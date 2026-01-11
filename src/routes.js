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
    const { config, saveConfig, characterManager, worldBookManager, sessionManager, regexProcessor, aiClient, promptBuilder, logger, bot } = deps;

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

    // 获取配置
    app.get('/api/config', (req, res) => {
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

    // 更新配置
    app.post('/api/config', async (req, res) => {
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

    // 获取角色列表
    app.get('/api/characters', async (req, res) => {
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

    // 获取当前角色
    app.get('/api/characters/current', (req, res) => {
        const character = characterManager.getCurrentCharacter();
        if (character) {
            res.json(character);
        } else {
            res.status(404).json({ error: '未选择角色' });
        }
    });

    // 选择角色
    app.post('/api/characters/select', async (req, res) => {
        try {
            const { filename } = req.body;
            // 移除 .png 扩展名
            const characterName = filename.replace(/\.png$/i, '');
            const character = characterManager.loadCharacter(characterName);
            res.json({ success: true, character });
        } catch (error) {
            logger.error('选择角色失败', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 刷新角色列表
    app.post('/api/characters/refresh', async (req, res) => {
        try {
            await characterManager.scanCharacters();
            const characters = await characterManager.listCharacters();
            res.json({ success: true, characters });
        } catch (error) {
            logger.error('刷新角色列表失败', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 上传角色卡
    app.post('/api/characters/upload', upload.single('file'), async (req, res) => {
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

    // 删除角色卡
    app.delete('/api/characters/:filename', async (req, res) => {
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

    // 获取角色卡详情
    app.get('/api/characters/:filename/detail', async (req, res) => {
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

    // 更新角色卡（保存编辑）
    app.post('/api/characters/:filename/update', async (req, res) => {
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

    // 获取世界书列表
    app.get('/api/worldbooks', async (req, res) => {
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

    // 获取当前世界书
    app.get('/api/worldbooks/current', (req, res) => {
        const worldbook = worldBookManager.getCurrentWorldBook();
        if (worldbook) {
            res.json(worldbook);
        } else {
            res.status(404).json({ error: '未加载世界书' });
        }
    });

    // 选择世界书
    app.post('/api/worldbooks/select', async (req, res) => {
        try {
            const { filename } = req.body;
            const worldbook = await worldBookManager.loadWorldBook(filename);
            res.json({ success: true, worldbook });
        } catch (error) {
            logger.error('选择世界书失败', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 刷新世界书列表
    app.post('/api/worldbooks/refresh', async (req, res) => {
        try {
            await worldBookManager.scanWorldBooks();
            const worldbooks = await worldBookManager.listWorldBooks();
            res.json({ success: true, worldbooks });
        } catch (error) {
            logger.error('刷新世界书列表失败', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 上传世界书
    app.post('/api/worldbooks/upload', upload.single('file'), async (req, res) => {
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

    // 删除世界书
    app.delete('/api/worldbooks/:filename', async (req, res) => {
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

    // 测试世界书匹配
    app.post('/api/worldbooks/test', (req, res) => {
        try {
            const { text } = req.body;
            const entries = worldBookManager.findMatchingEntries(text);
            res.json({ success: true, entries });
        } catch (error) {
            logger.error('测试世界书匹配失败', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 获取世界书内容（用于编辑）
    app.get('/api/worldbooks/:filename/content', async (req, res) => {
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

    // 保存世界书内容
    app.post('/api/worldbooks/:filename/save', async (req, res) => {
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

    // 从角色卡提取内嵌世界书
    app.post('/api/worldbooks/extract-from-character', async (req, res) => {
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

    // 获取所有会话
    app.get('/api/sessions', (req, res) => {
        const sessions = sessionManager.listSessions();
        res.json(sessions);
    });

    // 获取指定会话
    app.get('/api/sessions/:sessionId', (req, res) => {
        const { sessionId } = req.params;
        const session = sessionManager.getSession(sessionId);
        if (session) {
            res.json(session);
        } else {
            res.status(404).json({ error: '会话不存在' });
        }
    });

    // 获取会话历史
    app.get('/api/sessions/:sessionId/history', (req, res) => {
        const { sessionId } = req.params;
        const limit = parseInt(req.query.limit) || 50;
        const history = sessionManager.getHistory(sessionId, limit);
        res.json(history);
    });

    // 清除会话历史
    app.delete('/api/sessions/:sessionId/history', (req, res) => {
        const { sessionId } = req.params;
        sessionManager.clearHistory(sessionId);
        res.json({ success: true, message: '会话历史已清除' });
    });

    // 删除会话
    app.delete('/api/sessions/:sessionId', (req, res) => {
        const { sessionId } = req.params;
        sessionManager.deleteSession(sessionId);
        res.json({ success: true, message: '会话已删除' });
    });

    // ==================== 正则规则管理 ====================

    // 获取正则规则
    app.get('/api/regex', (req, res) => {
        const rules = regexProcessor.getRules();
        res.json(rules);
    });

    // 添加正则规则
    app.post('/api/regex', (req, res) => {
        try {
            const rule = req.body;
            regexProcessor.addRule(rule);
            res.json({ success: true, message: '规则已添加' });
        } catch (error) {
            logger.error('添加正则规则失败', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 删除正则规则
    app.delete('/api/regex/:index', (req, res) => {
        const index = parseInt(req.params.index);
        regexProcessor.removeRule(index);
        res.json({ success: true, message: '规则已删除' });
    });

    // 测试正则规则
    app.post('/api/regex/test', (req, res) => {
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

    // 测试 AI 调用
    app.post('/api/test/ai', async (req, res) => {
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

    // 获取最近日志
    app.get('/api/logs', (req, res) => {
        const logs = logger.getRecentLogs();
        res.json(logs);
    });

    // ==================== 系统信息 ====================

    // 获取系统状态
    app.get('/api/status', (req, res) => {
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

    // OneBot 重连
    app.post('/api/status/onebot/reconnect', (req, res) => {
        if (bot) {
            bot.reconnect();
            res.json({ success: true, message: '正在重新连接...' });
        } else {
            res.status(500).json({ success: false, error: 'OneBot 客户端未初始化' });
        }
    });

    logger.info('API 路由已设置');
}
