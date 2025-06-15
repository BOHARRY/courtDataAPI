// utils/query-builder.js
import { CRIMINAL_KEYWORDS_TITLE, CIVIL_KEYWORDS_TITLE } from './constants.js';
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
  // 檢查是否為精確詞組 (被雙引號包圍)
  if (term.startsWith('"') && term.endsWith('"')) {
    const exactPhrase = term.slice(1, -1);
    // 對於精確詞組，我們使用 match_phrase
    return {
      bool: {
        should: [
          { match_phrase: { "JFULL.cjk": { query: exactPhrase, boost: 5.0 } } },
          { match_phrase: { "JTITLE.cjk": { query: exactPhrase, boost: 6.0 } } },
          { match_phrase: { "summary_ai.cjk": { query: exactPhrase, boost: 4.0 } } },
          { match_phrase: { "main_reasons_ai": { query: exactPhrase, boost: 3.0 } } },
          { match_phrase: { "tags": { query: exactPhrase, boost: 2.0 } } }
        ],
        minimum_should_match: 1
      }
    };
  } else {
    // 對於單一關鍵字，使用 match_phrase 以確保「漏水」被視為一個整體
    // 這解決了您的第一個需求：從模糊搜索改為精準搜索
    return {
      bool: {
        should: [
          { match_phrase: { "JFULL.cjk": { query: term, boost: 3.0 } } },
          { match_phrase: { "JTITLE.cjk": { query: term, boost: 4.0 } } },
          { match_phrase: { "summary_ai.cjk": { query: term, boost: 2.0 } } },
          { match_phrase: { "main_reasons_ai": { query: term, boost: 2.0 } } },
          { match_phrase: { "tags": { query: term, boost: 1.5 } } },
          { term: { "lawyers.exact": { value: term, boost: 8.0 } } },
          { term: { "judges.exact": { value: term, boost: 8.0 } } },
        ],
        minimum_should_match: 1
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
    reasoningStrength,
    complexity,
    winReasons,
    onlyWithFullText,
    includeCitedCases,
    onlyRecent3Years
  } = filters;

  const must = [];
  const filter = [];

  // ==================== 關鍵字查詢重構 ====================
  if (query) {
    const { mustClauses, shouldClauses } = parseQueryString(query);

    if (mustClauses.length > 0) {
      // 對於 AND 邏輯，所有子查詢都放入 must 陣列
      must.push(...mustClauses);
    }

    if (shouldClauses.length > 0) {
      // 對於 OR 邏輯，將所有子查詢放入一個 bool.should 塊中
      must.push({
        bool: {
          should: shouldClauses,
          minimum_should_match: 1 // 至少匹配一個
        }
      });
    }
  }
  // =======================================================


  // 案件類型篩選 - (使用您上一輪的修正)
  if (caseTypes) {
    const typesArray = Array.isArray(caseTypes) ? caseTypes : caseTypes.split(',');
    if (typesArray.length > 0) {
      filter.push({
        terms: {
          'case_type': typesArray
        }
      });
    }
  }

  // 判決結果篩選 - (使用您上一輪的修正)
  if (verdict && verdict !== '不指定') {
    filter.push({
      term: {
        'verdict_type': verdict
      }
    });
  }

  // 法條篩選 - (使用您上一輪的修正)
  if (laws) {
    const lawsArray = Array.isArray(laws) ? laws : laws.split(',');
    if (lawsArray.length > 0) {
      filter.push({
        terms: { 'legal_basis': lawsArray.map(l => l.trim()).filter(Boolean) }
      });
    }
  }

  // 法院篩選
  if (courtLevels) {
    const courtsArray = Array.isArray(courtLevels) ? courtLevels : courtLevels.split(',');
    if (courtsArray.length > 0) {
      filter.push({
        terms: {
          'court.exact': courtsArray
        }
      });
    }
  }

  // 金額範圍篩選
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
      filter.push({
        nested: {
          path: "lawyerperformance",
          query: {
            range: { "lawyerperformance.claim_amount": rangeQuery }
          }
        }
      });
    }
  }

  // 判決理由強度篩選 - (使用您上一輪的修正)
  if (reasoningStrength && reasoningStrength !== '不指定') {
    filter.push({ term: { 'outcome_reasoning_strength': reasoningStrength } });
  }

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

  // 勝訴理由篩選 - (使用您上一輪的修正)
  if (winReasons) {
    const reasonsArray = Array.isArray(winReasons) ? winReasons : winReasons.split(',');
    if (reasonsArray.length > 0) {
      filter.push({
        terms: {
          'main_reasons_ai.tags': reasonsArray.map(r => r.trim()).filter(r => r)
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
          { range: { 'citations_count': { gte: 1 } } }
        ],
        minimum_should_match: 1
      }
    });
  }
  if (onlyRecent3Years === 'true' || onlyRecent3Years === true) {
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
    const dateStr = `${threeYearsAgo.getFullYear()}${String(threeYearsAgo.getMonth() + 1).padStart(2, '0')}${String(threeYearsAgo.getDate()).padStart(2, '0')}`;
    filter.push({ range: { 'JDATE': { gte: dateStr } } });
  }

  // 構建最終查詢
  const esQueryBody = { bool: {} };
  if (must.length > 0) esQueryBody.bool.must = must;
  if (filter.length > 0) esQueryBody.bool.filter = filter;

  if (must.length === 0 && filter.length === 0) {
    return { match_all: {} };
  }

  return esQueryBody;
}