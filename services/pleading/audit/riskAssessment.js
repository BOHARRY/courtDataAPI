// services/pleading/audit/riskAssessment.js

/**
 * 🎯 風險評估模組
 * 負責計算 AI 補充內容的風險等級
 */

export class RiskAssessment {
    constructor() {
        this.riskWeights = {
            legalArticles: 3,    // 法條補充風險最高
            facts: 2,            // 事實補充風險中等
            arguments: 1,        // 論述補充風險較低
            procedures: 0.5,     // 程序補充風險最低
            calculations: 0.5    // 計算補充風險最低
        };

        this.riskThresholds = {
            LOW: 0,
            MEDIUM: 3,
            HIGH: 6,
            CRITICAL: 10
        };
    }

    /**
     * 計算 AI 補充內容的風險等級
     */
    calculateRiskLevel(aiAdditions) {
        let riskScore = 0;
        
        // 根據不同類型的補充內容計算風險分數
        Object.keys(this.riskWeights).forEach(category => {
            const count = aiAdditions[category]?.length || 0;
            const weight = this.riskWeights[category];
            riskScore += count * weight;
        });

        // 根據分數確定風險等級
        if (riskScore === 0) return 'LOW';
        if (riskScore <= this.riskThresholds.MEDIUM) return 'MEDIUM';
        if (riskScore <= this.riskThresholds.HIGH) return 'HIGH';
        return 'CRITICAL';
    }

    /**
     * 獲取詳細的風險分析
     */
    getDetailedRiskAnalysis(aiAdditions) {
        const analysis = {
            totalScore: 0,
            categoryScores: {},
            riskFactors: [],
            recommendations: []
        };

        // 計算各類別的風險分數
        Object.keys(this.riskWeights).forEach(category => {
            const count = aiAdditions[category]?.length || 0;
            const weight = this.riskWeights[category];
            const score = count * weight;
            
            analysis.categoryScores[category] = {
                count,
                weight,
                score
            };
            
            analysis.totalScore += score;

            // 識別風險因子
            if (count > 0) {
                analysis.riskFactors.push({
                    category,
                    count,
                    riskLevel: this.getCategoryRiskLevel(category),
                    description: this.getCategoryDescription(category)
                });
            }
        });

        // 生成建議
        analysis.recommendations = this.generateRecommendations(analysis);

        return analysis;
    }

    /**
     * 獲取類別風險等級
     */
    getCategoryRiskLevel(category) {
        const weight = this.riskWeights[category];
        if (weight >= 3) return 'HIGH';
        if (weight >= 2) return 'MEDIUM';
        return 'LOW';
    }

    /**
     * 獲取類別描述
     */
    getCategoryDescription(category) {
        const descriptions = {
            legalArticles: '法條引用需要特別謹慎，建議逐一驗證',
            facts: '事實陳述可能影響案件結果，需要確認準確性',
            arguments: '法律論述應檢查邏輯性和適用性',
            procedures: '程序性內容通常風險較低，但仍需確認格式正確',
            calculations: '計算內容需要驗證數字和公式的準確性'
        };
        
        return descriptions[category] || '需要檢查的補充內容';
    }

    /**
     * 生成風險緩解建議
     */
    generateRecommendations(analysis) {
        const recommendations = [];

        if (analysis.totalScore >= this.riskThresholds.CRITICAL) {
            recommendations.push({
                priority: 'URGENT',
                action: '立即進行全面審查',
                reason: '檢測到高風險的AI補充內容'
            });
        }

        if (analysis.categoryScores.legalArticles?.count > 0) {
            recommendations.push({
                priority: 'HIGH',
                action: '驗證所有法條引用的準確性和適用性',
                reason: '法條錯誤可能導致嚴重後果'
            });
        }

        if (analysis.categoryScores.facts?.count > 2) {
            recommendations.push({
                priority: 'MEDIUM',
                action: '核實事實陳述的真實性',
                reason: '大量事實補充可能包含推測內容'
            });
        }

        if (analysis.totalScore > 0) {
            recommendations.push({
                priority: 'LOW',
                action: '建議與當事人確認所有補充內容',
                reason: '確保文書內容符合實際情況'
            });
        }

        return recommendations;
    }

    /**
     * 更新風險權重配置
     */
    updateRiskWeights(newWeights) {
        this.riskWeights = { ...this.riskWeights, ...newWeights };
    }

    /**
     * 更新風險閾值配置
     */
    updateRiskThresholds(newThresholds) {
        this.riskThresholds = { ...this.riskThresholds, ...newThresholds };
    }
}
