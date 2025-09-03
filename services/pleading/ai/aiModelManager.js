// services/pleading/ai/aiModelManager.js

import { ClaudeClient } from './claudeClient.js';
import { GPTClient } from './gptClient.js';

/**
 * 🎯 AI 模型管理器
 * 負責協調不同 AI 模型的使用和回退策略
 */

export class AIModelManager {
    constructor() {
        this.claudeClient = new ClaudeClient();
        this.gptClient = new GPTClient();
    }

    /**
     * 智能 AI 模型選擇：優先 Claude，備用 GPT
     */
    async generatePleadingContent(pleadingData) {
        try {
            // 🚀 優先使用 Claude Opus 4（法律文件判別能力更強）
            console.log('[AIModelManager] 🎯 嘗試使用 Claude Opus 4 生成訴狀');
            return await this.claudeClient.generateContent(pleadingData);
            
        } catch (claudeError) {
            console.warn('[AIModelManager] ⚠️ Claude Opus 4 生成失敗，切換到 GPT-4.1 備用方案');
            console.warn('[AIModelManager] Claude 錯誤:', claudeError.message);
            
            try {
                // 🔄 備用方案：使用 GPT-4.1
                const result = await this.gptClient.generateContent(pleadingData);
                
                // 在結果中標記使用了備用模型
                result.metadata.model = "gpt-4.1 (fallback)";
                result.metadata.fallbackReason = claudeError.message;
                
                // 🔍 為 GPT 備用方案添加基本透明度報告
                result.transparencyReport = {
                    aiAdditions: { 
                        legalArticles: [], 
                        facts: [], 
                        arguments: [], 
                        procedures: [], 
                        calculations: [], 
                        other: [] 
                    },
                    riskLevel: 'UNKNOWN',
                    lawyerChecklist: [{
                        priority: 'HIGH',
                        category: '全面檢查',
                        items: ['GPT 備用方案生成，建議全面檢查所有內容的準確性']
                    }],
                    summary: { 
                        totalAdditions: 0, 
                        hasLegalArticles: false, 
                        hasFacts: false, 
                        hasArguments: false 
                    },
                    auditedAt: new Date().toISOString(),
                    auditMethod: 'fallback_basic'
                };
                
                return result;
                
            } catch (gptError) {
                console.error('[AIModelManager] ❌ 所有 AI 模型都失敗');
                console.error('[AIModelManager] GPT 錯誤:', gptError.message);
                throw new Error(`AI 訴狀生成完全失敗 - Claude: ${claudeError.message}, GPT: ${gptError.message}`);
            }
        }
    }

    /**
     * 檢查模型可用性
     */
    async checkModelAvailability() {
        const status = {
            claude: false,
            gpt: false
        };

        try {
            await this.claudeClient.healthCheck();
            status.claude = true;
        } catch (error) {
            console.warn('[AIModelManager] Claude 不可用:', error.message);
        }

        try {
            await this.gptClient.healthCheck();
            status.gpt = true;
        } catch (error) {
            console.warn('[AIModelManager] GPT 不可用:', error.message);
        }

        return status;
    }

    /**
     * 獲取模型統計信息
     */
    getModelStats() {
        return {
            claude: this.claudeClient.getStats(),
            gpt: this.gptClient.getStats()
        };
    }
}
