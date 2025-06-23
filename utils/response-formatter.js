// utils/response-formatter.js (最終、最簡潔穩健版)

/**
 * 格式化來自 Elasticsearch 的搜尋回應。
 * 這個版本只做最基礎的數據合併，將所有複雜邏輯交給前端處理。
 * @param {object} esResult - Elasticsearch client.search 返回的原始結果。
 * @param {number} pageSize - 用於計算總頁數的每頁大小。
 * @returns {object} 包含 total, hits, totalPages, aggregations 的格式化後物件。
 */
export function formatEsResponse(esResult, pageSize = 10) {
  // 防禦性檢查，確保 esResult 和其內部結構存在
  if (!esResult || !esResult.hits) {
    console.warn("[Formatter] 無效的 esResult 物件，返回空結構。");
    return { total: 0, hits: [], totalPages: 0, aggregations: {} };
  }

  const hits = (esResult.hits.hits || []).map(hit => {
    const source = hit._source || {};
    const highlight = hit.highlight || {};
    
    // 建立一個包含所有原始資料的物件
    // 這樣前端就能獲取到 JFULL, citable_paragraphs, CourtInsightsStart 等所有需要的欄位
    const processedItem = {
      id: hit._id,
      score: hit._score,
      ...source,
    };

    // 處理 JTITLE 的高亮標題
    // 如果有高亮，則使用高亮版本；否則，回退到原始 source 的標題
    processedItem.JTITLE_highlighted = highlight['JTITLE']?.[0] || source.JTITLE;

    // 處理 summary_ai 的高亮摘要
    processedItem.summary_ai_highlighted = highlight['summary_ai']?.[0] || source.summary_ai;

    // 處理 JFULL 的高亮匹配段落
    // 直接返回從 ES 獲取的、未經處理的字串陣列
    processedItem.JFULL_highlights = highlight['JFULL'] || [];

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
    aggregations: allAggregations,
  };
}