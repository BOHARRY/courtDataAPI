// utils/xaiClient.js
import { xai } from '@ai-sdk/xai';
import { generateText } from 'ai';
import { XAI_API_KEY } from '../config/environment.js';

/**
 * xAI 客戶端工具類
 * 提供與 OpenAI 相容的介面，方便從 OpenAI 遷移到 xAI
 */
class XAIClient {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.xaiProvider = xai({
            apiKey: apiKey
        });

        // 創建與 OpenAI 相容的結構
        this.chat = {
            completions: {
                create: this.createChatCompletion.bind(this)
            }
        };
    }

    /**
     * 創建聊天完成 - 與 OpenAI 相容的介面
     * @param {Object} options - 聊天完成選項
     * @returns {Promise<Object>} - 格式化後的回應
     */
    async createChatCompletion(options) {
        try {
            const { model, messages, temperature, max_tokens, response_format } = options;
            
            // 轉換 messages 格式
            let prompt = this.convertMessagesToPrompt(messages);

            // 如果需要 JSON 格式，添加指示
            if (response_format?.type === 'json_object') {
                prompt += '\n\n請確保回應是有效的 JSON 格式，不要包含任何其他文字。';
            }

            // 調用 xAI
            const result = await generateText({
                model: this.xaiProvider(model),
                prompt: prompt,
                temperature: temperature || 0.7,
                maxTokens: max_tokens || 1000
            });

            // 轉換為 OpenAI 相容的格式
            return {
                choices: [{
                    message: {
                        content: result.text,
                        role: 'assistant'
                    },
                    finish_reason: 'stop'
                }],
                usage: {
                    prompt_tokens: result.usage?.promptTokens || 0,
                    completion_tokens: result.usage?.completionTokens || 0,
                    total_tokens: result.usage?.totalTokens || 0
                }
            };

        } catch (error) {
            console.error('[XAIClient] 調用失敗:', error);
            throw new Error(`xAI API 調用失敗: ${error.message}`);
        }
    }

    /**
     * 將 OpenAI 格式的 messages 轉換為單一 prompt
     * @param {Array} messages - OpenAI 格式的訊息陣列
     * @returns {string} - 轉換後的 prompt
     */
    convertMessagesToPrompt(messages) {
        let prompt = '';
        
        for (const message of messages) {
            if (message.role === 'system') {
                prompt += `系統指示: ${message.content}\n\n`;
            } else if (message.role === 'user') {
                prompt += `用戶: ${message.content}\n\n`;
            } else if (message.role === 'assistant') {
                prompt += `助手: ${message.content}\n\n`;
            }
        }
        
        return prompt.trim();
    }
}

// 創建全域實例
const xaiClient = new XAIClient(XAI_API_KEY);

export default xaiClient;
export { XAIClient };
