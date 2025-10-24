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

/**
 * 分析金額數據
 * @param {Object} casePrecedentData - 案件判決分析數據
 * @param {string} position - 立場（plaintiff/defendant）
 * @returns {Promise<Object>} 金額分析結果
 */
export async function analyzeAmountData(casePrecedentData, position = 'plaintiff') {
    console.log('[analyzeAmountData] 🚀 開始金額分析');
    console.log('[analyzeAmountData] 立場:', position);
    console.log('[analyzeAmountData] 案件數據:', {
        hasCases: !!casePrecedentData?.cases,
        casesLength: casePrecedentData?.cases?.length || 0
    });

    try {
        // 1. 從案件列表中提取金額數據
        const cases = casePrecedentData?.cases || [];
        
        if (cases.length === 0) {
            console.warn('[analyzeAmountData] ⚠️ 無案件數據');
            return {
                error: '無案件數據',
                statistics: null,
                amounts: [],
                outliers: { high: [], low: [] },
                representativeCases: { high: null, medium: null, low: null },
                insights: []
            };
        }

        const amounts = extractAmountData(cases);
        
        if (amounts.length === 0) {
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

        console.log(`[analyzeAmountData] ✅ 成功提取 ${amounts.length} 件案例的金額數據`);

        // 2. 計算統計數據
        const statistics = calculateStatistics(amounts);
        
        if (!statistics) {
            console.error('[analyzeAmountData] ❌ 統計計算失敗');
            return {
                error: '統計計算失敗',
                statistics: null,
                amounts: amounts,
                outliers: { high: [], low: [] },
                representativeCases: { high: null, medium: null, low: null },
                insights: []
            };
        }

        console.log('[analyzeAmountData] ✅ 統計計算完成');

        // 3. 識別異常值
        const outliers = identifyOutliers(amounts, statistics);
        console.log('[analyzeAmountData] ✅ 異常值識別完成');

        // 4. 選擇代表性案例
        const representativeCases = selectRepresentativeCases(amounts, statistics);
        console.log('[analyzeAmountData] ✅ 代表性案例選擇完成');

        // 5. 使用 AI 生成洞察
        let insights = [];
        try {
            insights = await generateAmountInsights(statistics, amounts, position);
            console.log('[analyzeAmountData] ✅ AI 洞察生成完成');
        } catch (error) {
            console.error('[analyzeAmountData] ⚠️ AI 洞察生成失敗:', error);
            // 使用基本洞察作為後備
            insights = generateBasicInsights(statistics, amounts);
        }

        const result = {
            statistics,
            amounts,
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
 * @param {Object} statistics - 統計數據
 * @param {Array} amounts - 金額數據數組
 * @returns {Array} 洞察數組
 */
function generateBasicInsights(statistics, amounts) {
    const insights = [];
    
    // 洞察 1: 樣本數量
    insights.push(`基於 ${statistics.totalCases} 件相同案由的民事判決進行分析`);
    
    // 洞察 2: 中位數
    insights.push(
        `請求金額中位數為 ${formatAmount(statistics.claimAmount.median)}，` +
        `法院實際准許金額中位數為 ${formatAmount(statistics.grantedAmount.median)}`
    );
    
    // 洞察 3: 平均獲准率
    const avgRate = statistics.approvalRate.mean;
    insights.push(
        `平均獲准率為 ${formatApprovalRate(avgRate)}，` +
        `表示法院通常會准許約 ${formatApprovalRate(avgRate)} 的請求金額`
    );
    
    // 洞察 4: IQR 範圍
    const claimIQR = statistics.claimAmount.q3 - statistics.claimAmount.q1;
    const grantedIQR = statistics.grantedAmount.q3 - statistics.grantedAmount.q1;
    insights.push(
        `多數案件的請求金額落在 ${formatAmount(statistics.claimAmount.q1)} ～ ${formatAmount(statistics.claimAmount.q3)} 之間，` +
        `獲准金額落在 ${formatAmount(statistics.grantedAmount.q1)} ～ ${formatAmount(statistics.grantedAmount.q3)} 之間`
    );
    
    // 洞察 5: 獲准率分布
    const rateRange = statistics.approvalRate.q3 - statistics.approvalRate.q1;
    if (rateRange < 0.3) {
        insights.push('獲准率分布較為集中，法院判決標準相對一致');
    } else {
        insights.push('獲准率分布較為分散，個案差異較大，建議詳細分析具體案例');
    }
    
    return insights;
}

/**
 * 導出金額分析服務
 */
export default {
    analyzeAmountData
};

