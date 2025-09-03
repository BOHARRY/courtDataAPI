// services/pleading/ai/claudeClient.js

import Anthropic from '@anthropic-ai/sdk';
import { CLAUDE_API_KEY, CLAUDE_MODEL_PLEADING } from '../../../config/environment.js';
import { ClaudePromptBuilder } from '../prompt/claudePromptBuilder.js';
import { ContentAuditor } from '../audit/contentAuditor.js';
import { ContentCleaner } from '../utils/contentCleaner.js';

/**
 * 🎯 Claude 客戶端
 * 負責與 Claude API 的交互和內容生成
 */

export class ClaudeClient {
    constructor() {
        this.anthropic = new Anthropic({
            apiKey: CLAUDE_API_KEY
        });
        this.promptBuilder = new ClaudePromptBuilder();
        this.contentAuditor = new ContentAuditor();
        this.contentCleaner = new ContentCleaner();
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
            
            console.log('[ClaudeClient] 🎯 使用 Claude Opus 4 生成訴狀內容');
            console.log('[ClaudeClient] 立場資訊:', {
                stance: pleadingData.caseInfo?.stance,
                litigationStage: pleadingData.litigationStage,
                documentType: pleadingData.litigationStage
            });

            // 🎯 為 Claude 創建優化的提示詞
            const prompt = this.promptBuilder.buildPrompt(pleadingData);

            console.log('[ClaudeClient] 提示詞長度:', prompt.length);

            // 🚀 調用 Claude Opus 4
            const response = await this.anthropic.messages.create({
                model: CLAUDE_MODEL_PLEADING,
                max_tokens: 4000, // Claude 支援更長的輸出
                temperature: 0.1, // 較低的溫度確保一致性
                messages: [
                    {
                        role: "user",
                        content: prompt
                    }
                ]
            });

            const pleadingContent = response.content[0].text;

            console.log('[ClaudeClient] Claude Opus 4 生成完成，內容長度:', pleadingContent.length);

            // 🔍 解析 AI 標記內容，生成透明度報告
            const transparencyReport = this.contentAuditor.auditContent(pleadingContent);
            console.log('[ClaudeClient] 🔍 AI 內容審查完成:', {
                totalAdditions: transparencyReport.summary.totalAdditions,
                riskLevel: transparencyReport.riskLevel,
                hasLegalArticles: transparencyReport.summary.hasLegalArticles
            });

            // 🧹 生成乾淨版本（移除標記）
            const cleanContent = this.contentCleaner.cleanMarkers(pleadingContent);

            // 更新統計
            this.stats.successfulRequests++;
            this.stats.totalTokens += (response.usage?.input_tokens + response.usage?.output_tokens) || 0;

            // 組裝結果
            return {
                pleadingContent: cleanContent,              // 乾淨版本（供律師使用）
                pleadingContentWithMarkers: pleadingContent, // 標記版本（供審查使用）
                generatedAt: new Date().toISOString(),
                litigationStage: pleadingData.litigationStage,
                metadata: {
                    model: CLAUDE_MODEL_PLEADING,
                    totalTokens: response.usage?.input_tokens + response.usage?.output_tokens || 0,
                    inputTokens: response.usage?.input_tokens || 0,
                    outputTokens: response.usage?.output_tokens || 0,
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
                },
                transparencyReport: {
                    aiAdditions: transparencyReport.aiAdditions,
                    riskLevel: transparencyReport.riskLevel,
                    lawyerChecklist: transparencyReport.lawyerChecklist,
                    summary: transparencyReport.summary,
                    auditedAt: new Date().toISOString(),
                    auditMethod: 'structured_marking'
                }
            };

        } catch (error) {
            this.stats.failedRequests++;
            console.error('[ClaudeClient] Claude Opus 4 生成失敗:', error);
            throw new Error(`Claude 訴狀生成失敗: ${error.message}`);
        }
    }

    /**
     * 健康檢查
     */
    async healthCheck() {
        try {
            const response = await this.anthropic.messages.create({
                model: CLAUDE_MODEL_PLEADING,
                max_tokens: 10,
                messages: [{ role: "user", content: "Hello" }]
            });
            return response.content[0].text !== undefined;
        } catch (error) {
            throw new Error(`Claude 健康檢查失敗: ${error.message}`);
        }
    }

    /**
     * 獲取統計信息
     */
    getStats() {
        return { ...this.stats };
    }
}
