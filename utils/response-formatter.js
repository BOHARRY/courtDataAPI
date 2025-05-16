// utils/response-formatter.js

/**
 * 格式化來自 Elasticsearch 的搜尋回應。
 * @param {object} esResult - Elasticsearch client.search 返回的原始結果。
 * @param {number} pageSize - 用於計算總頁數的每頁大小。
 * @returns {object} 包含 total, hits, totalPages, aggregations 的格式化後物件。
 */
export function formatEsResponse(esResult, pageSize = 10) { // 給 pageSize 一個預設值
  if (!esResult || !esResult.hits) {
    console.warn("formatEsResponse: Invalid esResult object received.");
    return { total: 0, hits: [], totalPages: 0, aggregations: {} };
  }

  // console.log("===== Debug: Elasticsearch 搜尋結果 (in formatter) ====="); // 開發時調試用
  // console.log("總結果數:", esResult.hits.total?.value || 0); // 安全取值
  // console.log("返回結果數量:", esResult.hits.hits?.length || 0); // 安全取值

  const hits = (esResult.hits.hits || []).map((hit, index) => {
    const source = hit._source || {};
    const highlight = hit.highlight || {};
    const processedItem = {
      id: hit._id,
      score: hit._score, // 包含評分可能有用
      ...source,
      JFULL_highlights: [], // 確保始終有這些欄位
      summary_ai_highlight: null, // 確保始終有這些欄位
    };

    if (highlight.JFULL && Array.isArray(highlight.JFULL) && highlight.JFULL.length > 0) {
      processedItem.JFULL_highlights = highlight.JFULL;
      // if (index === 0) console.log(`處理結果 #${index}: 添加了 ${highlight.JFULL.length} 個 JFULL 高亮片段`);
    }

    if (highlight.summary_ai && Array.isArray(highlight.summary_ai) && highlight.summary_ai.length > 0) {
      processedItem.summary_ai_highlight = highlight.summary_ai[0]; // 通常摘要只取第一個高亮片段
      // if (index === 0) console.log(`處理結果 #${index}: 添加了摘要高亮`);
    }

    return processedItem;
  });

  // const resultsWithHighlights = hits.filter(hit => hit.JFULL_highlights && hit.JFULL_highlights.length > 0).length;
  // console.log(`處理完成 (formatter): ${resultsWithHighlights}/${hits.length} 個結果包含高亮片段`);

  const totalResults = typeof esResult.hits.total === 'number' ? esResult.hits.total : (esResult.hits.total?.value || 0);

  return {
    total: totalResults,
    hits: hits,
    totalPages: pageSize > 0 ? Math.ceil(totalResults / pageSize) : 1,
    // 安全地訪問聚合結果
    aggregations: {
      win_reasons: esResult.aggregations?.win_reasons?.buckets || []
      // 未來可以添加其他聚合結果
    }
  };
}