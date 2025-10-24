// services/amountAnalysisService.js

/**
 * 金額分析服務
 * 分析民事案件中的請求金額與獲准金額關係
 */

import {
    extractAmountData,
    calculateStatistics,
    identifyOutliers,
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

        // 2. 從案件列表中提取金額數據（分層提取）
        const amountsData = extractAmountData(cases);

        if (amountsData.all.length === 0) {
            console.warn('[analyzeAmountData] ⚠️ 無有效金額數據');
            return {
                error: '無有效金額數據（可能不是民事案件或缺少金額欄位）',
                statistics: null,
                amounts: [],
                outliers: { high: [], low: [] },
                representativeCases: { high: null, medium: null, low: null },
                insights: []
            };
        }

        console.log(`[analyzeAmountData] ✅ 成功提取金額數據 - 總計: ${amountsData.all.length}, 勝訴: ${amountsData.won.length}, 敗訴: ${amountsData.lost.length}, 異常: ${amountsData.abnormal.length}`);

        // 🎯 關鍵決策：如果勝訴案件太少，警告用戶
        if (amountsData.won.length === 0) {
            console.warn('[analyzeAmountData] ⚠️ 無勝訴案件（所有案件獲准金額都是 0）');
            return {
                error: '無勝訴案件數據（所有案件的獲准金額都是 0 元，可能都是敗訴案件）',
                statistics: null,
                amounts: amountsData.all,
                lostCount: amountsData.lost.length,
                outliers: { high: [], low: [] },
                representativeCases: { high: null, medium: null, low: null },
                insights: []
            };
        }

        // 3. 計算統計數據（分層統計）
        const statistics = calculateStatistics(amountsData);

        if (!statistics) {
            console.error('[analyzeAmountData] ❌ 統計計算失敗');
            return {
                error: '統計計算失敗',
                statistics: null,
                amounts: amountsData.all,
                outliers: { high: [], low: [] },
                representativeCases: { high: null, medium: null, low: null },
                insights: []
            };
        }

        console.log('[analyzeAmountData] ✅ 統計計算完成');

        // 4. 識別異常值（基於勝訴案件統計）
        const outliers = identifyOutliers(amountsData.won, statistics.won);
        console.log('[analyzeAmountData] ✅ 異常值識別完成');

        // 5. 選擇代表性案例（基於勝訴案件）
        const representativeCases = selectRepresentativeCases(amountsData.won, statistics.won);
        console.log('[analyzeAmountData] ✅ 代表性案例選擇完成');

        // 6. 使用 AI 生成洞察（基於勝訴案件統計）
        let insights = [];
        try {
            insights = await generateAmountInsights(statistics, amountsData, position);
            console.log('[analyzeAmountData] ✅ AI 洞察生成完成');
        } catch (error) {
            console.error('[analyzeAmountData] ⚠️ AI 洞察生成失敗:', error);
            // 使用基本洞察作為後備
            insights = generateBasicInsights(statistics, amountsData);
        }

        const result = {
            statistics,
            amounts: amountsData.won,  // 🎯 前端只顯示勝訴案件
            allAmounts: amountsData.all,  // 保留全部數據供參考
            lostCount: amountsData.lost.length,
            abnormalCases: amountsData.abnormal,
            outliers,
            representativeCases,
            insights
        };

        console.log('[analyzeAmountData] 🎉 金額分析完成');
        return result;

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
 * @param {Object} statistics - 分層統計數據
 * @param {Object} amountsData - 分層金額數據
 * @returns {Array} 洞察數組
 */
function generateBasicInsights(statistics, amountsData) {
    const insights = [];

    // 使用勝訴案件統計（更有參考價值）
    const wonStats = statistics.won;
    const allStats = statistics.all;

    if (!wonStats) {
        insights.push('⚠️ 所有案件的獲准金額都是 0 元，無法提供有效的金額分析');
        return insights;
    }

    // 洞察 1: 樣本數量和勝訴率
    const winRate = statistics.winRate;
    insights.push(
        `分析了 ${allStats.totalCases} 件相同案由的民事判決，其中 ${wonStats.totalCases} 件獲得部分或全部勝訴（勝訴率 ${formatApprovalRate(winRate)}）`
    );

    // 洞察 2: 勝訴案件的中位數
    insights.push(
        `在勝訴案件中，請求金額中位數為 ${formatAmount(wonStats.claimAmount.median)}，` +
        `法院實際准許金額中位數為 ${formatAmount(wonStats.grantedAmount.median)}`
    );

    // 洞察 3: 勝訴案件的平均獲准率
    const avgRate = wonStats.approvalRate.median;  // 🔧 使用中位數而非平均數
    insights.push(
        `勝訴案件的中位獲准率為 ${formatApprovalRate(avgRate)}，` +
        `表示法院通常會准許約 ${formatApprovalRate(avgRate)} 的請求金額`
    );

    // 洞察 4: IQR 範圍（勝訴案件）
    insights.push(
        `多數勝訴案件的獲准金額落在 ${formatAmount(wonStats.grantedAmount.q1)} ～ ${formatAmount(wonStats.grantedAmount.q3)} 之間（IQR 範圍，代表中間 50% 的案件）`
    );

    // 洞察 5: 敗訴案件提示
    if (statistics.lostCount > 0) {
        const lostRate = statistics.lostCount / allStats.totalCases;
        insights.push(
            `需注意：有 ${statistics.lostCount} 件案件完全敗訴（獲准金額為 0），佔比 ${formatApprovalRate(lostRate)}，建議評估案件強度和證據充分性`
        );
    }

    // 洞察 6: 異常案件提示
    if (statistics.abnormalCount > 0) {
        insights.push(
            `發現 ${statistics.abnormalCount} 件異常案件（獲准金額超過請求金額），可能涉及利息、違約金或多案合併，已排除於統計之外`
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

