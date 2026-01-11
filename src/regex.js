/**
 * 正则处理模块
 * 用于对 AI 回复进行后处理（过滤、替换等）
 */

import logger from './logger.js';

export class RegexProcessor {
    constructor() {
        this.rules = [];
    }

    /**
     * 加载正则规则
     * @param {Array} rules - 正则规则数组
     */
    loadRules(rules) {
        this.rules = rules.map(rule => ({
            ...rule,
            pattern: new RegExp(rule.pattern, rule.flags || 'g')
        }));
        logger.info(`已加载 ${this.rules.length} 条正则规则`);
    }

    /**
     * 添加规则
     * @param {Object} rule - 正则规则
     */
    addRule(rule) {
        this.rules.push({
            ...rule,
            pattern: new RegExp(rule.pattern, rule.flags || 'g')
        });
    }

    /**
     * 移除规则
     * @param {number} index - 规则索引
     */
    removeRule(index) {
        if (index >= 0 && index < this.rules.length) {
            this.rules.splice(index, 1);
        }
    }

    /**
     * 获取所有规则
     * @returns {Array} 规则数组
     */
    getRules() {
        return this.rules.map(rule => ({
            name: rule.name,
            pattern: rule.pattern.source,
            flags: rule.pattern.flags,
            replacement: rule.replacement,
            enabled: rule.enabled !== false,
            description: rule.description || ''
        }));
    }

    /**
     * 处理文本
     * @param {string} text - 输入文本
     * @param {string} stage - 处理阶段 ('input' | 'output')
     * @returns {string} 处理后的文本
     */
    process(text, stage = 'output') {
        if (!text || this.rules.length === 0) {
            return text;
        }

        let result = text;
        let appliedRules = [];

        for (const rule of this.rules) {
            // 检查规则是否启用
            if (rule.enabled === false) {
                continue;
            }

            // 检查处理阶段
            if (rule.stage && rule.stage !== stage) {
                continue;
            }

            try {
                // 重置正则表达式的 lastIndex
                rule.pattern.lastIndex = 0;
                
                const before = result;
                result = result.replace(rule.pattern, rule.replacement || '');
                
                if (before !== result) {
                    appliedRules.push(rule.name || rule.pattern.source);
                }
            } catch (error) {
                logger.error(`正则规则执行失败: ${rule.name || rule.pattern.source}`, error);
            }
        }

        if (appliedRules.length > 0) {
            logger.debug(`应用了 ${appliedRules.length} 条正则规则: ${appliedRules.join(', ')}`);
        }

        return result;
    }

    /**
     * 处理输入文本（用户消息）
     * @param {string} text - 输入文本
     * @returns {string} 处理后的文本
     */
    processInput(text) {
        return this.process(text, 'input');
    }

    /**
     * 处理输出文本（AI 回复）
     * @param {string} text - 输出文本
     * @returns {string} 处理后的文本
     */
    processOutput(text) {
        return this.process(text, 'output');
    }

    /**
     * 测试正则规则
     * @param {string} pattern - 正则表达式
     * @param {string} flags - 标志
     * @param {string} replacement - 替换文本
     * @param {string} testText - 测试文本
     * @returns {Object} 测试结果
     */
    testRule(pattern, flags, replacement, testText) {
        try {
            const regex = new RegExp(pattern, flags || 'g');
            const matches = testText.match(regex);
            const result = testText.replace(regex, replacement || '');
            
            return {
                success: true,
                matches: matches || [],
                result: result,
                changed: testText !== result
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// 预设的常用正则规则
export const presetRules = [
    {
        name: '移除思考标签',
        pattern: '<thinking>[\\s\\S]*?</thinking>',
        flags: 'gi',
        replacement: '',
        stage: 'output',
        enabled: true,
        description: '移除 AI 回复中的思考过程标签'
    },
    {
        name: '移除 OC 标记',
        pattern: '\\(OOC:.*?\\)',
        flags: 'gi',
        replacement: '',
        stage: 'output',
        enabled: false,
        description: '移除 Out of Character 标记'
    },
    {
        name: '移除角色名前缀',
        pattern: '^[^:：]+[:：]\\s*',
        flags: 'm',
        replacement: '',
        stage: 'output',
        enabled: false,
        description: '移除回复开头的角色名前缀'
    },
    {
        name: '移除多余空行',
        pattern: '\\n{3,}',
        flags: 'g',
        replacement: '\n\n',
        stage: 'output',
        enabled: true,
        description: '将连续多个空行压缩为两个'
    },
    {
        name: '移除首尾空白',
        pattern: '^\\s+|\\s+$',
        flags: 'g',
        replacement: '',
        stage: 'output',
        enabled: true,
        description: '移除文本首尾的空白字符'
    }
];
