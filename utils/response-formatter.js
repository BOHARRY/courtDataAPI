// utils/response-formatter.js (最終安全強化版)

const MAX_TAG_LENGTH = 200; // 安全限制：標記文本的最大長度

/**
 * 將普通字串轉換為可以匹配內部任意空白的正則表達式字串。
 * @param {string} text - 原始文字。
 * @returns {RegExp|null} - 一個正則表達式物件，如果文本無效或過長則返回 null。
 */
function createSpacedRegex(text) {
  // 安全性檢查：確保 text 是有效且長度合理的字串
  if (!text || typeof text !== 'string' || text.length > MAX_TAG_LENGTH) {
    return null;
  }
  
  // 1. 轉義文本中的特殊正則字符，防止注入
  const escapedText = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 2. 在每個字符之間插入 \\s*
  const spacedPattern = escapedText.split('').join('\\s*');
  
  return new RegExp(spacedPattern, 'i'); // 'i' 表示不區分大小寫
}


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
    
    // ========== CourtInsight 邏輯 - 安全強化版 ==========

    const jfullText = source.JFULL || '';
    const courtInsightsStartTag = source.CourtInsightsStart;
    const courtInsightsEndTag = source.CourtInsightsEND;
    
    let insightStartIndex = -1;
    let insightEndIndex = -1;

    // 1. 使用正則表達式來查找標記位置 (已加入安全檢查)
    if (jfullText && courtInsightsStartTag && courtInsightsEndTag) {
      const startRegex = createSpacedRegex(courtInsightsStartTag);
      const endRegex = createSpacedRegex(courtInsightsEndTag);
      
      if (startRegex) {
        try {
            const startMatch = jfullText.match(startRegex);
            if (startMatch) {
              insightStartIndex = startMatch.index;
              const searchFromIndex = insightStartIndex + startMatch[0].length;

              if (endRegex) {
                 const endMatch = jfullText.substring(searchFromIndex).match(endRegex);
                 if (endMatch) {
                    insightEndIndex = searchFromIndex + endMatch.index;
                 }
              }
            }
        } catch(e) {
            console.error(`[Formatter] Regex match failed for JID: ${hit._id}. Error:`, e);
        }
      }
    }
    
    const originalHighlights = highlight['JFULL'] || [];
    let highlightsWithInfo = originalHighlights.map(fragment => {
      let in_court_insight = false;
      
      if (insightStartIndex !== -1 && insightEndIndex !== -1) {
        const cleanFragment = fragment.replace(/<em class='search-highlight'>/g, '').replace(/<\/em>/g, '');
        try {
          // 定位片段。indexOf 性能好，但在極端情況下（短片段重複）可能不準。
          // 對於判決書高亮上下文，此風險通常很低。
          const fragmentIndex = jfullText.indexOf(cleanFragment);
          if (fragmentIndex !== -1 && fragmentIndex >= insightStartIndex && fragmentIndex < insightEndIndex) {
            in_court_insight = true;
          }
        } catch (e) {
          console.warn(`[Formatter] Error locating fragment for JID: ${hit._id}. Fragment: ${cleanFragment.substring(0,50)}... Error:`, e);
        }
      }
      
      return {
        fragment: fragment,
        in_court_insight: in_court_insight,
      };
    });

    highlightsWithInfo.sort((a, b) => b.in_court_insight - a.in_court_insight);
    processedItem.JFULL_highlights = highlightsWithInfo;

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