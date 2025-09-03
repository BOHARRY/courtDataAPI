// services/pleading/audit/contentAuditor.js

import { RiskAssessment } from './riskAssessment.js';
import { TransparencyReporter } from './transparencyReporter.js';

/**
 * 🔍 內容審查器
 * 負責解析 AI 標記內容並生成透明度報告
 */

export class ContentAuditor {
    constructor() {
        this.riskAssessment = new RiskAssessment();
        this.transparencyReporter = new TransparencyReporter();
    }

    /**
     * 解析 AI 標記內容，生成透明度報告
     */
    auditContent(pleadingContent) {
        const aiAdditions = this.parseAIMarkedContent(pleadingContent);
        const riskLevel = this.riskAssessment.calculateRiskLevel(aiAdditions);
        const lawyerChecklist = this.transparencyReporter.generateLawyerChecklist(aiAdditions);

        return {
            aiAdditions,
            riskLevel,
            lawyerChecklist,
            summary: {
                totalAdditions: Object.values(aiAdditions).reduce((sum, arr) => sum + arr.length, 0),
                hasLegalArticles: aiAdditions.legalArticles.length > 0,
                hasFacts: aiAdditions.facts.length > 0,
                hasArguments: aiAdditions.arguments.length > 0
            }
        };
    }

    /**
     * 解析 AI 標記內容
     */
    parseAIMarkedContent(pleadingContent) {
        const aiAdditions = {
            legalArticles: [],      // AI補充的法條
            facts: [],              // AI補充的事實
            arguments: [],          // AI補充的論述
            procedures: [],         // AI補充的程序性內容
            calculations: [],       // AI補充的計算
            other: []              // 其他AI補充內容
        };

        // 定義標記模式
        const patterns = {
            legalArticles: /【AI補充-法條】(.*?)【\/AI補充-法條】/g,
            facts: /【AI補充-事實】(.*?)【\/AI補充-事實】/g,
            arguments: /【AI補充-論述】(.*?)【\/AI補充-論述】/g,
            procedures: /【AI補充-程序】(.*?)【\/AI補充-程序】/g,
            calculations: /【AI補充-計算】(.*?)【\/AI補充-計算】/g
        };

        // 解析各類標記內容
        Object.keys(patterns).forEach(category => {
            const matches = [...pleadingContent.matchAll(patterns[category])];
            matches.forEach(match => {
                if (match[1] && match[1].trim()) {
                    aiAdditions[category].push({
                        content: match[1].trim(),
                        position: match.index,
                        fullMatch: match[0]
                    });
                }
            });
        });

        return aiAdditions;
    }

    /**
     * 驗證標記格式的正確性
     */
    validateMarkingFormat(pleadingContent) {
        const issues = [];
        
        // 檢查未閉合的標記
        const openTags = pleadingContent.match(/【AI補充-[^】]+】/g) || [];
        const closeTags = pleadingContent.match(/【\/AI補充-[^】]+】/g) || [];
        
        if (openTags.length !== closeTags.length) {
            issues.push({
                type: 'UNCLOSED_TAGS',
                message: `發現 ${openTags.length} 個開始標記，但只有 ${closeTags.length} 個結束標記`,
                severity: 'WARNING'
            });
        }

        // 檢查嵌套標記
        const nestedPattern = /【AI補充-[^】]+】.*?【AI補充-[^】]+】.*?【\/AI補充-[^】]+】.*?【\/AI補充-[^】]+】/g;
        const nestedMatches = pleadingContent.match(nestedPattern);
        
        if (nestedMatches && nestedMatches.length > 0) {
            issues.push({
                type: 'NESTED_TAGS',
                message: `發現 ${nestedMatches.length} 個可能的嵌套標記`,
                severity: 'WARNING'
            });
        }

        return {
            isValid: issues.length === 0,
            issues
        };
    }

    /**
     * 獲取審查統計
     */
    getAuditStats(auditResult) {
        return {
            totalMarkedContent: auditResult.summary.totalAdditions,
            riskDistribution: {
                high: auditResult.aiAdditions.legalArticles.length,
                medium: auditResult.aiAdditions.facts.length,
                low: auditResult.aiAdditions.arguments.length + 
                     auditResult.aiAdditions.procedures.length + 
                     auditResult.aiAdditions.calculations.length
            },
            checklistItems: auditResult.lawyerChecklist.reduce((sum, category) => 
                sum + category.items.length, 0
            )
        };
    }
}
