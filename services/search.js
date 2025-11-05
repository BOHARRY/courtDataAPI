// services/search.js
import esClient from '../config/elasticsearch.js';
import { buildEsQuery } from '../utils/query-builder.js';
import { formatEsResponse } from '../utils/response-formatter.js';
import { getStructuredCourtList } from './courtNormalizer.js';
import logger from '../utils/logger.js';

const ES_INDEX_NAME = 'search-boooook';

/**
 * 執行判決書搜尋。
 * 🆕 支持 AI 案號智能解析
 *
 * @param {object} searchFilters - 從控制器傳來的查詢參數。
 * @param {number} page - 當前頁碼。
 * @param {number} pageSize - 每頁結果數量。
 * @returns {Promise<object>} 格式化後的搜尋結果。
 */
export async function performSearch(searchFilters, page, pageSize, userId = null) {
  const startTime = Date.now();

  // 🔍 調試日誌：檢查 Service 接收到的參數
  logger.debug('🔍 Service 接收到的搜尋參數', {
    operation: 'search_service_debug',
    userId,
    searchFilters,
    keywordFromFilters: searchFilters.keyword,
    queryFromFilters: searchFilters.query,
    allFilterKeys: Object.keys(searchFilters)
  });

  // 構建簡潔的篩選摘要
  const keyword = searchFilters.keyword?.trim() || '';
  const filterParts = [];

  // 優先顯示關鍵字
  if (keyword) {
    filterParts.push(`"${keyword}"`);
  }

  // 添加其他篩選條件
  if (searchFilters.caseTypes && searchFilters.caseTypes !== '全部') {
    filterParts.push(searchFilters.caseTypes);
  }
  if (searchFilters.court && searchFilters.court !== '全部') {
    filterParts.push(searchFilters.court);
  }
  if (searchFilters.verdict && searchFilters.verdict !== '全部') {
    filterParts.push(searchFilters.verdict);
  }

  const filterSummary = filterParts.length > 0 ? filterParts.join(' | ') : '全文搜尋';

  // 記錄搜尋開始
  logger.info(`🔍 判決搜尋: ${filterSummary}`, {
    event: 'judgment_search',
    operation: 'judgment_keyword_search',
    status: 'started',
    userId,
    keyword: keyword || null,
    filter_keyword: keyword || '無',
    filter_caseTypes: searchFilters.caseTypes || '全部',
    filter_court: searchFilters.court || '全部',
    filter_verdict: searchFilters.verdict || '全部',
    filter_dateRange: searchFilters.startDate && searchFilters.endDate ?
      `${searchFilters.startDate} ~ ${searchFilters.endDate}` : '不限',
    page,
    pageSize
  });

  // 🆕 buildEsQuery 現在是異步的（支持 AI 案號解析）
  const esQueryBody = await buildEsQuery(searchFilters);
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
            // ===== 修正 #1: 移除 .tags 後綴 =====
            field: 'main_reasons_ai',
            size: 20,
            order: { _count: 'desc' }
          }
        },
        // 動態獲取實際使用的案件類型
        dynamic_case_types: {
          terms: {
            field: 'case_type', // 根據 mapping，case_type 是 keyword，不需 .keyword
            size: 50,
            order: { _count: 'desc' }
          }
        },
        // 動態獲取實際的判決結果
        dynamic_verdicts: {
          terms: {
            field: 'verdict_type', // 根據 mapping，verdict_type 是 keyword，不需 .keyword
            size: 30,
            order: { _count: 'desc' }
          }
        },
        // 動態獲取法院名稱
        dynamic_courts: {
          terms: {
            field: 'court.exact', // 保持不變，這個是正確的
            size: 50,
            order: { _count: 'desc' }
          }
        }
      },
      highlight: {
        pre_tags: ["<em class='search-highlight'>"], // 使用 class 以便於 CSS 美化
        post_tags: ["</em>"],
        fields: {
          // ===== 修正 #2: 移除 .cjk 後綴，直接對主欄位進行高亮 =====
          "JFULL": {
            fragment_size: 120,       // 稍微增加片段長度，獲取更多上下文
            number_of_fragments: 20,  // 從 3 大幅增加到 20
            no_match_size: 120 // 如果沒有匹配，從頭截取 120 字元作為摘要
          },
          "JTITLE": {
            number_of_fragments: 0 // 對標題返回完整的高亮內容
          },
          "summary_ai": {
            fragment_size: 150,
            number_of_fragments: 1,
            no_match_size: 150
          }
          // ==============================================================
        },
        // 核心修正：使用主查詢來生成高亮
        highlight_query: esQueryBody
      },
      sort: [
        { '_score': 'desc' },
        { 'JDATE': 'desc' }
      ]
    });

    const duration = Date.now() - startTime;
    const resultCount = typeof esResult.hits.total === 'number'
      ? esResult.hits.total
      : esResult.hits.total.value;

    // 記錄搜尋成功
    logger.business(`✅ 判決搜尋完成: ${resultCount} 筆結果 (${duration}ms)`, {
      event: 'judgment_search',
      operation: 'judgment_keyword_search',
      status: 'completed',
      userId,
      keyword: keyword || null,
      filter_keyword: keyword || '無',
      filter_caseTypes: searchFilters.caseTypes || '全部',
      resultCount,
      duration,
      page,
      pageSize,
      hasResults: resultCount > 0
    });

    // 性能監控
    if (duration > 3000) {
      logger.performance(`⚠️ 判決搜尋較慢: ${duration}ms (${resultCount} 筆結果)`, {
        event: 'judgment_search',
        operation: 'judgment_keyword_search',
        status: 'slow_query',
        userId,
        keyword: keyword || null,
        duration,
        resultCount,
        threshold: 3000
      });
    }

    return formatEsResponse(esResult, pageSize);
  } catch (error) {
    const duration = Date.now() - startTime;

    // 記錄詳細錯誤
    logger.error(`❌ 判決搜尋失敗: ${error.message}`, {
      event: 'judgment_search',
      operation: 'judgment_keyword_search',
      status: 'failed',
      userId,
      keyword: keyword || null,
      filter_keyword: keyword || '無',
      filter_caseTypes: searchFilters.caseTypes || '全部',
      filter_court: searchFilters.court || '全部',
      filter_verdict: searchFilters.verdict || '全部',
      duration,
      error: error.message,
      stack: error.stack,
      esError: error.meta?.body?.error ? JSON.stringify(error.meta.body.error) : null
    });

    const serviceError = new Error('搜尋服務暫時無法使用，請稍後再試');
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
    // 臨時診斷：檢查一個文件的結構
    const sampleDoc = await esClient.search({
      index: ES_INDEX_NAME,
      size: 1,
      // ===== 修正 #3: 移除不存在的 outcome_reasoning_strength 欄位 =====
      _source: ['case_type', 'verdict_type', 'main_reasons_ai']
    });

    console.log('[DIAGNOSE] Sample document structure:', JSON.stringify(sampleDoc.hits.hits[0]?._source, null, 2));

    // 先執行一個測試查詢，確認欄位格式
    const testResponse = await esClient.search({
      index: ES_INDEX_NAME,
      size: 1,
      _source: ['case_type', 'verdict_type']
    });

    console.log('[Test] Sample document fields:', testResponse.hits.hits[0]?._source);

    const aggregationsResponse = await esClient.search({
      index: ES_INDEX_NAME,
      size: 0,
      aggs: {
        // 對陣列欄位，直接使用欄位名稱（不加 .keyword）
        case_types: {
          terms: {
            field: 'case_type',  // 移除 .keyword，正確
            size: 100,
            order: { _count: 'desc' }
          }
        },
        // 測試不同的欄位名稱組合
        court_names: {
          terms: {
            field: 'court.exact',  // 保持不變，因為這個有效
            size: 200,  // 增加到 200 以獲取所有法院
            order: { _count: 'desc' }
          }
        },
        // 嘗試不加 .keyword
        verdicts: {
          terms: {
            field: 'verdict_type',  // 移除 .keyword，正確
            size: 50,
            order: { _count: 'desc' }
          }
        },
        // ===== 修正 #4: 移除對不存在欄位 reasoning_strengths 的聚合 =====
        // reasoning_strengths: {
        //   terms: {
        //     field: 'outcome_reasoning_strength',
        //     size: 10
        //   }
        // },
        // 新增：初始的判決理由選項
        win_reasons: {
          terms: {
            // ===== 修正 #5: 修正勝訴理由的聚合欄位 =====
            field: 'main_reasons_ai',
            size: 30,  // 顯示前 30 個最常見的
            order: { _count: 'desc' }
          }
        }
      }
    });

    const aggs = aggregationsResponse.aggregations;

    // 詳細記錄每個聚合的結果
    console.log('[Search Service] Aggregation results:');
    console.log('- case_types buckets:', aggs?.case_types?.buckets?.length || 0);
    console.log('- verdicts buckets:', aggs?.verdicts?.buckets?.length || 0);
    console.log('- court_names buckets:', aggs?.court_names?.buckets?.length || 0);

    // 🆕 獲取原始法院名稱列表
    const rawCourtNames = aggs?.court_names?.buckets.map(b => b.key) || [];

    // 🆕 生成結構化法院列表（按地區分組）
    const structuredCourts = getStructuredCourtList(rawCourtNames);

    console.log('[Search Service] Structured courts by region:');
    Object.entries(structuredCourts).forEach(([region, courts]) => {
      console.log(`  - ${region}: ${courts.length} courts`);
    });

    const filters = {
      caseTypes: aggs?.case_types?.buckets.map(b => b.key) || [],
      courtNames: rawCourtNames,  // 保留原始列表（向後兼容）
      courtNamesStructured: structuredCourts,  // 🆕 新增結構化列表
      verdicts: aggs?.verdicts?.buckets.map(b => b.key) || [],
      reasoningStrengths: [], // 返回空陣列，因為 mapping 中沒有這個欄位
      winReasons: aggs?.win_reasons?.buckets || []  // 新增
    };

    console.log('[Search Service] Filters data retrieved (courtNames count):', filters.courtNames.length);
    return filters;
  } catch (error) {
    console.error('[Search Service] Error getting available filters:', error.meta || error);

    // 如果有 ES 錯誤，打印更詳細的資訊
    if (error.meta?.body?.error) {
      console.error('[Search Service] ES Error details:', JSON.stringify(error.meta.body.error, null, 2));
    }

    const serviceError = new Error('Failed to retrieve filter options due to a database error.');
    serviceError.statusCode = error.statusCode || 500;
    serviceError.originalError = error.message;
    throw serviceError;
  }
}
