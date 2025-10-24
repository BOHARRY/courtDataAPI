// services/casePrecedentAnalysis/core/resultMerger.js

import {
    LAWYER_VALUE_WEIGHTS,
    MERGE_CONFIG
} from '../utils/constants.js';

/**
 * 混合智能合併策略（第二階段：律師價值優化）
 * 
 * @param {Array} searchResults - 多角度搜索結果
 * @param {string} userInput - 用戶輸入
 * @returns {Array} 合併後的結果
 */
export function mergeMultiAngleResults(searchResults, userInput) {
    try {
        console.log(`[VECTOR-TEST] 🔄 開始合併多角度搜尋結果...`);

        const caseMap = new Map();
        let totalProcessed = 0;

        // 收集所有成功的搜尋結果
        searchResults.forEach(angleResult => {
            if (!angleResult.success) return;

            angleResult.results.forEach((caseItem, index) => {
                const caseId = caseItem.id;
                const positionScore = (25 - index) / 25; // 位置加分
                const weightedScore = caseItem.similarity * angleResult.config.weight * positionScore;

                totalProcessed++;

                if (!caseMap.has(caseId)) {
                    caseMap.set(caseId, {
                        case: caseItem,
                        appearances: 0,
                        sourceAngles: [],
                        angleScores: {},
                        totalScore: 0,
                        maxSimilarity: 0,
                        isIntersection: false,
                        lawyerValue: {
                            relevanceScore: 0,
                            diversityBonus: 0,
                            practicalValue: 0
                        }
                    });
                }

                const existing = caseMap.get(caseId);
                existing.appearances++;
                existing.sourceAngles.push(angleResult.angleName);
                existing.angleScores[angleResult.angleName] = weightedScore;
                existing.totalScore += weightedScore;
                existing.maxSimilarity = Math.max(existing.maxSimilarity, caseItem.similarity);
                existing.isIntersection = existing.appearances >= MERGE_CONFIG.min_intersection;
            });
        });

        // 計算律師價值評分
        const casesWithValue = Array.from(caseMap.values()).map(item => {
            const lawyerValue = calculateLawyerValue(item, userInput);
            return {
                ...item,
                lawyerValue,
                finalScore: calculateFinalScore(item, lawyerValue)
            };
        });

        // 混合智能排序策略
        const sortedResults = casesWithValue.sort((a, b) => {
            // 1. 優先高價值案例（多角度命中 + 律師價值）
            if (a.isIntersection !== b.isIntersection) {
                return b.isIntersection - a.isIntersection;
            }

            // 2. 律師價值評分
            if (Math.abs(b.finalScore - a.finalScore) > 0.05) {
                return b.finalScore - a.finalScore;
            }

            // 3. 多角度出現次數
            if (b.appearances !== a.appearances) {
                return b.appearances - a.appearances;
            }

            // 4. 最高相似度
            return b.maxSimilarity - a.maxSimilarity;
        }).slice(0, MERGE_CONFIG.max_results);

        console.log(`[VECTOR-TEST] 🎯 合併完成: 處理 ${totalProcessed} 個 → 優化後 ${sortedResults.length} 個`);
        console.log(`[VECTOR-TEST] 📊 多角度命中: ${sortedResults.filter(r => r.isIntersection).length} 個\n`);

        const mergedResults = sortedResults.map((item, index) => {
            // 🔍 記錄前 10 個合併後案例的詳細信息
            if (index < 10) {
                console.log(`[VECTOR-TEST] 🏆 TOP ${index + 1}: ${item.case.id} | 相似度: ${(item.maxSimilarity * 100).toFixed(1)}% | 出現次數: ${item.appearances} | 案由: ${item.case.title?.substring(0, 30)}...`);
            }

            return {
                id: item.case.id,
                title: item.case.title,
                verdictType: item.case.verdictType,
                court: item.case.court,
                year: item.case.year,
                similarity: item.maxSimilarity,
                source: item.case.source,
                positionAnalysis: item.case.positionAnalysis,
                multiAngleData: {
                    appearances: item.appearances,
                    sourceAngles: item.sourceAngles,
                    totalScore: item.totalScore,
                    isIntersection: item.isIntersection,
                    angleScores: item.angleScores,
                    lawyerValue: item.lawyerValue,
                    finalScore: item.finalScore,
                    recommendationReason: generateRecommendationReason(item)
                }
            };
        });

        // 最終檢查：確認返回的數據中有 positionAnalysis
        const withPositionAnalysis = mergedResults.filter(r => r.positionAnalysis).length;
        console.log(`[mergeMultiAngleResults] 🔍 最終檢查: ${withPositionAnalysis}/${mergedResults.length} 個案例有 positionAnalysis 數據`);

        return mergedResults;

    } catch (error) {
        console.error('[resultMerger] 結果合併失敗:', error);
        throw error;
    }
}

/**
 * 計算律師價值評分
 * 
 * @private
 * @param {Object} caseItem - 案例項目
 * @param {string} userInput - 用戶輸入
 * @returns {Object} 律師價值評分
 */
function calculateLawyerValue(caseItem, userInput) {
    // 1. 相關性評分（基於相似度和多角度命中）
    const relevanceScore = caseItem.maxSimilarity * (caseItem.isIntersection ? 1.2 : 1.0);

    // 2. 多樣性加分（不同角度發現的案例更有價值）
    const diversityBonus = Math.min(caseItem.appearances * 0.1, 0.3);

    // 3. 實務價值評分（基於判決類型和法院層級）
    let practicalValue = 0.5; // 基礎分

    // 勝訴案例加分
    if (caseItem.case.verdictType?.includes('勝訴') || caseItem.case.verdictType?.includes('准許')) {
        practicalValue += 0.2;
    }

    // 高等法院以上案例加分
    if (caseItem.case.court?.includes('高等') || caseItem.case.court?.includes('最高')) {
        practicalValue += 0.15;
    }

    // 近期案例加分
    const currentYear = new Date().getFullYear();
    const caseYear = parseInt(caseItem.case.year) || 0;
    if (currentYear - caseYear <= 3) {
        practicalValue += 0.1;
    }

    return {
        relevanceScore: Math.min(relevanceScore, 1.0),
        diversityBonus: diversityBonus,
        practicalValue: Math.min(practicalValue, 1.0)
    };
}

/**
 * 計算最終評分
 * 
 * @private
 * @param {Object} caseItem - 案例項目
 * @param {Object} lawyerValue - 律師價值評分
 * @returns {number} 最終評分
 */
function calculateFinalScore(caseItem, lawyerValue) {
    return (
        lawyerValue.relevanceScore * LAWYER_VALUE_WEIGHTS.relevance +
        lawyerValue.diversityBonus * LAWYER_VALUE_WEIGHTS.diversity +
        lawyerValue.practicalValue * LAWYER_VALUE_WEIGHTS.practical
    );
}

/**
 * 生成推薦理由
 * 
 * @private
 * @param {Object} caseItem - 案例項目
 * @returns {string} 推薦理由
 */
function generateRecommendationReason(caseItem) {
    const reasons = [];

    if (caseItem.isIntersection) {
        reasons.push(`多角度命中 (${caseItem.appearances}個角度發現)`);
    }

    if (caseItem.maxSimilarity >= 0.85) {
        reasons.push('高度相關');
    } else if (caseItem.maxSimilarity >= 0.75) {
        reasons.push('相關性良好');
    }

    if (caseItem.case.verdictType?.includes('勝訴')) {
        reasons.push('勝訴案例');
    }

    if (caseItem.case.court?.includes('高等') || caseItem.case.court?.includes('最高')) {
        reasons.push('高層級法院');
    }

    const currentYear = new Date().getFullYear();
    const caseYear = parseInt(caseItem.case.year) || 0;
    if (currentYear - caseYear <= 2) {
        reasons.push('近期案例');
    }

    if (caseItem.sourceAngles.length >= 3) {
        reasons.push('多維度匹配');
    }

    return reasons.length > 0 ? reasons.join('、') : '基礎相關';
}

