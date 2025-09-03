// services/pleading/ai/gptClient.js

import OpenAI from 'openai';
import { OPENAI_API_KEY } from '../../../config/environment.js';
import { GPTPromptBuilder } from '../prompt/gptPromptBuilder.js';

/**
 * 🎯 GPT 客戶端
 * 負責與 OpenAI GPT API 的交互和內容生成
 */

export class GPTClient {
    constructor() {
        this.openai = new OpenAI({
            apiKey: OPENAI_API_KEY
        });
        this.promptBuilder = new GPTPromptBuilder();
        this.stats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            totalTokens: 0
        };
    }

    /**
     * 生成訴狀內容
     */
    async generateContent(pleadingData) {
        try {
            this.stats.totalRequests++;
            
            console.log('[GPTClient] 🔄 使用 GPT-4.1 生成訴狀內容');
            console.log('[GPTClient] 立場資訊:', {
                stance: pleadingData.caseInfo?.stance,
                litigationStage: pleadingData.litigationStage,
                documentType: pleadingData.litigationStage
            });

            // 🔄 為 GPT 創建提示詞
            const prompt = this.promptBuilder.buildPrompt(pleadingData);

            console.log('[GPTClient] 提示詞長度:', prompt.length);

            // 🔄 調用 GPT-4.1
            const response = await this.openai.chat.completions.create({
                model: "gpt-4-1106-preview",
                messages: [
                    {
                        role: "system",
                        content: "你是台灣資深律師，專精各種法律文書的編寫。請嚴格按照指示生成專業的法律文書。"
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                max_tokens: 3000,
                temperature: 0.1
            });

            const pleadingContent = response.choices[0].message.content;

            console.log('[GPTClient] GPT-4.1 生成完成，內容長度:', pleadingContent.length);

            // 更新統計
            this.stats.successfulRequests++;
            this.stats.totalTokens += response.usage?.total_tokens || 0;

            // 組裝結果
            return {
                pleadingContent: pleadingContent,
                generatedAt: new Date().toISOString(),
                litigationStage: pleadingData.litigationStage,
                metadata: {
                    model: "gpt-4-1106-preview",
                    totalTokens: response.usage?.total_tokens || 0,
                    inputTokens: response.usage?.prompt_tokens || 0,
                    outputTokens: response.usage?.completion_tokens || 0,
                    inputDataSummary: {
                        caseInfoProvided: !!pleadingData.caseInfo,
                        claimsCount: pleadingData.claims?.length || 0,
                        lawsCount: pleadingData.laws?.length || 0,
                        evidenceCount: pleadingData.evidence?.length || 0,
                        disputesCount: pleadingData.disputes?.length || 0
                    }
                },
                inputSummary: {
                    litigationStage: pleadingData.litigationStage,
                    caseType: pleadingData.caseInfo?.caseType,
                    claimsCount: pleadingData.claims?.length || 0,
                    lawsCount: pleadingData.laws?.length || 0,
                    evidenceCount: pleadingData.evidence?.length || 0
                }
            };

        } catch (error) {
            this.stats.failedRequests++;
            console.error('[GPTClient] GPT-4.1 生成失敗:', error);
            throw new Error(`GPT 訴狀生成失敗: ${error.message}`);
        }
    }

    /**
     * 健康檢查
     */
    async healthCheck() {
        try {
            const response = await this.openai.chat.completions.create({
                model: "gpt-4-1106-preview",
                messages: [{ role: "user", content: "Hello" }],
                max_tokens: 5
            });
            return response.choices[0].message.content !== undefined;
        } catch (error) {
            throw new Error(`GPT 健康檢查失敗: ${error.message}`);
        }
    }

    /**
     * 獲取統計信息
     */
    getStats() {
        return { ...this.stats };
    }
}
