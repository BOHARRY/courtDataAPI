// services/lawyer.js
import esClient from '../config/elasticsearch.js';
import {
  getMainType,
  getSideFromPerformance,
  getDetailedResult,
  populateDynamicFilterOptions,
  generateLawyerAnalysis // 從 utils 引入
} from '../utils/case-analyzer.js';
import {
  createFinalOutcomeStats,
  calculateDetailedWinRates
} from '../utils/win-rate-calculator.js';

const ES_INDEX_NAME = 'search-boooook';

/**
 * 從案件中提取律師角色（使用新的 trial_party_lawyers 和 appeal_party_lawyers）
 * @param {object} caseData - 案件數據
 * @param {string} lawyerName - 律師名稱
 * @returns {object|null} - { side: 'plaintiff'|'defendant', level: 'trial'|'appeal', party, partyType }
 */
function getLawyerRoleFromCase(caseData, lawyerName) {
  // 優先檢查初審
  if (caseData.trial_party_lawyers && Array.isArray(caseData.trial_party_lawyers)) {
    for (const entry of caseData.trial_party_lawyers) {
      if (entry.lawyers && Array.isArray(entry.lawyers) && entry.lawyers.includes(lawyerName)) {
        return {
          side: entry.side,           // "plaintiff" or "defendant"
          level: 'trial',
          party: entry.party,
          partyType: entry.party_type
        };
      }
    }
  }

  // 檢查上訴審
  if (caseData.appeal_party_lawyers && Array.isArray(caseData.appeal_party_lawyers)) {
    for (const entry of caseData.appeal_party_lawyers) {
      if (entry.lawyers && Array.isArray(entry.lawyers) && entry.lawyers.includes(lawyerName)) {
        return {
          side: entry.appeal_role === 'appellant' ? 'plaintiff' : 'defendant',  // 簡化處理
          level: 'appeal',
          party: entry.party,
          partyType: entry.party_type
        };
      }
    }
  }

  // 回退到舊欄位
  if (caseData.lawyers && Array.isArray(caseData.lawyers) && caseData.lawyers.includes(lawyerName)) {
    return { side: 'plaintiff', level: 'trial', party: null, partyType: null };
  }

  if (caseData.lawyersdef && Array.isArray(caseData.lawyersdef) && caseData.lawyersdef.includes(lawyerName)) {
    return { side: 'defendant', level: 'trial', party: null, partyType: null };
  }

  return null;
}

/**
 * 從案件中提取律師表現評估（使用新的 lawyer_performance）
 * @param {object} caseData - 案件數據
 * @param {string} lawyerName - 律師名稱
 * @returns {object|null} - { performance: 'Good'|'Fair'|'Poor', outcome, justification }
 */
function getLawyerPerformanceFromCase(caseData, lawyerName) {
  if (caseData.lawyer_performance && Array.isArray(caseData.lawyer_performance)) {
    const perf = caseData.lawyer_performance.find(p => p.lawyer === lawyerName);
    if (perf) {
      return {
        performance: perf.performance,  // "Good", "Fair", "Poor"
        outcome: perf.outcome,
        justification: perf.justification
      };
    }
  }
  return null;
}

/**
 * 獲取標準化的判決結果分類（使用 disposition.class）
 * @param {object} caseData - 案件數據
 * @returns {string} - 'win', 'partial_win', 'loss', 'settlement', 'procedural', 'unknown'
 */
function getDispositionClass(caseData) {
  if (caseData.disposition && caseData.disposition.class) {
    return caseData.disposition.class;
  }

  // 回退到舊的 verdict_type 判斷
  const verdictType = caseData.verdict_type || '';
  if (verdictType.includes('勝訴') && !verdictType.includes('部分')) return 'win';
  if (verdictType.includes('部分勝訴')) return 'partial_win';
  if (verdictType.includes('敗訴')) return 'loss';
  if (verdictType.includes('和解')) return 'settlement';
  if (verdictType.includes('駁回') || verdictType.includes('不受理')) return 'procedural';

  return 'unknown';
}

/**
 * 🆕 計算增強版的勝率統計（使用新的數據結構）
 * @param {array} cases - 案件列表
 * @returns {object} - 詳細的勝率統計
 */
function calculateEnhancedWinRates(cases) {
  const stats = {
    civil: {
      total_cases: 0,
      by_role: {
        plaintiff: { total: 0, trial_level: 0, appeal_level: 0, outcomes: {}, performance: {}, performance_details: [], client_types: {} },
        defendant: { total: 0, trial_level: 0, appeal_level: 0, outcomes: {}, performance: {}, performance_details: [], client_types: {} }
      }
    },
    criminal: {
      total_cases: 0,
      by_role: {
        defendant: { total: 0, trial_level: 0, appeal_level: 0, outcomes: {}, performance: {}, performance_details: [], client_types: {} }
      }
    },
    administrative: {
      total_cases: 0,
      by_role: {
        plaintiff: { total: 0, trial_level: 0, appeal_level: 0, outcomes: {}, performance: {}, performance_details: [], client_types: {} }
      }
    }
  };

  cases.forEach(caseItem => {
    const mainType = caseItem.mainType || 'unknown';
    const side = caseItem.sideFromPerf || 'unknown';
    const outcome = caseItem.neutralOutcomeCode || 'unknown';
    const performance = caseItem.lawyerPerfObject?.performance || 'unknown';
    const performanceOutcome = caseItem.lawyerPerfObject?.outcome || ''; // 🆕 律師表現結果
    const level = caseItem.lawyerPerfObject?.level || 'trial';
    const partyType = caseItem.lawyerPerfObject?.partyType || 'unknown';

    // 確定案件類型
    let caseType = null;
    if (mainType === 'civil') caseType = 'civil';
    else if (mainType === 'criminal') caseType = 'criminal';
    else if (mainType === 'administrative') caseType = 'administrative';
    else return; // 跳過未知類型

    // 確保統計結構存在
    if (!stats[caseType].by_role[side]) return; // 跳過不支持的角色

    const roleStats = stats[caseType].by_role[side];

    // 基本計數
    stats[caseType].total_cases++;
    roleStats.total++;

    // 審級統計
    if (level === 'trial') roleStats.trial_level++;
    else if (level === 'appeal') roleStats.appeal_level++;

    // 判決結果統計（使用 disposition.class 的標準化分類）
    if (!roleStats.outcomes[outcome]) roleStats.outcomes[outcome] = 0;
    roleStats.outcomes[outcome]++;

    // 🆕 律師表現統計（支援 4 個等級：Excellent/Good/Fair/Poor）
    if (performance && performance !== 'unknown') {
      const perfKey = performance.toLowerCase(); // 'Excellent' -> 'excellent', 'Good' -> 'good'
      if (!roleStats.performance[perfKey]) roleStats.performance[perfKey] = 0;
      roleStats.performance[perfKey]++;

      // 🆕 添加詳細的表現記錄（用於前端表格顯示）
      roleStats.performance_details.push({
        performance: performance,
        outcome: performanceOutcome,
        case_id: caseItem.id
      });
    }

    // 客戶類型統計
    if (partyType && partyType !== 'unknown') {
      if (!roleStats.client_types[partyType]) roleStats.client_types[partyType] = 0;
      roleStats.client_types[partyType]++;
    }
  });

  // 計算勝率和關鍵指標
  ['civil', 'criminal', 'administrative'].forEach(caseType => {
    Object.keys(stats[caseType].by_role).forEach(role => {
      const roleStats = stats[caseType].by_role[role];
      const outcomes = roleStats.outcomes;
      const performance = roleStats.performance;

      // 計算勝率（win + partial_win）/ (total - settlement - procedural)
      const winCount = (outcomes.win || 0) + (outcomes.partial_win || 0);
      const totalRelevant = roleStats.total - (outcomes.settlement || 0) - (outcomes.procedural || 0);

      roleStats.win_rate = totalRelevant > 0 ? Math.round((winCount / totalRelevant) * 100) : 0;

      // 🆕 計算表現優秀率（Excellent + Good）/ total
      const excellentCount = (performance.excellent || 0) + (performance.good || 0);
      roleStats.excellence_rate = roleStats.total > 0 ? Math.round((excellentCount / roleStats.total) * 100) : 0;
    });

    // 計算整體勝率
    const allRoles = Object.values(stats[caseType].by_role);
    const totalWins = allRoles.reduce((sum, r) => sum + (r.outcomes.win || 0) + (r.outcomes.partial_win || 0), 0);
    const totalRelevant = allRoles.reduce((sum, r) => sum + r.total - (r.outcomes.settlement || 0) - (r.outcomes.procedural || 0), 0);

    stats[caseType].overall = totalRelevant > 0 ? Math.round((totalWins / totalRelevant) * 100) : 0;
  });

  console.log('[calculateEnhancedWinRates] 新統計結果:', JSON.stringify(stats, null, 2));

  return stats;
}

/**
 * 搜尋律師並分析其案件數據。
 * @param {string} lawyerName - 律師名稱。
 * @returns {Promise<object>} 包含律師分析數據的物件。
 */
export async function searchLawyerData(lawyerName) {
  // console.log(`[Lawyer Service] Searching and analyzing data for lawyer: ${lawyerName}`);
  try {
    const lawyerNameExact = lawyerName;
    const esQueryBody = {
      query: {
        bool: {
          should: [
            // 🆕 搜索新欄位 trial_party_lawyers
            {
              nested: {
                path: "trial_party_lawyers",
                query: {
                  term: { "trial_party_lawyers.lawyers": lawyerNameExact }
                }
              }
            },
            // 🆕 搜索新欄位 appeal_party_lawyers
            {
              nested: {
                path: "appeal_party_lawyers",
                query: {
                  term: { "appeal_party_lawyers.lawyers": lawyerNameExact }
                }
              }
            },
            // 保留舊欄位搜索（向後兼容）
            { term: { "lawyers.exact": lawyerNameExact } },
            { term: { "lawyersdef.exact": lawyerNameExact } }
          ],
          minimum_should_match: 1
        }
      }
    };

    console.log(`[Lawyer Service] Elasticsearch Query for lawyer ${lawyerName}:`, JSON.stringify(esQueryBody.query, null, 2));

    const esResult = await esClient.search({
      index: ES_INDEX_NAME,
      body: esQueryBody,
      size: 300,
      _source: [ // 🆕 包含新欄位
        "JID", "court", "JTITLE", "JDATE", "JDATE_num", "case_type", "verdict_type",
        "cause", "lawyers", "lawyersdef", "JCASE", "is_ruling",
        "lawyer_assessment", "position_based_analysis",
        // 🆕 新增的欄位
        "trial_party_lawyers", "appeal_party_lawyers", "lawyer_performance", "disposition"
      ]
    });



    // console.log(`[Lawyer Service] ES search for ${lawyerName} returned ${esResult.hits.hits.length} hits.`);
    // 調用內部輔助函數進行數據分析
    return analyzeAndStructureLawyerData(esResult.hits.hits, lawyerName, esResult.aggregations);

  } catch (error) {
    console.error(`[Lawyer Service] Error searching for lawyer ${lawyerName}:`, error.meta || error);
    const serviceError = new Error(`Failed to search data for lawyer ${lawyerName}.`);
    serviceError.statusCode = error.statusCode || 500;
    serviceError.originalError = error.message;
    throw serviceError;
  }
}

/**
 * 內部輔助函數：分析 ES 返回的案件數據並構建律師資料物件。
 * (此函數即為原程式碼中的 analyzeLawyerData)
 */
function analyzeAndStructureLawyerData(esHits, lawyerName, esAggregations) {
  const initialStats = {
    totalCasesLast3Years: 0,
    commonCaseTypes: [], // 儲存最常見的案件類型名稱
    caseTypeValues: [],  // 儲存對應的案件數量
    detailedWinRates: {
      civil: { overall: 0, plaintiff: createFinalOutcomeStats(), defendant: createFinalOutcomeStats(), other_side: createFinalOutcomeStats() },
      criminal: { overall: 0, plaintiff: createFinalOutcomeStats(), defendant: createFinalOutcomeStats(), other_side: createFinalOutcomeStats() },
      administrative: { overall: 0, plaintiff: createFinalOutcomeStats(), defendant: createFinalOutcomeStats(), other_side: createFinalOutcomeStats() }
    },
    dynamicFilterOptions: { // 用於該律師案件列表的動態篩選器
      civil: { causes: [], verdicts: [] },
      criminal: { causes: [], verdicts: [] },
      administrative: { causes: [], verdicts: [] }
    }
  };

  const resultData = {
    name: lawyerName,
    lawRating: 0, // 評分計算邏輯
    source: '法院公開判決書',
    stats: JSON.parse(JSON.stringify(initialStats)), // 深拷貝初始統計
    cases: [], // 儲存處理後的案件列表
    analysisSummary: null // 用於儲存 generateLawyerAnalysis 的結果
  };

  if (!esHits || esHits.length === 0) {
    // console.log(`[Lawyer Service - Analyze] No cases found for ${lawyerName}. Returning empty structure.`);
    resultData.analysisSummary = generateLawyerAnalysis(lawyerName, null); // 即使無案件，也生成通用分析
    return resultData;
  }

  const now = new Date();
  const threeYearsAgoNum = parseInt(
    `${now.getFullYear() - 3}${("0" + (now.getMonth() + 1)).slice(-2)}${("0" + now.getDate()).slice(-2)}`,
    10
  );
  // console.log(`[Lawyer Service] 近三年閾值: ${threeYearsAgoNum}, 當前日期: ${now.toISOString()}`);

  // 這個循環會在後面的 map 操作中處理，這裡先移除避免重複
  const allCaseTypesCounter = {}; // 用於統計案件類型數量

  resultData.cases = esHits.map(hit => {
    const source = hit._source || {};
    const mainType = getMainType(source); // utils/case-analyzer

    // 🆕 使用新的輔助函數提取律師角色
    const lawyerRole = getLawyerRoleFromCase(source, lawyerName);
    const sideFromPerf = lawyerRole ? lawyerRole.side : 'unknown';

    // 🆕 使用新的輔助函數提取律師表現
    const lawyerPerformance = getLawyerPerformanceFromCase(source, lawyerName);

    // 🆕 使用新的輔助函數獲取判決結果分類
    const dispositionClass = getDispositionClass(source);

    // 構建律師表現對象（保留舊邏輯以兼容）
    let perfVerdictText = null;
    let lawyerPerfObject = {
      side: sideFromPerf,
      verdict: source.verdict_type,
      dispositionClass: dispositionClass,  // 🆕 新增
      performance: lawyerPerformance?.performance,  // 🆕 新增
      outcome: lawyerPerformance?.outcome,  // 🆕 新增（律師表現結果）
      level: lawyerRole?.level,  // 🆕 新增（trial/appeal）
      partyType: lawyerRole?.partyType  // 🆕 新增（person/organization）
    };

    // 優先使用新的 lawyer_performance
    if (lawyerPerformance) {
      perfVerdictText = lawyerPerformance.outcome;
      lawyerPerfObject.assessment = lawyerPerformance.justification?.join('; ');
    }
    // 回退到舊的 lawyer_assessment
    else if (sideFromPerf === 'plaintiff' && source.lawyer_assessment?.plaintiff_side_comment) {
      perfVerdictText = source.lawyer_assessment.plaintiff_side_comment;
      lawyerPerfObject.assessment = source.lawyer_assessment.plaintiff_side_comment;
    } else if (sideFromPerf === 'defendant' && source.lawyer_assessment?.defendant_side_comment) {
      perfVerdictText = source.lawyer_assessment.defendant_side_comment;
      lawyerPerfObject.assessment = source.lawyer_assessment.defendant_side_comment;
    }
    // 回退到 position_based_analysis
    else if (sideFromPerf === 'plaintiff' && source.position_based_analysis?.plaintiff_perspective) {
      lawyerPerfObject.overall_result = source.position_based_analysis.plaintiff_perspective.overall_result;
      perfVerdictText = source.position_based_analysis.plaintiff_perspective.overall_result;
    } else if (sideFromPerf === 'defendant' && source.position_based_analysis?.defendant_perspective) {
      lawyerPerfObject.overall_result = source.position_based_analysis.defendant_perspective.overall_result;
      perfVerdictText = source.position_based_analysis.defendant_perspective.overall_result;
    }

    // 如果沒有具體的律師評估，使用案件的整體判決作為參考
    if (!perfVerdictText) {
      perfVerdictText = source.verdict_type || '結果未明';
    }

    // 🆕 優先使用 disposition.class 作為 neutralOutcomeCode
    let neutralOutcomeCode = dispositionClass;
    let description = perfVerdictText || source.verdict_type || '結果未明';

    // 如果 disposition.class 不存在或為 unknown，回退到舊的 getDetailedResult
    if (!dispositionClass || dispositionClass === 'unknown') {
      const detailedResult = getDetailedResult(perfVerdictText, mainType, source, lawyerPerfObject);
      neutralOutcomeCode = detailedResult.neutralOutcomeCode;
      description = detailedResult.description;
    }

    // 修正日期格式處理 - 支持多種格式
    let caseDate = null;
    if (source.JDATE_num && typeof source.JDATE_num === 'string' && source.JDATE_num.length === 8) {
      // 如果有 JDATE_num 且格式正確 (YYYYMMDD)
      caseDate = parseInt(source.JDATE_num, 10);
    } else if (source.JDATE && typeof source.JDATE === 'string') {
      // 處理 JDATE 字段的不同格式
      if (source.JDATE.length === 8) {
        // YYYYMMDD 格式
        caseDate = parseInt(source.JDATE, 10);
      } else if (source.JDATE.length === 10) {
        // YYYY-MM-DD 格式，轉換為 YYYYMMDD
        const dateStr = source.JDATE.replace(/-/g, '');
        caseDate = parseInt(dateStr, 10);
      }
    }

    // console.log(`[Lawyer Service] 案件 ${source.JID}: JDATE=${source.JDATE}, JDATE_num=${source.JDATE_num}, caseDate=${caseDate}, 閾值=${threeYearsAgoNum}`);

    // 統計近三年案件
    if (caseDate && !isNaN(caseDate) && caseDate >= threeYearsAgoNum) {
      resultData.stats.totalCasesLast3Years++;
      // console.log(`[Lawyer Service] ✅ 計入近三年案件: ${source.JID}, 日期: ${caseDate}`);
    }

    if (source.case_type) {
      allCaseTypesCounter[source.case_type] = (allCaseTypesCounter[source.case_type] || 0) + 1;
    }

    return {
      id: hit._id || source.JID, // JID 作為備用 ID
      mainType,
      title: source.JTITLE || `${source.court || ''} ${mainType}案件`,
      court: source.court,
      jcase: source.JCASE,
      date: source.JDATE, // YYYY/MM/DD 格式
      dateNum: caseDate, // 統一的 YYYYMMDD 數字格式
      cause: source.cause || '未指定',
      result: description, // 來自 getDetailedResult 的描述
      // originalVerdict: source.verdict, // 可選，用於調試或前端顯示
      // originalVerdictType: source.verdict_type, // 可選
      sideFromPerf: sideFromPerf, // 律師在此案件中的立場
      neutralOutcomeCode, // 用於勝率計算
      lawyerPerfObject, // 🆕 包含完整的律師表現對象（包含 performance, level, partyType）
      // originalSource: source // 可選，用於調試
    };
  }).sort((a, b) => (b.dateNum || 0) - (a.dateNum || 0)); // 按日期倒序排序

  // console.log(`--- Cases Breakdown for ${lawyerName} (${resultData.cases.length} total processed) ---`);
  // resultData.cases.forEach(c => {
  //   console.log(`  ID: ${c.id}, mainType: ${c.mainType}, side: ${c.sideFromPerf}, outcome: ${c.neutralOutcomeCode}, desc: ${c.result}`);
  // });

  // 🆕 計算詳細勝率（使用新的數據結構）
  resultData.stats.detailedWinRates = calculateEnhancedWinRates(resultData.cases);

  // 保留舊的計算方式作為備份（如果新方式失敗）
  if (!resultData.stats.detailedWinRates || Object.keys(resultData.stats.detailedWinRates).length === 0) {
    console.log('[Lawyer Service] 新統計方式失敗，使用舊方式');
    resultData.stats.detailedWinRates = calculateDetailedWinRates(resultData.cases, resultData.stats.detailedWinRates);
  }

  // 統計最常見案件類型
  const sortedCommonCaseTypes = Object.entries(allCaseTypesCounter)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5); // 取前 5 種
  resultData.stats.commonCaseTypes = sortedCommonCaseTypes.map(e => e[0]);
  resultData.stats.caseTypeValues = sortedCommonCaseTypes.map(e => e[1]);

  // 填充該律師案件列表的動態篩選選項
  populateDynamicFilterOptions(resultData.stats.dynamicFilterOptions, esAggregations, resultData.cases, lawyerName); // utils/case-analyzer

  // 計算律師評分 (lawRating) - 邏輯與原碼保持一致
  const overallCivil = resultData.stats.detailedWinRates.civil.overall || 0;
  const overallCriminal = resultData.stats.detailedWinRates.criminal.overall || 0;
  const overallAdmin = resultData.stats.detailedWinRates.administrative.overall || 0;
  const primaryOverallRate = overallCivil || overallCriminal || overallAdmin || 0; // 取一個主要的勝率

  if (resultData.stats.totalCasesLast3Years >= 3) {
    resultData.lawRating = Math.min(4, Math.floor(resultData.stats.totalCasesLast3Years / 5));
    if (primaryOverallRate > 70) resultData.lawRating += 3;
    else if (primaryOverallRate > 55) resultData.lawRating += 2;
    else if (primaryOverallRate > 40) resultData.lawRating += 1;
  } else {
    resultData.lawRating = Math.min(2, resultData.stats.totalCasesLast3Years);
  }
  resultData.lawRating = Math.max(0, Math.min(8, Math.round(resultData.lawRating))); // 確保評分在 0-8 之間

  // 生成分析摘要
  resultData.analysisSummary = generateLawyerAnalysis(lawyerName, resultData); // 使用分析後的數據 (雖然目前模板未使用)

  // console.log(`[Lawyer Service - Analyze] Finished analysis for ${lawyerName}. Rating: ${resultData.lawRating}`);
  // console.log(`[Lawyer Service - Analyze] Detailed Win Rates for ${lawyerName}: `, JSON.stringify(resultData.stats.detailedWinRates, null, 2));

  return resultData;
}

/**
 * 獲取律師案件類型分佈的靜態數據。
 * (根據原程式碼，此路由返回固定數據)
 * @param {string} lawyerName - 律師名稱 (目前未使用)。
 * @returns {object} 固定的案件類型分佈數據。
 */
export function getStaticLawyerCasesDistribution(lawyerName) {
  // console.log(`[Lawyer Service] Getting static cases distribution for ${lawyerName}`);
  return {
    caseTypes: {
      labels: ['民事租賃', '工程款請求', '侵權行為', '債務請求', '其他'],
      values: [25, 18, 15, 12, 30] // 示例數據
    }
    // 未來可以擴展其他分佈數據，如勝訴率分佈、法院層級分佈等
  };
}

/**
 * 獲取律師優劣勢分析文本。
 * (此方法封裝對 utils/case-analyzer.generateLawyerAnalysis 的調用)
 * @param {string} lawyerName - 律師名稱。
 * @returns {object} 包含優勢、注意事項和免責聲明的物件。
 */
export function getGeneratedLawyerAnalysis(lawyerName) {
  // console.log(`[Lawyer Service] Generating analysis text for ${lawyerName}`);
  // 未來如果 generateLawyerAnalysis 需要更多來自 ES 的數據，
  // 可以在這裡先調用 searchLawyerData 或其部分邏輯獲取數據，再傳給 generateLawyerAnalysis。
  // 目前，我們假設 generateLawyerAnalysis 主要是基於名稱和預設模板。
  return generateLawyerAnalysis(lawyerName, null); // 傳入 null 表示使用通用模板或特定名稱模板
}