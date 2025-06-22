// utils/response-formatter.js (新增 CourtInsight 判斷邏輯的完整版本)

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

    // --- 舊有高亮處理 ---
    processedItem.JTITLE_highlighted = highlight['JTITLE']?.[0] || source.JTITLE;
    processedItem.summary_ai_highlighted = highlight['summary_ai']?.[0] || source.summary_ai;
    
    // ========== 新增 CourtInsight 判斷邏輯 ==========

    const jfullText = source.JFULL || '';
    const courtInsightsStartTag = source.CourtInsightsStart;
    const courtInsightsEndTag = source.CourtInsightsEND;
    
    let insightStartIndex = -1;
    let insightEndIndex = -1;

    // 1. 獲取「法院見解」區間的索引位置
    if (jfullText && courtInsightsStartTag && courtInsightsEndTag) {
      insightStartIndex = jfullText.indexOf(courtInsightsStartTag);
      insightEndIndex = jfullText.indexOf(courtInsightsEndTag, insightStartIndex);
    }
    
    // 2. 處理 JFULL 的高亮匹配段落，並增加 in_court_insight 標記
    const originalHighlights = highlight['JFULL'] || [];
    processedItem.JFULL_highlights = originalHighlights.map(fragment => {
      let in_court_insight = false;
      
      // 只有在區間有效時才進行判斷
      if (insightStartIndex !== -1 && insightEndIndex !== -1) {
        // 為了定位，我們需要一個相對乾淨的文本片段
        // 移除高亮標籤，並取前後一些字符以提高定位準確性
        const cleanFragment = fragment.replace(/<em class='search-highlight'>/g, '').replace(/<\/em>/g, '');
        
        try {
          // 在全文中尋找這個乾淨片段的位置
          const fragmentIndex = jfullText.indexOf(cleanFragment);
        
          // 如果找到了片段，並且它的位置在「法院見解」區間內
          if (fragmentIndex !== -1 && fragmentIndex >= insightStartIndex && fragmentIndex <= insightEndIndex) {
            in_court_insight = true;
          }
        } catch (e) {
            // 在極端情況下，如果 cleanFragment 過於復雜導致 indexOf 出錯，則忽略
            console.warn("Error locating fragment:", e);
        }
      }
      
      // 3. 回傳新的物件結構
      return {
        fragment: fragment,
        in_court_insight: in_court_insight,
      };
    });
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