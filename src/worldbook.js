/**
 * 世界书管理模块
 * 兼容 SillyTavern WorldInfo 格式
 */

import fs from 'fs';
import path from 'path';

export class WorldBookManager {
    constructor(dataDir) {
        this.dataDir = dataDir;
        this.worldsDir = path.join(dataDir, 'worlds');
        this.cache = new Map();
        this.currentWorldBook = null;
        this.currentWorldBookName = null;
    }

    /**
     * 读取世界书
     */
    readWorldBook(characterName) {
        // 检查缓存
        if (this.cache.has(characterName)) {
            return this.cache.get(characterName);
        }

        // 尝试多种可能的文件名格式
        const possibleNames = [
            characterName + "'s Lorebook.json",  // 弯引号
            characterName + "'s Lorebook.json",  // 直引号
            characterName + " Lorebook.json",
            characterName + ".json"
        ];

        // 先尝试直接匹配
        for (const name of possibleNames) {
            const filePath = path.join(this.worldsDir, name);
            if (fs.existsSync(filePath)) {
                const worldBook = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                this.cache.set(characterName, worldBook);
                return worldBook;
            }
        }

        // 模糊匹配：扫描目录查找包含角色名的文件
        if (fs.existsSync(this.worldsDir)) {
            const files = fs.readdirSync(this.worldsDir);
            for (const file of files) {
                if (file.includes(characterName) && file.endsWith('.json')) {
                    const filePath = path.join(this.worldsDir, file);
                    const worldBook = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    this.cache.set(characterName, worldBook);
                    return worldBook;
                }
            }
        }

        return null;
    }

    /**
     * 匹配世界书条目
     * @param {Object} worldBook - 世界书对象
     * @param {string} inputText - 用于匹配的文本（包括历史消息）
     * @param {number} maxEntries - 最大返回条目数
     * @param {Set<string>} stickyKeys - 当前会话中仍然粘性的条目键集合
     */
    matchEntries(worldBook, inputText, maxEntries = 10, stickyKeys = new Set()) {
        if (!worldBook || !worldBook.entries) {
            return [];
        }

        const matched = [];
        const constants = [];
        const stickyMatched = [];  // 粘性触发的条目
        const inputLower = inputText.toLowerCase();

        // 支持数组格式和对象格式的 entries
        const entriesArray = Array.isArray(worldBook.entries) 
            ? worldBook.entries 
            : Object.values(worldBook.entries);

        for (const entry of entriesArray) {
            // enabled 为 undefined 时视为启用，只有明确设为 false 才禁用
            if (entry.enabled === false || entry.disable === true) {
                continue;
            }

            // 获取条目的唯一标识（用于粘性追踪）
            const keys = entry.keys || entry.key || [];
            const entryKey = entry.uid || entry.id || keys[0] || entry.comment || entry.name || 'unknown';
            
            // 获取粘性设置（sticky 字段，单位：轮数）
            // SillyTavern 使用 sticky 字段，0 或 undefined 表示不粘性
            const sticky = entry.sticky || 0;

            // 常驻条目（constant: true）始终包含
            if (entry.constant === true) {
                constants.push({
                    content: entry.content,
                    order: entry.order || entry.insertion_order || 0,
                    key: entryKey,
                    isConstant: true,
                    position: entry.position || 0,
                    sticky: 0  // 常驻条目不需要粘性
                });
                continue;
            }

            // 检查是否是粘性触发（之前触发过，还在粘性期内）
            const isStickyActive = stickyKeys.has(entryKey);

            // 关键词匹配 - 支持 keys（数组格式）和 key（对象格式）
            const secondaryKeys = entry.secondary_keys || entry.keysecondary || [];
            let primaryMatch = false;
            let secondaryMatch = secondaryKeys.length === 0; // 如果没有次要关键词，默认为 true

            // 主要关键词匹配（OR 逻辑）
            for (const key of keys) {
                if (key && inputLower.includes(key.toLowerCase())) {
                    primaryMatch = true;
                    break;
                }
            }

            // 次要关键词匹配（根据 selectiveLogic）
            if (primaryMatch && secondaryKeys.length > 0) {
                const logic = entry.selectiveLogic || 0; // 0 = AND ANY, 1 = NOT ALL, 2 = NOT ANY, 3 = AND ALL
                
                if (logic === 0) { // AND ANY - 任意一个次要关键词匹配
                    secondaryMatch = secondaryKeys.some(k => k && inputLower.includes(k.toLowerCase()));
                } else if (logic === 1) { // NOT ALL - 不是所有次要关键词都匹配
                    secondaryMatch = !secondaryKeys.every(k => k && inputLower.includes(k.toLowerCase()));
                } else if (logic === 2) { // NOT ANY - 没有任何次要关键词匹配
                    secondaryMatch = !secondaryKeys.some(k => k && inputLower.includes(k.toLowerCase()));
                } else if (logic === 3) { // AND ALL - 所有次要关键词都匹配
                    secondaryMatch = secondaryKeys.every(k => k && inputLower.includes(k.toLowerCase()));
                }
            }

            const keywordMatch = primaryMatch && secondaryMatch;

            // 条目触发条件：关键词匹配 OR 粘性激活
            if (keywordMatch || isStickyActive) {
                const entryData = {
                    content: entry.content,
                    order: entry.order || entry.insertion_order || 0,
                    key: entryKey,
                    keys: keys,
                    comment: entry.comment || entry.name || keys[0] || '未命名',
                    isConstant: false,
                    position: entry.position || 0,
                    sticky: sticky,
                    triggeredByKeyword: keywordMatch,  // 标记是否由关键词触发
                    triggeredBySticky: isStickyActive && !keywordMatch  // 标记是否仅由粘性触发
                };

                if (keywordMatch) {
                    matched.push(entryData);
                } else {
                    stickyMatched.push(entryData);
                }
            }
        }

        // 合并常驻、关键词匹配和粘性触发的条目，按 order 排序
        const all = [...constants, ...matched, ...stickyMatched];
        all.sort((a, b) => b.order - a.order);

        return all.slice(0, maxEntries);
    }

    /**
     * 获取所有世界书列表
     */
    listWorldBooks() {
        if (!fs.existsSync(this.worldsDir)) {
            return [];
        }

        const files = fs.readdirSync(this.worldsDir);
        return files.filter(f => f.endsWith('.json'));
    }

    /**
     * 清除缓存
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * 获取当前加载的世界书
     */
    getCurrentWorldBook() {
        if (!this.currentWorldBook) {
            return null;
        }
        return {
            name: this.currentWorldBookName,
            entries: this.currentWorldBook.entries ? Object.keys(this.currentWorldBook.entries).length : 0
        };
    }

    /**
     * 加载世界书
     */
    loadWorldBook(filename) {
        const filePath = path.join(this.worldsDir, filename);
        if (!fs.existsSync(filePath)) {
            throw new Error(`世界书文件不存在: ${filePath}`);
        }
        
        const worldBook = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        this.currentWorldBook = worldBook;
        this.currentWorldBookName = filename.replace('.json', '');
        this.cache.set(filename, worldBook);
        
        return {
            name: this.currentWorldBookName,
            entries: worldBook.entries ? Object.keys(worldBook.entries).length : 0
        };
    }

    /**
     * 扫描世界书目录（刷新列表）
     */
    scanWorldBooks() {
        this.clearCache();
        return this.listWorldBooks();
    }

    /**
     * 查找匹配的条目（用于测试）
     */
    findMatchingEntries(text) {
        if (!this.currentWorldBook) {
            return [];
        }
        return this.matchEntries(this.currentWorldBook, text);
    }
}
