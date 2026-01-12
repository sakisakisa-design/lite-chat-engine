/**
 * Lite Chat Engine - 轻量级 QQ 聊天引擎
 * 兼容 SillyTavern 数据格式
 */

import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

import { OneBotClient } from './onebot.js';
import { CharacterManager } from './character.js';
import { WorldBookManager } from './worldbook.js';
import { PromptBuilder } from './prompt.js';
import { AIClient } from './ai.js';
import { SessionManager } from './session.js';
import { RegexProcessor } from './regex.js';
import { setupRoutes } from './routes.js';
import { Logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

// 加载配置
function loadConfig() {
    const configPath = join(ROOT_DIR, 'config.json');
    if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
    throw new Error('配置文件不存在: config.json');
}

// 保存配置
function saveConfig(config) {
    const configPath = join(ROOT_DIR, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

const config = loadConfig();
const logger = new Logger();

// 数据目录（默认为项目根目录下的 data 文件夹）
const DATA_DIR = config.chat.dataDir || join(ROOT_DIR, 'data');

// 初始化各模块
const characterManager = new CharacterManager(DATA_DIR);
const worldBookManager = new WorldBookManager(DATA_DIR);
const sessionManager = new SessionManager(config.chat.maxHistoryLength);
const regexProcessor = new RegexProcessor(config.regex);
const aiClient = new AIClient(config.ai);
const promptBuilder = new PromptBuilder(characterManager, worldBookManager);

// 创建 Express 应用
const app = express();
const server = createServer(app);

app.use(express.json());
app.use(express.static(join(ROOT_DIR, 'public')));

// 连接 OneBot
const bot = new OneBotClient(config.onebot, logger);

// 设置 API 路由
setupRoutes(app, {
    config,
    saveConfig,
    characterManager,
    worldBookManager,
    sessionManager,
    regexProcessor,
    aiClient,
    promptBuilder,
    logger,
    bot
});

// 创建 WebSocket 服务器（用于前端实时日志）
const wss = new WebSocketServer({ server, path: '/ws/logs' });

wss.on('connection', (ws) => {
    logger.info('Web 面板已连接');
    logger.addListener((log) => {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify(log));
        }
    });
});

// 处理 QQ 消息
async function handleMessage(event, bot) {
    const { message_type, user_id, group_id, raw_message, message } = event;
    
    // 提取纯文本
    let text = '';
    let isAtMe = false;
    
    for (const seg of message) {
        if (seg.type === 'text') {
            text += seg.data.text;
        } else if (seg.type === 'at' && seg.data.qq === String(bot.selfId)) {
            isAtMe = true;
        }
    }
    text = text.trim();
    
    // 检查触发条件
    const triggerMode = config.chat.triggerMode || 'always';
    let shouldRespond = false;
    
    if (message_type === 'group') {
        // 群聊：必须 @机器人 才回复
        if (isAtMe) {
            shouldRespond = true;
        }
    } else {
        // 私聊：默认总是回复，除非配置了特定触发模式
        if (triggerMode === 'always' || !triggerMode) {
            shouldRespond = true;
        } else if (triggerMode === 'keyword') {
            const keywords = config.chat.triggerKeywords || [];
            for (const kw of keywords) {
                if (text.includes(kw)) {
                    shouldRespond = true;
                    break;
                }
            }
        }
    }
    
    // 检查白名单
    const allowedGroups = config.chat.allowedGroups || [];
    const allowedUsers = config.chat.allowedUsers || [];
    
    if (allowedGroups.length > 0 && message_type === 'group') {
        if (!allowedGroups.includes(group_id)) {
            shouldRespond = false;
        }
    }
    if (allowedUsers.length > 0) {
        if (!allowedUsers.includes(user_id)) {
            shouldRespond = false;
        }
    }
    
    if (!shouldRespond || !text) return;
    
    // 生成会话 ID
    const sessionId = message_type === 'group' 
        ? `group_${group_id}_${user_id}` 
        : `private_${user_id}`;
    
    logger.info(`收到消息 [${sessionId}]: ${text.substring(0, 50)}...`);
    
    try {
        // 获取会话历史
        const session = sessionManager.getSession(sessionId);
        
        // 构建 Prompt
        const { messages, worldBookCount } = await promptBuilder.build(
            config.chat.defaultCharacter,
            text,
            session.messages
        );
        
        logger.info(`世界书匹配: ${worldBookCount} 条`);

        // 调用 AI（带超时检测）
        const TIMEOUT_MS = 60000; // 1分钟超时
        let reply;

        try {
            const aiPromise = aiClient.chat(messages);
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('AI_TIMEOUT')), TIMEOUT_MS);
            });

            reply = await Promise.race([aiPromise, timeoutPromise]);
        } catch (error) {
            if (error.message === 'AI_TIMEOUT') {
                logger.warn(`AI 响应超时 [${sessionId}]`);
                const timeoutMsg = '丢包了，等了一分钟都没反应...要不你再试试？';
                if (message_type === 'group') {
                    await bot.sendGroupMessage(group_id, timeoutMsg);
                } else {
                    await bot.sendPrivateMessage(user_id, timeoutMsg);
                }
                return; // 直接返回，不继续处理
            }
            throw error; // 其他错误继续抛出
        }

        // 正则处理
        const processedReply = regexProcessor.process(reply);
        
        // 保存到会话
        sessionManager.addMessage(sessionId, 'user', text);
        sessionManager.addMessage(sessionId, 'assistant', processedReply);
        
        logger.info(`回复 [${sessionId}]: ${processedReply.substring(0, 50)}...`);
        
        // 发送回复（支持消息分段）
        const splitMessage = config.chat.splitMessage !== false; // 默认开启
        
        if (splitMessage) {
            // 按双换行分割成多条消息
            const segments = processedReply.split(/\n\n+/).filter(s => s.trim());
            for (const segment of segments) {
                if (message_type === 'group') {
                    await bot.sendGroupMessage(group_id, segment.trim());
                } else {
                    await bot.sendPrivateMessage(user_id, segment.trim());
                }
                // 多条消息之间稍微延迟，避免发送过快
                if (segments.length > 1) {
                    await new Promise(r => setTimeout(r, 500));
                }
            }
        } else {
            // 不分段，发送完整消息
            if (message_type === 'group') {
                await bot.sendGroupMessage(group_id, processedReply);
            } else {
                await bot.sendPrivateMessage(user_id, processedReply);
            }
        }
        
    } catch (error) {
        logger.error(`处理消息失败: ${error.message}`);
    }
}

bot.on('message', (event) => handleMessage(event, bot));

bot.on('connected', () => {
    logger.info(`已连接到 OneBot: ${config.onebot.url}`);
});

bot.on('disconnected', () => {
    logger.warn('OneBot 连接断开，将自动重连...');
});

// 启动服务器
server.listen(config.server.port, config.server.host, () => {
    logger.info(`服务器已启动: http://${config.server.host}:${config.server.port}`);
    
    // 自动加载默认角色
    if (config.chat.defaultCharacter) {
        try {
            characterManager.loadCharacter(config.chat.defaultCharacter);
            logger.info(`已加载默认角色: ${config.chat.defaultCharacter}`);
        } catch (error) {
            logger.warn(`加载默认角色失败: ${error.message}`);
        }
    }
    
    bot.connect();
});
