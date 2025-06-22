// utils/response-formatter.js (最終版 - 使用索引映射處理髒數據)

/**
 * 創建一個從“乾淨”文本（無空白）索引到原始文本索引的映射。
 * @param {string} originalText - 帶有空白符的原始文本。
 * @returns {number[]} 一個陣列，其索引是乾淨文本的索引，值是原始文本的對應索引。
 */
function createCleanToOriginalIndexMap(originalText) {
    const map = [];
    const whitespaceRegex = /\s/;
    for (let i = 0; i < originalText.length; i++) {
        if (!whitespaceRegex.test(originalText[i])) {
            map.push(i);
        }
    }
    return map;
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
    
    // ========== CourtInsight 邏輯 - 使用索引映射法 ==========

    const jfullText = source.JFULL || '';
    const courtInsightsStartTag = source.CourtInsightsStart || '';
    const courtInsightsEndTag = source.CourtInsightsEND || '';
    
    let insightStartIndex = -1;
    let insightEndIndex = -1;

    if (jfullText && courtInsightsStartTag && courtInsightsEndTag) {
        try {
            // 1. 創建一個 JFULL 的乾淨版本（移除所有空白符）
            const cleanJfullText = jfullText.replace(/\s/g, '');
            
            // 2. 創建從乾淨索引到原始索引的映射
            const indexMap = createCleanToOriginalIndexMap(jfullText);

            // 3. 在乾淨的文本中定位標記
            const cleanStartIndex = cleanJfullText.indexOf(courtInsightsStartTag);
            
            if (cleanStartIndex !== -1) {
                // 4. 使用映射表將乾淨索引轉換回原始索引
                insightStartIndex = indexMap[cleanStartIndex];

                // 從起始標記之後開始尋找結束標記
                const cleanEndIndex = cleanJfullText.indexOf(courtInsightsEndTag, cleanStartIndex + courtInsightsStartTag.length);

                if (cleanEndIndex !== -1) {
                    insightEndIndex = indexMap[cleanEndIndex];
                }
            }
        } catch (e) {
            console.error(`[Formatter] Index mapping failed for JID: ${hit._id}. Error:`, e);
        }
    }
    
    const originalHighlights = highlight['JFULL'] || [];
    let highlightsWithInfo = originalHighlights.map(fragment => {
      let in_court_insight = false;
      
      if (insightStartIndex !== -1 && insightEndIndex !== -1) {
        const cleanFragment = fragment.replace(/<em class='search-highlight'>/g, '').replace(/<\/em>/g, '');
        try {
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