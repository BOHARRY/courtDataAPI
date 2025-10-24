// services/casePrecedentAnalysis/analysis/criticalCaseAnalyzer.js

import esClient from '../../../config/elasticsearch.js';

/**
 * 從案例池中獲取重大判決案例
 * 優先選擇重大勝訴和重大敗訴，不足則補充部分勝訴
 * 
 * @param {Object} casePool - 案例池
 * @param {string} position - 立場 ('plaintiff' | 'defendant')
 * @param {number} maxCount - 最多獲取案例數量
 * @returns {Promise<{cases: Array, distribution: Object}>} 重大案例和分布統計
 */
export async function getCriticalCasesFromPool(casePool, position, maxCount = 10) {
    try {
        console.log(`[getCriticalCasesFromPool] 🎯 從案例池獲取重大判決案例，立場: ${position}，最多: ${maxCount} 件`);

        const positionKey = position === 'plaintiff' ? 'plaintiff_perspective' : 'defendant_perspective';

        // 1. 分類案例
        const majorVictory = [];  // 重大勝訴
        const majorDefeat = [];   // 重大敗訴
        const partialSuccess = []; // 部分勝訴

        casePool.allCases.forEach(case_ => {
            const analysis = case_.position_based_analysis?.[positionKey];
            if (!analysis) return;

            switch (analysis.overall_result) {
                case 'major_victory':
                    majorVictory.push(case_);
                    break;
                case 'major_defeat':
                    majorDefeat.push(case_);
                    break;
                case 'partial_success':
                    partialSuccess.push(case_);
                    break;
            }
        });

        console.log(`[getCriticalCasesFromPool] 📊 案例分類: 重大勝訴 ${majorVictory.length} 件, 重大敗訴 ${majorDefeat.length} 件, 部分勝訴 ${partialSuccess.length} 件`);

        // 2. 優先選擇重大勝訴和重大敗訴
        const selectedCases = [];

        // 2.1 加入所有重大勝訴（最多5件）
        selectedCases.push(...majorVictory.slice(0, 5));

        // 2.2 加入所有重大敗訴（最多5件）
        selectedCases.push(...majorDefeat.slice(0, 5));

        // 2.3 如果不足 maxCount 件，從部分勝訴補充
        if (selectedCases.length < maxCount) {
            const remaining = maxCount - selectedCases.length;
            selectedCases.push(...partialSuccess.slice(0, remaining));
        }

        console.log(`[getCriticalCasesFromPool] ✅ 選擇了 ${selectedCases.length} 件案例進行分析`);

        // 3. 獲取完整的判決數據
        const criticalCases = [];
        for (let i = 0; i < selectedCases.length; i++) {
            const case_ = selectedCases[i];

            try {
                const judgmentData = await getJudgmentNodeData(case_.id);
                const analysis = case_.position_based_analysis?.[positionKey];

                criticalCases.push({
                    id: case_.id,
                    title: case_.title,
                    court: case_.court,
                    year: case_.year,
                    verdictType: case_.verdictType,
                    overallResult: analysis?.overall_result,
                    similarity: case_.similarity,
                    summaryAiFull: judgmentData.summary_ai_full ||
                                  (Array.isArray(judgmentData.summary_ai) ?
                                   judgmentData.summary_ai.join(' ') :
                                   judgmentData.summary_ai || ''),
                    positionAnalysis: case_.position_based_analysis,
                    citationIndex: i + 1
                });
            } catch (error) {
                console.warn(`[getCriticalCasesFromPool] 無法獲取案例 ${case_.id} 的完整數據:`, error.message);
                const analysis = case_.position_based_analysis?.[positionKey];

                // 即使獲取失敗，也添加基本信息
                criticalCases.push({
                    id: case_.id,
                    title: case_.title,
                    court: case_.court,
                    year: case_.year,
                    verdictType: case_.verdictType,
                    overallResult: analysis?.overall_result,
                    similarity: case_.similarity,
                    summaryAiFull: `${case_.title} - ${case_.court} ${case_.year}年判決`,
                    positionAnalysis: case_.position_based_analysis,
                    citationIndex: i + 1
                });
            }
        }

        // 4. 統計分析的案例分布
        const distribution = {
            majorVictory: criticalCases.filter(c => c.overallResult === 'major_victory').length,
            majorDefeat: criticalCases.filter(c => c.overallResult === 'major_defeat').length,
            partialSuccess: criticalCases.filter(c => c.overallResult === 'partial_success').length
        };

        console.log(`[getCriticalCasesFromPool] 📊 分析案例分布: 重大勝訴 ${distribution.majorVictory} 件, 重大敗訴 ${distribution.majorDefeat} 件, 部分勝訴 ${distribution.partialSuccess} 件`);

        return { cases: criticalCases, distribution };
    } catch (error) {
        console.error('[getCriticalCasesFromPool] 獲取重大判決案例失敗:', error);
        throw error;
    }
}

/**
 * 獲取判決書node所需的完整數據
 * @private
 * @param {string} caseId - 案例ID
 * @returns {Promise<Object>} 判決書數據
 */
async function getJudgmentNodeData(caseId) {
    try {
        const response = await esClient.get({
            index: 'judgments',
            id: caseId,
            _source: [
                'JID', 'JYEAR', 'JTITLE', 'JCASE', 'JFULL',
                'summary_ai', 'summary_ai_full', 'main_reasons_ai',
                'position_based_analysis'
            ]
        });

        if (!response.found) {
            throw new Error(`找不到判決書: ${caseId}`);
        }

        return response._source;
    } catch (error) {
        console.error(`[getJudgmentNodeData] 獲取判決書 ${caseId} 失敗:`, error);
        throw error;
    }
}

/**
 * 準備包含立場分析的案例摘要
 * 
 * @param {Array} cases - 案例列表
 * @param {string} position - 立場
 * @returns {string} 格式化的案例摘要文本
 */
export function prepareEnrichedCaseSummaries(cases, position) {
    return cases.map((case_, index) => {
        let summary = `[${index + 1}] ${case_.title} (${case_.court} ${case_.year}年)\n${case_.summaryAiFull}`;

        // 如果有立場分析資料，加入相關資訊
        if (case_.positionAnalysis && position !== 'neutral') {
            const positionKey = position === 'plaintiff' ? 'plaintiff_perspective' : 'defendant_perspective';
            const positionData = case_.positionAnalysis[positionKey];

            if (positionData) {
                summary += `\n\n📊 ${position === 'plaintiff' ? '原告方' : '被告方'}立場分析：`;

                if (positionData.overall_result) {
                    summary += `\n• 結果評估：${positionData.overall_result}`;
                }

                if (positionData.case_value) {
                    summary += `\n• 案例價值：${positionData.case_value}`;
                }

                if (positionData.replicable_strategies) {
                    summary += `\n• 可複製策略：${positionData.replicable_strategies}`;
                }

                if (positionData.key_lessons) {
                    summary += `\n• 關鍵教訓：${positionData.key_lessons}`;
                }

                if (position === 'plaintiff' && positionData.successful_elements) {
                    summary += `\n• 成功要素：${positionData.successful_elements}`;
                } else if (position === 'defendant' && positionData.successful_elements) {
                    summary += `\n• 防禦成功要素：${positionData.successful_elements}`;
                }

                if (positionData.critical_failures) {
                    summary += `\n• 關鍵失敗點：${positionData.critical_failures}`;
                }
            }
        }

        return summary;
    }).join('\n\n');
}

/**
 * 構建引用信息
 * 
 * @param {Array} cases - 案例列表
 * @returns {Object} 引用信息對象
 */
export function buildCitations(cases) {
    const citations = {};
    
    cases.forEach((case_, index) => {
        citations[index + 1] = {
            JID: case_.id || case_.JID || '',
            JTITLE: case_.title || '',
            judgementId: `${case_.title || '未知判決'} (${case_.court || '未知法院'} ${case_.year || '未知年份'}年)`,
            originalText: case_.summaryAiFull || '無摘要',
            court: case_.court || '',
            year: case_.year || '',
            verdict_type: case_.verdict_type || case_.verdictType || '',
            summary_ai: case_.summaryAiFull || ''
        };
    });

    return citations;
}

/**
 * 格式化分析結果
 * 
 * @param {Object} analysisResult - AI 分析結果
 * @param {Array} cases - 案例列表
 * @param {string} position - 立場
 * @param {Object} distribution - 案例分布
 * @returns {Object} 格式化後的分析結果
 */
export function formatAnalysisResult(analysisResult, cases, position, distribution) {
    // 添加引用信息
    analysisResult.citations = buildCitations(cases);

    // 添加立場信息和案例分布
    analysisResult.position = position;
    analysisResult.analysisType = position === 'plaintiff' ? '原告方重大判決分析' : '被告方重大判決分析';
    analysisResult.caseDistribution = distribution;

    return analysisResult;
}

