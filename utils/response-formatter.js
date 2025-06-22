// utils/response-formatter.js (新增排序與計數功能的完整版本)

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

    const processedItem = {
      id: hit._id,
      score: hit._score,
      ...source,
    };

    processedItem.JTITLE_highlighted = highlight['JTITLE']?.[0] || source.JTITLE;
    processedItem.summary_ai_highlighted = highlight['summary_ai']?.[0] || source.summary_ai;
    
    // ========== CourtInsight 邏輯增強：排序與計數 ==========

    const jfullText = source.JFULL || '';
    const courtInsightsStartTag = source.CourtInsightsStart;
    const courtInsightsEndTag = source.CourtInsightsEND;
    
    let insightStartIndex = -1;
    let insightEndIndex = -1;

    if (jfullText && courtInsightsStartTag && courtInsightsEndTag) {
      insightStartIndex = jfullText.indexOf(courtInsightsStartTag);
      insightEndIndex = jfullText.indexOf(courtInsightsEndTag, insightStartIndex);
    }
    
    const originalHighlights = highlight['JFULL'] || [];
    let highlightsWithInfo = originalHighlights.map(fragment => {
      let in_court_insight = false;
      
      if (insightStartIndex !== -1 && insightEndIndex !== -1) {
        const cleanFragment = fragment.replace(/<em class='search-highlight'>/g, '').replace(/<\/em>/g, '');
        try {
          const fragmentIndex = jfullText.indexOf(cleanFragment);
          if (fragmentIndex !== -1 && fragmentIndex >= insightStartIndex && fragmentIndex <= insightEndIndex) {
            in_court_insight = true;
          }
        } catch (e) {
          console.warn("Error locating fragment:", e);
        }
      }
      
      return {
        fragment: fragment,
        in_court_insight: in_court_insight,
      };
    });

    // 1. 進行排序：將 in_court_insight 為 true 的項目排在前面
    highlightsWithInfo.sort((a, b) => b.in_court_insight - a.in_court_insight);
    processedItem.JFULL_highlights = highlightsWithInfo;

    // 2. 進行計數，並將結果附加到 processedItem 上
    const totalFragments = highlightsWithInfo.length;
    const insightFragmentsCount = highlightsWithInfo.filter(h => h.in_court_insight).length;
    processedItem.JFULL_highlights_summary = {
      total: totalFragments,
      in_insight: insightFragmentsCount,
    };
    // ======================================================

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