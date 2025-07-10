// utils/xaiClient.js
import axios from 'axios';
import { XAI_API_KEY } from '../config/environment.js';

/**
 * xAI 客戶端工具類
 * 提供與 OpenAI 相容的介面，方便從 OpenAI 遷移到 xAI
 * 使用直接的 HTTP 調用方式，避免 SDK 相容性問題
 */
class XAIClient {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseURL = 'https://api.x.ai/v1';

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

            // 準備請求數據
            const requestData = {
                model: model,
                messages: messages,
                temperature: temperature || 0.7,
                max_tokens: max_tokens || 1000
            };

            // 如果需要 JSON 格式，添加到最後一個用戶訊息
            if (response_format?.type === 'json_object') {
                const lastMessage = requestData.messages[requestData.messages.length - 1];
                if (lastMessage.role === 'user') {
                    lastMessage.content += '\n\n請確保回應是有效的 JSON 格式，不要包含任何其他文字。';
                }
            }

            // 調用 xAI API
            const response = await axios.post(`${this.baseURL}/chat/completions`, requestData, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            // 返回與 OpenAI 相容的格式
            return response.data;

        } catch (error) {
            console.error('[XAIClient] 調用失敗:', error);

            // 提供更詳細的錯誤信息
            if (error.response) {
                const errorMsg = error.response.data?.error?.message || error.response.statusText;
                throw new Error(`xAI API 調用失敗 (${error.response.status}): ${errorMsg}`);
            } else if (error.request) {
                throw new Error(`xAI API 網路錯誤: 無法連接到 xAI 服務`);
            } else {
                throw new Error(`xAI API 調用失敗: ${error.message}`);
            }
        }
    }


}

// 創建全域實例
const xaiClient = new XAIClient(XAI_API_KEY);

export default xaiClient;
export { XAIClient };
