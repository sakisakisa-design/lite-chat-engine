/**
 * 角色卡管理模块
 * 兼容 SillyTavern PNG 格式
 */

import fs from 'fs';
import path from 'path';

export class CharacterManager {
    constructor(dataDir) {
        this.dataDir = dataDir;
        this.charactersDir = path.join(dataDir, 'characters');
        this.overridesDir = path.join(dataDir, 'character_overrides');
        this.cache = new Map();
        this.currentCharacter = null;
        
        // 确保覆盖层目录存在
        if (!fs.existsSync(this.overridesDir)) {
            fs.mkdirSync(this.overridesDir, { recursive: true });
        }
    }

    /**
     * 从 PNG 文件读取角色数据
     * SillyTavern 将角色数据存储在 PNG 的 tEXt 块中
     * 如果存在覆盖层文件，会合并覆盖层的数据
     */
    readFromPng(characterName) {
        // 检查缓存
        if (this.cache.has(characterName)) {
            return this.cache.get(characterName);
        }

        const pngPath = path.join(this.charactersDir, characterName + '.png');
        
        if (!fs.existsSync(pngPath)) {
            throw new Error(`角色文件不存在: ${pngPath}`);
        }

        const buffer = fs.readFileSync(pngPath);
        let offset = 8; // 跳过 PNG 签名
        let character = null;

        while (offset < buffer.length) {
            const length = buffer.readUInt32BE(offset);
            const type = buffer.toString('ascii', offset + 4, offset + 8);

            if (type === 'tEXt' || type === 'iTXt') {
                const chunkData = buffer.slice(offset + 8, offset + 8 + length);
                const nullIndex = chunkData.indexOf(0);

                if (nullIndex !== -1) {
                    const keyword = chunkData.toString('ascii', 0, nullIndex);

                    if (keyword === 'chara') {
                        let dataStart = nullIndex + 1;

                        // iTXt 格式需要跳过额外的字段
                        if (type === 'iTXt') {
                            // 跳过压缩标志和压缩方法
                            while (dataStart < chunkData.length && chunkData[dataStart] === 0) dataStart++;
                            // 跳过语言标签
                            while (dataStart < chunkData.length && chunkData[dataStart] !== 0) dataStart++;
                            dataStart++;
                            // 跳过翻译关键字
                            while (dataStart < chunkData.length && chunkData[dataStart] !== 0) dataStart++;
                            dataStart++;
                        }

                        const base64Data = chunkData.toString('utf8', dataStart);
                        const jsonStr = Buffer.from(base64Data, 'base64').toString('utf8');
                        character = JSON.parse(jsonStr);
                        break;
                    }
                }
            }

            offset += 12 + length; // 4(length) + 4(type) + length + 4(crc)
        }

        if (!character) {
            throw new Error('无法从 PNG 文件中读取角色数据');
        }

        // 检查是否有覆盖层文件
        const overridePath = path.join(this.overridesDir, characterName + '.json');
        if (fs.existsSync(overridePath)) {
            try {
                const overrideData = JSON.parse(fs.readFileSync(overridePath, 'utf-8'));
                // 合并覆盖层数据
                character = { ...character, ...overrideData };
            } catch (e) {
                console.error(`读取覆盖层文件失败: ${overridePath}`, e);
            }
        }

        // 缓存结果
        this.cache.set(characterName, character);
        return character;
    }

    /**
     * 更新角色数据（保存到覆盖层文件）
     * @param {string} characterName - 角色名称（不含扩展名）
     * @param {Object} updates - 要更新的字段
     * @returns {Object} 更新后的完整角色数据
     */
    updateCharacter(characterName, updates) {
        // 先清除缓存，确保读取最新数据
        this.cache.delete(characterName);
        
        // 读取原始角色数据
        const pngPath = path.join(this.charactersDir, characterName + '.png');
        if (!fs.existsSync(pngPath)) {
            throw new Error(`角色文件不存在: ${pngPath}`);
        }

        // 读取现有的覆盖层数据（如果存在）
        const overridePath = path.join(this.overridesDir, characterName + '.json');
        let existingOverrides = {};
        if (fs.existsSync(overridePath)) {
            try {
                existingOverrides = JSON.parse(fs.readFileSync(overridePath, 'utf-8'));
            } catch (e) {
                console.error(`读取覆盖层文件失败: ${overridePath}`, e);
            }
        }

        // 合并更新
        const newOverrides = { ...existingOverrides, ...updates };
        
        // 保存覆盖层文件
        fs.writeFileSync(overridePath, JSON.stringify(newOverrides, null, 2), 'utf-8');

        // 重新读取并返回完整的角色数据
        const updatedCharacter = this.readFromPng(characterName);
        
        // 如果是当前角色，也更新 currentCharacter
        if (this.currentCharacter && this.currentCharacter.name === updatedCharacter.name) {
            this.currentCharacter = updatedCharacter;
        }

        return updatedCharacter;
    }

    /**
     * 获取所有角色列表
     */
    listCharacters() {
        if (!fs.existsSync(this.charactersDir)) {
            return [];
        }

        const files = fs.readdirSync(this.charactersDir);
        return files
            .filter(f => f.endsWith('.png'))
            .map(f => f.replace('.png', ''));
    }

    /**
     * 获取角色信息（简要）
     */
    getCharacterInfo(characterName) {
        const character = this.readFromPng(characterName);
        return {
            name: character.name,
            description: character.description?.substring(0, 200) + '...',
            personality: character.personality?.substring(0, 100) + '...',
            hasFirstMessage: !!character.first_mes,
            hasSystemPrompt: !!character.system_prompt
        };
    }

    /**
     * 清除缓存
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * 获取当前选中的角色
     */
    getCurrentCharacter() {
        return this.currentCharacter;
    }

    /**
     * 加载并设置当前角色
     */
    loadCharacter(characterName) {
        const character = this.readFromPng(characterName);
        this.currentCharacter = character;
        return character;
    }

    /**
     * 扫描角色目录（刷新列表）
     */
    scanCharacters() {
        this.clearCache();
        return this.listCharacters();
    }
}
