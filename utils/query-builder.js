// utils/query-builder.js
import { CRIMINAL_KEYWORDS_TITLE, CIVIL_KEYWORDS_TITLE } from './constants.js';

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

  // 關鍵字查詢
  if (query) {
    if (query.startsWith('"') && query.endsWith('"')) {
      const exactPhrase = query.slice(1, -1);
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
            'winlawyers^4',
            'judges^4',
            'judges.raw^8'
          ],
          type: 'best_fields',
          operator: 'and'
        }
      });
    }
  }

  // 案件類型篩選 - 處理陣列格式
  if (caseTypes) {
    const typesArray = Array.isArray(caseTypes) ? caseTypes : caseTypes.split(',');
    if (typesArray.length > 0) {
      // 使用 terms 查詢來匹配陣列欄位
      filter.push({
        terms: {
          'case_type.keyword': typesArray
        }
      });
    }
  }

  // 判決結果篩選 - 使用實際資料的 verdict_type
  if (verdict && verdict !== '不指定') {
    // 使用 match 查詢以支援部分匹配
    filter.push({
      match: {
        'verdict_type': verdict
      }
    });
  }

  // 法條篩選
  if (laws) {
    const lawsArray = Array.isArray(laws) ? laws : laws.split(',');
    lawsArray.forEach(law => {
      if (law.trim()) {
        must.push({ match: { 'legal_basis': law.trim() } });
      }
    });
  }

  // 法院篩選 - 使用實際法院名稱
  if (courtLevels) {
    const courtsArray = Array.isArray(courtLevels) ? courtLevels : courtLevels.split(',');
    if (courtsArray.length > 0) {
      // 直接使用法院名稱進行匹配
      filter.push({
        bool: {
          should: courtsArray.map(court => ({
            match_phrase: {
              'court': court
            }
          })),
          minimum_should_match: 1
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
      // 注意：需要確認 ES 中是否有金額相關欄位
      filter.push({ range: { 'compensation_claimed': rangeQuery } });
    }
  }

  // 判決理由強度篩選
  if (reasoningStrength && reasoningStrength !== '不指定') {
    filter.push({ term: { 'outcome_reasoning_strength.keyword': reasoningStrength } });
  }

  // 案件複雜度篩選
  if (complexity && complexity !== '不指定') {
    let minScore, maxScore;
    if (complexity.includes('簡單')) {
      minScore = 1;
      maxScore = 2;
    } else if (complexity.includes('普通')) {
      minScore = 3;
      maxScore = 5;
    } else if (complexity.includes('複雜')) {
      minScore = 6;
      maxScore = 9;
    }

    if (minScore !== undefined && maxScore !== undefined) {
      filter.push({ range: { 'SCORE': { gte: minScore, lte: maxScore } } });
    }
  }

  // 勝訴理由篩選
  if (winReasons) {
    const reasonsArray = Array.isArray(winReasons) ? winReasons : winReasons.split(',');
    if (reasonsArray.length > 0) {
      must.push({
        terms: {
          'main_reasons_ai.tags': reasonsArray.map(r => r.trim()).filter(r => r)
        }
      });
    }
  }

  // 進階篩選：只顯示包含判決全文
  if (onlyWithFullText === 'true' || onlyWithFullText === true) {
    filter.push({ exists: { field: 'JFULL' } });
  }

  // 進階篩選：包含引用判例
  if (includeCitedCases === 'true' || includeCitedCases === true) {
    must.push({
      bool: {
        should: [
          { exists: { field: 'citations' } },
          { range: { 'citations_count': { gte: 1 } } }
        ],
        minimum_should_match: 1
      }
    });
  }

  // 進階篩選：近三年判決
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

  // 如果沒有任何條件，返回 match_all
  if (must.length === 0 && filter.length === 0) {
    return { match_all: {} };
  }

  return esQueryBody;
}