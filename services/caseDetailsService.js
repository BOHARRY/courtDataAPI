// services/caseDetailsService.js
import esClient from '../config/elasticsearch.js';

const ES_INDEX_NAME = 'search-boooook'; // 與其他服務保持一致

// 案例列表顯示所需的字段（精簡版，用於列表顯示）
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
    console.log(`[CaseDetailsService] 開始獲取 ${caseIds.length} 個案例的列表詳情`);
    
    // 🚨 添加 ES 連接檢查
    try {
      await esClient.ping();
    } catch (pingError) {
      console.error(`[CaseDetailsService] Elasticsearch 連接失敗:`, pingError.message);
      console.warn(`[CaseDetailsService] 🚨 降級模式：返回空結果以避免應用崩潰`);
      return {};
    }

    // 使用 mget API 批次獲取文檔
    const response = await esClient.mget({
      index: ES_INDEX_NAME,
      body: { 
        ids: caseIds 
      },
      _source: CASE_LIST_FIELDS // 只獲取列表顯示所需的字段
    });

    console.log(`[CaseDetailsService] ES mget 響應: ${response.docs.length} 個文檔`);

    // 處理響應，構建結果對象
    const results = {};
    let foundCount = 0;
    let notFoundCount = 0;

    response.docs.forEach(doc => {
      if (doc.found && doc._source) {
        // 處理 main_reasons_ai 字段，限制數量以減少數據傳輸
        const processedSource = {
          ...doc._source,
          // 🎯 限制 main_reasons_ai 最多 3 個項目，減少數據量
          main_reasons_ai: Array.isArray(doc._source.main_reasons_ai) 
            ? doc._source.main_reasons_ai.slice(0, 3)
            : (doc._source.main_reasons_ai ? [doc._source.main_reasons_ai] : [])
        };

        results[doc._id] = processedSource;
        foundCount++;
      } else {
        console.warn(`[CaseDetailsService] 案例 ${doc._id} 未找到`);
        notFoundCount++;
      }
    });

    console.log(`[CaseDetailsService] ✅ 獲取完成: ${foundCount} 個成功, ${notFoundCount} 個未找到`);
    
    // 計算響應數據大小（用於監控）
    const responseSize = JSON.stringify(results).length;
    console.log(`[CaseDetailsService] 響應數據大小: ${(responseSize/1024).toFixed(1)} KB`);

    return results;

  } catch (error) {
    console.error('[CaseDetailsService] 獲取案例列表詳情失敗:', error);
    
    // 根據錯誤類型提供更具體的錯誤信息
    if (error.name === 'ConnectionError') {
      const connectionError = new Error('Elasticsearch 連接失敗，請稍後重試');
      connectionError.statusCode = 503;
      throw connectionError;
    }
    
    if (error.statusCode === 404) {
      const notFoundError = new Error('指定的案例索引不存在');
      notFoundError.statusCode = 404;
      throw notFoundError;
    }

    // 其他未知錯誤
    const serviceError = new Error('獲取案例詳情時發生內部錯誤');
    serviceError.statusCode = 500;
    serviceError.originalError = error;
    throw serviceError;
  }
}

/**
 * 驗證案例 ID 數組
 * @param {Array} caseIds - 案例 ID 數組
 * @returns {Object} 驗證結果 { isValid: boolean, error?: string }
 */
export function validateCaseIds(caseIds) {
  if (!caseIds) {
    return { isValid: false, error: 'caseIds 參數為必填' };
  }

  if (!Array.isArray(caseIds)) {
    return { isValid: false, error: 'caseIds 必須是數組' };
  }

  if (caseIds.length === 0) {
    return { isValid: false, error: 'caseIds 數組不能為空' };
  }

  if (caseIds.length > 50) {
    return { isValid: false, error: '單次請求不能超過 50 個案例' };
  }

  // 檢查是否所有 ID 都是有效字符串
  const invalidIds = caseIds.filter(id => !id || typeof id !== 'string' || id.trim().length === 0);
  if (invalidIds.length > 0) {
    return { isValid: false, error: `發現 ${invalidIds.length} 個無效的案例 ID` };
  }

  return { isValid: true };
}
