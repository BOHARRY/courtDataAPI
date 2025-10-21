// utils/query-builder.js (完整修正版)

import { processCaseNumberQuery } from '../services/caseNumberParser.js';

/**
 * 解析查詢字串，生成對應的查詢子句陣列。
 * 🆕 新增案號智能檢測：如果檢測到案號格式，優先使用 AI 解析
 *
 * @param {string} query - 原始查詢字串。
 * @returns {Promise<{mustClauses: object[], shouldClauses: object[], isCaseNumberQuery: boolean}>} - 解析後的 must 和 should 子句。
 */
async function parseQueryString(query) {
  const mustClauses = [];
  const shouldClauses = [];

  // 🆕 步驟 0: 案號智能檢測（優先級最高）
  // 如果是單一查詢詞（沒有 OR/AND 邏輯），嘗試案號解析
  const hasLogicOperators = /(\|\||OR|\+|&)/i.test(query);

  if (!hasLogicOperators) {
    try {
      const caseNumberQuery = await processCaseNumberQuery(query.trim());

      if (caseNumberQuery) {
        console.log('[QueryBuilder] 🎯 檢測到案號查詢，使用 AI 生成的精確查詢');
        // 案號查詢使用極高權重，確保優先匹配
        mustClauses.push({
          bool: {
            ...caseNumberQuery,
            boost: 100  // 極高權重
          }
        });
        return { mustClauses, shouldClauses, isCaseNumberQuery: true };
      }
    } catch (error) {
      console.error('[QueryBuilder] 案號解析失敗，回退到通用查詢:', error);
      // 繼續執行通用查詢邏輯
    }
  }

  // 1. 檢測 OR 邏輯
  const orRegex = /\s*(\|\||OR)\s*/i; // 匹配 || 或 OR (不分大小寫)
  if (orRegex.test(query)) {
    const terms = query.split(orRegex).filter(t => t && !orRegex.test(t));
    for (const term of terms) {
      shouldClauses.push(await buildSubQuery(term.trim()));
    }
    return { mustClauses, shouldClauses, isCaseNumberQuery: false };
  }

  // 2. 檢測 AND 邏輯 (預設)
  const andRegex = /\s*(\+|&| )\s*/; // 匹配 +, &, 或空格
  const terms = query.split(andRegex).filter(t => t && !andRegex.test(t));
  for (const term of terms) {
    mustClauses.push(await buildSubQuery(term.trim()));
  }

  return { mustClauses, shouldClauses, isCaseNumberQuery: false };
}

/**
 * 為單一關鍵詞或詞組構建 ES 查詢子句。
 * 這個版本統一使用 match_phrase 來實現精準詞組搜尋。
 * 🆕 支持異步操作（為未來擴展預留）
 *
 * @param {string} term - 單一查詢詞，例如 "無因管理" 或 ""不當得利""。
 * @returns {Promise<object>} - 一個 bool query 物件。
 */
async function buildSubQuery(term) {
  let searchTerm = term.trim();

  // 如果使用者用了引號，我們尊重它並移除引號，搜尋引號內的內容
  if (searchTerm.startsWith('"') && searchTerm.endsWith('"')) {
    searchTerm = searchTerm.slice(1, -1);
  }

  // 如果處理後 searchTerm 為空，則返回一個不會匹配任何東西的查詢
  if (!searchTerm) {
    return { bool: { must_not: { match_all: {} } } };
  }

  // ===== 核心修改：統一使用 match_phrase + 擴充新欄位 =====
  // 不論使用者是否加引號，都執行精準的詞組匹配。
  // 新增：利用新 mapping 的豐富欄位提升搜索覆蓋率
  const shouldClauses = [
    // 原有核心欄位
    { match_phrase: { "JFULL":           { query: searchTerm, boost: 3 } } },
    { match_phrase: { "JTITLE":          { query: searchTerm, boost: 4 } } },
    { match_phrase: { "summary_ai":      { query: searchTerm, boost: 2 } } },
    { match_phrase: { "main_reasons_ai": { query: searchTerm, boost: 2 } } },
    { match_phrase: { "tags":            { query: searchTerm, boost: 1.5 } } },

    // 對於 .exact (keyword) 欄位, match_phrase 等同於 term 查詢，行為正確
    { match_phrase: { "lawyers.exact":   { query: searchTerm, boost: 8 } } },
    { match_phrase: { "judges.exact":    { query: searchTerm, boost: 8 } } },

    // 🆕 新增欄位：法律請求基礎
    { match_phrase: { "legal_claim_basis": { query: searchTerm, boost: 2.5 } } },

    // 🆕 新增欄位：原告主張和被告抗辯摘要
    { match_phrase: { "plaintiff_claims_summary": { query: searchTerm, boost: 2 } } },
    { match_phrase: { "defendant_defenses_summary": { query: searchTerm, boost: 2 } } },

    // 🆕 新增欄位：可複製策略文本
    { match_phrase: { "replicable_strategies_text": { query: searchTerm, boost: 2 } } },

    // 🆕 新增欄位：利用 .legal 子欄位進行法律術語搜索（使用法律同義詞分析器）
    { match_phrase: { "JFULL.legal":     { query: searchTerm, boost: 2.5 } } },
    { match_phrase: { "summary_ai.legal": { query: searchTerm, boost: 1.8 } } },
  ];

  // 🆕 新增：nested 查詢 - 可引用段落
  shouldClauses.push({
    nested: {
      path: "citable_paragraphs",
      query: {
        match_phrase: {
          "citable_paragraphs.paragraph_text": {
            query: searchTerm,
            boost: 2.5
          }
        }
      }
    }
  });

  // 🆕 新增：nested 查詢 - 法律爭點
  shouldClauses.push({
    nested: {
      path: "legal_issues",
      query: {
        bool: {
          should: [
            { match_phrase: { "legal_issues.question": { query: searchTerm, boost: 3 } } },
            { match_phrase: { "legal_issues.answer":   { query: searchTerm, boost: 2 } } }
          ]
        }
      }
    }
  });

  return {
    bool: {
      should: shouldClauses,
      minimum_should_match: 1
    }
  };
}


/**
 * 根據提供的篩選條件構建 Elasticsearch 查詢 DSL 的 query 部分。
 * 🆕 支持異步操作以啟用 AI 案號解析
 *
 * @param {object} filters - 從請求查詢參數中獲取的篩選條件對象。
 * @returns {Promise<object>} Elasticsearch 查詢的 bool query 部分。
 */
export async function buildEsQuery(filters = {}) {
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

  // ==================== 關鍵字查詢重構（🆕 支持 AI 案號解析）====================
  if (query) {
    const { mustClauses, shouldClauses, isCaseNumberQuery } = await parseQueryString(query);
    if (mustClauses.length > 0) must.push(...mustClauses);
    if (shouldClauses.length > 0) should.push(...shouldClauses);

    // 🆕 如果是案號查詢，記錄日誌
    if (isCaseNumberQuery) {
      console.log('[QueryBuilder] ✅ 案號查詢已啟用 AI 智能解析');
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
  if (must.length > 0) esQueryBody.bool.must = must;
  if (should.length > 0) {
    esQueryBody.bool.should = should;
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