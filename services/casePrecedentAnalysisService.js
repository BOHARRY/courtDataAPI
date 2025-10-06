// services/casePrecedentAnalysisService.js
import esClient from '../config/elasticsearch.js';
import { OpenAI } from 'openai';
import { OPENAI_API_KEY, OPENAI_MODEL_NAME_CHAT } from '../config/environment.js';
import admin from 'firebase-admin';

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

const ES_INDEX_NAME = 'search-boooook';
const ANALYSIS_MODEL = OPENAI_MODEL_NAME_CHAT || 'gpt-4.1';

// 記憶體監控工具
const logMemoryUsage = (step) => {
    const used = process.memoryUsage();
    const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
    const rssMB = Math.round(used.rss / 1024 / 1024);
    const externalMB = Math.round(used.external / 1024 / 1024);
    console.log(`[Memory-${step}] Heap: ${heapUsedMB}MB, RSS: ${rssMB}MB, External: ${externalMB}MB`);

    // 警告記憶體使用過高
    if (heapUsedMB > 400) {
        console.warn(`⚠️ [Memory Warning] Heap usage high: ${heapUsedMB}MB`);
    }
};

/**
 * 將相似度門檻轉換為數值
 * ES cosine similarity 分數範圍是 0-1，公式：(1 + cosine_similarity) / 2
 * 用戶設定的百分比需要轉換為對應的分數閾值
 */
function getThresholdValue(threshold) {
    switch (threshold) {
        case 'low': return 0.5;    // 🚨 降低到50%，獲取更多案例
        case 'medium': return 0.6; // 🚨 降低到60%，獲取更多案例
        case 'high': return 0.75;   // 🚨 降低到75%，獲取更多案例
        default: return 0.6;       // 🚨 預設降低到60%
    }
}

/**
 * 將案件類型轉換為 ES 查詢條件
 */
function getCaseTypeFilter(caseType) {
    switch (caseType) {
        case '民事': return 'civil';
        case '刑事': return 'criminal';
        case '行政': return 'administrative';
        default: return 'civil';
    }
}

/**
 * 將法院層級轉換為 ES 查詢條件
 */
function getCourtLevelFilter(courtLevel) {
    switch (courtLevel) {
        case '地方法院': return 'district';
        case '高等法院': return 'high';
        case '最高法院': return 'supreme';
        default: return 'district';
    }
}

/**
 * 使用 OpenAI 生成案件描述的向量
 */
async function generateEmbedding(text) {
    try {
        const response = await openai.embeddings.create({
            model: 'text-embedding-3-large',
            input: text,
            dimensions: 1536
        });
        return response.data[0].embedding;
    } catch (error) {
        console.error('[casePrecedentAnalysisService] 生成向量失敗:', error);
        throw new Error('無法生成案件描述的向量表示');
    }
}

/**
 * 🆕 使用 GPT-4o 進行案件事由補足與分析（成本控制版）
 * 限制 token 使用量，專注於律師核心需求
 */
async function enrichCaseDescription(userInput) {
    try {
        console.log(`🔵 [ENRICH-START] 使用 GPT-4o 補足案件事由: "${userInput}"`);

        const prompt = `你是資深法律專家。請分析以下案件事由，從四個維度補足搜尋角度：

案件事由：「${userInput}」

請提供：
1. 法律術語：正式法律用詞（1-2個精準詞彙）
2. 實務用詞：實務常用表達（1-2個常見說法）
3. 爭點導向：具體法律爭點（1-2個核心爭點）

要求：
- 每個維度限制10字內
- 使用繁體中文
- 避免過於寬泛的詞彙

JSON格式回應：
{
  "formalTerms": "正式法律術語",
  "practicalTerms": "實務常用說法",
  "specificIssues": "具體法律爭點"
}`;

        console.log(`🔵 [ENRICH-API-CALL] 開始調用 OpenAI API`);
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 400, // 🎯 嚴格控制成本
            temperature: 0.3,
            response_format: { type: "json_object" }
        });

        console.log(`🔵 [ENRICH-API-SUCCESS] OpenAI API 調用成功`);
        const enrichment = JSON.parse(response.choices[0].message.content);
        console.log(`🔵 [ENRICH-RESULT] 事由補足結果:`, enrichment);
        return enrichment;

    } catch (error) {
        console.error('🔴 [ENRICH-ERROR] 事由補足失敗');
        console.error('🔴 [ENRICH-ERROR] 錯誤類型:', error.name);
        console.error('🔴 [ENRICH-ERROR] 錯誤訊息:', error.message);
        console.error('🔴 [ENRICH-ERROR] 錯誤堆疊:', error.stack);

        // 降級策略：返回基本結構
        const fallback = {
            formalTerms: userInput,
            practicalTerms: userInput,
            specificIssues: userInput
        };
        console.log('🟡 [ENRICH-FALLBACK] 使用降級策略:', fallback);
        return fallback;
    }
}

/**
 * 🆕 生成四角度搜尋策略
 */
function generateSearchAngles(userInput, enrichment) {
    return {
        核心概念: {
            query: userInput,
            weight: 0.4,
            purpose: "保持用戶原始表達",
            displayName: "核心概念"
        },
        法律術語: {
            query: enrichment.formalTerms || userInput,
            weight: 0.3,
            purpose: "正式法律用詞",
            displayName: "法律術語"
        },
        實務用詞: {
            query: enrichment.practicalTerms || userInput,
            weight: 0.2,
            purpose: "實務常用表達",
            displayName: "實務用詞"
        },
        爭點導向: {
            query: enrichment.specificIssues || userInput,
            weight: 0.1,
            purpose: "具體爭點角度",
            displayName: "爭點導向"
        }
    };
}

/**
 * 🆕 生成立場導向統計數據
 */
function generatePositionStats(similarCases, position) {
    if (position === 'neutral') {
        // 中性分析：提供通用統計
        const verdictCounts = {};
        similarCases.forEach(c => {
            verdictCounts[c.verdictType] = (verdictCounts[c.verdictType] || 0) + 1;
        });

        const totalCases = similarCases.length;
        const distribution = Object.entries(verdictCounts).map(([verdict, count]) => ({
            verdict,
            count,
            percentage: Math.round((count / totalCases) * 100)
        }));

        return {
            analysisType: 'neutral',
            totalCases,
            distribution,
            mainPattern: distribution.sort((a, b) => b.count - a.count)[0]
        };
    }

    // 立場導向分析：基於 position_based_analysis 數據
    const positionKey = position === 'plaintiff' ? 'plaintiff_perspective' : 'defendant_perspective';
    const casesWithPositionData = similarCases.filter(c =>
        c.positionAnalysis && c.positionAnalysis[positionKey]
    );

    if (casesWithPositionData.length === 0) {
        return {
            analysisType: position,
            totalCases: similarCases.length,
            positionDataAvailable: false,
            fallbackMessage: '立場分析數據不足，顯示通用統計'
        };
    }

    // 計算立場導向統計
    const successCases = casesWithPositionData.filter(c => {
        const analysis = c.positionAnalysis[positionKey];
        return analysis.overall_result === 'major_victory' ||
               analysis.case_value === 'positive_precedent' ||
               analysis.case_value === 'model_defense';
    });

    const riskCases = casesWithPositionData.filter(c => {
        const analysis = c.positionAnalysis[positionKey];
        return analysis.overall_result === 'major_defeat' ||
               analysis.case_value === 'negative_precedent';
    });

    const successRate = Math.round((successCases.length / casesWithPositionData.length) * 100);

    return {
        analysisType: position,
        totalCases: similarCases.length,
        positionDataAvailable: true,
        casesWithPositionData: casesWithPositionData.length,
        successCases: successCases.length,
        riskCases: riskCases.length,
        successRate,
        riskRate: Math.round((riskCases.length / casesWithPositionData.length) * 100)
    };
}

/**
 * 🆕 生成立場導向策略洞察
 */
function generateStrategicInsights(similarCases, position, verdictAnalysis) {
    if (position === 'neutral') {
        return {
            type: 'neutral',
            insights: [
                `基於 ${similarCases.length} 個相似案例的通用分析`,
                `主流判決模式：${verdictAnalysis.mainPattern?.verdict} (${verdictAnalysis.mainPattern?.percentage}%)`,
                verdictAnalysis.anomalies.length > 0 ?
                    `發現 ${verdictAnalysis.anomalies.length} 種異常模式需要注意` :
                    '判決模式相對穩定'
            ]
        };
    }

    const positionKey = position === 'plaintiff' ? 'plaintiff_perspective' : 'defendant_perspective';
    const casesWithPositionData = similarCases.filter(c =>
        c.positionAnalysis && c.positionAnalysis[positionKey]
    );

    if (casesWithPositionData.length === 0) {
        return {
            type: position,
            insights: ['立場分析數據不足，建議參考通用統計']
        };
    }

    // 提取成功策略和風險因素
    const successStrategies = [];
    const riskFactors = [];

    casesWithPositionData.forEach(c => {
        const analysis = c.positionAnalysis[positionKey];

        if (analysis.overall_result === 'major_victory') {
            if (analysis.successful_strategies) {
                successStrategies.push(...(Array.isArray(analysis.successful_strategies) ?
                    analysis.successful_strategies : [analysis.successful_strategies]));
            }
            if (analysis.winning_formula) {
                successStrategies.push(...(Array.isArray(analysis.winning_formula) ?
                    analysis.winning_formula : [analysis.winning_formula]));
            }
        }

        if (analysis.overall_result === 'major_defeat') {
            if (analysis.critical_failures) {
                riskFactors.push(...(Array.isArray(analysis.critical_failures) ?
                    analysis.critical_failures : [analysis.critical_failures]));
            }
        }
    });

    const positionLabel = position === 'plaintiff' ? '原告方' : '被告方';
    const successRate = Math.round((casesWithPositionData.filter(c =>
        c.positionAnalysis[positionKey].overall_result === 'major_victory'
    ).length / casesWithPositionData.length) * 100);

    return {
        type: position,
        positionLabel,
        successRate,
        insights: [
            `${positionLabel}成功率：${successRate}% (重大有利結果)`,
            successStrategies.length > 0 ?
                `關鍵成功策略：${[...new Set(successStrategies)].slice(0, 3).join('、')}` :
                '成功策略數據不足',
            riskFactors.length > 0 ?
                `主要風險因素：${[...new Set(riskFactors)].slice(0, 3).join('、')}` :
                '風險因素數據不足'
        ]
    };
}

/**
 * 🆕 根據立場和案件類型選擇向量欄位和權重策略
 * @param {string} position - 立場 (plaintiff/defendant/neutral)
 * @param {string} caseType - 案件類型 (民事/刑事/行政)
 */
function getPositionBasedSearchStrategy(position, caseType = '民事') {
    console.log(`[getPositionBasedSearchStrategy] 🎯 使用立場導向向量欄位進行 ${position} 立場搜尋 (案件類型: ${caseType})`);

    // ✅ 根據案件類型映射正確的視角欄位
    const perspectiveMap = {
        '民事': {
            plaintiff: 'plaintiff_perspective',
            defendant: 'defendant_perspective'
        },
        '刑事': {
            plaintiff: 'prosecutor_perspective',
            defendant: 'defense_perspective'
        },
        '行政': {
            plaintiff: 'citizen_perspective',
            defendant: 'agency_perspective'
        }
    };

    const perspectives = perspectiveMap[caseType] || perspectiveMap['民事'];

    switch (position) {
        case 'plaintiff':
            const plaintiffPerspective = perspectives.plaintiff;
            return {
                primaryVectorField: 'text_embedding',
                vectorFields: {
                    'text_embedding': 0.7,
                    'legal_issues_vector': 0.3
                },
                filterQuery: {
                    bool: {
                        should: [
                            // 1. 尋找對原告方有利的判例
                            { term: { [`position_based_analysis.${plaintiffPerspective}.case_value`]: 'positive_precedent' } },
                            { term: { [`position_based_analysis.${plaintiffPerspective}.overall_result`]: 'major_victory' } },
                            { term: { [`position_based_analysis.${plaintiffPerspective}.overall_result`]: 'partial_success' } },

                            // 2. 尋找有成功要素的案例
                            { exists: { field: `position_based_analysis.${plaintiffPerspective}.successful_elements` } }
                        ],
                        minimum_should_match: 0
                    }
                }
            };
        case 'defendant':
            const defendantPerspective = perspectives.defendant;
            return {
                primaryVectorField: 'text_embedding',
                vectorFields: {
                    'text_embedding': 0.7,
                    'legal_issues_vector': 0.3
                },
                filterQuery: {
                    bool: {
                        should: [
                            // 1. 尋找對被告方有利的判例
                            { term: { [`position_based_analysis.${defendantPerspective}.case_value`]: 'model_defense' } },
                            { term: { [`position_based_analysis.${defendantPerspective}.overall_result`]: 'major_victory' } },
                            { term: { [`position_based_analysis.${defendantPerspective}.overall_result`]: 'partial_success' } },

                            // 2. 尋找高複製性的防禦策略
                            { term: { 'position_based_analysis.replication_potential': 'high' } },

                            // 3. 尋找有成功策略的案例
                            { exists: { field: `position_based_analysis.${defendantPerspective}.successful_strategies` } },
                            { exists: { field: `position_based_analysis.${defendantPerspective}.winning_formula` } }
                        ],
                        minimum_should_match: 0
                    }
                }
            };
        default: // 'neutral'
            return {
                primaryVectorField: 'text_embedding',
                vectorFields: {
                    'text_embedding': 0.6,
                    'legal_issues_vector': 0.2,
                    'replicable_strategies_vector': 0.1,
                    'main_reasons_ai_vector': 0.1
                },
                filterQuery: null
            };
    }
}

/**
 * 🆕 執行立場導向的多角度並行語意搜尋
 */
async function performMultiAngleSearch(searchAngles, courtLevel, caseType, threshold, position = 'neutral') {
    try {
        console.log(`🟣 [MULTI-SEARCH-START] ===== 開始立場導向多角度搜尋 =====`);
        console.log(`🟣 [MULTI-SEARCH-START] 立場: ${position}，角度數量: ${Object.keys(searchAngles).length}`);
        console.log(`🟣 [MULTI-SEARCH-START] 參數:`, { courtLevel, caseType, threshold });

        const minScore = getThresholdValue(threshold);
        console.log(`🟣 [MULTI-SEARCH-START] 最低分數閾值: ${minScore}`);

        const searchStrategy = getPositionBasedSearchStrategy(position, caseType); // ✅ 傳入 caseType
        console.log(`🟣 [MULTI-SEARCH-START] 搜索策略:`, {
            primaryVectorField: searchStrategy.primaryVectorField,
            vectorFields: Object.keys(searchStrategy.vectorFields || {}),
            hasFilter: !!searchStrategy.filterQuery
        });

        // 並行執行所有角度的搜尋
        const searchPromises = Object.entries(searchAngles).map(async ([angleName, config]) => {
            try {
                console.log(`🟣 [ANGLE-${angleName}] 開始搜尋: "${config.query}"`);

                // 生成該角度的查詢向量
                console.log(`🟣 [ANGLE-${angleName}] 生成查詢向量...`);
                const queryVector = await generateEmbedding(config.query);
                console.log(`🟣 [ANGLE-${angleName}] ✅ 向量生成完成，維度: ${queryVector?.length}`);

                // 🆕 構建立場導向的 KNN 查詢
                const knnQuery = {
                    field: searchStrategy.primaryVectorField,
                    query_vector: queryVector,
                    k: 50, // 🚨 增加到50筆，提高樣本數量
                    num_candidates: 100 // 🚨 增加候選數量，提高搜尋品質
                };

                // 🚨 調試：檢查向量欄位和查詢
                console.log(`🟣 [ANGLE-${angleName}] 🔍 向量搜尋調試:`, {
                    angleName,
                    query: config.query,
                    primaryVectorField: searchStrategy.primaryVectorField,
                    position,
                    queryVectorLength: queryVector?.length,
                    queryVectorSample: queryVector?.slice(0, 5), // 前5個數值
                    hasFilterQuery: !!searchStrategy.filterQuery
                });

                // 🆕 顯示完整的過濾條件
                if (searchStrategy.filterQuery) {
                    console.log(`🟣 [ANGLE-${angleName}] 🔍 立場過濾條件:`, JSON.stringify(searchStrategy.filterQuery, null, 2));
                }

                // 🚨 檢查 ES 查詢結構
                console.log(`🟣 [ANGLE-${angleName}] 🔍 ES 查詢結構:`, {
                    index: ES_INDEX_NAME,
                    knn_field: knnQuery.field,
                    knn_k: knnQuery.k,
                    knn_num_candidates: knnQuery.num_candidates,
                    has_query_vector: !!knnQuery.query_vector,
                    query_vector_length: knnQuery.query_vector?.length
                });

                // 🆕 構建包含立場過濾的查詢
                const searchQuery = {
                    index: ES_INDEX_NAME,
                    knn: knnQuery,
                    _source: [
                        'JID', 'JTITLE', 'verdict_type', 'court', 'JYEAR',
                        'summary_ai', // 🆕 案例摘要信息（必需用於案例列表顯示）
                        'main_reasons_ai', // 🆕 勝負關鍵因素分析需要
                        'position_based_analysis', // 🆕 新增立場分析資料（包含所有立場分析欄位）
                        // 🚨 新增所有立場導向向量欄位和相關資料
                        'plaintiff_combined_vector',
                        'defendant_combined_vector',
                        'replicable_strategies_vector',
                        'main_reasons_ai_vector',
                        'text_embedding',
                        'legal_issues_vector' // ✅ 修正: legal_issues_embedding → legal_issues_vector
                    ],
                    size: 25,
                    timeout: '20s'
                };

                // 🚨 修復：結合用戶基本篩選條件和立場過濾
                const basicFilters = [];

                // 1. 法院層級過濾（最重要！）
                if (courtLevel && courtLevel !== '全部') {
                    // ✅ 修正：移除 .exact 子欄位，直接使用 court 欄位
                    if (courtLevel === '地方法院') {
                        basicFilters.push({
                            bool: {
                                should: [
                                    { wildcard: { 'court': '*地方法院*' } },
                                    { wildcard: { 'court': '*簡易庭*' } },
                                    { wildcard: { 'court': '*地院*' } }
                                ]
                            }
                        });
                    } else if (courtLevel === '高等法院') {
                        basicFilters.push({ wildcard: { 'court': '*高等*' } });
                    } else if (courtLevel === '最高法院') {
                        basicFilters.push({ wildcard: { 'court': '*最高*' } });
                    }
                }

                // 2. 案件類型過濾（最重要！）
                if (caseType && caseType !== '全部') {
                    // ✅ 修正：使用正確的欄位名稱 stage0_case_type 和英文值
                    if (caseType === '民事') {
                        basicFilters.push({
                            term: { 'stage0_case_type': 'civil' }
                        });
                    } else if (caseType === '刑事') {
                        basicFilters.push({
                            term: { 'stage0_case_type': 'criminal' }
                        });
                    } else if (caseType === '行政') {
                        basicFilters.push({
                            term: { 'stage0_case_type': 'administrative' }
                        });
                    }
                }

                // 🆕 顯示基本過濾條件
                console.log(`🟣 [ANGLE-${angleName}] 🔍 基本過濾條件:`, {
                    courtLevel,
                    caseType,
                    basicFiltersCount: basicFilters.length,
                    basicFilters: JSON.stringify(basicFilters, null, 2)
                });

                // 3. 結合立場過濾和基本過濾
                if (basicFilters.length > 0 || searchStrategy.filterQuery) {
                    const combinedQuery = {
                        bool: {
                            must: basicFilters // 基本條件必須滿足
                        }
                    };

                    // 如果有立場過濾，作為加分條件
                    if (searchStrategy.filterQuery) {
                        combinedQuery.bool.should = [searchStrategy.filterQuery];
                        combinedQuery.bool.boost = 2.0; // 立場匹配加分
                    }

                    searchQuery.query = combinedQuery;
                }

                const response = await esClient.search(searchQuery);

                const hits = response.hits?.hits || [];
                console.log(`[casePrecedentAnalysisService] 角度「${angleName}」返回 ${hits.length} 個結果`);

                // 🚨 調試：檢查 ES 響應結構
                console.log(`[casePrecedentAnalysisService] 🔍 ES 響應調試:`, {
                    total_hits: response.hits?.total?.value || 0,
                    max_score: response.hits?.max_score,
                    first_hit_score: hits[0]?._score,
                    has_knn_results: !!response.hits?.hits?.length,
                    response_took: response.took
                });

                // 🚨 調試：檢查搜尋結果的相關性
                // if (hits.length > 0) {
                //     console.log(`[casePrecedentAnalysisService] 🔍 角度「${angleName}」前3個結果:`, hits.slice(0, 3).map(hit => ({
                //         title: hit._source?.JTITLE?.substring(0, 50) + '...',
                //         score: hit._score,
                //         main_reasons_sample: hit._source?.main_reasons_ai?.slice(0, 2),
                //         has_text_embedding: !!hit._source?.text_embedding,
                //         text_embedding_length: hit._source?.text_embedding?.length
                //     })));
                // }

                // 篩選並標記來源角度
                const filteredResults = hits
                    .filter(hit => (hit._score || 0) >= minScore)
                    .map(hit => ({
                        id: hit._source?.JID || 'unknown',
                        title: hit._source?.JTITLE || '無標題',
                        verdictType: hit._source?.verdict_type || 'unknown',
                        court: hit._source?.court || '未知法院',
                        year: hit._source?.JYEAR || '未知年份',
                        similarity: hit._score || 0,
                        sourceAngle: angleName,
                        angleWeight: config.weight,
                        originalSimilarity: hit._score || 0,
                        positionAnalysis: hit._source?.position_based_analysis || null, // 🆕 立場分析資料
                        source: hit._source // 🆕 完整的 source 數據，包含 main_reasons_ai
                    }));

                return {
                    angleName,
                    config,
                    results: filteredResults,
                    success: true,
                    resultCount: filteredResults.length,
                    searchStrategy: position // 🆕 記錄使用的搜索策略
                };

            } catch (error) {
                console.error(`[casePrecedentAnalysisService] 角度「${angleName}」搜尋失敗:`, error);
                return {
                    angleName,
                    config,
                    results: [],
                    success: false,
                    error: error.message,
                    resultCount: 0,
                    searchStrategy: position
                };
            }
        });

        // 等待所有搜尋完成
        const searchResults = await Promise.all(searchPromises);

        // 統計成功的搜尋
        const successfulResults = searchResults.filter(r => r.success);
        const totalResults = successfulResults.reduce((sum, r) => sum + r.resultCount, 0);

        console.log(`[casePrecedentAnalysisService] 立場導向多角度搜尋完成: ${successfulResults.length}/${searchResults.length} 成功，共 ${totalResults} 個結果`);

        if (successfulResults.length === 0) {
            throw new Error('所有搜尋角度都失敗');
        }

        return searchResults;

    } catch (error) {
        console.error('[casePrecedentAnalysisService] 立場導向多角度搜尋失敗:', error);
        throw error;
    }
}

/**
 * 🆕 混合智能合併策略（第二階段：律師價值優化）
 */
function mergeMultiAngleResults(searchResults, userInput) {
    try {
        console.log(`[casePrecedentAnalysisService] 🧠 開始混合智能合併多角度搜尋結果`);

        const caseMap = new Map();
        let totalProcessed = 0;

        // 收集所有成功的搜尋結果
        searchResults.forEach(angleResult => {
            if (!angleResult.success) return;

            angleResult.results.forEach((caseItem, index) => {
                const caseId = caseItem.id;
                const positionScore = (25 - index) / 25; // 位置加分
                const weightedScore = caseItem.similarity * angleResult.config.weight * positionScore;

                totalProcessed++;

                if (!caseMap.has(caseId)) {
                    caseMap.set(caseId, {
                        case: caseItem,
                        appearances: 0,
                        sourceAngles: [],
                        angleScores: {},
                        totalScore: 0,
                        maxSimilarity: 0,
                        isIntersection: false,
                        // 🆕 律師價值評估
                        lawyerValue: {
                            relevanceScore: 0,
                            diversityBonus: 0,
                            practicalValue: 0
                        }
                    });
                }

                const existing = caseMap.get(caseId);
                existing.appearances++;
                existing.sourceAngles.push(angleResult.angleName);
                existing.angleScores[angleResult.angleName] = weightedScore;
                existing.totalScore += weightedScore;
                existing.maxSimilarity = Math.max(existing.maxSimilarity, caseItem.similarity);
                existing.isIntersection = existing.appearances >= 2;
            });
        });

        // 🆕 計算律師價值評分
        const casesWithValue = Array.from(caseMap.values()).map(item => {
            const lawyerValue = calculateLawyerValue(item, userInput);
            return {
                ...item,
                lawyerValue,
                finalScore: calculateFinalScore(item, lawyerValue)
            };
        });

        // 🆕 混合智能排序策略
        const sortedResults = casesWithValue.sort((a, b) => {
            // 1. 優先高價值案例（多角度命中 + 律師價值）
            if (a.isIntersection !== b.isIntersection) {
                return b.isIntersection - a.isIntersection;
            }

            // 2. 律師價值評分
            if (Math.abs(b.finalScore - a.finalScore) > 0.05) {
                return b.finalScore - a.finalScore;
            }

            // 3. 多角度出現次數
            if (b.appearances !== a.appearances) {
                return b.appearances - a.appearances;
            }

            // 4. 最高相似度
            return b.maxSimilarity - a.maxSimilarity;
        }).slice(0, 50);

        console.log(`[casePrecedentAnalysisService] 🎯 智能合併完成: 處理 ${totalProcessed} 個結果，優化後 ${sortedResults.length} 個`);
        console.log(`[casePrecedentAnalysisService] 📊 高價值案例: ${sortedResults.filter(r => r.isIntersection).length} 個多角度命中`);

        return sortedResults.map(item => ({
            id: item.case.id,
            title: item.case.title,
            verdictType: item.case.verdictType,
            court: item.case.court,
            year: item.case.year,
            similarity: item.maxSimilarity,
            // 🚨 修復：保留完整的 source 數據
            source: item.case.source, // 🆕 包含 main_reasons_ai 等完整數據
            positionAnalysis: item.case.positionAnalysis, // 🆕 立場分析數據
            // 🆕 增強的多角度分析數據
            multiAngleData: {
                appearances: item.appearances,
                sourceAngles: item.sourceAngles,
                totalScore: item.totalScore,
                isIntersection: item.isIntersection,
                angleScores: item.angleScores,
                // 🆕 律師價值數據
                lawyerValue: item.lawyerValue,
                finalScore: item.finalScore,
                recommendationReason: generateRecommendationReason(item)
            }
        }));

    } catch (error) {
        console.error('[casePrecedentAnalysisService] 結果合併失敗:', error);
        throw error;
    }
}

/**
 * 🆕 計算律師價值評分
 */
function calculateLawyerValue(caseItem, userInput) {
    // 1. 相關性評分（基於相似度和多角度命中）
    const relevanceScore = caseItem.maxSimilarity * (caseItem.isIntersection ? 1.2 : 1.0);

    // 2. 多樣性加分（不同角度發現的案例更有價值）
    const diversityBonus = Math.min(caseItem.appearances * 0.1, 0.3);

    // 3. 實務價值評分（基於判決類型和法院層級）
    let practicalValue = 0.5; // 基礎分

    // 勝訴案例加分
    if (caseItem.case.verdictType?.includes('勝訴') || caseItem.case.verdictType?.includes('准許')) {
        practicalValue += 0.2;
    }

    // 高等法院以上案例加分
    if (caseItem.case.court?.includes('高等') || caseItem.case.court?.includes('最高')) {
        practicalValue += 0.15;
    }

    // 近期案例加分
    const currentYear = new Date().getFullYear();
    const caseYear = parseInt(caseItem.case.year) || 0;
    if (currentYear - caseYear <= 3) {
        practicalValue += 0.1;
    }

    return {
        relevanceScore: Math.min(relevanceScore, 1.0),
        diversityBonus: diversityBonus,
        practicalValue: Math.min(practicalValue, 1.0)
    };
}

/**
 * 🆕 計算最終評分
 */
function calculateFinalScore(caseItem, lawyerValue) {
    const weights = {
        relevance: 0.5,    // 相關性權重 50%
        diversity: 0.2,    // 多樣性權重 20%
        practical: 0.3     // 實務價值權重 30%
    };

    return (
        lawyerValue.relevanceScore * weights.relevance +
        lawyerValue.diversityBonus * weights.diversity +
        lawyerValue.practicalValue * weights.practical
    );
}

/**
 * 🆕 生成推薦理由
 */
function generateRecommendationReason(caseItem) {
    const reasons = [];

    if (caseItem.isIntersection) {
        reasons.push(`多角度命中 (${caseItem.appearances}個角度發現)`);
    }

    if (caseItem.maxSimilarity >= 0.85) {
        reasons.push('高度相關');
    } else if (caseItem.maxSimilarity >= 0.75) {
        reasons.push('相關性良好');
    }

    if (caseItem.case.verdictType?.includes('勝訴')) {
        reasons.push('勝訴案例');
    }

    if (caseItem.case.court?.includes('高等') || caseItem.case.court?.includes('最高')) {
        reasons.push('高層級法院');
    }

    const currentYear = new Date().getFullYear();
    const caseYear = parseInt(caseItem.case.year) || 0;
    if (currentYear - caseYear <= 2) {
        reasons.push('近期案例');
    }

    if (caseItem.sourceAngles.length >= 3) {
        reasons.push('多維度匹配');
    }

    return reasons.length > 0 ? reasons.join('、') : '基礎相關';
}

/**
 * 🆕 生成智能推薦建議
 */
function generateSmartRecommendations(similarCases, coverageStats, verdictAnalysis, multiAngleResults, userInput) {
    try {
        console.log(`[casePrecedentAnalysisService] 🧠 生成智能推薦建議`);

        const recommendations = {
            topRecommendation: '',
            nextSteps: [],
            strategicInsights: [],
            riskWarnings: []
        };

        // 1. 基於多角度搜尋效果的推薦
        if (coverageStats.intersectionCases >= 5) {
            recommendations.topRecommendation = `發現 ${coverageStats.intersectionCases} 個高度相關案例，建議重點研究這些多角度命中的案例，它們最能代表您案件的核心特徵。`;
        } else if (coverageStats.intersectionCases >= 2) {
            recommendations.topRecommendation = `發現 ${coverageStats.intersectionCases} 個高度相關案例，建議深入分析這些案例的共同點和差異。`;
        } else {
            recommendations.topRecommendation = `多角度搜尋發現了不同面向的相關案例，建議從各個角度綜合分析以獲得全面視角。`;
        }

        // 2. 基於有利判決的策略建議
        const mainVerdict = verdictAnalysis.mainPattern.verdict;
        const mainPercentage = verdictAnalysis.mainPattern.percentage;

        if (mainPercentage >= 70) {
            if (mainVerdict.includes('勝訴') || mainVerdict.includes('准許')) {
                recommendations.nextSteps.push('主流判決結果有利，建議參考成功案例的論證策略');
                recommendations.nextSteps.push('重點分析勝訴案例的證據組織和法律適用方式');
            } else {
                recommendations.nextSteps.push('主流判決結果不利，建議尋找異常成功案例的突破點');
                recommendations.riskWarnings.push('需要特別注意常見的敗訴原因並提前準備應對策略');
            }
        } else if (mainPercentage >= 50) {
            recommendations.nextSteps.push('判決結果分歧較大，建議深入分析影響判決的關鍵因素');
            recommendations.nextSteps.push('準備多套論證策略以應對不同的審理重點');
        } else {
            recommendations.nextSteps.push('判決結果高度分歧，建議全面分析各種可能的判決路徑');
            recommendations.riskWarnings.push('案件結果不確定性較高，建議考慮和解等替代方案');
        }

        // 3. 基於搜尋角度效果的建議
        const mostEffectiveAngle = multiAngleResults
            .filter(r => r.success)
            .sort((a, b) => (b.resultCount || 0) - (a.resultCount || 0))[0];

        if (mostEffectiveAngle) {
            recommendations.strategicInsights.push(
                `「${mostEffectiveAngle.config.displayName}」角度發現最多相關案例，建議從此角度深化論證`
            );
        }

        // 4. 基於案例質量的建議
        const highValueCases = similarCases.filter(c =>
            c.multiAngleData?.isIntersection && c.multiAngleData?.finalScore > 0.7
        );

        if (highValueCases.length >= 3) {
            recommendations.nextSteps.push(`優先研究 ${highValueCases.length} 個高價值案例的判決理由和事實認定`);
        }

        // 5. 基於異常案例的風險提示
        if (verdictAnalysis.anomalies.length > 0) {
            recommendations.riskWarnings.push('發現異常判決模式，建議分析這些案例的特殊情況以避免類似風險');
        }

        // 6. 實務操作建議
        recommendations.nextSteps.push('建議使用「歸納主流判決」功能進一步分析成功要素');

        if (similarCases.length >= 30) {
            recommendations.nextSteps.push('樣本數量充足，分析結果具有統計意義');
        } else {
            recommendations.riskWarnings.push('樣本數量較少，建議擴大搜尋範圍或調整關鍵詞');
        }

        console.log(`[casePrecedentAnalysisService] 🎯 智能推薦生成完成:`, recommendations);
        return recommendations;

    } catch (error) {
        console.error('[casePrecedentAnalysisService] 智能推薦生成失敗:', error);
        return {
            topRecommendation: '建議深入分析發現的相關案例，重點關注判決理由和事實認定。',
            nextSteps: ['分析主流判決模式', '研究異常案例特點', '準備多元化論證策略'],
            strategicInsights: [],
            riskWarnings: []
        };
    }
}

/**
 * 執行 ES 向量搜索（保留原有函數作為備用）
 */
async function searchSimilarCases(caseDescription, courtLevel, caseType, threshold) {
    try {
        logMemoryUsage('Start-SearchSimilarCases');

        // 1. 生成查詢向量
        const queryVector = await generateEmbedding(caseDescription);
        logMemoryUsage('After-GenerateEmbedding');
        const minScore = getThresholdValue(threshold);

        // 2. 構建 ES KNN 查詢 - 平衡統計意義和性能穩定性
        const knnQuery = {
            field: "text_embedding",
            query_vector: queryVector,
            k: 50, // 增加到 50 個案例，提供更好的統計意義
            num_candidates: 100 // 適度增加候選數量
        };

        console.log(`[casePrecedentAnalysisService] 執行 KNN 向量搜索，k=${knnQuery.k}`);

        // 添加超時控制
        const searchPromise = esClient.search({
            index: ES_INDEX_NAME,
            knn: knnQuery,
            _source: [
                'JID', 'JTITLE', 'verdict_type', 'court', 'JYEAR',
                'summary_ai', // 🆕 案例摘要信息（必需用於案例列表顯示）
                'main_reasons_ai', // 🆕 勝負關鍵因素分析需要
                // 🚨 新增所有立場導向向量欄位和相關資料
                'position_based_analysis', // 🆕 包含所有立場分析欄位（plaintiff_perspective, defendant_perspective 等）
                'plaintiff_combined_vector',
                'defendant_combined_vector',
                'replicable_strategies_vector',
                'main_reasons_ai_vector',
                'text_embedding',
                'legal_issues_vector' // ✅ 修正: legal_issues_embedding → legal_issues_vector
            ],
            size: 50, // 與 k 保持一致
            timeout: '30s' // 設定 ES 查詢超時
        });

        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('ES 查詢超時 (30秒)')), 30000)
        );

        const response = await Promise.race([searchPromise, timeoutPromise]);
        logMemoryUsage('After-ES-Search');

        // 修正回應結構處理 - 參考 semanticSearchService.js 的成功模式
        const hits = response.hits?.hits || [];
        // console.log(`[casePrecedentAnalysisService] 搜索返回 ${hits.length} 個結果`);
        // console.log(`[casePrecedentAnalysisService] 完整回應結構:`, JSON.stringify(response, null, 2));

        // 3. 根據用戶設定的相似度閾值篩選結果
        const filteredHits = hits.filter(hit => {
            const similarity = hit._score || 0;
            return similarity >= minScore;
        });

        console.log(`[casePrecedentAnalysisService] 原始結果: ${hits.length} 個，篩選後: ${filteredHits.length} 個 (閾值: ${minScore})`);

        // 記錄前幾個案例的分數以便調試
        if (hits.length > 0) {
            console.log(`[casePrecedentAnalysisService] 前5個案例分數:`, hits.slice(0, 5).map(hit => ({
                title: hit._source?.JTITLE?.substring(0, 30) + '...',
                score: hit._score,
                percentage: Math.round((hit._score || 0) * 100) + '%'
            })));
        }

        return filteredHits.map(hit => ({
            id: hit._source?.JID || 'unknown',
            title: hit._source?.JTITLE || '無標題',
            summary: '', // 移除詳細摘要減少記憶體使用
            legalIssues: '', // 移除法律爭點減少記憶體使用
            verdictType: hit._source?.verdict_type || '未知',
            court: hit._source?.court || '未知法院',
            caseType: '', // 簡化案件類型
            year: hit._source?.JYEAR || '未知年份',
            similarity: (hit._score || 0), // KNN 查詢不需要減 1.0
            source: hit._source || {}
        }));
    } catch (error) {
        console.error('[casePrecedentAnalysisService] ES 搜索失敗:', error);
        console.error('[casePrecedentAnalysisService] KNN 查詢:', JSON.stringify(knnQuery, null, 2));
        throw new Error(`搜索相似案例時發生錯誤: ${error.message}`);
    }
}

/**
 * 🆕 分析勝負關鍵因素排名
 */
async function analyzeKeyFactors(cases, position = 'neutral') {
    console.log(`[casePrecedentAnalysisService] 開始分析勝負關鍵因素，立場: ${position}，案例數: ${cases.length}`);

    if (cases.length === 0) {
        return { winFactors: [], loseFactors: [], factorAnalysis: null };
    }

    // 🧪 臨時測試：如果沒有真實數據，返回測試數據
    console.log(`[analyzeKeyFactors] 🔍 檢查 ${cases.length} 個案例的 main_reasons_ai 數據...`);

    let realDataCount = 0;
    const hasRealData = cases.some((case_, index) => {
        const reasons1 = case_.judgmentNodeData?.main_reasons_ai;
        const reasons2 = case_.source?.main_reasons_ai;
        const reasons = reasons1 || reasons2;

        console.log(`[analyzeKeyFactors] 案例 ${index + 1}/${cases.length} (${case_.id}):`, {
            hasJudgmentNodeData: !!case_.judgmentNodeData,
            hasSource: !!case_.source,
            reasons1Type: typeof reasons1,
            reasons1IsArray: Array.isArray(reasons1),
            reasons1Length: reasons1?.length,
            reasons2Type: typeof reasons2,
            reasons2IsArray: Array.isArray(reasons2),
            reasons2Length: reasons2?.length,
            finalReasons: reasons,
            finalReasonsValid: reasons && Array.isArray(reasons) && reasons.length > 0
        });

        if (reasons && Array.isArray(reasons) && reasons.length > 0) {
            realDataCount++;
            return true;
        }
        return false;
    });

    console.log(`[analyzeKeyFactors] 🔍 檢查結果: ${realDataCount}/${cases.length} 個案例有有效的 main_reasons_ai 數據`);

    // 🔧 如果沒有完整數據，嘗試獲取完整的判決數據
    if (!hasRealData) {
        console.log(`[analyzeKeyFactors] 🔄 沒有找到 main_reasons_ai 數據，嘗試獲取完整判決數據...`);

        // 獲取前10個案例的完整數據進行分析（避免過多API調用）
        const sampleCases = cases.slice(0, 10);
        const casesWithFullData = [];

        for (const case_ of sampleCases) {
            try {
                const fullData = await getJudgmentNodeData(case_.id);
                if (fullData && fullData.main_reasons_ai && Array.isArray(fullData.main_reasons_ai) && fullData.main_reasons_ai.length > 0) {
                    casesWithFullData.push({
                        ...case_,
                        judgmentNodeData: fullData
                    });
                }
            } catch (error) {
                console.log(`[analyzeKeyFactors] 獲取案例 ${case_.id} 完整數據失敗:`, error.message);
            }
        }

        console.log(`[analyzeKeyFactors] 🔄 獲取完整數據結果: ${casesWithFullData.length}/${sampleCases.length} 個案例有 main_reasons_ai 數據`);

        if (casesWithFullData.length > 0) {
            // 使用獲取到的完整數據重新分析
            return await analyzeKeyFactorsWithFullData(casesWithFullData, position);
        }
    }

    if (!hasRealData) {
        console.log(`[casePrecedentAnalysisService] ⚠️ 相關判決資料不足，無法進行勝負關鍵因素統計分析`);
        return {
            dataStatus: 'insufficient',
            message: '相關判決資料不足，無法進行統計分析',
            suggestion: '建議：1) 擴大搜尋範圍 2) 調整搜尋關鍵詞 3) 降低相似度門檻',
            availableData: {
                caseCount: cases.length,
                dataCompleteness: `${realDataCount}/${cases.length}`,
                position: position
            },
            winFactors: [],
            loseFactors: [],
            factorAnalysis: null
        };
    }

    // 收集所有 main_reasons_ai 數據
    const allReasons = [];
    const winCases = [];
    const loseCases = [];

    cases.forEach(case_ => {
        // 🔧 修正數據路徑：main_reasons_ai 在 judgmentNodeData 中
        const reasons = case_.judgmentNodeData?.main_reasons_ai || case_.source?.main_reasons_ai || [];
        // 🔧 修正判決類型路徑：verdict_type 在 judgmentNodeData 中
        const verdict = case_.judgmentNodeData?.verdict_type || case_.verdictType || '';

        // 🧪 調試：檢查每個案例的 main_reasons_ai 數據
        console.log(`[analyzeKeyFactors] 案例 ${case_.id}: verdict=${verdict}, main_reasons_ai=`, reasons);
        console.log(`[analyzeKeyFactors] 🔍 數據路徑檢查: judgmentNodeData=`, !!case_.judgmentNodeData, 'source=', !!case_.source);

        // 🚨 改進：使用精細化的勝負分類邏輯
        const verdictAnalysis = analyzeVerdictOutcome(verdict, position);
        const isWinCase = verdictAnalysis.isWin;
        const isLoseCase = verdictAnalysis.isLose;
        const isPartialCase = verdictAnalysis.isPartial;

        const reasonArray = Array.isArray(reasons) ? reasons : (reasons ? [reasons] : []);
        reasonArray.forEach(reason => {
            if (reason && reason.trim()) {
                allReasons.push({
                    reason: reason.trim(),
                    isWin: isWinCase,
                    isLose: isLoseCase,
                    caseId: case_.id,
                    verdict: verdict
                });

                if (isWinCase) {
                    winCases.push({ ...case_, reasons: reasonArray });
                } else if (isLoseCase) {
                    loseCases.push({ ...case_, reasons: reasonArray });
                }
            }
        });
    });

    // 統計勝訴因素
    const winReasonStats = {};
    const loseReasonStats = {};

    allReasons.forEach(item => {
        if (item.isWin) {
            winReasonStats[item.reason] = (winReasonStats[item.reason] || 0) + 1;
        }
        if (item.isLose) {
            loseReasonStats[item.reason] = (loseReasonStats[item.reason] || 0) + 1;
        }
    });

    // 計算勝訴因素排名（出現在勝訴案例中的頻率）
    const winFactors = Object.entries(winReasonStats)
        .map(([reason, count]) => {
            const totalWinCases = winCases.length;
            const percentage = totalWinCases > 0 ? Math.round((count / totalWinCases) * 100) : 0;
            return {
                factor: reason,
                count,
                percentage,
                type: 'win',
                description: `${percentage}% 的勝訴案例具備此要素`
            };
        })
        .filter(item => item.count >= 2) // 至少出現2次
        .sort((a, b) => b.percentage - a.percentage)
        .slice(0, 5); // 取前5名

    // 計算敗訴因素排名（出現在敗訴案例中的頻率）
    const loseFactors = Object.entries(loseReasonStats)
        .map(([reason, count]) => {
            const totalLoseCases = loseCases.length;
            const percentage = totalLoseCases > 0 ? Math.round((count / totalLoseCases) * 100) : 0;
            return {
                factor: reason,
                count,
                percentage,
                type: 'lose',
                description: `${percentage}% 的敗訴案例存在此問題`
            };
        })
        .filter(item => item.count >= 2) // 至少出現2次
        .sort((a, b) => b.percentage - a.percentage)
        .slice(0, 5); // 取前5名

    const factorAnalysis = {
        totalCases: cases.length,
        winCases: winCases.length,
        loseCases: loseCases.length,
        position: position,
        winRate: cases.length > 0 ? Math.round((winCases.length / cases.length) * 100) : 0
    };

    console.log(`[casePrecedentAnalysisService] 勝負因素分析完成，勝訴因素: ${winFactors.length} 個，敗訴因素: ${loseFactors.length} 個`);

    return {
        winFactors,
        loseFactors,
        factorAnalysis
    };
}

/**
 * 分析判決結果分布並檢測異常
 */
function analyzeVerdictDistribution(cases) {
    const verdictStats = {};
    const totalCases = cases.length;
    
    // 統計各種判決結果
    cases.forEach(case_ => {
        const verdict = case_.verdictType || '未知';
        verdictStats[verdict] = (verdictStats[verdict] || 0) + 1;
    });
    
    // 計算百分比並識別異常
    const distribution = Object.entries(verdictStats).map(([verdict, count]) => ({
        verdict,
        count,
        percentage: Math.round((count / totalCases) * 100)
    })).sort((a, b) => b.count - a.count);
    
    // 找出主流模式（最常見的結果）
    const mainPattern = distribution[0];
    
    // 找出異常模式（低於 10% 的結果）
    const anomalies = distribution.filter(item => item.percentage < 10 && item.count > 0);
    
    return {
        totalCases,
        distribution,
        mainPattern,
        anomalies
    };
}

/**
 * 🆕 使用完整數據分析勝負關鍵因素
 */
async function analyzeKeyFactorsWithFullData(casesWithFullData, position = 'neutral') {
    console.log(`[analyzeKeyFactorsWithFullData] 開始分析 ${casesWithFullData.length} 個有完整數據的案例，立場: ${position}`);

    // 收集所有 main_reasons_ai 數據
    const allReasons = [];
    const winCases = [];
    const loseCases = [];

    casesWithFullData.forEach(case_ => {
        // 🚨 修復：使用多重數據源獲取 main_reasons_ai
        const reasons = case_.judgmentNodeData?.main_reasons_ai || case_.source?.main_reasons_ai || [];
        const verdict = case_.judgmentNodeData?.verdict_type || case_.verdictType || '';

        console.log(`[analyzeKeyFactorsWithFullData] 案例 ${case_.id}: verdict=${verdict}, main_reasons_ai=`, reasons);
        console.log(`[analyzeKeyFactorsWithFullData] 🔍 數據來源檢查:`, {
            hasJudgmentNodeData: !!case_.judgmentNodeData,
            hasSource: !!case_.source,
            judgmentNodeData_main_reasons: case_.judgmentNodeData?.main_reasons_ai,
            source_main_reasons: case_.source?.main_reasons_ai
        });

        // 🚨 改進：使用精細化的勝負分類邏輯
        const verdictAnalysis = analyzeVerdictOutcome(verdict, position);
        const isWinCase = verdictAnalysis.isWin;
        const isLoseCase = verdictAnalysis.isLose;
        const isPartialCase = verdictAnalysis.isPartial;

        const reasonArray = Array.isArray(reasons) ? reasons : (reasons ? [reasons] : []);
        reasonArray.forEach(reason => {
            if (reason && reason.trim()) {
                allReasons.push({
                    reason: reason.trim(),
                    isWin: isWinCase,
                    isLose: isLoseCase,
                    verdict: verdict,
                    caseId: case_.id
                });

                if (isWinCase) {
                    winCases.push({ caseId: case_.id, reason: reason.trim(), verdict });
                }
                if (isLoseCase) {
                    loseCases.push({ caseId: case_.id, reason: reason.trim(), verdict });
                }
            }
        });
    });

    console.log(`[analyzeKeyFactorsWithFullData] 收集到 ${allReasons.length} 個理由，勝訴案例: ${winCases.length}，敗訴案例: ${loseCases.length}`);

    // 🆕 語義合併相似理由
    const mergedWinFactors = winCases.length > 0 ? await mergeSemanticReasons(winCases.map(c => c.reason), 'win') : {};
    const mergedLoseFactors = loseCases.length > 0 ? await mergeSemanticReasons(loseCases.map(c => c.reason), 'lose') : {};

    console.log(`[analyzeKeyFactorsWithFullData] 語義合併完成，勝訴因素: ${Object.keys(mergedWinFactors).length} 類，敗訴因素: ${Object.keys(mergedLoseFactors).length} 類`);

    // 統計合併後的勝訴關鍵因素
    const winFactorCounts = {};
    winCases.forEach(item => {
        // 找到這個理由被合併到哪個類別
        const mergedCategory = findMergedCategory(item.reason, mergedWinFactors);
        const categoryName = mergedCategory || item.reason; // 如果沒找到合併類別，使用原理由
        winFactorCounts[categoryName] = (winFactorCounts[categoryName] || 0) + 1;
    });

    // 統計合併後的敗訴風險因素
    const loseFactorCounts = {};
    loseCases.forEach(item => {
        // 找到這個理由被合併到哪個類別
        const mergedCategory = findMergedCategory(item.reason, mergedLoseFactors);
        const categoryName = mergedCategory || item.reason; // 如果沒找到合併類別，使用原理由
        loseFactorCounts[categoryName] = (loseFactorCounts[categoryName] || 0) + 1;
    });

    // 轉換為排序後的數組
    const winFactors = Object.entries(winFactorCounts)
        .map(([factor, count]) => ({
            factor,
            count,
            percentage: Math.round((count / winCases.length) * 100),
            type: 'win',
            description: `${Math.round((count / winCases.length) * 100)}% 的勝訴案例具備此要素`
        }))
        .sort((a, b) => b.count - a.count);

    const loseFactors = Object.entries(loseFactorCounts)
        .map(([factor, count]) => ({
            factor,
            count,
            percentage: Math.round((count / loseCases.length) * 100),
            type: 'lose',
            description: `${Math.round((count / loseCases.length) * 100)}% 的敗訴案例存在此問題`
        }))
        .sort((a, b) => b.count - a.count);

    // 🆕 計算原始關鍵字統計（未合併）
    const originalWinFactorCounts = {};
    winCases.forEach(item => {
        originalWinFactorCounts[item.reason] = (originalWinFactorCounts[item.reason] || 0) + 1;
    });

    const originalLoseFactorCounts = {};
    loseCases.forEach(item => {
        originalLoseFactorCounts[item.reason] = (originalLoseFactorCounts[item.reason] || 0) + 1;
    });

    // 轉換為排序後的原始關鍵字數組
    const originalWinFactors = Object.entries(originalWinFactorCounts)
        .map(([factor, count]) => ({
            factor,
            count,
            percentage: Math.round((count / winCases.length) * 100),
            type: 'win',
            description: `${count} 個案例提及此要素`
        }))
        .sort((a, b) => b.count - a.count);

    const originalLoseFactors = Object.entries(originalLoseFactorCounts)
        .map(([factor, count]) => ({
            factor,
            count,
            percentage: Math.round((count / loseCases.length) * 100),
            type: 'lose',
            description: `${count} 個案例存在此問題`
        }))
        .sort((a, b) => b.count - a.count);

    const result = {
        // 🆕 統整後的排名（AI合併）
        winFactors: winFactors.slice(0, 5),
        loseFactors: loseFactors.slice(0, 5),

        // 🆕 原始關鍵字列表
        originalWinFactors: originalWinFactors.slice(0, 10), // 顯示更多原始關鍵字
        originalLoseFactors: originalLoseFactors.slice(0, 10),

        factorAnalysis: {
            totalCases: casesWithFullData.length,
            winCases: winCases.length,
            loseCases: loseCases.length,
            position: position,
            winRate: winCases.length > 0 ? Math.round((winCases.length / (winCases.length + loseCases.length)) * 100) : 0,
            dataSource: 'real_data',
            // 🆕 語義合併信息
            semanticMerging: {
                originalWinReasons: winCases.length,
                mergedWinCategories: Object.keys(mergedWinFactors).length,
                originalLoseReasons: loseCases.length,
                mergedLoseCategories: Object.keys(mergedLoseFactors).length,
                mergedWinFactors: mergedWinFactors,
                mergedLoseFactors: mergedLoseFactors
            }
        }
    };

    console.log(`[analyzeKeyFactorsWithFullData] 分析完成，勝訴因素: ${result.winFactors.length} 個，敗訴因素: ${result.loseFactors.length} 個`);
    return result;
}

/**
 * 🆕 精細化判決結果分析 - 善用結構化 verdict_type
 */
function analyzeVerdictOutcome(verdict, position) {
    // 🎯 基於結構化的 verdict_type 進行精確分類
    const result = {
        isWin: false,
        isLose: false,
        isPartial: false,
        winRate: 0, // 勝訴程度 0-100%
        category: 'unknown'
    };

    // 🔍 民事案件的精細分類
    if (verdict === '原告勝訴') {
        result.category = 'full_win';
        result.winRate = 100;
        if (position === 'plaintiff') {
            result.isWin = true;
        } else if (position === 'defendant') {
            result.isLose = true;
        }
    } else if (verdict === '原告敗訴') {
        result.category = 'full_lose';
        result.winRate = 0;
        if (position === 'plaintiff') {
            result.isLose = true;
        } else if (position === 'defendant') {
            result.isWin = true;
        }
    } else if (verdict === '部分勝訴部分敗訴') {
        // 🎯 最有參考價值的判決類型！
        result.category = 'partial_win';
        result.isPartial = true;
        result.winRate = 50; // 可以後續根據具體內容調整

        // 部分勝訴對雙方都有參考價值
        if (position === 'plaintiff') {
            result.isWin = true; // 原告視角：部分勝訴仍算成功
        } else if (position === 'defendant') {
            result.isWin = true; // 被告視角：避免完全敗訴也算成功
        }
    } else if (verdict === '上訴駁回') {
        // 需要根據上訴方判斷
        result.category = 'appeal_rejected';
        result.winRate = 0; // 上訴方敗訴
        // 這裡可以根據具體情況進一步分析
        result.isLose = true;
    } else if (verdict === '和解成立') {
        result.category = 'settlement';
        result.isPartial = true;
        result.winRate = 50; // 和解通常是雙方妥協
    } else if (verdict.includes('駁回')) {
        result.category = 'rejected';
        result.winRate = 0;
        if (position === 'plaintiff') {
            result.isLose = true;
        } else if (position === 'defendant') {
            result.isWin = true;
        }
    }

    return result;
}

/**
 * 🆕 使用 GPT-4o mini 合併語義相似的理由
 */
async function mergeSemanticReasons(reasons, type = 'win') {
    if (reasons.length === 0) return {};

    try {
        console.log(`[mergeSemanticReasons] 開始合併 ${reasons.length} 個${type === 'win' ? '勝訴' : '敗訴'}理由`);

        const prompt = `請將以下法律判決理由按照語義相似性進行分類合併。

理由列表：
${reasons.map((reason, index) => `${index + 1}. ${reason}`).join('\n')}

請按照以下規則分類：
1. 將語義相似的理由歸為同一類
2. 為每一類選擇一個簡潔明確的類別名稱，最多不超過8字
3. 類別名稱應該是法律專業術語，便於律師理解
4. 請避免使用籠統概念如「侵權問題」「法律問題」，若可能請具體指出**法律爭點**或**法律效果**
5. 如果某個理由很獨特，可以單獨成類
6. 所有文字請使用繁體中文

請以純JSON格式回應，不要包含任何markdown標記或說明文字：
{
  "類別名稱1": ["理由1", "理由2"],
  "類別名稱2": ["理由3"],
  ...
}

錯誤示範：
{
  "侵權問題": ["原告請求駁回"]
}

正確示範：
{
  "時效抗辯": ["請求已逾時效"],
  "舉證不足": ["原告無法證明損害"],
  "因果關係不成立": ["事故與傷害無直接關聯"]
}

重要：只返回JSON對象，不要添加任何其他文字或格式標記。`;

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: '你是專業的法律分析助手，擅長將相似的法律理由進行分類整理，並提供給資深律師高度判斷價值。'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.1,
            max_tokens: 1000
        });

        // 🔧 處理 GPT 可能返回的 markdown 格式
        let responseContent = response.choices[0].message.content.trim();

        // 移除可能的 markdown 代碼塊標記
        if (responseContent.startsWith('```json')) {
            responseContent = responseContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (responseContent.startsWith('```')) {
            responseContent = responseContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        console.log(`[mergeSemanticReasons] 🔧 清理後的響應:`, responseContent.substring(0, 200) + '...');

        const mergedReasons = JSON.parse(responseContent);
        console.log(`[mergeSemanticReasons] 合併完成，${reasons.length} 個理由合併為 ${Object.keys(mergedReasons).length} 類`);
        console.log(`[mergeSemanticReasons] 合併結果:`, mergedReasons);

        return mergedReasons;

    } catch (error) {
        console.error(`[mergeSemanticReasons] 語義合併失敗:`, error);
        // 如果合併失敗，返回原始理由（每個理由單獨成類）
        const fallbackResult = {};
        reasons.forEach(reason => {
            fallbackResult[reason] = [reason];
        });
        return fallbackResult;
    }
}

/**
 * 🆕 找到理由對應的合併類別
 */
function findMergedCategory(reason, mergedFactors) {
    for (const [category, reasonList] of Object.entries(mergedFactors)) {
        if (reasonList.includes(reason)) {
            return category;
        }
    }
    return null;
}

/**
 * 使用 AI 分析異常案例的關鍵差異
 */
async function analyzeAnomalies(mainCases, anomalyCases, caseDescription) {
    if (anomalyCases.length === 0) {
        return null;
    }
    
    try {
        const prompt = `你是一位資深的法律分析師。請分析以下案例數據，找出異常判決結果的關鍵差異因素。

用戶案件描述：
${caseDescription}

主流判決案例（${mainCases.length}件）：
${mainCases.slice(0, 3).map((c, i) => `${i+1}. ${c.summary?.substring(0, 200)}...`).join('\n')}

異常判決案例（${anomalyCases.length}件）：
${anomalyCases.map((c, i) => `${i+1}. 判決：${c.verdictType} - ${c.summary?.substring(0, 200)}...`).join('\n')}

請分析並回答：
1. 異常案例與主流案例的關鍵差異是什麼？
2. 這些差異因素對判決結果有什麼影響？
3. 對於類似的案件，律師應該注意哪些風險或機會？

請以 JSON 格式回應：
{
  "keyDifferences": ["差異1", "差異2", "差異3"],
  "riskFactors": ["風險因素1", "風險因素2"],
  "opportunities": ["機會點1", "機會點2"],
  "strategicInsights": "整體策略建議"
}`;

        const response = await openai.chat.completions.create({
            model: ANALYSIS_MODEL,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            response_format: { type: "json_object" }
        });
        
        return JSON.parse(response.choices[0].message.content);
    } catch (error) {
        console.error('[casePrecedentAnalysisService] AI 異常分析失敗:', error);
        return null;
    }
}

/**
 * (背景執行) 真正的分析函式
 */
async function executeAnalysisInBackground(taskId, analysisData, userId) {
    const db = admin.firestore();
    const taskRef = db.collection('aiAnalysisTasks').doc(taskId);

    try {
        logMemoryUsage('Start-Analysis');
        console.log(`🟢 [ANALYSIS-START] ===== 開始執行多角度案件有利判決分析 =====`);
        console.log(`🟢 [ANALYSIS-START] 任務ID: ${taskId}`);
        console.log(`🟢 [ANALYSIS-START] 用戶ID: ${userId}`);
        console.log(`🟢 [ANALYSIS-START] 分析參數:`, {
            caseType: analysisData.caseType,
            courtLevel: analysisData.courtLevel,
            threshold: analysisData.threshold,
            position: analysisData.position
        });

        // 🆕 1. AI事由補足與分析
        console.log(`🟢 [CHECKPOINT-1] 開始 AI 事由補足`);
        const enrichment = await enrichCaseDescription(analysisData.caseDescription);
        console.log(`🟢 [CHECKPOINT-1] ✅ 事由補足完成:`, enrichment);

        // 🆕 2. 生成四角度搜尋策略
        console.log(`🟢 [CHECKPOINT-2] 開始生成搜尋角度`);
        const searchAngles = generateSearchAngles(analysisData.caseDescription, enrichment);
        console.log(`🟢 [CHECKPOINT-2] ✅ 生成搜尋角度:`, Object.keys(searchAngles));
        console.log(`🟢 [CHECKPOINT-2] 搜尋角度詳情:`, searchAngles);

        // 🆕 3. 執行立場導向的多角度並行搜尋
        console.log(`🟢 [CHECKPOINT-3] 開始執行多角度並行搜尋`);
        console.log(`🟢 [CHECKPOINT-3] 搜尋參數:`, {
            courtLevel: analysisData.courtLevel,
            caseType: analysisData.caseType,
            threshold: analysisData.threshold,
            position: analysisData.position || 'neutral'
        });

        const multiAngleResults = await performMultiAngleSearch(
            searchAngles,
            analysisData.courtLevel,
            analysisData.caseType,
            analysisData.threshold,
            analysisData.position || 'neutral' // 🆕 新增立場參數
        );
        console.log(`🟢 [CHECKPOINT-3] ✅ 多角度搜尋完成，結果數量:`, multiAngleResults.length);

        // 🆕 4. 智能合併結果（傳入用戶輸入用於價值評估）
        console.log(`🟢 [CHECKPOINT-4] 開始智能合併結果`);
        const similarCases = mergeMultiAngleResults(multiAngleResults, analysisData.caseDescription);
        console.log(`🟢 [CHECKPOINT-4] ✅ 合併完成，最終案例數量: ${similarCases.length}`);

        if (similarCases.length === 0) {
            console.error(`🔴 [ANALYSIS-ERROR] 未找到符合條件的相似案例`);
            throw new Error('未找到符合條件的相似案例');
        }

        console.log(`🟢 [CHECKPOINT-5] 🎯 多角度搜尋完成，找到 ${similarCases.length} 個相似案例`);

        // 統計多角度搜尋效果
        const intersectionCases = similarCases.filter(c => c.multiAngleData?.isIntersection);
        const coverageStats = {
            totalCases: similarCases.length,
            intersectionCases: intersectionCases.length,
            coverageImprovement: intersectionCases.length > 0 ? Math.round((intersectionCases.length / similarCases.length) * 100) : 0
        };
        console.log(`[casePrecedentAnalysisService] 📊 搜尋效果統計:`, coverageStats);

        // 檢查案例數量是否少於期望值，提供透明的提醒
        let sampleSizeNote = '';
        if (similarCases.length < 50) {
            sampleSizeNote = `\n📋 樣本數量說明：資料庫中共找到 ${similarCases.length} 個相似案例（期望50個）`;
            if (similarCases.length < 30) {
                sampleSizeNote += '\n⚠️ 樣本數量較少，統計結果僅供參考，建議擴大搜索範圍或調整關鍵詞';
            } else {
                sampleSizeNote += '\n✅ 樣本數量足夠進行統計分析';
            }
            console.log(`[casePrecedentAnalysisService] ${sampleSizeNote.replace(/\n/g, ' ')}`);
        }

        // 2. 分析判決分布
        console.log('[casePrecedentAnalysisService] 案例樣本數據:', similarCases.slice(0, 3).map(c => ({
            id: c.id,
            verdictType: c.verdictType,
            title: c.title
        })));

        const verdictAnalysis = analyzeVerdictDistribution(similarCases);
        logMemoryUsage('After-VerdictAnalysis');
        console.log(`[casePrecedentAnalysisService] 判決分布分析完成，主流模式: ${verdictAnalysis.mainPattern?.verdict}`);
        console.log(`[casePrecedentAnalysisService] 異常模式:`, verdictAnalysis.anomalies);

        // 🆕 2.5. 分析勝負關鍵因素排名
        let keyFactorsAnalysis = null;
        try {
            console.log(`[casePrecedentAnalysisService] 🎯 開始勝負因素分析，立場: ${analysisData.position || 'neutral'}`);
            keyFactorsAnalysis = await analyzeKeyFactors(similarCases, analysisData.position || 'neutral');
            console.log(`[casePrecedentAnalysisService] 勝負因素分析完成，勝訴因素: ${keyFactorsAnalysis.winFactors.length} 個，敗訴因素: ${keyFactorsAnalysis.loseFactors.length} 個`);
            console.log(`[casePrecedentAnalysisService] 🧪 勝訴因素詳情:`, keyFactorsAnalysis.winFactors);
            console.log(`[casePrecedentAnalysisService] 🧪 敗訴因素詳情:`, keyFactorsAnalysis.loseFactors);
        } catch (error) {
            console.error(`[casePrecedentAnalysisService] ❌ 勝負因素分析失敗:`, error);
            keyFactorsAnalysis = null;
        }

        // 3. 分析異常案例 - 暫時跳過 AI 分析避免超時
        let anomalyAnalysis = null;
        let anomalyDetails = {};
        if (verdictAnalysis.anomalies.length > 0) {
            // 簡化的異常分析，不調用 OpenAI
            anomalyAnalysis = {
                keyDifferences: ["案件事實差異", "法律適用差異", "舉證程度差異"],
                riskFactors: ["證據不足風險", "法律適用風險"],
                opportunities: ["完整舉證機會", "法律論述機會"],
                strategicInsights: `發現 ${verdictAnalysis.anomalies.length} 種異常判決模式，建議深入分析差異因素。`
            };

            // 🚨 生成詳細的異常案例數據（將在案例池中處理）
            anomalyDetails = {}; // 暫時為空，將在案例池中生成
            console.log('[casePrecedentAnalysisService] 生成的異常詳情:', JSON.stringify(anomalyDetails, null, 2));

            // 如果沒有生成到詳細數據，創建測試數據
            if (Object.keys(anomalyDetails).length === 0 && verdictAnalysis.anomalies.length > 0) {
                console.log('[casePrecedentAnalysisService] 創建測試異常詳情數據');
                anomalyDetails = createTestAnomalyDetails(verdictAnalysis.anomalies);
            }
        }
        
        // 🆕 5. 生成智能推薦建議
        const smartRecommendations = generateSmartRecommendations(
            similarCases,
            coverageStats,
            verdictAnalysis,
            multiAngleResults,
            analysisData.caseDescription
        );

        // 🆕 6. 準備增強的多角度分析結果
        const summaryText = `🎯 多角度案件有利判決分析完成！

📊 分析了 ${similarCases.length} 個相似案例
🔍 多角度搜尋效果：${coverageStats.intersectionCases} 個高度相關案例 (${coverageStats.coverageImprovement}% 覆蓋提升)
🎯 主流判決模式：${verdictAnalysis.mainPattern.verdict} (${verdictAnalysis.mainPattern.percentage}%)
${verdictAnalysis.anomalies.length > 0 ?
`⚠️ 發現 ${verdictAnalysis.anomalies.length} 種異常模式：${verdictAnalysis.anomalies.map(a => `${a.verdict} (${a.percentage}%)`).join(', ')}` :
'✅ 未發現顯著異常模式'}

${anomalyAnalysis ? `💡 關鍵洞察：${anomalyAnalysis.strategicInsights}` : ''}${sampleSizeNote}

🔍 搜尋角度分析：
${Object.entries(searchAngles).map(([name, config]) => {
    const angleResults = multiAngleResults.find(r => r.angleName === name);
    return `• ${config.displayName}：「${config.query}」(${angleResults?.resultCount || 0}筆)`;
}).join('\n')}

🎯 智能推薦：
${smartRecommendations.topRecommendation}

📋 下一步建議：
${smartRecommendations.nextSteps.map(step => `• ${step}`).join('\n')}`;

        const result = {
            // 保持與 summarizeCommonPointsService 一致的格式
            report: {
                summaryText,
                citations: {} // 案件有利判決分析不需要引用
            },
            analyzedCount: similarCases.length,

            // 🆕 增強的案件有利判決分析數據
            casePrecedentData: {
                analysisType: 'multi_angle_favorable_judgment_analysis', // 🆕 標記為多角度有利判決分析
                totalSimilarCases: similarCases.length,
                expectedSampleSize: 50,
                sampleSizeAdequate: similarCases.length >= 30,
                sampleSizeNote: sampleSizeNote.replace(/\n/g, ' ').trim(),

                // 🆕 多角度搜尋數據
                multiAngleData: {
                    searchAngles: searchAngles,
                    angleResults: multiAngleResults.map(r => ({
                        angleName: r.angleName,
                        query: r.config.query,
                        resultCount: r.resultCount,
                        success: r.success,
                        displayName: r.config.displayName,
                        searchStrategy: r.searchStrategy // 🆕 記錄搜索策略
                    })),
                    coverageStats: coverageStats,
                    intersectionCases: intersectionCases.length,
                    totalProcessedResults: multiAngleResults.reduce((sum, r) => sum + (r.resultCount || 0), 0),
                    // 🆕 智能推薦數據
                    smartRecommendations: smartRecommendations
                },

                // 🆕 立場導向分析數據
                positionBasedAnalysis: {
                    selectedPosition: analysisData.position || 'neutral',
                    positionStats: generatePositionStats(similarCases, analysisData.position || 'neutral'),
                    strategicInsights: generateStrategicInsights(similarCases, analysisData.position || 'neutral', verdictAnalysis)
                },

                verdictDistribution: verdictAnalysis.distribution,
                mainPattern: verdictAnalysis.mainPattern,
                anomalies: verdictAnalysis.anomalies,
                anomalyAnalysis,
                anomalyDetails,

                // 🆕 勝負關鍵因素排名分析
                keyFactorsAnalysis: keyFactorsAnalysis,

                // 🆕 增強的代表性案例（包含完整摘要信息，從5筆增加到20筆，包含AI摘要和關鍵理由）
                representativeCases: similarCases.slice(0, 20).map(c => ({
                    id: c.id,
                    title: c.title,
                    verdictType: c.verdictType,
                    court: c.court,
                    year: c.year,
                    similarity: Math.round(c.similarity * 100),

                    // 🆕 增強摘要信息（不包含向量和JFULL）
                    summary_ai: c.source?.summary_ai || `${c.court || '未知法院'} ${c.year || '未知年份'}年判決，判決結果：${c.verdictType || '未知'}`,
                    main_reasons_ai: Array.isArray(c.source?.main_reasons_ai)
                        ? c.source.main_reasons_ai
                        : (c.source?.main_reasons_ai ? [c.source.main_reasons_ai] : []),

                    // 🆕 完整案例基本信息
                    JTITLE: c.source?.JTITLE || c.title || '無標題',
                    JYEAR: c.source?.JYEAR || c.year || '未知年份',
                    JID: c.source?.JID || c.id || '無ID',
                    verdict_type: c.source?.verdict_type || c.verdictType || '未知判決',

                    // 🆕 多角度發現信息（過濾 undefined 值）
                    ...(c.multiAngleData && (
                        c.multiAngleData.appearances !== undefined ||
                        c.multiAngleData.sourceAngles !== undefined ||
                        c.multiAngleData.isIntersection !== undefined ||
                        c.multiAngleData.totalScore !== undefined
                    ) ? {
                        multiAngleInfo: {
                            ...(c.multiAngleData.appearances !== undefined && { appearances: c.multiAngleData.appearances }),
                            ...(c.multiAngleData.sourceAngles !== undefined && { sourceAngles: c.multiAngleData.sourceAngles }),
                            ...(c.multiAngleData.isIntersection !== undefined && { isIntersection: c.multiAngleData.isIntersection }),
                            ...(c.multiAngleData.totalScore !== undefined && { totalScore: Math.round(c.multiAngleData.totalScore * 100) })
                        }
                    } : {}),

                    // 🆕 完整立場分析數據（包含 strategic_value）
                    ...(c.positionAnalysis ? {
                        position_based_analysis: c.positionAnalysis
                    } : {})
                })),
                analysisParams: analysisData,

                // 🚨 增強：案例池（包含基本摘要信息，避免 Firestore 大小限制）
                casePool: {
                    allCases: similarCases.map(case_ => ({
                        id: case_.id,
                        title: case_.title,
                        verdictType: case_.verdictType,
                        court: case_.court,
                        year: case_.year,
                        similarity: case_.similarity,

                        // 🆕 增加基本摘要信息（不包含向量和JFULL）
                        summary_ai: case_.source?.summary_ai || `${case_.court || '未知法院'} ${case_.year || '未知年份'}年判決`,
                        main_reasons_ai: Array.isArray(case_.source?.main_reasons_ai)
                            ? case_.source.main_reasons_ai.slice(0, 3) // 限制最多3個理由，控制大小
                            : (case_.source?.main_reasons_ai ? [case_.source.main_reasons_ai] : []),

                        // 🆕 完整案例標識信息
                        JID: case_.source?.JID || case_.id || '無ID',
                        JTITLE: case_.source?.JTITLE || case_.title || '無標題',

                        // 🚨 保留引用信息
                        hasFullData: !!case_.source,

                        // 🆕 完整立場分析數據（包含 strategic_value）
                        ...(case_.positionAnalysis ? {
                            position_based_analysis: case_.positionAnalysis
                        } : {}),
                        ...(case_.multiAngleData ? {
                            multiAngleData: {
                                ...(case_.multiAngleData.isIntersection !== undefined && { isIntersection: case_.multiAngleData.isIntersection }),
                                ...(case_.multiAngleData.appearances !== undefined && { appearances: case_.multiAngleData.appearances }),
                                ...(case_.multiAngleData.sourceAngles !== undefined && { sourceAngles: case_.multiAngleData.sourceAngles })
                            }
                        } : {})
                    })),
                    caseIds: similarCases.map(c => c.id).filter(id => id !== undefined),
                    mainPattern: {
                        verdict: verdictAnalysis.mainPattern.verdict || '',
                        percentage: verdictAnalysis.mainPattern.percentage || 0,
                        cases: similarCases
                            .filter(c => c.verdictType === verdictAnalysis.mainPattern.verdict && c.id)
                            .map(c => c.id)
                    },
                    anomalies: verdictAnalysis.anomalies.map(anomaly => ({
                        verdict: anomaly.verdict || '',
                        count: anomaly.count || 0,
                        percentage: anomaly.percentage || 0,
                        cases: similarCases
                            .filter(c => c.verdictType === anomaly.verdict && c.id)
                            .map(c => c.id)
                    })),
                    searchMetadata: {
                        courtLevel: analysisData.courtLevel,
                        caseType: analysisData.caseType,
                        threshold: analysisData.threshold,
                        position: analysisData.position || 'neutral',
                        timestamp: new Date().toISOString(),
                        totalCases: similarCases.length,
                        searchAngles: Object.keys(searchAngles)
                    }
                }
            }
        };

        // 🚨 生成異常案例詳情（基於案例池）
        result.casePrecedentData.anomalyDetails = await generateAnomalyDetailsFromPool(
            verdictAnalysis.anomalies,
            result.casePrecedentData.casePool
        );
        
        // 5. 更新任務狀態為完成
        await taskRef.update({
            status: 'complete',
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            result
        });
        
        console.log(`[casePrecedentAnalysisService] 分析完成，任務ID: ${taskId}`);
        
    } catch (error) {
        console.error(`[casePrecedentAnalysisService] 背景執行失敗，任務ID: ${taskId}`, error);
        
        // 更新任務狀態為失敗
        await taskRef.update({
            status: 'failed',
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            error: error.message || '案件有利判決分析時發生未知錯誤'
        });
    }
}

/**
 * (入口函式) 啟動案件有利判決分析任務
 */
export async function startCasePrecedentAnalysis(analysisData, userId) {
    if (!analysisData.caseDescription || !analysisData.caseDescription.trim()) {
        const error = new Error('案件描述為必填欄位');
        error.statusCode = 400;
        throw error;
    }
    
    const db = admin.firestore();
    const taskRef = db.collection('aiAnalysisTasks').doc();
    const taskId = taskRef.id;
    
    const taskData = {
        userId,
        taskId,
        analysisType: 'favorable_judgment_analysis',
        analysisData,
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    await taskRef.set(taskData);
    console.log(`[casePrecedentAnalysisService] 任務 ${taskId} 已為用戶 ${userId} 創建`);
    
    // **非同步執行**，不等待其完成
    executeAnalysisInBackground(taskId, analysisData, userId);
    
    return { taskId };
}

/**
 * 獲取判決書node所需的完整數據
 */
async function getJudgmentNodeData(caseId) {
    try {
        const response = await esClient.get({
            index: ES_INDEX_NAME, // 使用正確的索引名稱
            id: caseId,
            _source: [
                'JID', 'JTITLE', 'court', 'verdict_type',
                'summary_ai', 'main_reasons_ai',
                'legal_issues', 'citations',
                // 🚨 新增所有立場導向向量欄位和相關資料
                'position_based_analysis', // 🆕 包含所有立場分析欄位
                'plaintiff_combined_vector',
                'defendant_combined_vector',
                'replicable_strategies_vector',
                'main_reasons_ai_vector',
                'text_embedding',
                'legal_issues_vector' // ✅ 修正: legal_issues_embedding → legal_issues_vector
            ]
        });

        console.log(`[getJudgmentNodeData] 成功獲取案例 ${caseId} 數據:`, {
            JID: response._source.JID,
            JTITLE: response._source.JTITLE,
            summary_ai_type: typeof response._source.summary_ai,
            summary_ai_isArray: Array.isArray(response._source.summary_ai),
            summary_ai_value: response._source.summary_ai,
            main_reasons_ai_type: typeof response._source.main_reasons_ai,
            main_reasons_ai_isArray: Array.isArray(response._source.main_reasons_ai)
        });

        return response._source;
    } catch (error) {
        console.error(`[getJudgmentNodeData] 獲取案例 ${caseId} 詳細數據失敗:`, error);
        return null;
    }
}

/**
 * 🚨 從案例池生成詳細的異常案例數據
 */
async function generateAnomalyDetailsFromPool(anomalies, casePool) {
    console.log('[generateAnomalyDetailsFromPool] 開始從案例池生成異常詳情');
    console.log('[generateAnomalyDetailsFromPool] 異常類型:', anomalies.map(a => a.verdict));

    const anomalyDetails = {};

    for (const anomaly of anomalies) {
        console.log(`[generateAnomalyDetailsFromPool] 處理異常類型: ${anomaly.verdict}`);

        // 從案例池中找到異常案例的 ID
        const anomalyCaseIds = casePool.anomalies
            .find(a => a.verdict === anomaly.verdict)?.cases || [];

        // 從案例池中獲取異常案例的完整數據
        const anomalyCases = casePool.allCases.filter(case_ =>
            anomalyCaseIds.includes(case_.id)
        );

        console.log(`[generateAnomalyDetailsFromPool] 找到 ${anomalyCases.length} 個 ${anomaly.verdict} 案例`);

        if (anomalyCases.length > 0) {
            // 為每個異常案例生成詳細信息
            const detailedCases = await Promise.all(
                anomalyCases.slice(0, 5).map(async (case_, index) => {
                    console.log(`[generateAnomalyDetailsFromPool] 正在處理案例 ${case_.id}`);

                    // 🚨 修復：從 ES 獲取完整數據（因為案例池已精簡）
                    let judgmentData = null;
                    try {
                        judgmentData = await getJudgmentNodeData(case_.id);
                    } catch (error) {
                        console.warn(`[generateAnomalyDetailsFromPool] 無法獲取案例 ${case_.id} 的完整數據:`, error.message);
                    }

                    return {
                        id: case_.id,
                        title: case_.title || '無標題',
                        court: case_.court || '未知法院',
                        year: case_.year || '未知年份',
                        similarity: case_.similarity || 0,
                        summary: `${case_.court || '未知法院'} ${case_.year || '未知年份'}年判決，判決結果：${case_.verdictType}`,
                        // 🚨 精簡判決數據，避免大型陣列
                        judgmentSummary: judgmentData ? {
                            JID: judgmentData.JID || case_.id,
                            JTITLE: judgmentData.JTITLE || case_.title,
                            court: judgmentData.court || case_.court,
                            verdict_type: judgmentData.verdict_type || case_.verdictType,
                            summary: Array.isArray(judgmentData.summary_ai) ?
                                    judgmentData.summary_ai.join(' ') :
                                    (judgmentData.summary_ai || '案例摘要暫無'),
                            hasFullData: true
                        } : {
                            JID: case_.id,
                            JTITLE: case_.title,
                            court: case_.court,
                            verdict_type: case_.verdictType,
                            summary: `${case_.title} - ${case_.court} ${case_.year}年判決`,
                            hasFullData: false
                        },
                        keyDifferences: [
                            "與主流案例在事實認定上存在差異",
                            "法律適用或解釋角度不同",
                            "證據評價標準可能有所不同"
                        ],
                        riskFactors: [
                            { factor: "事實認定風險", level: "medium" },
                            { factor: "法律適用風險", level: "medium" },
                            { factor: "證據充分性", level: "high" }
                        ]
                    };
                })
            );

            anomalyDetails[anomaly.verdict] = detailedCases;
        } else {
            console.log(`[generateAnomalyDetailsFromPool] 警告: 案例池中沒有找到 ${anomaly.verdict} 類型的案例`);
        }
    }

    console.log('[generateAnomalyDetailsFromPool] 生成完成，異常詳情鍵:', Object.keys(anomalyDetails));
    return anomalyDetails;
}

/**
 * 生成詳細的異常案例數據 (已棄用)
 */
async function generateAnomalyDetails(anomalies, allCases) {
    console.log('[generateAnomalyDetails] 開始生成異常詳情');
    console.log('[generateAnomalyDetails] 異常類型:', anomalies.map(a => a.verdict));
    console.log('[generateAnomalyDetails] 總案例數:', allCases.length);
    console.log('[generateAnomalyDetails] 案例判決類型樣本:', allCases.slice(0, 3).map(c => c.verdictType));

    const anomalyDetails = {};

    for (const anomaly of anomalies) {
        console.log(`[generateAnomalyDetails] 處理異常類型: ${anomaly.verdict}`);

        // 找到屬於這個異常類型的案例
        const anomalyCases = allCases.filter(case_ => case_.verdictType === anomaly.verdict);
        console.log(`[generateAnomalyDetails] 找到 ${anomalyCases.length} 個 ${anomaly.verdict} 案例`);

        if (anomalyCases.length > 0) {
            // 為每個異常案例生成詳細信息，包括判決書node數據
            const detailedCases = await Promise.all(
                anomalyCases.slice(0, 5).map(async (case_) => {
                    // 獲取完整的判決書數據
                    console.log(`[generateAnomalyDetails] 正在獲取案例 ${case_.id} 的完整數據`);
                    const fullJudgmentData = await getJudgmentNodeData(case_.id);
                    console.log(`[generateAnomalyDetails] 案例 ${case_.id} 數據獲取結果:`, fullJudgmentData ? '成功' : '失敗');

                    return {
                        // 基本信息（用於列表顯示）
                        id: case_.id,
                        title: case_.title || '無標題',
                        court: case_.court || '未知法院',
                        year: case_.year || '未知年份',
                        similarity: case_.similarity || 0,
                        summary: `${case_.court} ${case_.year}年判決，判決結果：${case_.verdictType}`,

                        // 判決書node完整數據（用於創建node和hover預覽）
                        judgmentNodeData: fullJudgmentData ? {
                            JID: fullJudgmentData.JID || case_.id,
                            JTITLE: fullJudgmentData.JTITLE || case_.title,
                            court: fullJudgmentData.court || case_.court,
                            verdict_type: fullJudgmentData.verdict_type || case_.verdictType,
                            // summary_ai 是 text 類型，直接使用字符串
                            summary_ai: fullJudgmentData.summary_ai || '無 AI 摘要',
                            // main_reasons_ai 是 keyword 類型，可能是數組
                            main_reasons_ai: Array.isArray(fullJudgmentData.main_reasons_ai)
                                ? fullJudgmentData.main_reasons_ai
                                : (fullJudgmentData.main_reasons_ai ? [fullJudgmentData.main_reasons_ai] : []),
                            // legal_issues 是 nested 類型，應該是對象數組
                            legal_issues: Array.isArray(fullJudgmentData.legal_issues)
                                ? fullJudgmentData.legal_issues
                                : [],
                            // citations 是 keyword 類型，可能是數組
                            citations: Array.isArray(fullJudgmentData.citations)
                                ? fullJudgmentData.citations
                                : (fullJudgmentData.citations ? [fullJudgmentData.citations] : [])
                        } : {
                            // 備用數據，如果無法獲取完整數據
                            JID: case_.id,
                            JTITLE: case_.title,
                            court: case_.court,
                            verdict_type: case_.verdictType,
                            summary_ai: '無 AI 摘要',
                            main_reasons_ai: [],
                            legal_issues: [],
                            citations: []
                        },

                        // 分析數據
                        keyDifferences: [
                            "與主流案例在事實認定上存在差異",
                            "法律適用或解釋角度不同",
                            "證據評價標準可能有所不同"
                        ],
                        riskFactors: [
                            { factor: "事實認定風險", level: "medium" },
                            { factor: "法律適用風險", level: "medium" },
                            { factor: "證據充分性", level: "high" }
                        ]
                    };
                })
            );

            anomalyDetails[anomaly.verdict] = detailedCases;
        } else {
            console.log(`[generateAnomalyDetails] 警告: 沒有找到 ${anomaly.verdict} 類型的案例`);
        }
    }

    console.log('[generateAnomalyDetails] 生成完成，異常詳情鍵:', Object.keys(anomalyDetails));
    return anomalyDetails;
}

/**
 * 創建測試異常詳情數據（當實際數據不可用時）
 */
function createTestAnomalyDetails(anomalies) {
    const testDetails = {};

    for (const anomaly of anomalies) {
        testDetails[anomaly.verdict] = [
            {
                id: `test_${anomaly.verdict}_1`,
                title: `${anomaly.verdict}案例 A`,
                court: '台北地方法院',
                year: '2023',
                similarity: 0.75,
                summary: `台北地方法院 2023年判決，判決結果：${anomaly.verdict}`,
                keyDifferences: [
                    "證據認定標準與主流案例不同",
                    "法律條文解釋角度存在差異",
                    "事實認定的重點有所偏移"
                ],
                riskFactors: [
                    { factor: "證據充分性風險", level: "high" },
                    { factor: "法律適用風險", level: "medium" },
                    { factor: "事實認定風險", level: "medium" }
                ]
            },
            {
                id: `test_${anomaly.verdict}_2`,
                title: `${anomaly.verdict}案例 B`,
                court: '新北地方法院',
                year: '2022',
                similarity: 0.68,
                summary: `新北地方法院 2022年判決，判決結果：${anomaly.verdict}`,
                keyDifferences: [
                    "當事人舉證策略不同",
                    "法官對爭點的理解有差異",
                    "適用法條的選擇不同"
                ],
                riskFactors: [
                    { factor: "舉證策略風險", level: "high" },
                    { factor: "爭點理解風險", level: "medium" },
                    { factor: "法條適用風險", level: "low" }
                ]
            }
        ];
    }

    return testDetails;
}

/**
 * 🚨 從案例池中獲取主流判決案例的詳細數據
 */
async function getMainstreamCasesFromPool(casePool, mainVerdictType) {
    try {
        console.log(`[getMainstreamCasesFromPool] 從案例池獲取主流判決案例: ${mainVerdictType}`);

        // 1. 從案例池中篩選主流判決案例
        const mainCaseIds = casePool.mainPattern.cases;
        const mainCases = casePool.allCases.filter(case_ =>
            mainCaseIds.includes(case_.id) && case_.verdictType === mainVerdictType
        );

        console.log(`[getMainstreamCasesFromPool] 找到 ${mainCases.length} 個主流案例`);

        // 2. 獲取完整的判決數據（如果需要 summary_ai_full）
        const mainStreamCases = [];
        for (let i = 0; i < Math.min(mainCases.length, 10); i++) {
            const case_ = mainCases[i];

            // 🚨 修復：從 ES 獲取完整數據（因為案例池已精簡）
            try {
                const judgmentData = await getJudgmentNodeData(case_.id);
                mainStreamCases.push({
                    id: case_.id,
                    title: case_.title,
                    court: case_.court,
                    year: case_.year,
                    verdictType: case_.verdictType,
                    similarity: case_.similarity,
                    summaryAiFull: judgmentData.summary_ai_full ||
                                  (Array.isArray(judgmentData.summary_ai) ?
                                   judgmentData.summary_ai.join(' ') :
                                   judgmentData.summary_ai || ''),
                    positionAnalysis: case_.positionAnalysis,
                    citationIndex: i + 1
                });
            } catch (error) {
                console.warn(`[getMainstreamCasesFromPool] 無法獲取案例 ${case_.id} 的完整數據:`, error.message);
                // 即使獲取失敗，也添加基本信息
                mainStreamCases.push({
                    id: case_.id,
                    title: case_.title,
                    court: case_.court,
                    year: case_.year,
                    verdictType: case_.verdictType,
                    similarity: case_.similarity,
                    summaryAiFull: `${case_.title} - ${case_.court} ${case_.year}年判決`,
                    positionAnalysis: case_.positionAnalysis,
                    citationIndex: i + 1
                });
            }
        }

        console.log(`[getMainstreamCasesFromPool] 成功獲取 ${mainStreamCases.length} 個主流案例的完整數據`);
        return mainStreamCases;

    } catch (error) {
        console.error('[getMainstreamCasesFromPool] 獲取主流案例失敗:', error);
        throw error;
    }
}

/**
 * 🆕 獲取主流判決案例的詳細數據（包含 summary_ai_full）- 使用立場導向搜索 (已棄用)
 */
async function getMainstreamCasesWithSummary(caseDescription, courtLevel, caseType, threshold, mainVerdictType, position = 'neutral') {
    try {
        console.log(`[getMainstreamCasesWithSummary] 開始獲取主流判決案例: ${mainVerdictType}，立場: ${position}`);

        // 🆕 1. 使用與初始搜索相同的立場導向策略
        const queryVector = await generateEmbedding(caseDescription);
        const minScore = getThresholdValue(threshold);
        const searchStrategy = getPositionBasedSearchStrategy(position, caseType); // ✅ 傳入 caseType

        const knnQuery = {
            field: searchStrategy.primaryVectorField,
            query_vector: queryVector,
            k: 50,
            num_candidates: 100
        };

        // 🆕 構建包含立場過濾的查詢
        const searchQuery = {
            index: ES_INDEX_NAME,
            knn: knnQuery,
            _source: [
                'JID', 'JTITLE', 'verdict_type', 'court', 'JYEAR', 'summary_ai_full',
                'main_reasons_ai', // 🆕 勝負關鍵因素分析需要
                'position_based_analysis', // 🆕 新增立場分析資料（包含所有立場分析欄位）
                // 🚨 新增所有立場導向向量欄位和相關資料
                'plaintiff_combined_vector',
                'defendant_combined_vector',
                'replicable_strategies_vector',
                'main_reasons_ai_vector',
                'text_embedding',
                'legal_issues_vector' // ✅ 修正: legal_issues_embedding → legal_issues_vector
            ],
            size: 50,
            timeout: '30s'
        };

        // 🆕 如果有立場過濾條件，添加到查詢中
        if (searchStrategy.filterQuery) {
            searchQuery.query = searchStrategy.filterQuery;
        }

        const response = await esClient.search(searchQuery);

        const hits = response.hits?.hits || [];

        // 2. 篩選出主流判決類型且符合相似度閾值的案例
        const mainStreamCases = hits
            .filter(hit => {
                const similarity = hit._score || 0;
                const verdictType = hit._source?.verdict_type || '';
                return similarity >= minScore && verdictType === mainVerdictType;
            })
            .slice(0, 10) // 取前10名
            .map((hit, index) => ({
                id: hit._source?.JID || 'unknown',
                title: hit._source?.JTITLE || '無標題',
                court: hit._source?.court || '未知法院',
                year: hit._source?.JYEAR || '未知年份',
                verdictType: hit._source?.verdict_type || '未知',
                similarity: hit._score || 0,
                summaryAiFull: hit._source?.summary_ai_full || '',
                positionAnalysis: hit._source?.position_based_analysis || null, // 🆕 添加立場分析資料
                citationIndex: index + 1 // 用於引用編號 [1], [2], ...
            }));

        console.log(`[getMainstreamCasesWithSummary] 找到 ${mainStreamCases.length} 個主流判決案例`);
        return mainStreamCases;

    } catch (error) {
        console.error('[getMainstreamCasesWithSummary] 獲取主流案例失敗:', error);
        throw error;
    }
}

/**
 * 🆕 根據立場生成專業的分析提示詞
 */
function getPositionPrompt(position, caseDescription, mainPattern, caseSummaries) {
    const baseInfo = `**用戶案件描述：**
${caseDescription}

**主流判決模式：** ${mainPattern.verdict} (${mainPattern.count}件，${mainPattern.percentage}%)

🎯 **重要說明：以下案例來自智慧洞察分析的同一案例池，確保分析一致性**

**主流判決案例（來自智慧洞察案例池）：**
${caseSummaries}`;

    const commonRequirements = `
**重要要求：**
- 每個分析點都必須引用具體的判決書，使用格式 [數字]
- 引用要精準，確保引用的判決書確實支持該論點
- 分析要深入，不只是表面描述
- 提供可操作的策略建議`;

    switch (position) {
        case 'plaintiff':
            return `你是資深原告律師，擁有豐富的訴訟經驗。請從原告方角度分析以下案例，重點關注如何為原告爭取最佳結果。

${baseInfo}

請從原告律師的專業角度進行分析：

1. **原告勝訴關鍵要素**：分析這些案例中原告成功的共同因素和制勝要點
2. **有效攻擊策略**：原告律師使用的成功攻擊策略和論證模式
3. **關鍵舉證要點**：原告需要重點準備的證據類型和舉證策略
4. **常見敗訴陷阱**：原告方應該避免的錯誤和風險點
5. **可複製的勝訴模式**：適用於用戶案件的具體攻擊策略建議

**分析重點**：如何幫助原告最大化勝訴機會，提供實戰可用的策略指導
${commonRequirements}

請以JSON格式回應：
{
  "summaryText": "原告方主流判決分析摘要...",
  "plaintiffSuccessFactors": ["原告勝訴要素1 [1][3]", "原告勝訴要素2 [2][5]", ...],
  "attackStrategies": ["攻擊策略1 [2][5]", "攻擊策略2 [3][7]", ...],
  "evidenceRequirements": ["舉證要點1 [1][2]", "舉證要點2 [4][6]", ...],
  "commonPitfalls": ["常見陷阱1 [4][6]", "常見陷阱2 [7][9]", ...],
  "replicableStrategies": ["可複製策略1 [2][6]", "可複製策略2 [3][8]", ...],
  "citations": {
    "1": "判決書標題1 (法院 年份)",
    "2": "判決書標題2 (法院 年份)",
    ...
  }
}`;

        case 'defendant':
            return `你是資深被告律師，擁有豐富的抗辯經驗。請從被告方角度分析以下案例，重點關注如何為被告建立有效防禦。

${baseInfo}

請從被告律師的專業角度進行分析：

1. **被告成功防禦要素**：分析這些案例中被告抗辯成功的共同因素和關鍵要點
2. **有效防禦策略**：被告律師使用的成功防禦策略和抗辯模式
3. **原告方弱點識別**：原告常見的攻擊漏洞、舉證不足和策略缺陷
4. **關鍵抗辯要點**：被告需要重點準備的抗辯理由和防禦證據
5. **可複製的防禦模式**：適用於用戶案件的具體防禦策略建議

**分析重點**：如何幫助被告最大化勝訴或減損機會，提供實戰可用的防禦指導
${commonRequirements}

請以JSON格式回應：
{
  "summaryText": "被告方主流判決分析摘要...",
  "defenseSuccessFactors": ["防禦成功要素1 [1][3]", "防禦成功要素2 [2][5]", ...],
  "defenseStrategies": ["防禦策略1 [2][5]", "防禦策略2 [3][7]", ...],
  "plaintiffWeaknesses": ["原告弱點1 [1][2]", "原告弱點2 [4][6]", ...],
  "counterargumentPoints": ["抗辯要點1 [4][6]", "抗辯要點2 [7][9]", ...],
  "replicableDefenses": ["可複製防禦1 [2][6]", "可複製防禦2 [3][8]", ...],
  "citations": {
    "1": "判決書標題1 (法院 年份)",
    "2": "判決書標題2 (法院 年份)",
    ...
  }
}`;

        default: // 'neutral'
            return `你是資深法律分析師。請客觀分析以下案例的判決模式，提供中性的專業見解。

${baseInfo}

請進行客觀的專業分析：

1. **判決關鍵要素**：分析影響判決結果的主要因素和決定性要點
2. **法院重視的證據類型**：識別法院在判決中特別重視的證據種類
3. **常見論證邏輯**：歸納法院在類似案件中的推理模式和判決邏輯
4. **判決理由共同點**：提取判決書中反覆出現的理由和法律見解
5. **策略建議**：基於主流模式為用戶案件提供中性的專業建議

**分析重點**：提供客觀、平衡的法律分析，幫助理解判決規律
${commonRequirements}

請以JSON格式回應：
{
  "summaryText": "主流判決分析摘要...",
  "keySuccessFactors": ["關鍵要素1 [1][3]", "關鍵要素2 [2][5]", ...],
  "evidenceTypes": ["證據類型1 [1][2]", "證據類型2 [4][6]", ...],
  "reasoningPatterns": ["推理模式1 [2][7]", "推理模式2 [3][8]", ...],
  "commonReasons": ["共同理由1 [1][4]", "共同理由2 [5][9]", ...],
  "strategicRecommendations": ["建議1 [2][6]", "建議2 [3][7]", ...],
  "citations": {
    "1": "判決書標題1 (法院 年份)",
    "2": "判決書標題2 (法院 年份)",
    ...
  }
}`;
    }
}

/**
 * 🆕 準備包含立場分析的案例摘要
 */
function prepareEnrichedCaseSummaries(mainStreamCases, position) {
    return mainStreamCases.map((case_, index) => {
        let summary = `[${index + 1}] ${case_.title} (${case_.court} ${case_.year}年)\n${case_.summaryAiFull}`;

        // 🆕 如果有立場分析資料，加入相關資訊
        if (case_.positionAnalysis && position !== 'neutral') {
            const positionKey = position === 'plaintiff' ? 'plaintiff_perspective' : 'defendant_perspective';
            const positionData = case_.positionAnalysis[positionKey];

            if (positionData) {
                summary += `\n\n📊 ${position === 'plaintiff' ? '原告方' : '被告方'}立場分析：`;

                if (positionData.overall_result) {
                    summary += `\n• 結果評估：${positionData.overall_result}`;
                }

                if (positionData.case_value) {
                    summary += `\n• 案例價值：${positionData.case_value}`;
                }

                if (positionData.replicable_strategies) {
                    summary += `\n• 可複製策略：${positionData.replicable_strategies}`;
                }

                if (positionData.key_lessons) {
                    summary += `\n• 關鍵教訓：${positionData.key_lessons}`;
                }

                if (position === 'plaintiff' && positionData.successful_elements) {
                    summary += `\n• 成功要素：${positionData.successful_elements}`;
                } else if (position === 'defendant' && positionData.successful_elements) {
                    summary += `\n• 防禦成功要素：${positionData.successful_elements}`;
                }

                if (positionData.critical_failures) {
                    summary += `\n• 關鍵失敗點：${positionData.critical_failures}`;
                }
            }
        }

        return summary;
    }).join('\n\n');
}

/**
 * 🆕 使用 AI 分析主流判決模式 - 立場導向版本
 */
async function analyzeMainstreamPattern(caseDescription, mainStreamCases, mainPattern, position = 'neutral') {
    try {
        console.log(`[analyzeMainstreamPattern] 開始分析主流判決模式，立場: ${position}`);

        // 🆕 準備包含立場分析的案例摘要文本
        const caseSummaries = prepareEnrichedCaseSummaries(mainStreamCases, position);

        // 🆕 使用立場導向的提示詞
        const prompt = getPositionPrompt(position, caseDescription, mainPattern, caseSummaries);

        const response = await openai.chat.completions.create({
            model: ANALYSIS_MODEL,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            response_format: { type: "json_object" }
        });

        const analysisResult = JSON.parse(response.choices[0].message.content);

        // 確保引用格式正確
        const citations = {};
        mainStreamCases.forEach((case_, index) => {
            citations[index + 1] = `${case_.title} (${case_.court} ${case_.year}年)`;
        });

        analysisResult.citations = citations;

        // 🆕 添加立場信息到結果中
        analysisResult.position = position;
        analysisResult.analysisType = position === 'plaintiff' ? '原告方分析' :
                                     position === 'defendant' ? '被告方分析' : '中性分析';

        console.log(`[analyzeMainstreamPattern] 主流判決分析完成，立場: ${position}`);
        return analysisResult;

    } catch (error) {
        console.error('[analyzeMainstreamPattern] AI分析失敗:', error);
        throw error;
    }
}

/**
 * 歸納主流判決分析
 * @param {string} taskId - 原始案件有利判決分析的任務ID
 * @param {string} userId - 用戶ID
 * @returns {Promise<{taskId: string}>} 新的分析任務ID
 */
export async function startMainstreamAnalysis(originalTaskId, userId) {
    const db = admin.firestore();

    // 1. 獲取原始分析結果
    const originalTaskRef = db.collection('aiAnalysisTasks').doc(originalTaskId);
    const originalTaskDoc = await originalTaskRef.get();

    if (!originalTaskDoc.exists) {
        throw new Error('找不到原始分析任務');
    }

    const originalResult = originalTaskDoc.data().result;
    if (!originalResult?.casePrecedentData) {
        throw new Error('原始分析結果格式不正確');
    }

    // 2. 創建新的分析任務
    const taskRef = db.collection('aiAnalysisTasks').doc();
    const taskId = taskRef.id;

    const taskData = {
        userId,
        taskId,
        originalTaskId,
        type: 'mainstream_analysis',
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await taskRef.set(taskData);
    console.log(`[casePrecedentAnalysisService] 主流判決分析任務 ${taskId} 已創建`);

    // 3. 非同步執行分析
    executeMainstreamAnalysisInBackground(taskId, originalResult, userId);

    return { taskId };
}

/**
 * (背景執行) 主流判決分析函式
 */
async function executeMainstreamAnalysisInBackground(taskId, originalResult, userId) {
    const db = admin.firestore();
    const taskRef = db.collection('aiAnalysisTasks').doc(taskId);

    try {
        console.log(`[casePrecedentAnalysisService] 開始執行主流判決分析，任務ID: ${taskId}`);

        const casePrecedentData = originalResult.casePrecedentData;
        const mainPattern = casePrecedentData.mainPattern;
        const analysisParams = casePrecedentData.analysisParams;

        // 檢查是否有足夠的主流案例
        if (!mainPattern || mainPattern.count < 5) {
            throw new Error('主流判決案例數量不足，無法進行分析');
        }

        // 🚨 4. 從案例池中獲取主流判決案例（不重新搜尋）
        const { casePool } = casePrecedentData;
        console.log(`[casePrecedentAnalysisService] 🎯 使用案例池中的主流案例: ${casePool.mainPattern.cases.length} 個`);

        const mainStreamCases = await getMainstreamCasesFromPool(casePool, mainPattern.verdict);

        if (mainStreamCases.length < 3) {
            throw new Error(`案例池中主流判決案例數量不足: ${mainStreamCases.length} 個`);
        }

        // 5. 使用 AI 分析主流判決模式 - 🆕 傳遞立場參數
        const analysisResult = await analyzeMainstreamPattern(
            analysisParams.caseDescription,
            mainStreamCases,
            mainPattern,
            analysisParams.position || 'neutral' // 🆕 傳遞立場參數
        );

        // 6. 更新任務狀態為完成
        await taskRef.update({
            status: 'complete',
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            result: {
                report: analysisResult,
                analyzedCount: mainStreamCases.length,
                mainPattern: mainPattern,
                originalCaseDescription: analysisParams.caseDescription
            }
        });

        console.log(`[casePrecedentAnalysisService] 主流判決分析完成，任務ID: ${taskId}`);

    } catch (error) {
        console.error(`[casePrecedentAnalysisService] 主流判決分析失敗，任務ID: ${taskId}`, error);

        await taskRef.update({
            status: 'error',
            error: error.message,
            completedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }
}
