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
            { term: { "lawyers.exact": lawyerNameExact } },      // 查主要律師 (精確)
            { term: { "lawyersdef.exact": lawyerNameExact } },   // 查辯護律師 (精確)
            {
              nested: {                                       // 查參與案件的律師
                path: "lawyerperformance",
                query: {
                  term: { "lawyerperformance.lawyer.exact": lawyerNameExact }
                }
              }
            }
          ],
          minimum_should_match: 1
        }
      }
    };

    console.log(`[Lawyer Service] Elasticsearch Query for lawyer ${lawyerName}:`, JSON.stringify(esQueryBody.query, null, 2)); // 打印 query 部分

    const esResult = await esClient.search({
      index: ES_INDEX_NAME,
      body: esQueryBody, // 將 query 放在 body 下
      size: 300,
      _source: [ // 明確指定需要的欄位，減少數據傳輸
        "JID", "court", "JTITLE", "JDATE", "JDATE_num", "case_type", "verdict", "verdict_type",
        "cause", "lawyers", "lawyersdef", "JCASE", "lawyerperformance", "is_ruling"
        // 確保所有 analyzeLawyerData 和其輔助函數需要的欄位都在這裡
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
  resultData.cases.forEach(caseItem => {
    // 確保使用正確的日期欄位和格式
    let caseDate;
    if (caseItem.dateNum) {
      caseDate = parseInt(caseItem.dateNum, 10);
    } else if (caseItem.date) {
      // 嘗試從不同格式轉換（包括 YYYY/MM/DD）
      const dateStr = caseItem.date.replace(/\//g, '');
      caseDate = parseInt(dateStr, 10);
    }

    if (caseDate && !isNaN(caseDate) && caseDate >= threeYearsAgoNum) {
      resultData.stats.totalCasesLast3Years++;
      console.log(`計入近三年案件: ${caseItem.id}, 日期: ${caseDate}, 閾值: ${threeYearsAgoNum}`);
    }
  });
  const allCaseTypesCounter = {}; // 用於統計案件類型數量

  resultData.cases = esHits.map(hit => {
    const source = hit._source || {};
    const mainType = getMainType(source); // utils/case-analyzer

    let sideFromPerf = 'unknown';
    let perfVerdictText = null;
    let lawyerPerfObject = null;

    const performances = source.lawyerperformance;
    if (performances && Array.isArray(performances)) {
      // 精確匹配律師名稱，或包含該律師 (如果 lawyerperformance.lawyer 欄位可能有多個律師名)
      const perf = performances.find(p => p.lawyer && p.lawyer.includes(lawyerName)); // 假設 lawyerperformance.lawyer 是字串
      if (perf) {
        lawyerPerfObject = perf;
        sideFromPerf = getSideFromPerformance(perf); // utils/case-analyzer
        perfVerdictText = perf.verdict;
      }
    }

    const { neutralOutcomeCode, description } = getDetailedResult(perfVerdictText, mainType, source, lawyerPerfObject); // utils/case-analyzer

    // JDATE_num 用於統計近三年案件
    if (source.JDATE_num && parseInt(source.JDATE_num, 10) >= threeYearsAgoNum) {
      resultData.stats.totalCasesLast3Years++;
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
      dateNum: source.JDATE_num, // YYYYMMDD 數字格式
      cause: source.cause || '未指定',
      result: description, // 來自 getDetailedResult 的描述
      // originalVerdict: source.verdict, // 可選，用於調試或前端顯示
      // originalVerdictType: source.verdict_type, // 可選
      sideFromPerf: sideFromPerf, // 律師在此案件中的立場
      neutralOutcomeCode, // 用於勝率計算
      // originalSource: source // 可選，用於調試
    };
  }).sort((a, b) => (b.dateNum || 0) - (a.dateNum || 0)); // 按日期倒序排序

  // console.log(`--- Cases Breakdown for ${lawyerName} (${resultData.cases.length} total processed) ---`);
  // resultData.cases.forEach(c => {
  //   console.log(`  ID: ${c.id}, mainType: ${c.mainType}, side: ${c.sideFromPerf}, outcome: ${c.neutralOutcomeCode}, desc: ${c.result}`);
  // });

  // 計算詳細勝率
  resultData.stats.detailedWinRates = calculateDetailedWinRates(resultData.cases, resultData.stats.detailedWinRates); // utils/win-rate-calculator

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