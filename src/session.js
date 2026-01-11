/**
 * 会话管理模块
 */

export class SessionManager {
    constructor(maxHistoryLength = 50) {
        this.sessions = new Map();
        this.maxHistoryLength = maxHistoryLength;
    }

    /**
     * 获取会话
     */
    getSession(sessionId) {
        if (!this.sessions.has(sessionId)) {
            this.sessions.set(sessionId, {
                messages: [],
                createdAt: Date.now(),
                lastActive: Date.now()
            });
        }

        const session = this.sessions.get(sessionId);
        session.lastActive = Date.now();
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
    }

    /**
     * 清除会话
     */
    clearSession(sessionId) {
        this.sessions.delete(sessionId);
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
}
