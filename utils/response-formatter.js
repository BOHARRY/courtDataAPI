// utils/response-formatter.js (新思路：簡化版，只提供原材料)

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

    // 我們的目標是將所有需要的原始數據和高亮數據都傳給前端
    const processedItem = {
      id: hit._id,
      score: hit._score,
      ...source, // 包含 JFULL, CourtInsightsStart, CourtInsightsEND 等所有原始欄位
      
      // 添加高亮欄位
      JTITLE_highlighted: highlight['JTITLE']?.[0] || source.JTITLE,
      summary_ai_highlighted: highlight['summary_ai']?.[0] || source.summary_ai,
      
      // JFULL_highlights 恢復為簡單的字串陣列
      JFULL_highlights: highlight['JFULL'] || [], 
    };
    
    // 不再進行排序和計數，這些交給前端處理
    return processedItem;
  });

  const totalResults = typeof esResult.hits.total === 'number' 
    ? esResult.hits.total 
    : (esResult.hits.total?.value || 0);

  const allAggregations = esResult.aggregations || {};

  return {
    total: totalResults,
    hits: hits,
    totalPages: pageSize > 0 ? Math.ceil(totalResults / pageSize) : 1,
    aggregations: allAggregations
  };
}