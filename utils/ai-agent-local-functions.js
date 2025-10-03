// utils/ai-agent-local-functions.js
/**
 * AI Agent 本地統計函數
 * 這些函數在後端執行,用於處理從 MCP 工具獲取的數據
 */

/**
 * 計算判決結果統計
 * @param {Array} judgments - 判決書陣列
 * @param {Object} options - 選項
 * @param {string} options.analysis_type - 分析類型: 'verdict_rate' | 'case_type_rate' | 'amount_stats'
 * @param {string} options.verdict_type - 要分析的判決結果類型 (可選)
 * @param {string} options.case_type - 要分析的案由 (可選)
 * @returns {Object} 統計結果
 */
export function calculate_verdict_statistics(judgments, options = {}) {
    const { analysis_type = 'verdict_rate', verdict_type, case_type } = options;

    if (!Array.isArray(judgments) || judgments.length === 0) {
        return {
            error: '無判決書數據',
            total_cases: 0
        };
    }

    const total = judgments.length;

    if (analysis_type === 'verdict_rate') {
        // 計算判決結果分布
        const verdictCounts = {};
        judgments.forEach(j => {
            const verdict = j['裁判結果'] || j.verdict_type || 'Unknown';
            verdictCounts[verdict] = (verdictCounts[verdict] || 0) + 1;
        });

        const distribution = Object.entries(verdictCounts).map(([verdict, count]) => ({
            判決結果: verdict,
            數量: count,
            比例: `${(count / total * 100).toFixed(1)}%`,
            百分比: (count / total * 100).toFixed(1)
        }));

        // 如果指定了特定判決類型,計算其勝訴率
        let target_rate = null;
        if (verdict_type) {
            const target_count = verdictCounts[verdict_type] || 0;
            target_rate = {
                判決類型: verdict_type,
                數量: target_count,
                勝訴率: `${(target_count / total * 100).toFixed(1)}%`
            };
        }

        return {
            總案件數: total,
            判決結果分布: distribution.sort((a, b) => b.數量 - a.數量),
            特定判決統計: target_rate
        };
    }

    if (analysis_type === 'case_type_rate') {
        // 計算案由分布
        const caseTypeCounts = {};
        judgments.forEach(j => {
            const caseType = j['案由'] || j.JTITLE || 'Unknown';
            caseTypeCounts[caseType] = (caseTypeCounts[caseType] || 0) + 1;
        });

        const distribution = Object.entries(caseTypeCounts).map(([caseType, count]) => ({
            案由: caseType,
            數量: count,
            比例: `${(count / total * 100).toFixed(1)}%`
        }));

        return {
            總案件數: total,
            案由分布: distribution.sort((a, b) => b.數量 - a.數量)
        };
    }

    if (analysis_type === 'amount_stats') {
        // 計算金額統計
        const amounts = judgments
            .map(j => ({
                claim: parseFloat(j['請求金額'] || j.claim_amount || 0),
                granted: parseFloat(j['判賠金額'] || j.granted_amount || 0)
            }))
            .filter(a => a.claim > 0 || a.granted > 0);

        if (amounts.length === 0) {
            return {
                error: '無金額數據',
                總案件數: total
            };
        }

        const totalClaim = amounts.reduce((sum, a) => sum + a.claim, 0);
        const totalGranted = amounts.reduce((sum, a) => sum + a.granted, 0);
        const avgClaim = totalClaim / amounts.length;
        const avgGranted = totalGranted / amounts.length;

        return {
            總案件數: total,
            有金額數據案件數: amounts.length,
            總請求金額: totalClaim.toLocaleString('zh-TW'),
            總判賠金額: totalGranted.toLocaleString('zh-TW'),
            平均請求金額: avgClaim.toLocaleString('zh-TW'),
            平均判賠金額: avgGranted.toLocaleString('zh-TW'),
            平均判賠率: `${(totalGranted / totalClaim * 100).toFixed(1)}%`
        };
    }

    return { error: '未知的分析類型' };
}

/**
 * 提取 TOP 引用法條
 * @param {Array} citationAnalysis - 引用法條分析結果 (來自 MCP get_citation_analysis)
 * @param {number} top_n - 取前 N 個
 * @returns {Object} TOP 法條列表
 */
export function extract_top_citations(citationAnalysis, top_n = 10) {
    if (!citationAnalysis || !citationAnalysis['引用法條統計']) {
        return {
            error: '無引用法條數據'
        };
    }

    const citations = citationAnalysis['引用法條統計'];
    const topCitations = citations.slice(0, top_n);

    return {
        法官姓名: citationAnalysis['法官姓名'],
        分析判決書數量: citationAnalysis['分析判決書數量'],
        TOP引用法條: topCitations.map((c, idx) => ({
            排名: idx + 1,
            法條: c['法條'],
            引用次數: c['引用次數'],
            引用範例: c['引用範例']
        }))
    };
}

/**
 * 分析金額趨勢
 * @param {Array} judgments - 判決書陣列 (需包含日期和金額)
 * @param {string} trend_type - 趨勢類型: 'monthly' | 'quarterly'
 * @returns {Object} 趨勢分析結果
 */
export function analyze_amount_trends(judgments, trend_type = 'monthly') {
    if (!Array.isArray(judgments) || judgments.length === 0) {
        return {
            error: '無判決書數據'
        };
    }

    // 過濾有金額數據的判決
    const validJudgments = judgments.filter(j => {
        const claim = parseFloat(j['請求金額'] || j.claim_amount || 0);
        const granted = parseFloat(j['判賠金額'] || j.granted_amount || 0);
        return claim > 0 || granted > 0;
    });

    if (validJudgments.length === 0) {
        return {
            error: '無有效金額數據'
        };
    }

    // 按日期分組
    const trends = {};
    validJudgments.forEach(j => {
        const date = j['判決日期'] || j.JDATE || '';
        if (!date) return;

        // 提取年月 (YYYYMMDD -> YYYY-MM)
        const yearMonth = `${date.substring(0, 4)}-${date.substring(4, 6)}`;
        
        if (!trends[yearMonth]) {
            trends[yearMonth] = {
                案件數: 0,
                總請求金額: 0,
                總判賠金額: 0
            };
        }

        trends[yearMonth].案件數 += 1;
        trends[yearMonth].總請求金額 += parseFloat(j['請求金額'] || j.claim_amount || 0);
        trends[yearMonth].總判賠金額 += parseFloat(j['判賠金額'] || j.granted_amount || 0);
    });

    // 計算平均值並排序
    const trendArray = Object.entries(trends)
        .map(([period, data]) => ({
            期間: period,
            案件數: data.案件數,
            平均請求金額: (data.總請求金額 / data.案件數).toLocaleString('zh-TW'),
            平均判賠金額: (data.總判賠金額 / data.案件數).toLocaleString('zh-TW'),
            平均判賠率: `${(data.總判賠金額 / data.總請求金額 * 100).toFixed(1)}%`
        }))
        .sort((a, b) => a.期間.localeCompare(b.期間));

    return {
        趨勢類型: trend_type,
        總案件數: validJudgments.length,
        期間數據: trendArray
    };
}

/**
 * 比較多位法官
 * @param {Array} judgesData - 多位法官的分析數據陣列
 * @returns {Object} 比較結果
 */
export function compare_judges(judgesData) {
    if (!Array.isArray(judgesData) || judgesData.length < 2) {
        return {
            error: '至少需要兩位法官的數據'
        };
    }

    const comparison = judgesData.map(judgeData => {
        const verdictDist = judgeData['裁判結果分布'] || [];
        const total = judgeData['分析判決書數量'] || 0;

        // 提取主要判決結果
        const mainVerdict = verdictDist[0] || {};

        return {
            法官姓名: judgeData['法官姓名'],
            總案件數: total,
            主要判決結果: mainVerdict['結果'] || 'N/A',
            主要判決比例: mainVerdict['比例'] || 'N/A',
            判決結果分布: verdictDist.slice(0, 5)
        };
    });

    return {
        比較法官數: judgesData.length,
        法官比較: comparison
    };
}

/**
 * 計算案件類型分布
 * @param {Array} judgments - 判決書陣列
 * @param {string} group_by - 分組依據: 'case_type' | 'court' | 'verdict_type'
 * @returns {Object} 分布統計
 */
export function calculate_case_type_distribution(judgments, group_by = 'case_type') {
    if (!Array.isArray(judgments) || judgments.length === 0) {
        return {
            error: '無判決書數據'
        };
    }

    const total = judgments.length;
    const distribution = {};

    judgments.forEach(j => {
        let key;
        if (group_by === 'case_type') {
            key = j['案由'] || j.JTITLE || 'Unknown';
        } else if (group_by === 'court') {
            key = j['法院'] || j.court || 'Unknown';
        } else if (group_by === 'verdict_type') {
            key = j['裁判結果'] || j.verdict_type || 'Unknown';
        } else {
            key = 'Unknown';
        }

        distribution[key] = (distribution[key] || 0) + 1;
    });

    const distributionArray = Object.entries(distribution)
        .map(([key, count]) => ({
            類別: key,
            數量: count,
            比例: `${(count / total * 100).toFixed(1)}%`
        }))
        .sort((a, b) => b.數量 - a.數量);

    return {
        總案件數: total,
        分組依據: group_by,
        分布: distributionArray
    };
}

