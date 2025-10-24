// services/casePrecedentAnalysis/utils/amountUtils.js

/**
 * 金額分析工具函數
 * 用於提取、計算和分析民事案件的金額數據
 */

/**
 * 從判決列表中提取金額數據
 * @param {Array} cases - 判決案例列表
 * @returns {Object} 包含有效案件和排除案件的金額數據
 */
export function extractAmountData(cases) {
    console.log('[extractAmountData] 開始提取金額數據，案例數量:', cases?.length || 0);

    if (!cases || !Array.isArray(cases)) {
        console.warn('[extractAmountData] 無效的案例數據');
        return { valid: [], excluded: [] };
    }

    const validAmounts = [];      // 有效案件（請求金額 > 0 且 獲准金額 > 0）
    const excludedCases = [];     // 排除案件（請求金額 = 0 或 獲准金額 = 0）

    cases.forEach((case_, index) => {
        try {
            // 🔧 支持多種數據結構
            const source = case_._source || case_.source || case_;
            const keyMetrics = source?.key_metrics;
            const civilMetrics = keyMetrics?.civil_metrics;

            if (civilMetrics) {
                const claimAmount = civilMetrics.claim_amount;
                const grantedAmount = civilMetrics.granted_amount;

                // 🎯 核心邏輯：只保留請求金額 > 0 且 獲准金額 > 0 的案件
                if (claimAmount > 0 && grantedAmount > 0) {
                    const approvalRate = grantedAmount / claimAmount;

                    const amountData = {
                        caseId: source.JID || `case_${index}`,
                        caseTitle: source.JTITLE || '無標題',
                        claimAmount: claimAmount,
                        grantedAmount: grantedAmount,
                        approvalRate: approvalRate,
                        court: source.court || '未知法院',
                        year: source.JYEAR || '未知年份',
                        verdictType: source.verdict_type || '未知'
                    };

                    validAmounts.push(amountData);
                    console.log(`[extractAmountData] ✅ 案例 ${index + 1}: ${source.JID} - 請求: ${claimAmount}, 獲准: ${grantedAmount}, 獲准率: ${(approvalRate * 100).toFixed(1)}%`);
                } else {
                    // 排除請求金額 = 0 或 獲准金額 = 0 的案件
                    const reason = claimAmount <= 0 ? '請求金額為 0' : '獲准金額為 0';
                    excludedCases.push({
                        caseId: source.JID || `case_${index}`,
                        reason: reason,
                        claimAmount: claimAmount,
                        grantedAmount: grantedAmount
                    });
                    console.log(`[extractAmountData] ⚠️ 案例 ${index + 1}: ${source.JID} - 已排除 (${reason})`);
                }
            } else {
                console.log(`[extractAmountData] ⚠️ 案例 ${index + 1}: ${source?.JID || 'unknown'} - 無 civil_metrics 數據`);
            }
        } catch (error) {
            console.error(`[extractAmountData] ❌ 處理案例 ${index + 1} 時發生錯誤:`, error);
        }
    });

    console.log(`[extractAmountData] 完成提取 - 有效案件: ${validAmounts.length}, 排除案件: ${excludedCases.length}`);

    return {
        valid: validAmounts,
        excluded: excludedCases
    };
}

/**
 * 計算統計數據（使用標準差排除異常值）
 * @param {Object} amountsData - 包含 valid 和 excluded 的金額數據對象
 * @returns {Object|null} 統計結果
 */
export function calculateStatistics(amountsData) {
    console.log('[calculateStatistics] 開始計算統計數據');

    // 🔧 兼容舊版 API（如果傳入的是數組，轉換為新格式）
    let validAmounts, excludedCases;

    if (Array.isArray(amountsData)) {
        console.warn('[calculateStatistics] ⚠️ 使用舊版 API，建議更新為新版格式');
        validAmounts = amountsData.filter(a => a.claimAmount > 0 && a.grantedAmount > 0);
        excludedCases = [];
    } else {
        validAmounts = amountsData.valid || [];
        excludedCases = amountsData.excluded || [];
    }

    console.log('[calculateStatistics] 數據概況:', {
        valid: validAmounts.length,
        excluded: excludedCases.length
    });

    if (validAmounts.length === 0) {
        console.warn('[calculateStatistics] 無有效金額數據');
        return null;
    }

    // 🎯 核心統計函數
    const median = (arr) => {
        if (arr.length === 0) return 0;
        const mid = Math.floor(arr.length / 2);
        return arr.length % 2 === 0
            ? (arr[mid - 1] + arr[mid]) / 2
            : arr[mid];
    };

    const quartile = (arr, q) => {
        if (arr.length === 0) return 0;
        const pos = (arr.length - 1) * q;
        const base = Math.floor(pos);
        const rest = pos - base;
        return arr[base + 1] !== undefined
            ? arr[base] + rest * (arr[base + 1] - arr[base])
            : arr[base];
    };

    const mean = (arr) => {
        if (arr.length === 0) return 0;
        return arr.reduce((sum, val) => sum + val, 0) / arr.length;
    };

    const stdDev = (arr, meanValue) => {
        if (arr.length === 0) return 0;
        const variance = arr.reduce((sum, val) => sum + Math.pow(val - meanValue, 2), 0) / arr.length;
        return Math.sqrt(variance);
    };

    // 🎯 步驟 1: 計算初步統計（用於識別異常值）
    const grantedAmounts = validAmounts.map(a => a.grantedAmount);
    const grantedMean = mean(grantedAmounts);
    const grantedStdDev = stdDev(grantedAmounts, grantedMean);

    console.log('[calculateStatistics] 初步統計:', {
        mean: grantedMean.toFixed(2),
        stdDev: grantedStdDev.toFixed(2),
        lowerBound: (grantedMean - 2 * grantedStdDev).toFixed(2),
        upperBound: (grantedMean + 2 * grantedStdDev).toFixed(2)
    });

    // 🎯 步驟 2: 使用 2σ 法則排除異常值
    const lowerBound = grantedMean - 2 * grantedStdDev;
    const upperBound = grantedMean + 2 * grantedStdDev;

    const normalAmounts = [];
    const outlierAmounts = [];

    validAmounts.forEach(a => {
        if (a.grantedAmount >= lowerBound && a.grantedAmount <= upperBound) {
            normalAmounts.push(a);
        } else {
            outlierAmounts.push(a);
        }
    });

    console.log('[calculateStatistics] 異常值篩選結果:', {
        normal: normalAmounts.length,
        outliers: outlierAmounts.length,
        outlierRate: ((outlierAmounts.length / validAmounts.length) * 100).toFixed(1) + '%'
    });

    // 🎯 步驟 3: 基於正常範圍內的案件計算最終統計
    const finalAmounts = normalAmounts.length >= 3 ? normalAmounts : validAmounts;

    if (finalAmounts.length < normalAmounts.length) {
        console.warn('[calculateStatistics] ⚠️ 正常案件數量不足，使用全部有效案件');
    }

    const sortedClaim = finalAmounts.map(a => a.claimAmount).sort((a, b) => a - b);
    const sortedGranted = finalAmounts.map(a => a.grantedAmount).sort((a, b) => a - b);
    const sortedRate = finalAmounts.map(a => a.approvalRate).sort((a, b) => a - b);

    const statistics = {
        totalCases: validAmounts.length,  // 總案件數（包含異常值）
        normalCases: finalAmounts.length,  // 正常範圍內的案件數
        excludedCases: excludedCases.length,  // 排除的案件數（請求或獲准金額為 0）
        outlierCases: outlierAmounts.length,  // 異常值案件數
        claimAmount: {
            median: median(sortedClaim),
            mean: mean(sortedClaim),
            q1: quartile(sortedClaim, 0.25),
            q3: quartile(sortedClaim, 0.75),
            min: sortedClaim[0],
            max: sortedClaim[sortedClaim.length - 1],
            stdDev: stdDev(sortedClaim, mean(sortedClaim))
        },
        grantedAmount: {
            median: median(sortedGranted),
            mean: mean(sortedGranted),
            q1: quartile(sortedGranted, 0.25),
            q3: quartile(sortedGranted, 0.75),
            min: sortedGranted[0],
            max: sortedGranted[sortedGranted.length - 1],
            stdDev: stdDev(sortedGranted, mean(sortedGranted))
        },
        approvalRate: {
            median: median(sortedRate),
            mean: mean(sortedRate),
            q1: quartile(sortedRate, 0.25),
            q3: quartile(sortedRate, 0.75),
            min: sortedRate[0],
            max: sortedRate[sortedRate.length - 1],
            stdDev: stdDev(sortedRate, mean(sortedRate))
        }
    };

    console.log('[calculateStatistics] 最終統計（標準差範圍內）:', {
        totalCases: statistics.totalCases,
        normalCases: statistics.normalCases,
        claimMedian: statistics.claimAmount.median.toFixed(2),
        grantedMedian: statistics.grantedAmount.median.toFixed(2),
        approvalRateMedian: (statistics.approvalRate.median * 100).toFixed(1) + '%'
    });

    return {
        statistics,
        normalAmounts: finalAmounts,
        outlierAmounts: outlierAmounts,
        excludedCases: excludedCases
    };
}

/**
 * 識別異常值（已棄用，異常值在 calculateStatistics 中識別）
 * @deprecated 使用 calculateStatistics 返回的 outlierAmounts
 * @param {Array} outlierAmounts - 異常值數組
 * @returns {Object} 異常值數據
 */
export function identifyOutliers(outlierAmounts) {
    console.log('[identifyOutliers] 返回異常值數據');

    if (!outlierAmounts || outlierAmounts.length === 0) {
        return { high: [], low: [] };
    }

    // 簡單返回異常值列表
    return {
        high: outlierAmounts,
        low: []
    };
}

/**
 * 選擇代表性案例
 * @param {Array} amounts - 金額數據數組
 * @param {Object} statistics - 統計數據
 * @returns {Object} 代表性案例
 */
export function selectRepresentativeCases(amounts, statistics) {
    console.log('[selectRepresentativeCases] 開始選擇代表性案例');
    
    if (!amounts || amounts.length === 0 || !statistics) {
        return { high: null, medium: null, low: null };
    }
    
    // 按獲准率排序
    const sortedByRate = [...amounts].sort((a, b) => a.approvalRate - b.approvalRate);
    
    // 選擇高、中、低獲准率的代表性案例
    const lowIndex = Math.floor(sortedByRate.length * 0.1); // 10th percentile
    const mediumIndex = Math.floor(sortedByRate.length * 0.5); // 50th percentile (median)
    const highIndex = Math.floor(sortedByRate.length * 0.9); // 90th percentile
    
    const representatives = {
        low: sortedByRate[lowIndex] || null,
        medium: sortedByRate[mediumIndex] || null,
        high: sortedByRate[highIndex] || null
    };
    
    console.log('[selectRepresentativeCases] 選擇完成:', {
        low: representatives.low ? `${(representatives.low.approvalRate * 100).toFixed(1)}%` : 'N/A',
        medium: representatives.medium ? `${(representatives.medium.approvalRate * 100).toFixed(1)}%` : 'N/A',
        high: representatives.high ? `${(representatives.high.approvalRate * 100).toFixed(1)}%` : 'N/A'
    });
    
    return representatives;
}

/**
 * 格式化金額顯示
 * @param {number} amount - 金額
 * @returns {string} 格式化後的金額字符串
 */
export function formatAmount(amount) {
    if (amount >= 10000) {
        return `${(amount / 10000).toFixed(1)} 萬元`;
    }
    return `${amount.toLocaleString('zh-TW')} 元`;
}

/**
 * 格式化獲准率顯示
 * @param {number} rate - 獲准率（0-1）
 * @returns {string} 格式化後的獲准率字符串
 */
export function formatApprovalRate(rate) {
    return `${(rate * 100).toFixed(0)}%`;
}

