/**
 * 日志模块
 */

export class Logger {
    constructor() {
        this.listeners = [];
        this.recentLogs = [];
        this.maxLogs = 100;
    }

    addListener(callback) {
        this.listeners.push(callback);
    }

    _emit(level, message) {
        const log = {
            time: new Date().toISOString(),
            level,
            message
        };
        
        // 保存到最近日志
        this.recentLogs.push(log);
        if (this.recentLogs.length > this.maxLogs) {
            this.recentLogs.shift();
        }
        
        // 控制台输出
        const timeStr = new Date().toLocaleTimeString('zh-CN');
        const prefix = {
            info: '\x1b[36m[INFO]\x1b[0m',
            warn: '\x1b[33m[WARN]\x1b[0m',
            error: '\x1b[31m[ERROR]\x1b[0m',
            debug: '\x1b[90m[DEBUG]\x1b[0m'
        }[level] || '[LOG]';
        
        console.log(`${timeStr} ${prefix} ${message}`);
        
        // 通知监听器
        for (const listener of this.listeners) {
            try {
                listener(log);
            } catch (e) {
                // 忽略监听器错误
            }
        }
    }

    info(message) {
        this._emit('info', message);
    }

    warn(message) {
        this._emit('warn', message);
    }

    error(message, error) {
        if (error) {
            this._emit('error', `${message}: ${error.message || error}`);
        } else {
            this._emit('error', message);
        }
    }

    debug(message) {
        this._emit('debug', message);
    }

    getRecentLogs() {
        return [...this.recentLogs];
    }
}

// 默认导出一个实例，供其他模块使用
const logger = new Logger();
export default logger;
