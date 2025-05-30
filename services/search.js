// services/search.js
import esClient from '../config/elasticsearch.js';
import { buildEsQuery } from '../utils/query-builder.js';
import { formatEsResponse } from '../utils/response-formatter.js';

const ES_INDEX_NAME = 'search-boooook';

/**
 * 執行判決書搜尋。
 * @param {object} searchFilters - 從控制器傳來的查詢參數。
 * @param {number} page - 當前頁碼。
 * @param {number} pageSize - 每頁結果數量。
 * @returns {Promise<object>} 格式化後的搜尋結果。
 */
export async function performSearch(searchFilters, page, pageSize) {
  const esQueryBody = buildEsQuery(searchFilters);
  const from = (page - 1) * pageSize;

  try {
    const esResult = await esClient.search({
      index: ES_INDEX_NAME,
      from: from,
      size: pageSize,
      query: (esQueryBody.bool && Object.keys(esQueryBody.bool).length > 0) ? esQueryBody : { match_all: {} },
      aggs: {
        // 主要勝訴理由聚合
        win_reasons: {
          terms: {
            field: 'main_reasons_ai.keyword',
            size: 20,
            order: { _count: 'desc' }
          }
        },
        // 動態獲取實際使用的案件類型
        dynamic_case_types: {
          terms: {
            field: 'case_type.keyword',
            size: 50,
            order: { _count: 'desc' }
          }
        },
        // 動態獲取實際的判決結果
        dynamic_verdicts: {
          terms: {
            field: 'verdict_type.keyword',
            size: 30,
            order: { _count: 'desc' }
          }
        },
        // 動態獲取法院名稱
        dynamic_courts: {
          terms: {
            field: 'court.exact',
            size: 50,
            order: { _count: 'desc' }
          }
        }
      },
      highlight: {
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
        { 'JDATE': 'desc' }
      ]
    });

    return formatEsResponse(esResult, pageSize);
  } catch (error) {
    if (error.meta && error.meta.body && error.meta.body.error) {
      console.error('[Search Service] Elasticsearch Error Body:', JSON.stringify(error.meta.body.error, null, 2));
    } else {
      console.error('[Search Service] Error during Elasticsearch search (meta or body missing):', error);
    }
    const serviceError = new Error('Failed to perform search due to a database error.');
    serviceError.statusCode = error.statusCode || 500;
    serviceError.esErrorDetails = error.meta ? (error.meta.body ? error.meta.body.error : error.meta) : error.message;
    throw serviceError;
  }
}

/**
 * 獲取用於前端篩選器的可用選項。
 * @returns {Promise<object>} 包含各種篩選條件選項的物件。
 */
export async function getAvailableFilters() {
  try {
    const aggregationsResponse = await esClient.search({
      index: ES_INDEX_NAME,
      size: 0,
      aggs: {
        case_types: { 
          terms: { 
            field: 'case_type.keyword', 
            size: 100,
            order: { _count: 'desc' }
          } 
        },
        court_names: { 
          terms: { 
            field: 'court.exact', 
            size: 50,
            order: { _count: 'desc' }
          } 
        },
        verdicts: { 
          terms: { 
            field: 'verdict_type.keyword', 
            size: 50,
            order: { _count: 'desc' }
          } 
        },
        reasoning_strengths: { 
          terms: { 
            field: 'outcome_reasoning_strength.keyword', 
            size: 10 
          } 
        }
      }
    });

    const aggs = aggregationsResponse.aggregations;
    const filters = {
      caseTypes: aggs?.case_types?.buckets.map(b => b.key) || [],
      courtNames: aggs?.court_names?.buckets.map(b => b.key) || [],
      verdicts: aggs?.verdicts?.buckets.map(b => b.key) || [],
      reasoningStrengths: aggs?.reasoning_strengths?.buckets.map(b => b.key) || [],
    };
    
    console.log('[Search Service] Filters data retrieved:', filters);
    return filters;
  } catch (error) {
    console.error('[Search Service] Error getting available filters:', error.meta || error);
    const serviceError = new Error('Failed to retrieve filter options due to a database error.');
    serviceError.statusCode = error.statusCode || 500;
    serviceError.originalError = error.message;
    throw serviceError;
  }
}