// services/pleading/audit/transparencyReporter.js

/**
 * 🎯 透明度報告生成器
 * 負責生成律師檢查清單和透明度報告
 */

export class TransparencyReporter {
    constructor() {
        this.priorityLevels = {
            HIGH: { weight: 3, color: 'red', urgency: '立即檢查' },
            MEDIUM: { weight: 2, color: 'orange', urgency: '重要檢查' },
            LOW: { weight: 1, color: 'yellow', urgency: '建議檢查' }
        };
    }

    /**
     * 生成律師檢查清單
     */
    generateLawyerChecklist(aiAdditions) {
        const checklist = [];

        // 法條驗證（最高優先級）
        if (aiAdditions.legalArticles.length > 0) {
            checklist.push({
                priority: 'HIGH',
                category: '法條驗證',
                urgency: this.priorityLevels.HIGH.urgency,
                items: aiAdditions.legalArticles.map((item, index) => ({
                    id: `legal_${index}`,
                    content: item.content,
                    checkPoint: `請驗證法條引用：${this.truncateText(item.content, 50)}`,
                    position: item.position,
                    riskLevel: 'HIGH',
                    recommendation: '確認法條條號、內容準確性及適用性'
                }))
            });
        }

        // 事實查核（中等優先級）
        if (aiAdditions.facts.length > 0) {
            checklist.push({
                priority: 'MEDIUM',
                category: '事實查核',
                urgency: this.priorityLevels.MEDIUM.urgency,
                items: aiAdditions.facts.map((item, index) => ({
                    id: `fact_${index}`,
                    content: item.content,
                    checkPoint: `請確認事實描述：${this.truncateText(item.content, 50)}`,
                    position: item.position,
                    riskLevel: 'MEDIUM',
                    recommendation: '核實事實的真實性和完整性'
                }))
            });
        }

        // 論述檢查（較低優先級）
        if (aiAdditions.arguments.length > 0) {
            checklist.push({
                priority: 'LOW',
                category: '論述檢查',
                urgency: this.priorityLevels.LOW.urgency,
                items: aiAdditions.arguments.map((item, index) => ({
                    id: `argument_${index}`,
                    content: item.content,
                    checkPoint: `請檢查論述邏輯：${this.truncateText(item.content, 50)}`,
                    position: item.position,
                    riskLevel: 'LOW',
                    recommendation: '確認論述邏輯性和說服力'
                }))
            });
        }

        // 程序性內容檢查
        if (aiAdditions.procedures.length > 0) {
            checklist.push({
                priority: 'LOW',
                category: '程序檢查',
                urgency: this.priorityLevels.LOW.urgency,
                items: aiAdditions.procedures.map((item, index) => ({
                    id: `procedure_${index}`,
                    content: item.content,
                    checkPoint: `請檢查程序格式：${this.truncateText(item.content, 50)}`,
                    position: item.position,
                    riskLevel: 'LOW',
                    recommendation: '確認符合法院格式要求'
                }))
            });
        }

        // 計算檢查
        if (aiAdditions.calculations.length > 0) {
            checklist.push({
                priority: 'MEDIUM',
                category: '計算檢查',
                urgency: this.priorityLevels.MEDIUM.urgency,
                items: aiAdditions.calculations.map((item, index) => ({
                    id: `calculation_${index}`,
                    content: item.content,
                    checkPoint: `請驗證計算結果：${this.truncateText(item.content, 50)}`,
                    position: item.position,
                    riskLevel: 'MEDIUM',
                    recommendation: '確認數字、公式和計算邏輯正確'
                }))
            });
        }

        return this.sortChecklistByPriority(checklist);
    }

    /**
     * 生成詳細透明度報告
     */
    generateDetailedReport(aiAdditions, riskLevel, lawyerChecklist) {
        const report = {
            summary: this.generateSummary(aiAdditions, riskLevel),
            breakdown: this.generateBreakdown(aiAdditions),
            checklist: lawyerChecklist,
            recommendations: this.generateRecommendations(riskLevel, aiAdditions),
            statistics: this.generateStatistics(aiAdditions),
            metadata: {
                generatedAt: new Date().toISOString(),
                version: '1.0',
                reportType: 'AI_CONTENT_TRANSPARENCY'
            }
        };

        return report;
    }

    /**
     * 生成摘要
     */
    generateSummary(aiAdditions, riskLevel) {
        const totalAdditions = Object.values(aiAdditions).reduce((sum, arr) => sum + arr.length, 0);
        
        return {
            totalAIAdditions: totalAdditions,
            riskLevel,
            riskDescription: this.getRiskDescription(riskLevel),
            hasHighRiskContent: aiAdditions.legalArticles.length > 0,
            requiresImmediateAttention: riskLevel === 'CRITICAL' || riskLevel === 'HIGH',
            overallAssessment: this.getOverallAssessment(riskLevel, totalAdditions)
        };
    }

    /**
     * 生成分類統計
     */
    generateBreakdown(aiAdditions) {
        return {
            legalArticles: {
                count: aiAdditions.legalArticles.length,
                riskLevel: 'HIGH',
                description: 'AI 自行引用的法條條文'
            },
            facts: {
                count: aiAdditions.facts.length,
                riskLevel: 'MEDIUM',
                description: 'AI 推論補充的事實描述'
            },
            arguments: {
                count: aiAdditions.arguments.length,
                riskLevel: 'LOW',
                description: 'AI 添加的法律論述'
            },
            procedures: {
                count: aiAdditions.procedures.length,
                riskLevel: 'LOW',
                description: 'AI 補充的程序性內容'
            },
            calculations: {
                count: aiAdditions.calculations.length,
                riskLevel: 'MEDIUM',
                description: 'AI 進行的計算和推算'
            }
        };
    }

    /**
     * 生成建議
     */
    generateRecommendations(riskLevel, aiAdditions) {
        const recommendations = [];

        if (riskLevel === 'CRITICAL') {
            recommendations.push({
                priority: 'URGENT',
                action: '立即暫停使用此訴狀，進行全面人工審查',
                reason: '檢測到極高風險的 AI 補充內容'
            });
        }

        if (aiAdditions.legalArticles.length > 0) {
            recommendations.push({
                priority: 'HIGH',
                action: '逐一驗證所有 AI 引用的法條',
                reason: '法條錯誤可能導致敗訴風險'
            });
        }

        if (aiAdditions.facts.length > 2) {
            recommendations.push({
                priority: 'MEDIUM',
                action: '與當事人確認所有事實描述',
                reason: '大量事實補充可能包含推測內容'
            });
        }

        recommendations.push({
            priority: 'LOW',
            action: '建議在提交前進行最終審查',
            reason: '確保文書內容完全符合案件實際情況'
        });

        return recommendations;
    }

    /**
     * 生成統計信息
     */
    generateStatistics(aiAdditions) {
        const totalItems = Object.values(aiAdditions).reduce((sum, arr) => sum + arr.length, 0);
        
        return {
            totalItems,
            distribution: {
                highRisk: aiAdditions.legalArticles.length,
                mediumRisk: aiAdditions.facts.length + aiAdditions.calculations.length,
                lowRisk: aiAdditions.arguments.length + aiAdditions.procedures.length
            },
            percentages: {
                highRisk: totalItems > 0 ? (aiAdditions.legalArticles.length / totalItems * 100).toFixed(1) : 0,
                mediumRisk: totalItems > 0 ? ((aiAdditions.facts.length + aiAdditions.calculations.length) / totalItems * 100).toFixed(1) : 0,
                lowRisk: totalItems > 0 ? ((aiAdditions.arguments.length + aiAdditions.procedures.length) / totalItems * 100).toFixed(1) : 0
            }
        };
    }

    /**
     * 輔助方法
     */
    truncateText(text, maxLength) {
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    sortChecklistByPriority(checklist) {
        const priorityOrder = { 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
        return checklist.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);
    }

    getRiskDescription(riskLevel) {
        const descriptions = {
            'LOW': '風險較低，建議例行檢查',
            'MEDIUM': '中等風險，需要重點關注',
            'HIGH': '高風險，需要仔細審查',
            'CRITICAL': '極高風險，需要立即處理'
        };
        return descriptions[riskLevel] || '未知風險等級';
    }

    getOverallAssessment(riskLevel, totalAdditions) {
        if (totalAdditions === 0) {
            return '此訴狀完全基於提供的資料生成，無 AI 補充內容';
        }
        
        if (riskLevel === 'CRITICAL') {
            return '此訴狀包含高風險 AI 補充內容，強烈建議人工全面審查';
        }
        
        if (riskLevel === 'HIGH') {
            return '此訴狀包含需要驗證的 AI 補充內容，建議重點檢查';
        }
        
        return '此訴狀包含少量 AI 補充內容，建議例行檢查後使用';
    }
}
