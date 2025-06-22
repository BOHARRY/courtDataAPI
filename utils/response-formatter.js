// utils/response-formatter.js (修正後的完整版本)

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

    // ========== 核心修正：使用新的高亮鍵名（不含 .cjk） ==========
    
    // 處理 JFULL 的高亮匹配段落
    // ES回傳的是一個字串陣列，直接賦值
    processedItem.JFULL_highlights = highlight['JFULL'] || [];

    // 處理 JTITLE 的高亮標題
    // 如果有高亮，則使用高亮版本；否則，回退到原始 source 的標題
    processedItem.JTITLE_highlighted = highlight['JTITLE']?.[0] || source.JTITLE;

    // 處理 summary_ai 的高亮摘要
    // 如果有高亮，則使用高亮版本；否則，回退到原始 source 的摘要
    processedItem.summary_ai_highlighted = highlight['summary_ai']?.[0] || source.summary_ai;
    // ===============================================================

    return processedItem;
  });

  const totalResults = typeof esResult.hits.total === 'number' 
    ? esResult.hits.total 
    : (esResult.hits.total?.value || 0);

  // 同時也將後端回傳的所有聚合結果都傳給前端
  const allAggregations = esResult.aggregations || {};

  return {
    total: totalResults,
    hits: hits,
    totalPages: pageSize > 0 ? Math.ceil(totalResults / pageSize) : 1,
    aggregations: allAggregations // 將所有聚合結果傳遞下去
  };
}