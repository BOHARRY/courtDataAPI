// services/casePrecedentAnalysis/utils/amountUtils.js

/**
 * 金額分析工具函數
 * 用於提取、計算和分析民事案件的金額數據
 */

/**
 * 從判決列表中提取金額數據
 * @param {Array} cases - 判決案例列表
 * @returns {Array} 金額數據數組
 */
export function extractAmountData(cases) {
    console.log('[extractAmountData] 開始提取金額數據，案例數量:', cases?.length || 0);
    
    if (!cases || !Array.isArray(cases)) {
        console.warn('[extractAmountData] 無效的案例數據');
        return [];
    }

    const amounts = [];
    
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
                    const approvalRate = grantedAmount / claimAmount;
                    
                    amounts.push({
                        caseId: source.JID || `case_${index}`,
                        caseTitle: source.JTITLE || '無標題',
                        claimAmount: claimAmount,
                        grantedAmount: grantedAmount,
                        approvalRate: approvalRate,
                        court: source.court || '未知法院',
                        year: source.JYEAR || '未知年份',
                        verdictType: source.verdict_type || '未知'
                    });
                    
                    console.log(`[extractAmountData] ✅ 案例 ${index + 1}: ${source.JID} - 請求: ${claimAmount}, 獲准: ${grantedAmount}, 獲准率: ${(approvalRate * 100).toFixed(1)}%`);
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
    
    console.log(`[extractAmountData] 完成提取，有效金額數據: ${amounts.length}/${cases.length}`);
    return amounts;
}

/**
 * 計算統計數據
 * @param {Array} amounts - 金額數據數組
 * @returns {Object|null} 統計結果
 */
export function calculateStatistics(amounts) {
    console.log('[calculateStatistics] 開始計算統計數據，數據量:', amounts?.length || 0);
    
    if (!amounts || amounts.length === 0) {
        console.warn('[calculateStatistics] 無有效金額數據');
        return null;
    }
    
    // 排序
    const sortedClaim = amounts.map(a => a.claimAmount).sort((a, b) => a - b);
    const sortedGranted = amounts.map(a => a.grantedAmount).sort((a, b) => a - b);
    const sortedRate = amounts.map(a => a.approvalRate).sort((a, b) => a - b);
    
    // 計算中位數
    const median = (arr) => {
        const mid = Math.floor(arr.length / 2);
        return arr.length % 2 === 0 
            ? (arr[mid - 1] + arr[mid]) / 2 
            : arr[mid];
    };
    
    // 計算四分位數
    const quartile = (arr, q) => {
        const pos = (arr.length - 1) * q;
        const base = Math.floor(pos);
        const rest = pos - base;
        return arr[base + 1] !== undefined
            ? arr[base] + rest * (arr[base + 1] - arr[base])
            : arr[base];
    };
    
    // 計算平均數
    const mean = (arr) => arr.reduce((sum, val) => sum + val, 0) / arr.length;
    
    const statistics = {
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
    
    console.log('[calculateStatistics] 統計結果:', {
        totalCases: statistics.totalCases,
        claimMedian: statistics.claimAmount.median,
        grantedMedian: statistics.grantedAmount.median,
        approvalRateMedian: (statistics.approvalRate.median * 100).toFixed(1) + '%'
    });
    
    return statistics;
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

