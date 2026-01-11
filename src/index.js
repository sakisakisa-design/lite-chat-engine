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

// 初始化各模块
const characterManager = new CharacterManager(config.chat.dataDir);
const worldBookManager = new WorldBookManager(config.chat.dataDir);
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
    const triggerMode = config.chat.triggerMode;
    let shouldRespond = false;
    
    if (triggerMode === 'always') {
        shouldRespond = true;
    } else if (triggerMode === 'at' && isAtMe) {
        shouldRespond = true;
    } else if (triggerMode === 'keyword') {
        for (const kw of config.chat.triggerKeywords) {
            if (text.includes(kw)) {
                shouldRespond = true;
                break;
            }
        }
    }
    
    // 检查白名单
    if (config.chat.allowedGroups.length > 0 && message_type === 'group') {
        if (!config.chat.allowedGroups.includes(group_id)) {
            shouldRespond = false;
        }
    }
    if (config.chat.allowedUsers.length > 0) {
        if (!config.chat.allowedUsers.includes(user_id)) {
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
        
        // 调用 AI
        const reply = await aiClient.chat(messages);
        
        // 正则处理
        const processedReply = regexProcessor.process(reply);
        
        // 保存到会话
        sessionManager.addMessage(sessionId, 'user', text);
        sessionManager.addMessage(sessionId, 'assistant', processedReply);
        
        logger.info(`回复 [${sessionId}]: ${processedReply.substring(0, 50)}...`);
        
        // 发送回复
        if (message_type === 'group') {
            await bot.sendGroupMessage(group_id, processedReply);
        } else {
            await bot.sendPrivateMessage(user_id, processedReply);
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
    bot.connect();
});
