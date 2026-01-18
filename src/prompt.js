/**
 * Prompt 构建模块
 * 仿照 SillyTavern 的逻辑组装 Prompt
 */

export class PromptBuilder {
    constructor(characterManager, worldBookManager) {
        this.characterManager = characterManager;
        this.worldBookManager = worldBookManager;
    }

    /**
     * 构建完整的 Prompt
     * @param {string} characterName - 角色名
     * @param {string} userMessage - 用户消息
     * @param {Array} historyMessages - 历史消息
     * @param {Set<string>} stickyKeys - 当前会话的粘性条目键集合
     */
    async build(characterName, userMessage, historyMessages = [], stickyKeys = new Set()) {
        // 读取角色数据
        const character = this.characterManager.readFromPng(characterName);
        
        // 读取世界书：优先使用已选择的世界书，否则根据角色名查找
        let worldBook = this.worldBookManager.currentWorldBook;
        if (!worldBook) {
            worldBook = this.worldBookManager.readWorldBook(characterName);
        }
        
        // 用于世界书匹配的文本：历史消息 + 当前消息
        const allText = historyMessages.map(m => m.content).join(' ') + ' ' + userMessage;
        
        // 匹配世界书条目（传入粘性键）
        const worldBookEntries = this.worldBookManager.matchEntries(worldBook, allText, 10, stickyKeys);
        
        // 构建系统提示
        let systemPrompt = '';
        
        // 1. 添加当前时间
        const now = new Date();
        const timeStr = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
        systemPrompt += `【当前时间】${timeStr}\n\n`;
        
        // 2. 添加世界书内容（position 较高的放前面）
        if (worldBookEntries.length > 0) {
            systemPrompt += '【世界设定】\n';
            for (const entry of worldBookEntries) {
                systemPrompt += entry.content + '\n\n';
            }
        }
        
        // 3. 添加角色信息
        if (character.description) {
            systemPrompt += `【角色描述】\n${character.description}\n\n`;
        }
        
        if (character.personality) {
            systemPrompt += `【${character.name}的性格】\n${character.personality}\n\n`;
        }
        
        if (character.scenario) {
            systemPrompt += `【场景】\n${character.scenario}\n\n`;
        }
        
        // 4. 添加系统提示（如果有）
        if (character.system_prompt) {
            systemPrompt += character.system_prompt + '\n\n';
        }
        
        // 构建消息数组
        const messages = [
            { role: 'system', content: systemPrompt }
        ];
        
        // 5. 添加首条消息（如果是新会话）
        if (historyMessages.length === 0 && character.first_mes) {
            messages.push({ role: 'assistant', content: character.first_mes });
        }
        
        // 6. 添加历史消息
        for (const msg of historyMessages) {
            messages.push(msg);
        }
        
        // 7. 添加当前用户消息
        messages.push({ role: 'user', content: userMessage });
        
        return {
            messages,
            character,
            worldBookCount: worldBookEntries.length,
            worldBookKeys: worldBookEntries.map(e => e.key),
            // 返回完整的条目信息，用于更新粘性状态
            worldBookEntries: worldBookEntries.map(e => ({
                key: e.key,
                sticky: e.sticky || 0,
                triggeredByKeyword: e.triggeredByKeyword,
                triggeredBySticky: e.triggeredBySticky,
                comment: e.comment
            }))
        };
    }
}
