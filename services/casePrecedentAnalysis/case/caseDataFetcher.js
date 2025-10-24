// services/casePrecedentAnalysis/case/caseDataFetcher.js

import esClient from '../../../config/elasticsearch.js';
import { ES_INDEX_NAME } from '../utils/constants.js';

/**
 * 獲取判決書 node 所需的完整數據
 * 
 * @param {string} caseId - 案例 ID
 * @returns {Promise<Object|null>} 判決書數據，失敗時返回 null
 */
export async function getJudgmentNodeData(caseId) {
    try {
        const response = await esClient.get({
            index: ES_INDEX_NAME,
            id: caseId,
            _source: [
                'JID', 'JTITLE', 'court', 'verdict_type',
                'summary_ai', 'main_reasons_ai',
                'legal_issues', 'citations',
                // 立場導向向量欄位和相關資料
                'position_based_analysis',
                'plaintiff_combined_vector',
                'defendant_combined_vector',
                'replicable_strategies_vector',
                'main_reasons_ai_vector',
                'text_embedding',
                'legal_issues_vector',
                'key_metrics' // 🆕 金額分析需要（包含 civil_metrics.claim_amount 和 granted_amount）
            ]
        });

        console.log(`[getJudgmentNodeData] 成功獲取案例 ${caseId} 數據:`, {
            JID: response._source.JID,
            JTITLE: response._source.JTITLE,
            summary_ai_type: typeof response._source.summary_ai,
            summary_ai_isArray: Array.isArray(response._source.summary_ai),
            summary_ai_value: response._source.summary_ai,
            main_reasons_ai_type: typeof response._source.main_reasons_ai,
            main_reasons_ai_isArray: Array.isArray(response._source.main_reasons_ai)
        });

        return response._source;
    } catch (error) {
        console.error(`[getJudgmentNodeData] 獲取案例 ${caseId} 詳細數據失敗:`, error);
        return null;
    }
}

/**
 * 批量獲取判決書數據
 * 
 * @param {Array<string>} caseIds - 案例 ID 列表
 * @returns {Promise<Object>} 案例 ID 到數據的映射
 */
export async function batchGetJudgmentData(caseIds) {
    try {
        const result = await esClient.mget({
            index: ES_INDEX_NAME,
            body: {
                ids: caseIds
            }
        });

        const judgmentsMap = {};
        if (result && result.docs) {
            result.docs.forEach(doc => {
                if (doc.found && doc._source) {
                    judgmentsMap[doc._id] = doc._source;
                }
            });
        }

        console.log(`[batchGetJudgmentData] 成功獲取 ${Object.keys(judgmentsMap).length}/${caseIds.length} 個案例數據`);
        return judgmentsMap;
    } catch (error) {
        console.error('[batchGetJudgmentData] 批量獲取案例數據失敗:', error);
        return {};
    }
}

