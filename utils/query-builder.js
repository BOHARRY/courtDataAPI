// utils/query-builder.js
import { CRIMINAL_KEYWORDS_TITLE, CIVIL_KEYWORDS_TITLE } from './constants.js';

/**
 * 根據提供的篩選條件構建 Elasticsearch 查詢 DSL 的 query 部分。
 * @param {object} filters - 從請求查詢參數中獲取的篩選條件對象。
 * @returns {object} Elasticsearch 查詢的 bool query 部分。
 */
export function buildEsQuery(filters = {}) { // 給予預設值以防 filters 未定義
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
  const filter = []; // 注意：ES 中的 filter context 不計算評分，適合精確匹配

  if (query) {
    if (query.startsWith('"') && query.endsWith('"')) {
      const exactPhrase = query.slice(1, -1);
      // console.log("精確匹配查詢:", exactPhrase); // 開發時調試用
      must.push({
        bool: {
          should: [
            { match_phrase: { "JFULL": { query: exactPhrase, boost: 5.0 } } },
            { match_phrase: { "summary_ai": { query: exactPhrase, boost: 4.0 } } },
            { match_phrase: { "lawyers": { query: exactPhrase, boost: 8.0 } } },
            { match_phrase: { "judges": { query: exactPhrase, boost: 8.0 } } },
            { match_phrase: { "plaintiff": { query: exactPhrase, boost: 3.0 } } },
            { match_phrase: { "defendant": { query: exactPhrase, boost: 3.0 } } }
          ],
          minimum_should_match: 1
        }
      });
    } else {
      must.push({
        multi_match: {
          query,
          fields: [
            'JFULL^3',
            'summary_ai^2',
            'main_reasons_ai^2',
            'JTITLE',
            'tags',
            'lawyers^4',
            'lawyers.raw^8',
            'winlawyers^4', // 注意: winlawyers 的準確性可能不高
            'judges^4',
            'judges.raw^8'
          ],
          type: 'best_fields', // 'cross_fields' 或 'phrase' 可能在某些情況下更好
          operator: 'and'    // 'and' 表示所有詞項都需匹配 (在其中一個欄位)
        }
      });
    }
  }

  if (caseTypes) {
    const typesArray = Array.isArray(caseTypes) ? caseTypes : caseTypes.split(',');
    if (typesArray.length > 0) {
      filter.push({ terms: { 'case_type.keyword': typesArray } }); // 建議使用 .keyword 精確匹配
    }
  }

  if (verdict && verdict !== '不指定') {
    filter.push({ term: { 'verdict.keyword': verdict } }); // 建議使用 .keyword
  }

  if (laws) {
    const lawsArray = Array.isArray(laws) ? laws : laws.split(',');
    lawsArray.forEach(law => {
      if (law.trim()) { // 避免空字串
        must.push({ match: { 'legal_basis': law.trim() } }); // legal_basis 通常是 text 類型
      }
    });
  }

  if (courtLevels) {
    const levels = Array.isArray(courtLevels) ? courtLevels : courtLevels.split(',');
    const courtShouldClauses = [];
    levels.forEach(level => {
      if (level.trim()) {
        // 這裡的匹配邏輯可以根據您的 ES mapping 調整
        // 如果 court 欄位是 text 且分詞，match_phrase 可能適用
        // 如果是 keyword，則應該用 term 或 terms
        if (level === '地方法院') {
          courtShouldClauses.push({ match_phrase: { court: '簡易' } });
          courtShouldClauses.push({ match_phrase: { court: '地方法' } });
        } else if (level === '高等法院') {
          courtShouldClauses.push({ match_phrase: { court: '高等' } });
        } else if (level === '最高法院') {
          courtShouldClauses.push({ match_phrase: { court: '最高' } });
        } else if (level === '智慧財產及商業法院') {
          courtShouldClauses.push({ match_phrase: { court: '智慧財產' } });
          // 如果有"商業法庭"，也可能需要加入
        }
        // 可以考慮用 terms query 匹配 'court.keyword' 如果有該欄位
      }
    });
    if (courtShouldClauses.length > 0) {
      filter.push({ bool: { should: courtShouldClauses, minimum_should_match: 1 } });
    }
  }

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
      filter.push({ range: { 'compensation_claimed': rangeQuery } }); // 假設欄位名
    }
  }

  if (reasoningStrength && reasoningStrength !== '不指定') {
    filter.push({ term: { 'outcome_reasoning_strength.keyword': reasoningStrength } }); // 假設有 .keyword
  }

  if (complexity && complexity !== '不指定') {
    let minScore, maxScore;
    if (complexity.includes('簡單')) { minScore = 1; maxScore = 3; } // 調整範圍
    else if (complexity.includes('普通')) { minScore = 4; maxScore = 6; }
    else if (complexity.includes('複雜')) { minScore = 7; maxScore = 9; } // 假設 SCORE 範圍是 1-9

    if (minScore !== undefined && maxScore !== undefined) {
      filter.push({ range: { 'SCORE': { gte: minScore, lte: maxScore } } });
    }
  }

  if (winReasons) {
    const reasonsArray = Array.isArray(winReasons) ? winReasons : winReasons.split(',');
    if (reasonsArray.length > 0) {
      // main_reasons_ai 可能是 text 類型，用 match
      // 如果是 tags 類型（keyword array），用 terms
      must.push({ terms: { 'main_reasons_ai.keyword': reasonsArray.map(r => r.trim()).filter(r => r) } });
    }
  }

  if (onlyWithFullText === 'true' || onlyWithFullText === true) {
    filter.push({ exists: { field: 'JFULL' } });
  }

  if (includeCitedCases === 'true' || includeCitedCases === true) {
    // 確保至少有一個引用，或者 cited_cases_count 大於 0
    must.push({
      bool: {
        should: [
          { exists: { field: 'citations' } }, // 假設 citations 是個陣列或物件
          { range: { 'cited_cases_count': { gte: 1 } } } // 假設有這個計數欄位
        ],
        minimum_should_match: 1
      }
    });
  }

  if (onlyRecent3Years === 'true' || onlyRecent3Years === true) {
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
    // 格式化為 YYYYMMDD 數字，或 Elasticsearch date 格式 "YYYY-MM-dd"
    // 假設您的 JDATE_num 是 YYYYMMDD 格式的數字
    const dateNum = parseInt(
      `${threeYearsAgo.getFullYear()}${("0" + (threeYearsAgo.getMonth() + 1)).slice(-2)}${("0" + threeYearsAgo.getDate()).slice(-2)}`,
      10
    );
    filter.push({ range: { 'JDATE_num': { gte: dateNum } } }); // 假設您有 JDATE_num 欄位
    // 或者，如果 JDATE 是 date 類型:
    // filter.push({ range: { 'JDATE': { gte: threeYearsAgo.toISOString().split('T')[0] } } });
  }

  const esQueryBody = { bool: {} };
  if (must.length > 0) esQueryBody.bool.must = must;
  if (filter.length > 0) esQueryBody.bool.filter = filter; // 使用 filter context

  // 如果 must 和 filter 都為空，可以返回 match_all，或者讓調用者處理
  if (must.length === 0 && filter.length === 0 && !query) { // 如果連 query 都沒有
     return { match_all: {} }; // 如果沒有任何篩選，則匹配所有文件
  }

  return esQueryBody;
}