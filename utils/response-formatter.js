// utils/response-formatter.js (步驟一：新增 para_id)

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
      ...source, // 包含 JFULL, citable_paragraphs, CourtInsightsStart 等所有原始欄位
      
      // 添加高亮欄位
      JTITLE_highlighted: highlight['JTITLE']?.[0] || source.JTITLE,
      summary_ai_highlighted: highlight['summary_ai']?.[0] || source.summary_ai,
    };
    
    // ========== 核心修改點：為 JFULL_highlights 附加 para_id ==========
    
    const originalHighlights = highlight['JFULL'] || [];
    const citableParagraphs = source.citable_paragraphs || [];

    // 如果沒有可引用的段落，我們無法進行匹配，直接返回原始片段
    if (citableParagraphs.length === 0) {
        processedItem.JFULL_highlights = originalHighlights.map(fragment => ({
            fragment: fragment,
            para_id: null
        }));
    } else {
        processedItem.JFULL_highlights = originalHighlights.map(fragment => {
            // 為了匹配，我們需要一個沒有高亮標籤的純文字版本
            const cleanFragment = fragment.replace(/<em class='search-highlight'>/g, '').replace(/<\/em>/g, '');
            
            // 在 citable_paragraphs 陣列中尋找包含這個乾淨片段的段落
            // 我們使用 find 來找到第一個匹配的段落
            const sourceParagraph = citableParagraphs.find(p => 
                p.paragraph_text && p.paragraph_text.includes(cleanFragment)
            );
            
            // 返回新的物件結構，包含 fragment 和 para_id
            return {
                fragment: fragment,
                para_id: sourceParagraph ? sourceParagraph.para_id : null 
            };
        });
    }
    // =================================================================

    // 不再在這裡進行排序和計數，這些邏輯已經轉移到前端
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