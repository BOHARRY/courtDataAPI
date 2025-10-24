// services/casePrecedentAnalysis/analysis/strategicInsights.js

/**
 * 策略洞察分析模組
 * 負責生成立場導向的策略洞察
 */

import { summarizeStrategicInsights } from '../ai/insightSummarizer.js';

/**
 * 清理引用標記
 * @param {String} text - 文本
 * @returns {String} 清理後的文本
 */
function cleanCitationMarkers(text) {
    if (!text) return '';
    return text.replace(/\[\d+\]/g, '').trim();
}

/**
 * 從案例中提取成功策略
 * @param {Array} cases - 案例列表
 * @param {String} position - 立場
 * @returns {Array} 成功策略列表
 */
function extractSuccessStrategies(cases, position) {
    const strategies = [];

    // 將 position 轉換為正確的 key
    const positionKey = position === 'plaintiff' ? 'plaintiff_perspective' :
                       position === 'defendant' ? 'defendant_perspective' :
                       position;

    for (const caseItem of cases) {
        const positionAnalysis = caseItem.position_based_analysis || caseItem.positionAnalysis;
        if (!positionAnalysis) continue;

        const positionData = positionAnalysis[positionKey];
        if (!positionData) continue;

        // 提取成功策略 - 使用 successful_elements 或 successful_strategies
        const overallResult = positionData.overall_result;
        if (overallResult === 'major_victory' ||
            overallResult === 'substantial_victory' ||
            overallResult === 'partial_success') {

            // 優先使用 successful_elements，其次使用 successful_strategies
            const successElements = positionData.successful_elements || positionData.successful_strategies;
            if (successElements && Array.isArray(successElements)) {
                strategies.push(...successElements);
            }
        }
    }

    return strategies;
}

/**
 * 從案例中提取風險因素
 * @param {Array} cases - 案例列表
 * @param {String} position - 立場
 * @returns {Array} 風險因素列表
 */
function extractRiskFactors(cases, position) {
    const risks = [];

    // 將 position 轉換為正確的 key
    const positionKey = position === 'plaintiff' ? 'plaintiff_perspective' :
                       position === 'defendant' ? 'defendant_perspective' :
                       position;

    for (const caseItem of cases) {
        const positionAnalysis = caseItem.position_based_analysis || caseItem.positionAnalysis;
        if (!positionAnalysis) continue;

        const positionData = positionAnalysis[positionKey];
        if (!positionData) continue;

        // 提取風險因素 - 使用 critical_failures 或 failed_strategies
        const overallResult = positionData.overall_result;

        // 從所有案例中提取風險，不僅僅是失敗案例
        // critical_failures 包含了即使部分成功也存在的關鍵失敗點
        const criticalFailures = positionData.critical_failures;
        if (criticalFailures && Array.isArray(criticalFailures)) {
            risks.push(...criticalFailures);
        }

        // 如果是失敗案例，也提取 failed_strategies
        if (overallResult === 'major_defeat' || overallResult === 'substantial_defeat') {
            const failedStrategies = positionData.failed_strategies;
            if (failedStrategies && Array.isArray(failedStrategies)) {
                risks.push(...failedStrategies);
            }
        }
    }

    return risks;
}

/**
 * 計算勝訴統計
 * @param {Array} cases - 案例列表
 * @param {String} position - 立場
 * @returns {Object} 勝訴統計數據
 */
function calculateVictoryStats(cases, position) {
    let majorVictoryCount = 0;      // 重大勝訴 (major_victory)
    let substantialVictoryCount = 0; // 實質勝訴 (substantial_victory)
    let partialSuccessCount = 0;     // 部分勝訴 (partial_success)
    let minorVictoryCount = 0;       // 形式勝訴 (minor_victory)
    let majorDefeatCount = 0;        // 重大敗訴 (major_defeat)

    const totalCases = cases.length;

    // 將 position 轉換為正確的 key
    // 'plaintiff' -> 'plaintiff_perspective'
    // 'defendant' -> 'defendant_perspective'
    const positionKey = position === 'plaintiff' ? 'plaintiff_perspective' :
                       position === 'defendant' ? 'defendant_perspective' :
                       position;

    for (const caseItem of cases) {
        const positionAnalysis = caseItem.position_based_analysis || caseItem.positionAnalysis;
        if (!positionAnalysis) continue;

        const positionData = positionAnalysis[positionKey];
        if (!positionData) continue;

        // 使用 overall_result 而不是 outcome
        const overallResult = positionData.overall_result;
        if (!overallResult) continue;

        if (overallResult === 'major_victory') {
            majorVictoryCount++;
        } else if (overallResult === 'substantial_victory') {
            substantialVictoryCount++;
        } else if (overallResult === 'partial_success') {
            partialSuccessCount++;
        } else if (overallResult === 'minor_victory') {
            minorVictoryCount++;
        } else if (overallResult === 'major_defeat' || overallResult === 'substantial_defeat') {
            majorDefeatCount++;
        }
    }

    // 計算百分比
    const majorVictoryRate = totalCases > 0 ? Math.round((majorVictoryCount / totalCases) * 100) : 0;
    const substantialVictoryRate = totalCases > 0 ? Math.round((substantialVictoryCount / totalCases) * 100) : 0;
    const partialSuccessRate = totalCases > 0 ? Math.round((partialSuccessCount / totalCases) * 100) : 0;
    const minorVictoryRate = totalCases > 0 ? Math.round((minorVictoryCount / totalCases) * 100) : 0;
    const majorDefeatRate = totalCases > 0 ? Math.round((majorDefeatCount / totalCases) * 100) : 0;

    return {
        majorVictoryCount,
        majorVictoryRate,
        substantialVictoryCount,
        substantialVictoryRate,
        partialSuccessCount,
        partialSuccessRate,
        minorVictoryCount,
        minorVictoryRate,
        majorDefeatCount,
        majorDefeatRate
    };
}

/**
 * 生成立場導向策略洞察
 * @param {Array} similarCases - 相似案例列表
 * @param {String} position - 立場 ('plaintiff' | 'defendant' | 'neutral')
 * @param {Object} verdictAnalysis - 判決分析結果
 * @returns {Object} 策略洞察
 */
export async function generateStrategicInsights(similarCases, position, verdictAnalysis) {
    if (position === 'neutral') {
        // 中立立場：返回通用分析
        const mainVerdict = verdictAnalysis.mostCommon || '未知';
        const mainPercentage = verdictAnalysis.distribution?.[mainVerdict]?.percentage || 0;

        return {
            type: 'neutral',
            insights: [
                `基於 ${similarCases.length} 個相似案例的通用分析`,
                `主流判決模式：${mainVerdict} (${mainPercentage}%)`,
                '判決模式相對穩定'
            ]
        };
    }

    // 檢查是否有立場分析數據
    // 將 position 轉換為正確的 key
    const positionKey = position === 'plaintiff' ? 'plaintiff_perspective' :
                       position === 'defendant' ? 'defendant_perspective' :
                       position;

    const hasPositionData = similarCases.some(c => {
        const analysis = c.position_based_analysis || c.positionAnalysis;
        return analysis && analysis[positionKey];
    });

    if (!hasPositionData) {
        console.log(`[generateStrategicInsights] 沒有找到 ${position} 立場的分析數據`);
        return {
            type: position,
            insights: ['立場分析數據不足，建議參考通用統計']
        };
    }

    // 提取成功策略和風險因素
    const successStrategies = extractSuccessStrategies(similarCases, position);
    const riskFactors = extractRiskFactors(similarCases, position);

    console.log(`[generateStrategicInsights] ${position} 立場 - 成功策略: ${successStrategies.length}, 風險因素: ${riskFactors.length}`);

    // 計算勝訴統計
    const stats = calculateVictoryStats(similarCases, position);

    // 生成洞察文案
    const positionLabel = position === 'plaintiff' ? '原告方' : '被告方';
    const insights = [];

    // 第一行：重大勝訴率
    if (stats.majorVictoryCount > 0) {
        insights.push(`${positionLabel}重大勝訴率：${stats.majorVictoryRate}% (${stats.majorVictoryCount} 件)`);
    }

    // 第二行：實質勝訴率
    if (stats.substantialVictoryCount > 0) {
        insights.push(`${positionLabel}實質勝訴率：${stats.substantialVictoryRate}% (${stats.substantialVictoryCount} 件)`);
    }

    // 第三行：部分勝訴率
    if (stats.partialSuccessCount > 0) {
        insights.push(`${positionLabel}部分勝訴率：${stats.partialSuccessRate}% (${stats.partialSuccessCount} 件)`);
    }

    // 第四行：形式勝訴率
    if (stats.minorVictoryCount > 0) {
        insights.push(`${positionLabel}形式勝訴率：${stats.minorVictoryRate}% (${stats.minorVictoryCount} 件)`);
    }

    // 第五行：重大敗訴率
    if (stats.majorDefeatCount > 0) {
        insights.push(`${positionLabel}重大敗訴率：${stats.majorDefeatRate}% (${stats.majorDefeatCount} 件)`);
    }

    // 關鍵成功策略 (使用 AI 歸納)
    let successStrategiesDetails = null;
    if (successStrategies.length > 0) {
        console.log(`[generateStrategicInsights] 開始 AI 歸納成功策略，原始數量: ${successStrategies.length}`);

        const summarized = await summarizeStrategicInsights(
            successStrategies,
            'success',
            position
        );

        console.log(`[generateStrategicInsights] AI 歸納完成，生成 ${summarized.summary.length} 個核心策略`);

        // 生成洞察文本
        if (summarized.summary.length > 0) {
            const strategiesText = summarized.summary.join('、');
            insights.push(`關鍵成功策略：${strategiesText}`);

            // 保存詳細數據供前端展開查看
            successStrategiesDetails = summarized.details;
        }
    }

    // 主要風險因素 (使用 AI 歸納)
    let riskFactorsDetails = null;
    if (riskFactors.length > 0) {
        console.log(`[generateStrategicInsights] 開始 AI 歸納風險因素，原始數量: ${riskFactors.length}`);

        const summarized = await summarizeStrategicInsights(
            riskFactors,
            'risk',
            position
        );

        console.log(`[generateStrategicInsights] AI 歸納完成，生成 ${summarized.summary.length} 個核心風險`);

        // 生成洞察文本
        if (summarized.summary.length > 0) {
            const risksText = summarized.summary.join('、');
            insights.push(`主要風險因素：${risksText}`);

            // 保存詳細數據供前端展開查看
            riskFactorsDetails = summarized.details;
        }
    }

    return {
        type: position,
        ...stats,
        insights: insights,

        // 新增詳細數據
        successStrategiesDetails: successStrategiesDetails,
        riskFactorsDetails: riskFactorsDetails
    };
}

/**
 * 生成立場統計數據
 * @param {Array} similarCases - 相似案例列表
 * @param {String} position - 立場
 * @returns {Object} 立場統計
 */
export function generatePositionStats(similarCases, position) {
    const stats = calculateVictoryStats(similarCases, position);

    // 計算獲勝比例（明顯有利結果）
    // successRate = major_victory + substantial_victory 的比例
    const successCount = stats.majorVictoryCount + stats.substantialVictoryCount;
    const successRate = similarCases.length > 0 ? Math.round((successCount / similarCases.length) * 100) : 0;

    // 計算風險比例（明顯不利結果）
    // riskRate = major_defeat 的比例
    const riskRate = stats.majorDefeatRate;

    // 生成判決分布數據（前端期望的格式）
    const positionLabel = position === 'plaintiff' ? '原告' : position === 'defendant' ? '被告' : '';
    const verdictDistribution = [];

    if (stats.majorVictoryCount > 0) {
        verdictDistribution.push({
            verdict: `${positionLabel}重大勝訴`,
            percentage: stats.majorVictoryRate,
            count: stats.majorVictoryCount
        });
    }

    if (stats.substantialVictoryCount > 0) {
        verdictDistribution.push({
            verdict: `${positionLabel}實質勝訴`,
            percentage: stats.substantialVictoryRate,
            count: stats.substantialVictoryCount
        });
    }

    if (stats.partialSuccessCount > 0) {
        verdictDistribution.push({
            verdict: `${positionLabel}部分勝訴`,
            percentage: stats.partialSuccessRate,
            count: stats.partialSuccessCount
        });
    }

    if (stats.minorVictoryCount > 0) {
        verdictDistribution.push({
            verdict: `${positionLabel}形式勝訴`,
            percentage: stats.minorVictoryRate,
            count: stats.minorVictoryCount
        });
    }

    if (stats.majorDefeatCount > 0) {
        verdictDistribution.push({
            verdict: `${positionLabel}重大敗訴`,
            percentage: stats.majorDefeatRate,
            count: stats.majorDefeatCount
        });
    }

    return {
        position: position,
        totalCases: similarCases.length,
        successRate: successRate,  // 前端期望的字段
        riskRate: riskRate,        // 前端期望的字段
        successCases: successCount, // 成功案例數
        riskCases: stats.majorDefeatCount, // 風險案例數
        verdictDistribution: verdictDistribution, // 前端期望的判決分布
        ...stats
    };
}

