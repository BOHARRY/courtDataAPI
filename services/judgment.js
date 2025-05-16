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