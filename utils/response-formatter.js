// utils/response-formatter.js

/**
 * 格式化來自 Elasticsearch 的搜尋回應。
 * @param {object} esResult - Elasticsearch client.search 返回的原始結果。
 * @param {number} pageSize - 用於計算總頁數的每頁大小。
 * @returns {object} 包含 total, hits, totalPages, aggregations 的格式化後物件。
 */
export function formatEsResponse(esResult, pageSize = 10) {
  if (!esResult || !esResult.hits) {
    console.warn("formatEsResponse: 無效的 esResult 物件。");
    return { total: 0, hits: [], totalPages: 0, aggregations: {} };
  }

  const hits = (esResult.hits.hits || []).map(hit => {
    const source = hit._source || {};
    const highlight = hit.highlight || {};
    
    // 建立一個包含原始資料的物件
    const processedItem = {
      id: hit._id,
      score: hit._score,
      ...source,
    };

    // ========== 核心修正：正確解析高亮欄位 ==========
    // 我們在 search.js 中請求的是 JFULL.cjk, JTITLE.cjk, summary_ai.cjk 的高亮
    
    // 處理 JFULL 的高亮匹配段落
    if (highlight['JFULL.cjk'] && Array.isArray(highlight['JFULL.cjk'])) {
      processedItem.JFULL_highlights = highlight['JFULL.cjk'];
    } else {
      processedItem.JFULL_highlights = []; // 確保此欄位永遠存在
    }

    // 處理 JTITLE 的高亮標題
    if (highlight['JTITLE.cjk'] && Array.isArray(highlight['JTITLE.cjk'])) {
      processedItem.JTITLE_highlighted = highlight['JTITLE.cjk'][0];
    }

    // 處理 summary_ai 的高亮摘要
    if (highlight['summary_ai.cjk'] && Array.isArray(highlight['summary_ai.cjk'])) {
      processedItem.summary_ai_highlighted = highlight['summary_ai.cjk'][0];
    }
    // ===============================================

    return processedItem;
  });

  const totalResults = typeof esResult.hits.total === 'number' 
    ? esResult.hits.total 
    : (esResult.hits.total?.value || 0);

  return {
    total: totalResults,
    hits: hits,
    totalPages: pageSize > 0 ? Math.ceil(totalResults / pageSize) : 1,
    aggregations: {
      win_reasons: esResult.aggregations?.win_reasons?.buckets || []
    }
  };
}