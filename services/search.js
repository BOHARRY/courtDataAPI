// services/search.js
import esClient from '../config/elasticsearch.js'; // 引入 ES 客戶端實例
import { buildEsQuery } from '../utils/query-builder.js';
import { formatEsResponse } from '../utils/response-formatter.js';

const ES_INDEX_NAME = 'search-boooook'; // 將索引名稱定義為常數

/**
 * 執行判決書搜尋。
 * @param {object} searchFilters - 從控制器傳來的查詢參數。
 * @param {number} page - 當前頁碼。
 * @param {number} pageSize - 每頁結果數量。
 * @returns {Promise<object>} 格式化後的搜尋結果。
 */
export async function performSearch(searchFilters, page, pageSize) {
  // console.log('[Search Service] Performing search with filters:', searchFilters, `Page: ${page}, Size: ${pageSize}`);
  const esQueryBody = buildEsQuery(searchFilters);
  const from = (page - 1) * pageSize;

  try {
    const esResult = await esClient.search({
      index: ES_INDEX_NAME,
      from: from,
      size: pageSize,
      // 如果 esQueryBody.bool 為空 (例如 match_all)，直接使用 esQueryBody
      // 否則，如果 esQueryBody.bool 有內容，則使用它
      query: (esQueryBody.bool && Object.keys(esQueryBody.bool).length > 0) ? esQueryBody : { match_all: {} },
      aggs: { // 聚合請求保持不變
        win_reasons: {
          terms: {
            field: 'main_reasons_ai.keyword', // 確保使用 .keyword 進行精確聚合
            size: 50, // 聚合返回的桶數量
            // order: { _count: 'asc' } // 根據您的需求調整排序
          }
        }
        // 未來可以根據 searchFilters 動態添加更多聚合
      },
      highlight: { // 高亮配置保持不變
        fields: {
          "JFULL": {
            fragment_size: 60,
            number_of_fragments: 2,
            pre_tags: ["<em>"],
            post_tags: ["</em>"]
          },
          "summary_ai": {
            fragment_size: 150,
            number_of_fragments: 1,
            pre_tags: ["<em>"],
            post_tags: ["</em>"]
          }
        }
      },
      sort: [
        { '_score': 'desc' },
        { 'JDATE': 'desc' } // <--- 使用正確的 JDATE (keyword 類型) 欄位
      ]
    });

    // console.log('[Search Service] Elasticsearch query successful.');
    return formatEsResponse(esResult, pageSize);
  } catch (error) {
    if (error.meta && error.meta.body && error.meta.body.error) {
      console.error('[Search Service] Elasticsearch Error Body:', JSON.stringify(error.meta.body.error, null, 2)); // <--- 更詳細的錯誤
    } else {
      console.error('[Search Service] Error during Elasticsearch search (meta or body missing):', error);
    }
    // 拋出一個更通用的錯誤，或者根據 ES 錯誤類型進行轉換
    const serviceError = new Error('Failed to perform search due to a database error.');
    serviceError.statusCode = error.statusCode || 500; // 保留原始 ES 錯誤碼 (如果存在)
    serviceError.esErrorDetails = error.meta ? (error.meta.body ? error.meta.body.error : error.meta) : error.message; // 附加更詳細的ES錯誤
    throw serviceError;
  }
}

/**
 * 獲取用於前端篩選器的可用選項。
 * @returns {Promise<object>} 包含各種篩選條件選項的物件。
 */
export async function getAvailableFilters() {
  // console.log('[Search Service] Getting available filters.');
  try {
    const aggregationsResponse = await esClient.search({
      index: ES_INDEX_NAME,
      size: 0, // 不需要返回任何命中，只需要聚合結果
      aggs: {
        case_types: { terms: { field: 'case_type.keyword', size: 50 } },
        court_names: { terms: { field: 'court.keyword', size: 30 } }, // 改為 court_names 以示區分
        verdicts: { terms: { field: 'verdict.keyword', size: 10 } },
        reasoning_strengths: { terms: { field: 'outcome_reasoning_strength.keyword', size: 10 } },
        // 可以根據您的需求添加更多聚合，例如 JYEAR (年份)
        // jyear: { terms: { field: 'JYEAR.keyword', size: 20, order: { _key: 'desc' } } }
      }
    });

    const aggs = aggregationsResponse.aggregations;
    const filters = {
      caseTypes: aggs?.case_types?.buckets.map(b => b.key) || [],
      courtNames: aggs?.court_names?.buckets.map(b => b.key) || [], // 對應修改
      verdicts: aggs?.verdicts?.buckets.map(b => b.key) || [],
      reasoningStrengths: aggs?.reasoning_strengths?.buckets.map(b => b.key) || [],
      // jyears: aggs?.jyear?.buckets.map(b => b.key) || [],
    };
    // console.log('[Search Service] Filters data retrieved:', filters);
    return filters;
  } catch (error) {
    console.error('[Search Service] Error getting available filters:', error.meta || error);
    const serviceError = new Error('Failed to retrieve filter options due to a database error.');
    serviceError.statusCode = error.statusCode || 500;
    serviceError.originalError = error.message;
    throw serviceError;
  }
}