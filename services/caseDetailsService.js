// services/caseDetailsService.js
import esClient from '../config/elasticsearch.js';

const ES_INDEX_NAME = 'search-boooook';

// 案例列表顯示所需的字段（原始版本 - 9個基本字段）
const CASE_LIST_FIELDS = [
  'JID', 'JTITLE', 'court', 'verdict_type', 'JYEAR',
  'summary_ai', 'main_reasons_ai', 'case_type', 'JDATE'
];

/**
 * 批次獲取案例列表詳情（精簡版）
 * @param {Array} caseIds - 案例 ID 數組
 * @returns {Promise<Object>} 以 ID 為鍵的案例詳情對象
 */
export async function getCaseListDetails(caseIds) {
  try {
    const response = await esClient.mget({
      index: ES_INDEX_NAME,
      body: { ids: caseIds },
      _source: CASE_LIST_FIELDS
    });

    const results = {};
    response.docs.forEach(doc => {
      if (doc.found && doc._source) {
        results[doc._id] = {
          ...doc._source,
          main_reasons_ai: Array.isArray(doc._source.main_reasons_ai)
            ? doc._source.main_reasons_ai.slice(0, 3)
            : (doc._source.main_reasons_ai ? [doc._source.main_reasons_ai] : [])
        };
      }
    });

    return results;
  } catch (error) {
    console.error('[CaseDetailsService] 獲取案例列表詳情失敗:', error);
    throw error;
  }
}
