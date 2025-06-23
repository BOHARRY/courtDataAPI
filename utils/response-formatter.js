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
      ...source,
      JTITLE_highlighted: highlight['JTITLE']?.[0] || source.JTITLE,
      summary_ai_highlighted: highlight['summary_ai']?.[0] || source.summary_ai,
    };
    
    // ========== 核心修改點：更穩健的 para_id 匹配邏輯 ==========
    
    const originalHighlights = highlight['JFULL'] || [];
    const citableParagraphs = source.citable_paragraphs || [];

    if (citableParagraphs.length === 0) {
        processedItem.JFULL_highlights = originalHighlights.map(fragment => ({
            fragment: fragment,
            para_id: null
        }));
    } else {
        processedItem.JFULL_highlights = originalHighlights.map(fragment => {
            // 1. 從高亮片段中提取出真正的關鍵詞
            const match = fragment.match(/<em class='search-highlight'>(.*?)<\/em>/);
            const keyword = match ? match[1] : null;

            let sourceParaId = null;

            // 2. 如果能提取出關鍵詞，就用關鍵詞去尋找來源段落
            if (keyword) {
                const sourceParagraph = citableParagraphs.find(p => 
                    p.paragraph_text && p.paragraph_text.includes(keyword)
                );
                if (sourceParagraph) {
                    sourceParaId = sourceParagraph.para_id;
                }
            }
            
            // 3. 如果用關鍵詞找不到（極端情況），再用舊的、較不穩定的方法做一次備用查找
            if (!sourceParaId) {
                const cleanFragment = fragment.replace(/<em class='search-highlight'>/g, '').replace(/<\/em>/g, '');
                const fallbackParagraph = citableParagraphs.find(p => 
                    p.paragraph_text && p.paragraph_text.includes(cleanFragment)
                );
                if (fallbackParagraph) {
                    sourceParaId = fallbackParagraph.para_id;
                }
            }
            
            return {
                fragment: fragment,
                para_id: sourceParaId // 返回找到的 ID，找不到則為 null
            };
        });
    }
    // =================================================================

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