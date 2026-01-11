/**
 * AI API 客户端模块
 */

export class AIClient {
    constructor(config) {
        this.config = config;
    }

    /**
     * 调用 AI API
     * @param {Array} messages - 消息数组
     */
    async chat(messages) {
        const headers = {
            'Content-Type': 'application/json'
        };

        if (this.config.apiKey) {
            headers['Authorization'] = `Bearer ${this.config.apiKey}`;
        }

        // 支持 baseUrl 或 apiUrl 配置
        const apiUrl = this.config.baseUrl 
            ? `${this.config.baseUrl}/chat/completions`
            : this.config.apiUrl;
        
        if (!apiUrl) {
            throw new Error('未配置 AI API URL (baseUrl 或 apiUrl)');
        }

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: this.config.model,
                messages,
                max_tokens: this.config.maxTokens,
                temperature: this.config.temperature,
                stream: false
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`AI API 错误: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    /**
     * 更新配置
     */
    updateConfig(newConfig) {
        Object.assign(this.config, newConfig);
    }
}
