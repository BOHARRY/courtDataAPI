// utils/query-builder.js (完整修正版)

/**
 * 解析查詢字串，生成對應的查詢子句陣列。
 * @param {string} query - 原始查詢字串。
 * @returns {{mustClauses: object[], shouldClauses: object[]}} - 解析後的 must 和 should 子句。
 */
function parseQueryString(query) {
  const mustClauses = [];
  const shouldClauses = [];

  // 1. 檢測 OR 邏輯
  const orRegex = /\s*(\|\||OR)\s*/i; // 匹配 || 或 OR (不分大小寫)
  if (orRegex.test(query)) {
    const terms = query.split(orRegex).filter(t => t && !orRegex.test(t));
    terms.forEach(term => {
      shouldClauses.push(buildSubQuery(term.trim()));
    });
    return { mustClauses, shouldClauses };
  }

  // 2. 檢測 AND 邏輯 (預設)
  const andRegex = /\s*(\+|&| )\s*/; // 匹配 +, &, 或空格
  const terms = query.split(andRegex).filter(t => t && !andRegex.test(t));
  terms.forEach(term => {
    mustClauses.push(buildSubQuery(term.trim()));
  });

  return { mustClauses, shouldClauses };
}

/**
 * 為單一關鍵詞或詞組構建 ES 查詢子句。
 * @param {string} term - 單一查詢詞，例如 "漏水" 或 ""不當得利""。
 * @returns {object} - 一個 bool query 物件。
 */
function buildSubQuery(term) {
  // ===== 核心修正 #1: 更新所有查詢欄位名稱，移除 .cjk 後綴，並修正 tags 欄位 =====
  if (term.startsWith('"') && term.endsWith('"')) {
    const exactPhrase = term.slice(1, -1);
    // 對於精確詞組，我們使用 match_phrase
    return {
      bool: {
        should: [
          { match_phrase: { "JFULL": { query: exactPhrase, boost: 5.0 } } },
          { match_phrase: { "JTITLE": { query: exactPhrase, boost: 6.0 } } },
          { match_phrase: { "summary_ai": { query: exactPhrase, boost: 4.0 } } },
          { match_phrase: { "main_reasons_ai": { query: exactPhrase, boost: 3.0 } } }, // main_reasons_ai 是 keyword，match_phrase 也能用
          { match_phrase: { "tags": { query: exactPhrase, boost: 2.0 } } } // tags 是 keyword
        ],
        minimum_should_match: 1
      }
    };
  } else {
    // 對於單一關鍵字，使用 multi_match 進行跨多個欄位的查詢
    // 這樣更簡潔，且能更好地處理不同分析器
    return {
        multi_match: {
            query: term,
            fields: [
                "JFULL^3",          // 全文，權重 3
                "JTITLE^4",         // 標題，權重 4
                "summary_ai^2",     // AI摘要，權重 2
                "main_reasons_ai^2",// AI判決理由，權重 2
                "tags^1.5",         // 標籤，權重 1.5
                "lawyers.exact^8",  // 律師 (精確)，權重 8
                "judges.exact^8"    // 法官 (精確)，權重 8
            ],
            type: "best_fields" // 採用分數最高的欄位的得分
        }
    };
  }
}


/**
 * 根據提供的篩選條件構建 Elasticsearch 查詢 DSL 的 query 部分。
 * @param {object} filters - 從請求查詢參數中獲取的篩選條件對象。
 * @returns {object} Elasticsearch 查詢的 bool query 部分。
 */
export function buildEsQuery(filters = {}) {
  const {
    query,
    caseTypes,
    verdict,
    laws,
    courtLevels,
    minAmount,
    maxAmount,
    // reasoningStrength, // mapping 中無此欄位，暫時移除
    complexity,
    winReasons,
    onlyWithFullText,
    includeCitedCases,
    onlyRecent3Years
  } = filters;

  let must = [];
  const filter = [];
  let should = [];

  // ==================== 關鍵字查詢重構 ====================
  if (query) {
    const { mustClauses, shouldClauses } = parseQueryString(query);

    if (mustClauses.length > 0) {
      must.push(...mustClauses);
    }
    
    if (shouldClauses.length > 0) {
      // 對於 OR 邏輯，直接將它們放入最外層的 should 陣列
      should.push(...shouldClauses);
    }
  }
  // =======================================================

  // 案件類型篩選
  if (caseTypes) {
    const typesArray = Array.isArray(caseTypes) ? caseTypes : caseTypes.split(',');
    if (typesArray.length > 0) {
      filter.push({ terms: { 'case_type': typesArray } });
    }
  }

  // 判決結果篩選
  if (verdict && verdict !== '不指定') {
    filter.push({ term: { 'verdict_type': verdict } });
  }

  // 法條篩選
  if (laws) {
    const lawsArray = Array.isArray(laws) ? laws : laws.split(',');
    if (lawsArray.length > 0) {
      filter.push({ terms: { 'legal_basis': lawsArray.map(l => l.trim()).filter(Boolean) } });
    }
  }

  // 法院篩選
  if (courtLevels) {
    const courtsArray = Array.isArray(courtLevels) ? courtLevels : courtLevels.split(',');
    if (courtsArray.length > 0) {
      filter.push({ terms: { 'court.exact': courtsArray } });
    }
  }

  // ===== 核心修正 #2: 金額範圍篩選 =====
  if (minAmount || maxAmount) {
    const rangeQuery = {};
    if (minAmount !== undefined && minAmount !== null && minAmount !== '') {
      const parsedMin = parseInt(minAmount, 10);
      if (!isNaN(parsedMin)) rangeQuery.gte = parsedMin;
    }
    if (maxAmount !== undefined && maxAmount !== null && maxAmount !== '') {
      const parsedMax = parseInt(maxAmount, 10);
      if (!isNaN(parsedMax)) rangeQuery.lte = parsedMax;
    }

    if (Object.keys(rangeQuery).length > 0) {
      // 根據 mapping，金額在 key_metrics.civil_metrics.claim_amount
      filter.push({
        range: { "key_metrics.civil_metrics.claim_amount": rangeQuery }
      });
    }
  }

  // 判決理由強度篩選 (已移除，因 mapping 不存在)
  // if (reasoningStrength && reasoningStrength !== '不指定') {
  //   filter.push({ term: { 'outcome_reasoning_strength': reasoningStrength } });
  // }

  // 案件複雜度篩選
  if (complexity && complexity !== '不指定') {
    let minScore, maxScore;
    if (complexity.includes('簡單')) { minScore = 1; maxScore = 2; }
    else if (complexity.includes('普通')) { minScore = 3; maxScore = 5; }
    else if (complexity.includes('複雜')) { minScore = 6; maxScore = 9; }

    if (minScore !== undefined && maxScore !== undefined) {
      filter.push({ range: { 'SCORE': { gte: minScore, lte: maxScore } } });
    }
  }

  // ===== 核心修正 #3: 勝訴理由篩選 =====
  if (winReasons) {
    const reasonsArray = Array.isArray(winReasons) ? winReasons : winReasons.split(',');
    if (reasonsArray.length > 0) {
      filter.push({
        terms: {
          'main_reasons_ai': reasonsArray.map(r => r.trim()).filter(r => r) // 移除 .tags
        }
      });
    }
  }

  // 進階篩選
  if (onlyWithFullText === 'true' || onlyWithFullText === true) {
    filter.push({ exists: { field: 'JFULL' } });
  }
  if (includeCitedCases === 'true' || includeCitedCases === true) {
    filter.push({
      bool: {
        should: [
          { exists: { field: 'citations' } },
          // mapping 中沒有 citations_count，可移除或確認欄位名
          // { range: { 'citations_count': { gte: 1 } } }
        ],
        minimum_should_match: 1
      }
    });
  }
  if (onlyRecent3Years === 'true' || onlyRecent3Years === true) {
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
    // 確保日期格式為 yyyy-MM-dd，以匹配 ES date 類型
    const dateStr = threeYearsAgo.toISOString().split('T')[0]; 
    filter.push({ range: { 'JDATE': { gte: dateStr } } });
  }

  // 構建最終查詢
  const esQueryBody = { bool: {} };
  
  // 處理 AND (must) 和 OR (should) 邏輯
  if (must.length > 0) esQueryBody.bool.must = must;
  if (should.length > 0) {
    esQueryBody.bool.should = should;
    // 如果有 should 子句，通常需要設定 minimum_should_match
    // 但如果同時有 must 或 filter，則不需要，因為它們已經限制了範圍
    // 僅在只有 should 的情況下，才需要它來強制匹配
    if (must.length === 0 && filter.length === 0) {
      esQueryBody.bool.minimum_should_match = 1;
    }
  }

  if (filter.length > 0) esQueryBody.bool.filter = filter;

  if (must.length === 0 && should.length === 0 && filter.length === 0) {
    return { match_all: {} };
  }
  
  return esQueryBody;
}