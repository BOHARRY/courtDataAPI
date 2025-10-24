// services/casePrecedentAnalysis/case/anomalyCaseProcessor.js

import { getJudgmentNodeData } from './caseDataFetcher.js';

/**
 * 從案例池生成詳細的異常案例數據（簡化版，不調用 ES）
 * 
 * @param {Array} anomalies - 異常案例列表
 * @param {Object} casePool - 案例池
 * @returns {Promise<Object>} 異常案例詳情
 */
export async function generateAnomalyDetailsFromPoolSimplified(anomalies, casePool) {
    console.log('[generateAnomalyDetailsFromPoolSimplified] 開始從案例池生成異常詳情（簡化版）');
    console.log('[generateAnomalyDetailsFromPoolSimplified] 異常類型:', anomalies.map(a => a.verdict));

    const anomalyDetails = {};

    for (const anomaly of anomalies) {
        console.log(`[generateAnomalyDetailsFromPoolSimplified] 處理異常類型: ${anomaly.verdict}`);

        // 從案例池中找到異常案例的 ID
        const anomalyCaseIds = anomaly.cases || [];

        // 從案例池中獲取異常案例的完整數據
        const anomalyCases = casePool.allCases.filter(case_ =>
            anomalyCaseIds.includes(case_.id)
        );

        console.log(`[generateAnomalyDetailsFromPoolSimplified] 找到 ${anomalyCases.length} 個 ${anomaly.verdict} 案例`);

        if (anomalyCases.length > 0) {
            // 簡化版：不調用 getJudgmentNodeData()，只使用案例池中已有的數據
            const detailedCases = anomalyCases.slice(0, 5).map((case_) => {
                console.log(`[generateAnomalyDetailsFromPoolSimplified] 處理案例 ${case_.id}`);

                return {
                    id: case_.id,
                    title: case_.title || '無標題',
                    court: case_.court || '未知法院',
                    year: case_.year || '未知年份',
                    similarity: case_.similarity || 0,
                    summary: `${case_.court || '未知法院'} ${case_.year || '未知年份'}年判決，判決結果：${case_.verdictType}`,
                    // 使用案例池中已有的數據（不調用 ES）
                    judgmentSummary: {
                        JID: case_.id,
                        JTITLE: case_.title,
                        court: case_.court,
                        verdict_type: case_.verdictType,
                        summary: case_.source?.summary_ai?.join(' ') || '案例摘要暫無',
                        hasFullData: false  // 標記為簡化版數據
                    },
                    keyDifferences: [
                        "與主流案例在事實認定上存在差異",
                        "法律適用或解釋角度不同",
                        "證據評價標準可能有所不同"
                    ],
                    riskFactors: [
                        { factor: "事實認定風險", level: "medium" },
                        { factor: "法律適用風險", level: "medium" },
                        { factor: "證據充分性", level: "high" }
                    ]
                };
            });

            anomalyDetails[anomaly.verdict] = detailedCases;
            console.log(`[generateAnomalyDetailsFromPoolSimplified] ${anomaly.verdict} 類型生成 ${detailedCases.length} 個案例詳情`);
        } else {
            console.log(`[generateAnomalyDetailsFromPoolSimplified] 警告: 案例池中沒有找到 ${anomaly.verdict} 類型的案例`);
        }
    }

    console.log('[generateAnomalyDetailsFromPoolSimplified] 生成完成，異常詳情鍵:', Object.keys(anomalyDetails));
    return anomalyDetails;
}

/**
 * 從案例池生成詳細的異常案例數據（完整版，調用 ES）
 * ⚠️ 此函數已棄用，建議使用 generateAnomalyDetailsFromPoolSimplified 代替
 * 
 * @param {Array} anomalies - 異常案例列表
 * @param {Object} casePool - 案例池
 * @returns {Promise<Object>} 異常案例詳情
 */
export async function generateAnomalyDetailsFromPool(anomalies, casePool) {
    console.log('[generateAnomalyDetailsFromPool] 開始從案例池生成異常詳情');
    console.log('[generateAnomalyDetailsFromPool] 異常類型:', anomalies.map(a => a.verdict));

    const anomalyDetails = {};

    for (const anomaly of anomalies) {
        console.log(`[generateAnomalyDetailsFromPool] 處理異常類型: ${anomaly.verdict}`);

        // 從案例池中找到異常案例的 ID
        const anomalyCaseIds = casePool.anomalies
            .find(a => a.verdict === anomaly.verdict)?.cases || [];

        // 從案例池中獲取異常案例的完整數據
        const anomalyCases = casePool.allCases.filter(case_ =>
            anomalyCaseIds.includes(case_.id)
        );

        console.log(`[generateAnomalyDetailsFromPool] 找到 ${anomalyCases.length} 個 ${anomaly.verdict} 案例`);

        if (anomalyCases.length > 0) {
            // 為每個異常案例生成詳細信息
            const detailedCases = await Promise.all(
                anomalyCases.slice(0, 5).map(async (case_, index) => {
                    console.log(`[generateAnomalyDetailsFromPool] 正在處理案例 ${case_.id}`);

                    // 從 ES 獲取完整數據（因為案例池已精簡）
                    let judgmentData = null;
                    try {
                        judgmentData = await getJudgmentNodeData(case_.id);
                    } catch (error) {
                        console.warn(`[generateAnomalyDetailsFromPool] 無法獲取案例 ${case_.id} 的完整數據:`, error.message);
                    }

                    return {
                        id: case_.id,
                        title: case_.title || '無標題',
                        court: case_.court || '未知法院',
                        year: case_.year || '未知年份',
                        similarity: case_.similarity || 0,
                        summary: `${case_.court || '未知法院'} ${case_.year || '未知年份'}年判決，判決結果：${case_.verdictType}`,
                        // 精簡判決數據，避免大型陣列
                        judgmentSummary: judgmentData ? {
                            JID: judgmentData.JID || case_.id,
                            JTITLE: judgmentData.JTITLE || case_.title,
                            court: judgmentData.court || case_.court,
                            verdict_type: judgmentData.verdict_type || case_.verdictType,
                            summary: Array.isArray(judgmentData.summary_ai) ?
                                    judgmentData.summary_ai.join(' ') :
                                    (judgmentData.summary_ai || '案例摘要暫無'),
                            hasFullData: true
                        } : {
                            JID: case_.id,
                            JTITLE: case_.title,
                            court: case_.court,
                            verdict_type: case_.verdictType,
                            summary: `${case_.title} - ${case_.court} ${case_.year}年判決`,
                            hasFullData: false
                        },
                        keyDifferences: [
                            "與主流案例在事實認定上存在差異",
                            "法律適用或解釋角度不同",
                            "證據評價標準可能有所不同"
                        ],
                        riskFactors: [
                            { factor: "事實認定風險", level: "medium" },
                            { factor: "法律適用風險", level: "medium" },
                            { factor: "證據充分性", level: "high" }
                        ]
                    };
                })
            );

            anomalyDetails[anomaly.verdict] = detailedCases;
            console.log(`[generateAnomalyDetailsFromPool] ${anomaly.verdict} 類型生成 ${detailedCases.length} 個案例詳情`);
        } else {
            console.log(`[generateAnomalyDetailsFromPool] 警告: 案例池中沒有找到 ${anomaly.verdict} 類型的案例`);
        }
    }

    console.log('[generateAnomalyDetailsFromPool] 生成完成，異常詳情鍵:', Object.keys(anomalyDetails));
    return anomalyDetails;
}

/**
 * 生成異常案例詳情（舊版，已棄用）
 * ⚠️ 此函數已棄用，建議使用 generateAnomalyDetailsFromPool 或 generateAnomalyDetailsFromPoolSimplified
 * 
 * @param {Array} anomalies - 異常案例列表
 * @param {Array} allCases - 所有案例列表
 * @returns {Promise<Object>} 異常案例詳情
 */
export async function generateAnomalyDetails(anomalies, allCases) {
    console.log('[generateAnomalyDetails] 開始生成異常詳情（舊版）');
    const anomalyDetails = {};

    for (const anomaly of anomalies) {
        const anomalyCases = allCases.filter(case_ =>
            anomaly.cases.includes(case_.id)
        );

        if (anomalyCases.length > 0) {
            // 為每個異常案例生成詳細信息，包括判決書node數據
            const detailedCases = await Promise.all(
                anomalyCases.slice(0, 5).map(async (case_) => {
                    // 獲取完整的判決書數據
                    console.log(`[generateAnomalyDetails] 正在獲取案例 ${case_.id} 的完整數據`);
                    const fullJudgmentData = await getJudgmentNodeData(case_.id);
                    console.log(`[generateAnomalyDetails] 案例 ${case_.id} 數據獲取結果:`, fullJudgmentData ? '成功' : '失敗');

                    return {
                        // 基本信息（用於列表顯示）
                        id: case_.id,
                        title: case_.title || '無標題',
                        court: case_.court || '未知法院',
                        year: case_.year || '未知年份',
                        similarity: case_.similarity || 0,
                        summary: `${case_.court} ${case_.year}年判決，判決結果：${case_.verdictType}`,
                        // 完整判決書數據（用於node顯示）
                        judgmentNodeData: fullJudgmentData,
                        keyDifferences: [
                            "與主流案例在事實認定上存在差異",
                            "法律適用或解釋角度不同",
                            "證據評價標準可能有所不同"
                        ],
                        riskFactors: [
                            { factor: "事實認定風險", level: "medium" },
                            { factor: "法律適用風險", level: "medium" },
                            { factor: "證據充分性", level: "high" }
                        ]
                    };
                })
            );

            anomalyDetails[anomaly.verdict] = detailedCases;
        }
    }

    return anomalyDetails;
}

