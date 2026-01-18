/**
 * 会话管理模块
 */

import fs from 'fs';
import path from 'path';

export class SessionManager {
    constructor(maxHistoryLength = 50) {
        this.sessions = new Map();
        this.maxHistoryLength = maxHistoryLength;
        this.cacheFile = path.join(process.cwd(), 'data', 'chats', 'sessions.json');
        this.loadSessions();
    }

    loadSessions() {
        try {
            if (fs.existsSync(this.cacheFile)) {
                const data = JSON.parse(fs.readFileSync(this.cacheFile, 'utf-8'));
                this.sessions = new Map(data.map(([id, session]) => [
                    id,
                    {
                        ...session,
                        stickyEntries: new Map(session.stickyEntries || [])
                    }
                ]));
            }
        } catch (err) {
            console.error('加载会话缓存失败:', err);
        }
    }

    saveSessions() {
        try {
            const dir = path.dirname(this.cacheFile);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            const data = Array.from(this.sessions.entries()).map(([id, session]) => [
                id,
                {
                    ...session,
                    stickyEntries: Array.from(session.stickyEntries.entries())
                }
            ]);
            fs.writeFileSync(this.cacheFile, JSON.stringify(data, null, 2));
        } catch (err) {
            console.error('保存会话缓存失败:', err);
        }
    }

    /**
     * 获取会话
     */
    getSession(sessionId) {
        if (!this.sessions.has(sessionId)) {
            this.sessions.set(sessionId, {
                messages: [],
                createdAt: Date.now(),
                lastActive: Date.now(),
                // 粘性世界书条目：Map<entryKey, remainingTurns>
                stickyEntries: new Map()
            });
        }

        const session = this.sessions.get(sessionId);
        session.lastActive = Date.now();
        
        // 兼容旧会话，确保有 stickyEntries
        if (!session.stickyEntries) {
            session.stickyEntries = new Map();
        }
        
        return session;
    }

    /**
     * 添加消息到会话
     */
    addMessage(sessionId, role, content) {
        const session = this.getSession(sessionId);
        session.messages.push({ role, content });

        // 限制历史长度
        if (session.messages.length > this.maxHistoryLength) {
            session.messages = session.messages.slice(-this.maxHistoryLength);
        }
        
        this.saveSessions();
    }

    /**
     * 清除会话
     */
    clearSession(sessionId) {
        this.sessions.delete(sessionId);
        this.saveSessions();
    }

    /**
     * 获取会话历史消息
     * @param {string} sessionId - 会话ID
     * @param {number} limit - 最大返回条数
     * @returns {Array} 历史消息数组
     */
    getHistory(sessionId, limit = 50) {
        const session = this.getSession(sessionId);
        const messages = session.messages || [];
        return messages.slice(-limit);
    }

    /**
     * 清除会话历史消息（但保留会话）
     * @param {string} sessionId - 会话ID
     */
    clearHistory(sessionId) {
        const session = this.getSession(sessionId);
        session.messages = [];
        session.stickyEntries = new Map();
        this.saveSessions();
    }

    /**
     * 获取所有会话列表
     */
    listSessions() {
        const list = [];
        for (const [id, session] of this.sessions) {
            list.push({
                id,
                messageCount: session.messages.length,
                createdAt: session.createdAt,
                lastActive: session.lastActive
            });
        }
        return list.sort((a, b) => b.lastActive - a.lastActive);
    }

    /**
     * 清理过期会话（超过指定时间未活动）
     */
    cleanupSessions(maxIdleTime = 24 * 60 * 60 * 1000) {
        const now = Date.now();
        for (const [id, session] of this.sessions) {
            if (now - session.lastActive > maxIdleTime) {
                this.sessions.delete(id);
            }
        }
    }

    /**
     * 更新粘性世界书条目
     * @param {string} sessionId - 会话ID
     * @param {Array} triggeredEntries - 本轮触发的条目 [{key, sticky}, ...]
     */
    updateStickyEntries(sessionId, triggeredEntries) {
        const session = this.getSession(sessionId);
        
        // 1. 所有现有粘性条目的剩余轮数减 1
        for (const [key, remaining] of session.stickyEntries) {
            if (remaining <= 1) {
                session.stickyEntries.delete(key);
            } else {
                session.stickyEntries.set(key, remaining - 1);
            }
        }
        
        // 2. 添加/刷新本轮触发的条目
        for (const entry of triggeredEntries) {
            if (entry.sticky && entry.sticky > 0) {
                // 如果条目有粘性设置，设置/刷新其剩余轮数
                session.stickyEntries.set(entry.key, entry.sticky);
            }
        }
        
        this.saveSessions();
    }

    /**
     * 获取当前会话的粘性条目键列表
     * @param {string} sessionId - 会话ID
     * @returns {Set<string>} 粘性条目的键集合
     */
    getStickyEntryKeys(sessionId) {
        const session = this.getSession(sessionId);
        return new Set(session.stickyEntries.keys());
    }
}
