/**
 * API 路由模块
 * 提供 Web 管理面板的后端接口
 */

import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import multer from 'multer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 设置路由
 * @param {express.Application} app - Express 应用
 * @param {Object} deps - 依赖注入
 */
export function setupRoutes(app, deps) {
    const { config, saveConfig, characterManager, worldBookManager, sessionManager, regexProcessor, aiClient, promptBuilder, logger, bot, ttsManager, VOICE_TYPES } = deps;

    // ==================== 认证中间件 ====================
    
    // 检查是否需要认证
    const requireAuth = (req, res, next) => {
        // 如果认证未启用，直接通过
        if (!config.auth?.enabled) {
            return next();
        }
        
        // 检查是否已登录
        if (req.session?.authenticated) {
            return next();
        }
        
        // 未登录，返回 401
        res.status(401).json({ error: '未登录', needLogin: true });
    };

    // ==================== 登录相关路由 ====================

    // 检查登录状态
    app.get('/api/auth/status', (req, res) => {
        if (!config.auth?.enabled) {
            return res.json({ enabled: false, authenticated: true });
        }
        res.json({ 
            enabled: true, 
            authenticated: req.session?.authenticated || false 
        });
    });

    // 登录
    app.post('/api/auth/login', (req, res) => {
        if (!config.auth?.enabled) {
            return res.json({ success: true, message: '认证未启用' });
        }
        
        const { username, password } = req.body;
        
        if (username === config.auth.username && password === config.auth.password) {
            req.session.authenticated = true;
            logger.info(`用户 ${username} 登录成功`);
            res.json({ success: true, message: '登录成功' });
        } else {
            logger.warn(`登录失败: 用户名或密码错误`);
            res.status(401).json({ success: false, error: '用户名或密码错误' });
        }
    });

    // 登出
    app.post('/api/auth/logout', (req, res) => {
        if (req.session) {
            req.session.destroy();
        }
        res.json({ success: true, message: '已登出' });
    });

    // 文件上传配置
    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            const isCharacter = req.path.includes('/characters/');
            const isWorldbook = req.path.includes('/worldbooks/');
            let destDir;
            if (isCharacter) {
                destDir = path.join(config.chat.dataDir || './data', 'characters');
            } else if (isWorldbook) {
                destDir = path.join(config.chat.dataDir || './data', 'worlds');
            } else {
                destDir = config.chat.dataDir || './data';
            }
            // 确保目录存在
            fs.mkdir(destDir, { recursive: true }).then(() => cb(null, destDir)).catch(err => cb(err));
        },
        filename: (req, file, cb) => {
            // 保持原文件名，处理中文编码
            const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
            cb(null, originalName);
        }
    });
    
    const upload = multer({ 
        storage,
        fileFilter: (req, file, cb) => {
            const isCharacter = req.path.includes('/characters/');
            const isWorldbook = req.path.includes('/worldbooks/');
            if (isCharacter && !file.originalname.toLowerCase().endsWith('.png')) {
                cb(new Error('角色卡必须是 PNG 格式'));
            } else if (isWorldbook && !file.originalname.toLowerCase().endsWith('.json')) {
                cb(new Error('世界书必须是 JSON 格式'));
            } else {
                cb(null, true);
            }
        },
        limits: { fileSize: 50 * 1024 * 1024 } // 50MB 限制
    });

    // ==================== 配置管理 ====================

    // 获取配置（需要认证）
    app.get('/api/config', requireAuth, (req, res) => {
        // 隐藏敏感信息
        const safeConfig = {
            ...config,
            ai: {
                ...config.ai,
                apiKey: config.ai.apiKey ? '******' : ''
            }
        };
        res.json(safeConfig);
    });

    // 更新配置（需要认证）
    app.post('/api/config', requireAuth, async (req, res) => {
        try {
            const newConfig = req.body;
            
            // 合并配置（保留未提供的字段）
            Object.assign(config, newConfig);
            
            // 保存到文件
            saveConfig(config);
            
            logger.info('配置已更新');
            res.json({ success: true, message: '配置已保存' });
        } catch (error) {
            logger.error('保存配置失败', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ==================== 角色卡管理 ====================

    // 获取角色列表（需要认证）
    app.get('/api/characters', requireAuth, async (req, res) => {
        try {
            const filenames = characterManager.listCharacters();
            // 返回包含 name 和 filename 的对象数组
            const characters = filenames.map(filename => {
                try {
                    const char = characterManager.readFromPng(filename);
                    return {
                        name: char.name || filename,
                        filename: filename + '.png'
                    };
                } catch (e) {
                    return {
                        name: filename,
                        filename: filename + '.png'
                    };
                }
            });
            res.json(characters);
        } catch (error) {
            logger.error('获取角色列表失败', error);
            res.status(500).json({ error: error.message });
        }
    });

    // 获取当前角色（需要认证）
    app.get('/api/characters/current', requireAuth, (req, res) => {
        const character = characterManager.getCurrentCharacter();
        if (character) {
            res.json(character);
        } else {
            res.status(404).json({ error: '未选择角色' });
        }
    });

    // 选择角色（需要认证）
    app.post('/api/characters/select', requireAuth, async (req, res) => {
        try {
            const { filename } = req.body;
            // 移除 .png 扩展名
            const characterName = filename.replace(/\.png$/i, '');
            const character = characterManager.loadCharacter(characterName);
            
            // 更新配置并保存，确保重启后仍然使用选择的角色
            config.chat.defaultCharacter = characterName;
            saveConfig(config);
            
            logger.info(`已选择角色: ${characterName}`);
            res.json({ success: true, character });
        } catch (error) {
            logger.error('选择角色失败', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 刷新角色列表（需要认证）
    app.post('/api/characters/refresh', requireAuth, async (req, res) => {
        try {
            await characterManager.scanCharacters();
            const characters = await characterManager.listCharacters();
            res.json({ success: true, characters });
        } catch (error) {
            logger.error('刷新角色列表失败', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 上传角色卡（需要认证）
    app.post('/api/characters/upload', requireAuth, upload.single('file'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, error: '未上传文件' });
            }
            logger.info(`角色卡已上传: ${req.file.filename}`);
            // 刷新角色列表
            await characterManager.scanCharacters();
            const characters = await characterManager.listCharacters();
            res.json({ success: true, message: '角色卡上传成功', filename: req.file.filename, characters });
        } catch (error) {
            logger.error('上传角色卡失败', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 删除角色卡（需要认证）
    app.delete('/api/characters/:filename', requireAuth, async (req, res) => {
        try {
            const { filename } = req.params;
            const filePath = path.join(config.chat.dataDir || './data', 'characters', filename);
            await fs.unlink(filePath);
            await characterManager.scanCharacters();
            logger.info(`角色卡已删除: ${filename}`);
            res.json({ success: true, message: '角色卡已删除' });
        } catch (error) {
            logger.error('删除角色卡失败', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 获取角色卡详情（需要认证）
    app.get('/api/characters/:filename/detail', requireAuth, async (req, res) => {
        try {
            const { filename } = req.params;
            const characterName = filename.replace(/\.png$/i, '');
            const character = characterManager.readFromPng(characterName);
            res.json({ success: true, character });
        } catch (error) {
            logger.error('获取角色卡详情失败', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 更新角色卡（保存编辑，需要认证）
    app.post('/api/characters/:filename/update', requireAuth, async (req, res) => {
        try {
            const { filename } = req.params;
            const updates = req.body;
            
            // 更新角色卡数据
            const characterName = filename.replace(/\.png$/i, '');
            const updated = characterManager.updateCharacter(characterName, updates);
            
            logger.info(`角色卡已更新: ${filename}`);
            res.json({ success: true, message: '角色卡已保存', character: updated });
        } catch (error) {
            logger.error('更新角色卡失败', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ==================== 世界书管理 ====================

    // 获取世界书列表（需要认证）
    app.get('/api/worldbooks', requireAuth, async (req, res) => {
        try {
            const worldbooks = await worldBookManager.listWorldBooks();
            // 过滤掉无效的文件名
            const validWorldbooks = worldbooks.filter(f => f && f !== 'undefined' && f.endsWith('.json'));
            res.json(validWorldbooks);
        } catch (error) {
            logger.error('获取世界书列表失败', error);
            res.status(500).json({ error: error.message });
        }
    });

    // 获取当前世界书（需要认证）
    app.get('/api/worldbooks/current', requireAuth, (req, res) => {
        const worldbook = worldBookManager.getCurrentWorldBook();
        if (worldbook) {
            res.json(worldbook);
        } else {
            res.status(404).json({ error: '未加载世界书' });
        }
    });

    // 选择世界书（需要认证）
    app.post('/api/worldbooks/select', requireAuth, async (req, res) => {
        try {
            const { filename } = req.body;
            const worldbook = await worldBookManager.loadWorldBook(filename);
            res.json({ success: true, worldbook });
        } catch (error) {
            logger.error('选择世界书失败', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 刷新世界书列表（需要认证）
    app.post('/api/worldbooks/refresh', requireAuth, async (req, res) => {
        try {
            await worldBookManager.scanWorldBooks();
            const worldbooks = await worldBookManager.listWorldBooks();
            res.json({ success: true, worldbooks });
        } catch (error) {
            logger.error('刷新世界书列表失败', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 上传世界书（需要认证）
    app.post('/api/worldbooks/upload', requireAuth, upload.single('file'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, error: '未上传文件' });
            }
            logger.info(`世界书已上传: ${req.file.filename}`);
            // 刷新世界书列表
            await worldBookManager.scanWorldBooks();
            const worldbooks = await worldBookManager.listWorldBooks();
            res.json({ success: true, message: '世界书上传成功', filename: req.file.filename, worldbooks });
        } catch (error) {
            logger.error('上传世界书失败', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 删除世界书（需要认证）
    app.delete('/api/worldbooks/:filename', requireAuth, async (req, res) => {
        try {
            const { filename } = req.params;
            const filePath = path.join(config.chat.dataDir || './data', 'worlds', filename);
            await fs.unlink(filePath);
            await worldBookManager.scanWorldBooks();
            logger.info(`世界书已删除: ${filename}`);
            res.json({ success: true, message: '世界书已删除' });
        } catch (error) {
            logger.error('删除世界书失败', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 测试世界书匹配（需要认证）
    app.post('/api/worldbooks/test', requireAuth, (req, res) => {
        try {
            const { text } = req.body;
            const entries = worldBookManager.findMatchingEntries(text);
            res.json({ success: true, entries });
        } catch (error) {
            logger.error('测试世界书匹配失败', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 获取世界书内容（用于编辑，需要认证）
    app.get('/api/worldbooks/:filename/content', requireAuth, async (req, res) => {
        try {
            const { filename } = req.params;
            const filePath = path.join(config.chat.dataDir || './data', 'worlds', filename);
            const content = await fs.readFile(filePath, 'utf-8');
            const worldbook = JSON.parse(content);
            res.json({ success: true, worldbook });
        } catch (error) {
            logger.error('获取世界书内容失败', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 保存世界书内容（需要认证）
    app.post('/api/worldbooks/:filename/save', requireAuth, async (req, res) => {
        try {
            const { filename } = req.params;
            const { worldbook } = req.body;
            
            if (!worldbook) {
                return res.status(400).json({ success: false, error: '请提供世界书数据' });
            }
            
            const filePath = path.join(config.chat.dataDir || './data', 'worlds', filename);
            await fs.writeFile(filePath, JSON.stringify(worldbook, null, 2), 'utf-8');
            
            // 如果当前加载的是这个世界书，重新加载
            const currentWorldBook = worldBookManager.getCurrentWorldBook();
            if (currentWorldBook && currentWorldBook.filename === filename) {
                await worldBookManager.loadWorldBook(filename);
            }
            
            logger.info(`世界书已保存: ${filename}`);
            res.json({ success: true, message: '世界书已保存' });
        } catch (error) {
            logger.error('保存世界书失败', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 从角色卡提取内嵌世界书（需要认证）
    app.post('/api/worldbooks/extract-from-character', requireAuth, async (req, res) => {
        try {
            const { filename } = req.body;
            
            // 验证 filename
            if (!filename || typeof filename !== 'string') {
                return res.status(400).json({ success: false, error: '请提供有效的角色卡文件名' });
            }
            
            const characterName = filename.replace(/\.png$/i, '');
            
            // 读取角色卡
            const character = characterManager.readFromPng(characterName);
            
            // 查找内嵌世界书（可能在顶层或 data 对象内）
            const characterBook = character.character_book || character.data?.character_book;
            
            if (!characterBook) {
                return res.status(404).json({ success: false, error: '该角色卡没有内嵌世界书' });
            }
            
            // 获取角色名称（可能在顶层或 data 对象内）
            const charName = character.name || character.data?.name || characterName;
            
            // 生成世界书文件名
            const worldbookFilename = `${charName}_worldbook.json`;
            const worldbookPath = path.join(config.chat.dataDir || './data', 'worlds', worldbookFilename);
            
            // 转换为标准世界书格式
            const worldbook = {
                name: `${charName} 世界书`,
                description: `从角色卡 ${charName} 提取的世界书`,
                entries: characterBook.entries || []
            };
            
            // 保存世界书文件
            await fs.writeFile(worldbookPath, JSON.stringify(worldbook, null, 2), 'utf-8');
            
            // 刷新世界书列表
            await worldBookManager.scanWorldBooks();
            
            logger.info(`已从角色卡提取世界书: ${worldbookFilename}`);
            res.json({ 
                success: true, 
                message: '世界书已提取并保存', 
                filename: worldbookFilename,
                entriesCount: worldbook.entries.length
            });
        } catch (error) {
            logger.error('提取世界书失败', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ==================== 会话管理 ====================

    // 获取所有会话（需要认证）
    app.get('/api/sessions', requireAuth, (req, res) => {
        const sessions = sessionManager.listSessions();
        res.json(sessions);
    });

    // 获取指定会话（需要认证）
    app.get('/api/sessions/:sessionId', requireAuth, (req, res) => {
        const { sessionId } = req.params;
        const session = sessionManager.getSession(sessionId);
        if (session) {
            res.json(session);
        } else {
            res.status(404).json({ error: '会话不存在' });
        }
    });

    // 获取会话历史（需要认证）
    app.get('/api/sessions/:sessionId/history', requireAuth, (req, res) => {
        const { sessionId } = req.params;
        const limit = parseInt(req.query.limit) || 50;
        const history = sessionManager.getHistory(sessionId, limit);
        res.json(history);
    });

    // 清除会话历史（需要认证）
    app.delete('/api/sessions/:sessionId/history', requireAuth, (req, res) => {
        const { sessionId } = req.params;
        sessionManager.clearHistory(sessionId);
        res.json({ success: true, message: '会话历史已清除' });
    });

    // 删除会话（需要认证）
    app.delete('/api/sessions/:sessionId', requireAuth, (req, res) => {
        const { sessionId } = req.params;
        sessionManager.deleteSession(sessionId);
        res.json({ success: true, message: '会话已删除' });
    });

    // ==================== 正则规则管理 ====================

    // 获取正则规则（需要认证）
    app.get('/api/regex', requireAuth, (req, res) => {
        const rules = regexProcessor.getRules();
        res.json(rules);
    });

    // 添加正则规则（需要认证）
    app.post('/api/regex', requireAuth, (req, res) => {
        try {
            const rule = req.body;
            regexProcessor.addRule(rule);
            res.json({ success: true, message: '规则已添加' });
        } catch (error) {
            logger.error('添加正则规则失败', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 删除正则规则（需要认证）
    app.delete('/api/regex/:index', requireAuth, (req, res) => {
        const index = parseInt(req.params.index);
        regexProcessor.removeRule(index);
        res.json({ success: true, message: '规则已删除' });
    });

    // 测试正则规则（需要认证）
    app.post('/api/regex/test', requireAuth, (req, res) => {
        try {
            const { pattern, flags, replacement, testText } = req.body;
            const result = regexProcessor.testRule(pattern, flags, replacement, testText);
            res.json(result);
        } catch (error) {
            logger.error('测试正则规则失败', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ==================== 测试功能 ====================

    // 测试 AI 调用（需要认证）
    app.post('/api/test/ai', requireAuth, async (req, res) => {
        try {
            const { message } = req.body;
            const response = await aiClient.chat([
                { role: 'user', content: message }
            ]);
            res.json({ success: true, response });
        } catch (error) {
            logger.error('测试 AI 调用失败', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ==================== 日志 ====================

    // 获取最近日志（需要认证）
    app.get('/api/logs', requireAuth, (req, res) => {
        const logs = logger.getRecentLogs();
        res.json(logs);
    });

    // ==================== TTS 语音合成 ====================

    // 获取 TTS 配置（需要认证）
    app.get('/api/tts/config', requireAuth, (req, res) => {
        const ttsConfig = ttsManager.getConfig();
        // 隐藏 token
        res.json({
            ...ttsConfig,
            token: ttsConfig.token ? '******' : ''
        });
    });

    // 更新 TTS 配置（需要认证）
    app.post('/api/tts/config', requireAuth, (req, res) => {
        try {
            const newConfig = req.body;
            console.log('[TTS] 收到配置:', JSON.stringify(newConfig, null, 2));
            // 字段名映射：前端 -> 后端
            const mappedConfig = {
                enabled: newConfig.enabled,
                appid: newConfig.appId || newConfig.appid,
                token: newConfig.accessToken || newConfig.token,
                voiceType: newConfig.voiceType,
                speedRatio: newConfig.speed || newConfig.speedRatio || 1.0,
                volumeRatio: newConfig.volume || newConfig.volumeRatio || 1.0,
                pitchRatio: newConfig.pitch || newConfig.pitchRatio || 1.0
            };
            console.log('[TTS] 映射后配置:', JSON.stringify(mappedConfig, null, 2));
            ttsManager.updateConfig(mappedConfig);
            logger.info('TTS 配置已更新');
            res.json({ success: true, message: 'TTS 配置已保存' });
        } catch (error) {
            logger.error('更新 TTS 配置失败', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 获取可用音色列表（需要认证）
    app.get('/api/tts/voices', requireAuth, (req, res) => {
        // 将对象格式转换为数组格式 [{id, name}]
        const voiceList = Object.entries(VOICE_TYPES).map(([id, name]) => ({
            id,
            name
        }));
        res.json(voiceList);
    });

    // 测试 TTS 合成（需要认证）
    app.post('/api/tts/test', requireAuth, async (req, res) => {
        try {
            const { text } = req.body;
            if (!text) {
                return res.status(400).json({ success: false, error: '请提供测试文本' });
            }
            
            const audioPath = await ttsManager.synthesize(text);
            // 提取文件名，生成可访问的 URL
            const filename = path.basename(audioPath);
            const audioUrl = `/audio/${filename}`;
            
            logger.info(`TTS 测试成功: ${audioPath}`);
            res.json({ 
                success: true, 
                audioUrl,
                filePath: audioPath,
                message: '语音合成成功' 
            });
        } catch (error) {
            logger.error('TTS 测试失败', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ==================== 系统信息 ====================

    // 获取系统状态（需要认证）
    app.get('/api/status', requireAuth, (req, res) => {
        res.json({
            version: '1.0.0',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            onebot: {
                connected: bot ? bot.isConnected() : false
            },
            character: characterManager.getCurrentCharacter()?.name || '未选择',
            worldbook: worldBookManager.getCurrentWorldBook()?.name || '未加载',
            sessions: sessionManager.listSessions().length
        });
    });

    // OneBot 重连（需要认证）
    app.post('/api/status/onebot/reconnect', requireAuth, (req, res) => {
        if (bot) {
            bot.reconnect();
            res.json({ success: true, message: '正在重新连接...' });
        } else {
            res.status(500).json({ success: false, error: 'OneBot 客户端未初始化' });
        }
    });

    logger.info('API 路由已设置');
}
