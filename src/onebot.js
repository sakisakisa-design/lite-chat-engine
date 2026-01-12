/**
 * OneBot WebSocket 客户端
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import fs from 'fs';

export class OneBotClient extends EventEmitter {
    constructor(config, logger) {
        super();
        this.config = config;
        this.logger = logger;
        this.ws = null;
        this.selfId = null;
        this.connected = false;
        this.pendingCalls = new Map();
        this.callId = 0;
    }

    connect() {
        if (this.ws) {
            this.ws.close();
        }

        const url = this.config.url;
        this.logger.info(`正在连接 OneBot: ${url}`);

        this.ws = new WebSocket(url, {
            headers: this.config.accessToken 
                ? { Authorization: `Bearer ${this.config.accessToken}` }
                : {}
        });

        this.ws.on('open', () => {
            this.connected = true;
            this.emit('connected');
            // 获取登录信息
            this._call('get_login_info').then(info => {
                this.selfId = info.user_id;
                this.logger.info(`登录账号: ${info.nickname} (${info.user_id})`);
            }).catch(err => {
                this.logger.error(`获取登录信息失败: ${err.message}`);
            });
        });

        this.ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                this._handleMessage(msg);
            } catch (e) {
                this.logger.error(`解析消息失败: ${e.message}`);
            }
        });

        this.ws.on('close', () => {
            this.connected = false;
            this.emit('disconnected');
            // 自动重连
            setTimeout(() => this.connect(), this.config.reconnectInterval || 5000);
        });

        this.ws.on('error', (err) => {
            this.logger.error(`WebSocket 错误: ${err.message}`);
        });
    }

    _handleMessage(msg) {
        // 处理 API 响应
        if (msg.echo !== undefined) {
            const pending = this.pendingCalls.get(msg.echo);
            if (pending) {
                this.pendingCalls.delete(msg.echo);
                if (msg.status === 'ok' || msg.retcode === 0) {
                    pending.resolve(msg.data);
                } else {
                    pending.reject(new Error(msg.message || msg.wording || 'API 调用失败'));
                }
            }
            return;
        }

        // 处理事件
        if (msg.post_type === 'message') {
            this.emit('message', msg);
        } else if (msg.post_type === 'meta_event') {
            if (msg.meta_event_type === 'heartbeat') {
                // 心跳，忽略
            } else if (msg.meta_event_type === 'lifecycle') {
                this.logger.debug(`生命周期事件: ${msg.sub_type}`);
            }
        }
    }

    _call(action, params = {}) {
        return new Promise((resolve, reject) => {
            if (!this.connected) {
                reject(new Error('未连接到 OneBot'));
                return;
            }

            const echo = ++this.callId;
            this.pendingCalls.set(echo, { resolve, reject });

            this.ws.send(JSON.stringify({
                action,
                params,
                echo
            }));

            // 超时处理
            setTimeout(() => {
                if (this.pendingCalls.has(echo)) {
                    this.pendingCalls.delete(echo);
                    reject(new Error('API 调用超时'));
                }
            }, 30000);
        });
    }

    async sendGroupMessage(groupId, message) {
        return this._call('send_group_msg', {
            group_id: groupId,
            message: typeof message === 'string' ? message : message
        });
    }

    async sendPrivateMessage(userId, message) {
        return this._call('send_private_msg', {
            user_id: userId,
            message: typeof message === 'string' ? message : message
        });
    }

    async getGroupList() {
        return this._call('get_group_list');
    }

    async getFriendList() {
        return this._call('get_friend_list');
    }

    /**
     * 发送群语音消息（使用 base64 编码，兼容 Docker 环境）
     * @param {number} groupId - 群号
     * @param {string} filePath - 音频文件路径（绝对路径）
     */
    async sendGroupRecord(groupId, filePath) {
        // 读取文件并转换为 base64
        const audioData = fs.readFileSync(filePath);
        const base64Data = audioData.toString('base64');
        
        return this._call('send_group_msg', {
            group_id: groupId,
            message: [
                {
                    type: 'record',
                    data: {
                        file: `base64://${base64Data}`
                    }
                }
            ]
        });
    }

    /**
     * 发送私聊语音消息（使用 base64 编码，兼容 Docker 环境）
     * @param {number} userId - 用户 QQ 号
     * @param {string} filePath - 音频文件路径（绝对路径）
     */
    async sendPrivateRecord(userId, filePath) {
        // 读取文件并转换为 base64
        const audioData = fs.readFileSync(filePath);
        const base64Data = audioData.toString('base64');
        
        return this._call('send_private_msg', {
            user_id: userId,
            message: [
                {
                    type: 'record',
                    data: {
                        file: `base64://${base64Data}`
                    }
                }
            ]
        });
    }

    /**
     * 检查是否已连接
     */
    isConnected() {
        return this.connected;
    }

    /**
     * 手动重新连接
     */
    reconnect() {
        this.logger.info('手动触发重新连接...');
        if (this.ws) {
            this.ws.close();
        }
        this.connect();
    }
}
