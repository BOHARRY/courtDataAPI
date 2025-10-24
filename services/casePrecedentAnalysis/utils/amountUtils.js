// services/casePrecedentAnalysis/utils/amountUtils.js

/**
 * 金額分析工具函數
 * 用於提取、計算和分析民事案件的金額數據
 */

/**
 * 從判決列表中提取金額數據
 * @param {Array} cases - 判決案例列表
 * @returns {Object} 包含全部案件和勝訴案件的金額數據
 */
export function extractAmountData(cases) {
    console.log('[extractAmountData] 開始提取金額數據，案例數量:', cases?.length || 0);

    if (!cases || !Array.isArray(cases)) {
        console.warn('[extractAmountData] 無效的案例數據');
        return { all: [], won: [], lost: [] };
    }

    const allAmounts = [];      // 所有有效案件（包含敗訴）
    const wonAmounts = [];      // 勝訴案件（獲准金額 > 0）
    const lostAmounts = [];     // 敗訴案件（獲准金額 = 0）
    const abnormalCases = [];   // 異常案件（獲准率 > 100%）

    cases.forEach((case_, index) => {
        try {
            // 🔧 支持多種數據結構
            const source = case_._source || case_.source || case_;
            const keyMetrics = source?.key_metrics;
            const civilMetrics = keyMetrics?.civil_metrics;

            if (civilMetrics) {
                const claimAmount = civilMetrics.claim_amount;
                const grantedAmount = civilMetrics.granted_amount;

                // 只保留有效數據（請求金額 > 0，獲准金額 >= 0）
                if (claimAmount > 0 && grantedAmount >= 0) {
                    // 🔧 計算獲准率，並限制在 0-100% 範圍內
                    let approvalRate = grantedAmount / claimAmount;
                    let isAbnormal = false;

                    // 🚨 檢測異常值：獲准金額 > 請求金額
                    if (approvalRate > 1.0) {
                        isAbnormal = true;
                        console.warn(`[extractAmountData] ⚠️ 異常案例 ${source.JID}: 獲准金額(${grantedAmount}) > 請求金額(${claimAmount}), 獲准率: ${(approvalRate * 100).toFixed(1)}%`);
                    }

                    const amountData = {
                        caseId: source.JID || `case_${index}`,
                        caseTitle: source.JTITLE || '無標題',
                        claimAmount: claimAmount,
                        grantedAmount: grantedAmount,
                        approvalRate: approvalRate,
                        court: source.court || '未知法院',
                        year: source.JYEAR || '未知年份',
                        verdictType: source.verdict_type || '未知',
                        isAbnormal: isAbnormal
                    };

                    // 🎯 分類存儲
                    allAmounts.push(amountData);

                    if (isAbnormal) {
                        abnormalCases.push(amountData);
                    } else if (grantedAmount > 0) {
                        wonAmounts.push(amountData);
                    } else {
                        lostAmounts.push(amountData);
                    }

                    console.log(`[extractAmountData] ✅ 案例 ${index + 1}: ${source.JID} - 請求: ${claimAmount}, 獲准: ${grantedAmount}, 獲准率: ${(approvalRate * 100).toFixed(1)}%${isAbnormal ? ' [異常]' : ''}${grantedAmount === 0 ? ' [敗訴]' : ''}`);
                } else {
                    console.log(`[extractAmountData] ⚠️ 案例 ${index + 1}: ${source.JID} - 金額數據無效 (請求: ${claimAmount}, 獲准: ${grantedAmount})`);
                }
            } else {
                console.log(`[extractAmountData] ⚠️ 案例 ${index + 1}: ${source?.JID || 'unknown'} - 無 civil_metrics 數據`);
            }
        } catch (error) {
            console.error(`[extractAmountData] ❌ 處理案例 ${index + 1} 時發生錯誤:`, error);
        }
    });

    console.log(`[extractAmountData] 完成提取 - 總計: ${allAmounts.length}, 勝訴: ${wonAmounts.length}, 敗訴: ${lostAmounts.length}, 異常: ${abnormalCases.length}`);

    return {
        all: allAmounts,
        won: wonAmounts,
        lost: lostAmounts,
        abnormal: abnormalCases
    };
}

/**
 * 計算統計數據（支持分層統計）
 * @param {Object} amountsData - 包含 all, won, lost, abnormal 的金額數據對象
 * @returns {Object|null} 統計結果
 */
export function calculateStatistics(amountsData) {
    console.log('[calculateStatistics] 開始計算統計數據');

    // 🔧 兼容舊版 API（如果傳入的是數組，轉換為新格式）
    let amounts, wonAmounts, lostAmounts, abnormalAmounts;

    if (Array.isArray(amountsData)) {
        console.warn('[calculateStatistics] ⚠️ 使用舊版 API，建議更新為新版分層數據格式');
        amounts = amountsData;
        wonAmounts = amountsData.filter(a => a.grantedAmount > 0 && a.approvalRate <= 1.0);
        lostAmounts = amountsData.filter(a => a.grantedAmount === 0);
        abnormalAmounts = amountsData.filter(a => a.approvalRate > 1.0);
    } else {
        amounts = amountsData.all || [];
        wonAmounts = amountsData.won || [];
        lostAmounts = amountsData.lost || [];
        abnormalAmounts = amountsData.abnormal || [];
    }

    console.log('[calculateStatistics] 數據分層:', {
        total: amounts.length,
        won: wonAmounts.length,
        lost: lostAmounts.length,
        abnormal: abnormalAmounts.length
    });

    if (amounts.length === 0) {
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

    // 🎯 計算全體案件統計（包含敗訴）
    const sortedClaim = amounts.map(a => a.claimAmount).sort((a, b) => a - b);
    const sortedGranted = amounts.map(a => a.grantedAmount).sort((a, b) => a - b);
    const sortedRate = amounts.map(a => Math.min(a.approvalRate, 1.0)).sort((a, b) => a - b); // 🔧 限制獲准率上限為 100%

    const allStatistics = {
        totalCases: amounts.length,
        claimAmount: {
            median: median(sortedClaim),
            mean: mean(sortedClaim),
            q1: quartile(sortedClaim, 0.25),
            q3: quartile(sortedClaim, 0.75),
            min: sortedClaim[0],
            max: sortedClaim[sortedClaim.length - 1]
        },
        grantedAmount: {
            median: median(sortedGranted),
            mean: mean(sortedGranted),
            q1: quartile(sortedGranted, 0.25),
            q3: quartile(sortedGranted, 0.75),
            min: sortedGranted[0],
            max: sortedGranted[sortedGranted.length - 1]
        },
        approvalRate: {
            median: median(sortedRate),
            mean: mean(sortedRate),
            q1: quartile(sortedRate, 0.25),
            q3: quartile(sortedRate, 0.75),
            min: sortedRate[0],
            max: sortedRate[sortedRate.length - 1]
        }
    };

    // 🎯 計算勝訴案件統計（排除敗訴和異常值）
    let wonStatistics = null;
    if (wonAmounts.length > 0) {
        const wonSortedClaim = wonAmounts.map(a => a.claimAmount).sort((a, b) => a - b);
        const wonSortedGranted = wonAmounts.map(a => a.grantedAmount).sort((a, b) => a - b);
        const wonSortedRate = wonAmounts.map(a => a.approvalRate).sort((a, b) => a - b);

        wonStatistics = {
            totalCases: wonAmounts.length,
            claimAmount: {
                median: median(wonSortedClaim),
                mean: mean(wonSortedClaim),
                q1: quartile(wonSortedClaim, 0.25),
                q3: quartile(wonSortedClaim, 0.75),
                min: wonSortedClaim[0],
                max: wonSortedClaim[wonSortedClaim.length - 1]
            },
            grantedAmount: {
                median: median(wonSortedGranted),
                mean: mean(wonSortedGranted),
                q1: quartile(wonSortedGranted, 0.25),
                q3: quartile(wonSortedGranted, 0.75),
                min: wonSortedGranted[0],
                max: wonSortedGranted[wonSortedGranted.length - 1]
            },
            approvalRate: {
                median: median(wonSortedRate),
                mean: mean(wonSortedRate),
                q1: quartile(wonSortedRate, 0.25),
                q3: quartile(wonSortedRate, 0.75),
                min: wonSortedRate[0],
                max: wonSortedRate[wonSortedRate.length - 1]
            }
        };
    }

    console.log('[calculateStatistics] 全體案件統計:', {
        totalCases: allStatistics.totalCases,
        claimMedian: allStatistics.claimAmount.median,
        grantedMedian: allStatistics.grantedAmount.median,
        approvalRateMedian: (allStatistics.approvalRate.median * 100).toFixed(1) + '%'
    });

    if (wonStatistics) {
        console.log('[calculateStatistics] 勝訴案件統計:', {
            totalCases: wonStatistics.totalCases,
            claimMedian: wonStatistics.claimAmount.median,
            grantedMedian: wonStatistics.grantedAmount.median,
            approvalRateMedian: (wonStatistics.approvalRate.median * 100).toFixed(1) + '%'
        });
    }

    return {
        all: allStatistics,
        won: wonStatistics,
        lostCount: lostAmounts.length,
        abnormalCount: abnormalAmounts.length,
        winRate: wonAmounts.length / amounts.length
    };
}

/**
 * 識別異常值
 * @param {Array} amounts - 金額數據數組
 * @param {Object} statistics - 統計數據
 * @returns {Object} 異常值數據
 */
export function identifyOutliers(amounts, statistics) {
    console.log('[identifyOutliers] 開始識別異常值');
    
    if (!amounts || !statistics) {
        return { high: [], low: [] };
    }
    
    // 使用 IQR 法則識別異常值
    const claimIQR = statistics.claimAmount.q3 - statistics.claimAmount.q1;
    const grantedIQR = statistics.grantedAmount.q3 - statistics.grantedAmount.q1;
    
    const claimLowerBound = statistics.claimAmount.q1 - 1.5 * claimIQR;
    const claimUpperBound = statistics.claimAmount.q3 + 1.5 * claimIQR;
    const grantedLowerBound = statistics.grantedAmount.q1 - 1.5 * grantedIQR;
    const grantedUpperBound = statistics.grantedAmount.q3 + 1.5 * grantedIQR;
    
    const outliers = {
        high: [],
        low: []
    };
    
    amounts.forEach(amount => {
        const isHighClaim = amount.claimAmount > claimUpperBound;
        const isHighGranted = amount.grantedAmount > grantedUpperBound;
        const isLowClaim = amount.claimAmount < claimLowerBound;
        const isLowGranted = amount.grantedAmount < grantedLowerBound;
        
        if (isHighClaim || isHighGranted) {
            outliers.high.push({
                ...amount,
                reason: isHighClaim ? '請求金額過高' : '獲准金額過高'
            });
        }
        
        if (isLowClaim || isLowGranted) {
            outliers.low.push({
                ...amount,
                reason: isLowClaim ? '請求金額過低' : '獲准金額過低'
            });
        }
    });
    
    console.log(`[identifyOutliers] 識別完成 - 高異常值: ${outliers.high.length}, 低異常值: ${outliers.low.length}`);
    return outliers;
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

