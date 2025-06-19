// services/judgment.js
import esClient from '../config/elasticsearch.js';

const ES_INDEX_NAME = 'search-boooook'; // 與 searchService 保持一致

/**
 * 根據 ID 獲取單一判決書的詳細資料。
 * @param {string} judgmentId - 判決書的 ID。
 * @returns {Promise<object|null>} 判決書的 _source 內容，如果找不到則返回 null。
 * @throws {Error} 如果 Elasticsearch 查詢失敗。
 */
export async function getJudgmentDetails(judgmentId) {
  // console.log(`[Judgment Service] Getting details for judgment ID: ${judgmentId}`);
  try {
    const result = await esClient.get({
      index: ES_INDEX_NAME,
      id: judgmentId
    });

    if (result && result._source) {
      // console.log(`[Judgment Service] Found judgment ID: ${judgmentId}`);
      return result._source; // 只返回 _source 內容
    } else {
      // 正常情況下，如果 ES 找不到文檔，get API 會拋出 404 錯誤
      // 但以防萬一，如果 ES 回應結構異常但未拋錯
      // console.warn(`[Judgment Service] Judgment ID: ${judgmentId} not found, but ES did not throw 404.`);
      return null;
    }
  } catch (error) {
    if (error.statusCode === 404) {
      // console.log(`[Judgment Service] Judgment ID: ${judgmentId} not found in Elasticsearch.`);
      return null; // 標準化處理：找不到時返回 null
    }
    console.error(`[Judgment Service] Error getting judgment ID ${judgmentId}:`, error.meta || error);
    const serviceError = new Error(`Failed to retrieve judgment details for ID ${judgmentId}.`);
    serviceError.statusCode = error.statusCode || 500;
    serviceError.originalError = error.message;
    throw serviceError; // 拋出錯誤由控制器捕獲
  }
}

/**
 * 根據 ID 陣列批次獲取多個判決書的詳細資料。
 * @param {Array<string>} judgmentIds - 包含多個判決書 ID 的陣列。
 * @returns {Promise<object>} 一個以判決書 ID 為鍵，判決書內容為值的物件。
 * @throws {Error} 如果 Elasticsearch 查詢失敗。
 */
export async function getJudgmentsByIds(judgmentIds) {
  // 備註：這是我們新增的核心批次查詢函式。
  console.log(`[Judgment Service] Batch getting details for ${judgmentIds.length} judgment IDs.`);
  
  // 如果傳入的陣列為空，直接返回空物件，避免不必要的 ES 查詢。
  if (!judgmentIds || judgmentIds.length === 0) {
    return {};
  }

  try {
    const result = await esClient.mget({
      index: ES_INDEX_NAME,
      body: {
        ids: judgmentIds
      }
    });

    // 備註：使用 mget API 是根據多個 ID 獲取文檔最高效的方式。
    // 它返回的 result.docs 是一個陣列，包含了每個 ID 的查詢結果。

    const judgmentsMap = {};
    if (result && result.docs) {
      result.docs.forEach(doc => {
        // 我們只處理成功找到的 (found: true) 文檔。
        if (doc.found && doc._source) {
          judgmentsMap[doc._id] = doc._source;
        }
      });
    }

    console.log(`[Judgment Service] Batch fetch found ${Object.keys(judgmentsMap).length} of ${judgmentIds.length} judgments.`);
    return judgmentsMap; // 返回一個以 ID 為鍵的物件，方便前端查找。

  } catch (error) {
    console.error(`[Judgment Service] Error during batch get for judgment IDs:`, error.meta || error);
    const serviceError = new Error('Failed to retrieve judgment details in batch.');
    serviceError.statusCode = error.statusCode || 500;
    serviceError.originalError = error.message;
    throw serviceError;
  }
}