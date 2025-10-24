// services/amountAnalysisService.js

/**
 * 金額分析服務
 * 分析民事案件中的請求金額與獲准金額關係
 */

import {
    extractAmountData,
    calculateStatistics,
    selectRepresentativeCases,
    formatAmount,
    formatApprovalRate
} from './casePrecedentAnalysis/utils/amountUtils.js';
import { generateAmountInsights } from './ai/amountInsightsGenerator.js';
import { batchGetKeyMetrics } from './casePrecedentAnalysis/utils/keyMetricsFetcher.js';

/**
 * 分析金額數據
 * @param {Object} casePrecedentData - 包含 jids 的數據對象
 * @param {string} position - 立場（plaintiff/defendant）
 * @returns {Promise<Object>} 金額分析結果
 */
export async function analyzeAmountData(casePrecedentData, position = 'plaintiff') {
    console.log('[analyzeAmountData] 🚀 開始金額分析');
    console.log('[analyzeAmountData] 立場:', position);
    console.log('[analyzeAmountData] 請求數據:', {
        hasJids: !!casePrecedentData?.jids,
        jidsLength: casePrecedentData?.jids?.length || 0
    });

    try {
        // 1. 從 JID 列表批量查詢 key_metrics
        const jids = casePrecedentData?.jids || [];

        if (jids.length === 0) {
            console.warn('[analyzeAmountData] ⚠️ 無 JID 數據');
            return {
                error: '無 JID 數據',
                statistics: null,
                amounts: [],
                outliers: { high: [], low: [] },
                representativeCases: { high: null, medium: null, low: null },
                insights: []
            };
        }

        console.log('[analyzeAmountData] 🔍 開始批量查詢 key_metrics...');
        const cases = await batchGetKeyMetrics(jids);

        if (cases.length === 0) {
            console.warn('[analyzeAmountData] ⚠️ 批量查詢未返回任何案件');
            return {
                error: '無法獲取案件數據',
                statistics: null,
                amounts: [],
                outliers: { high: [], low: [] },
                representativeCases: { high: null, medium: null, low: null },
                insights: []
            };
        }

        console.log(`[analyzeAmountData] ✅ 成功獲取 ${cases.length} 件案例數據`);

        // 2. 從案件列表中提取金額數據（排除請求或獲准金額為 0 的案件）
        const amountsData = extractAmountData(cases);

        if (amountsData.valid.length === 0) {
            console.warn('[analyzeAmountData] ⚠️ 無有效金額數據');
            return {
                error: '無有效金額數據（所有案件的請求金額或獲准金額都是 0 元）',
                statistics: null,
                amounts: [],
                excludedCount: amountsData.excluded.length,
                outliers: [],
                representativeCases: { high: null, medium: null, low: null },
                insights: []
            };
        }

        console.log(`[analyzeAmountData] ✅ 成功提取金額數據 - 有效: ${amountsData.valid.length}, 排除: ${amountsData.excluded.length}`);

        // 3. 計算統計數據（使用標準差排除異常值）
        const result = calculateStatistics(amountsData);

        if (!result || !result.statistics) {
            console.error('[analyzeAmountData] ❌ 統計計算失敗');
            return {
                error: '統計計算失敗',
                statistics: null,
                amounts: [],
                outliers: [],
                representativeCases: { high: null, medium: null, low: null },
                insights: []
            };
        }

        const { statistics, normalAmounts, outlierAmounts, excludedCases } = result;

        console.log('[analyzeAmountData] ✅ 統計計算完成');

        // 4. 選擇代表性案例（基於正常範圍內的案件）
        const representativeCases = selectRepresentativeCases(normalAmounts, statistics);
        console.log('[analyzeAmountData] ✅ 代表性案例選擇完成');

        // 6. 使用 AI 生成洞察
        let insights = [];
        try {
            insights = await generateAmountInsights(statistics, normalAmounts, position);
            console.log('[analyzeAmountData] ✅ AI 洞察生成完成');
        } catch (error) {
            console.error('[analyzeAmountData] ⚠️ AI 洞察生成失敗:', error);
            // 使用基本洞察作為後備
            insights = generateBasicInsights(statistics, normalAmounts);
        }

        const analysisResult = {
            statistics,
            amounts: normalAmounts,  // 🎯 正常範圍內的案件
            excludedCount: excludedCases.length,  // 排除的案件數（請求或獲准金額為 0）
            outlierCount: outlierAmounts.length,  // 異常值案件數
            outliers: outlierAmounts,  // 異常值案件列表
            representativeCases,
            insights
        };

        console.log('[analyzeAmountData] 🎉 金額分析完成');
        return analysisResult;

    } catch (error) {
        console.error('[analyzeAmountData] ❌ 金額分析過程中發生錯誤:', error);
        return {
            error: `金額分析失敗: ${error.message}`,
            statistics: null,
            amounts: [],
            outliers: { high: [], low: [] },
            representativeCases: { high: null, medium: null, low: null },
            insights: []
        };
    }
}

/**
 * 生成基本洞察（當 AI 生成失敗時使用）
 * @param {Object} statistics - 統計數據
 * @param {Array} normalAmounts - 正常範圍內的案件數組
 * @returns {Array} 洞察數組
 */
function generateBasicInsights(statistics, normalAmounts) {
    const insights = [];

    if (!statistics || normalAmounts.length === 0) {
        insights.push('⚠️ 無有效金額數據，無法提供分析');
        return insights;
    }

    // 洞察 1: 樣本數量
    insights.push(
        `分析了 ${statistics.totalCases} 件相同案由的民事判決（排除 ${statistics.excludedCases} 件請求或獲准金額為 0 的案件）`
    );

    // 洞察 2: 中位數
    insights.push(
        `請求金額中位數為 ${formatAmount(statistics.claimAmount.median)}，` +
        `法院實際准許金額中位數為 ${formatAmount(statistics.grantedAmount.median)}`
    );

    // 洞察 3: 中位獲准率
    const medianRate = statistics.approvalRate.median;
    insights.push(
        `中位獲准率為 ${formatApprovalRate(medianRate)}，` +
        `表示法院通常會准許約 ${formatApprovalRate(medianRate)} 的請求金額`
    );

    // 洞察 4: IQR 範圍
    insights.push(
        `多數案件的獲准金額落在 ${formatAmount(statistics.grantedAmount.q1)} ～ ${formatAmount(statistics.grantedAmount.q3)} 之間（IQR 範圍，代表中間 50% 的案件）`
    );

    // 洞察 5: 異常值提示
    if (statistics.outlierCases > 0) {
        insights.push(
            `發現 ${statistics.outlierCases} 件異常案件（超出標準差範圍），已排除於統計之外以確保數據準確性`
        );
    }

    return insights;
}

/**
 * 導出金額分析服務
 */
export default {
    analyzeAmountData
};

