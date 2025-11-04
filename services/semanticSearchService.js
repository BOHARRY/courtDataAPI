// services/semanticSearchService.js
import esClient from '../config/elasticsearch.js';
import { OpenAI } from 'openai';
import { OPENAI_API_KEY, OPENAI_MODEL_NAME_EMBEDDING } from '../config/environment.js';
import { kmeans } from 'ml-kmeans';
import logger from '../utils/logger.js';

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

const ES_INDEX_NAME = 'search-boooook';
const EMBEDDING_MODEL = OPENAI_MODEL_NAME_EMBEDDING || 'text-embedding-3-large';

/**
 * 使用 GPT-4o-mini 優化用戶的查詢
 */
async function enhanceQuery(userQuery, caseType, userId = null) {
    const startTime = Date.now();

    try {
        logger.info(`🤖 GPT 優化查詢: "${userQuery.substring(0, 30)}${userQuery.length > 30 ? '...' : ''}"`, {
            event: 'semantic_query_enhancement',
            operation: 'semantic_query_enhancement',
            status: 'started',
            userId,
            userQuery,
            queryLength: userQuery.length,
            caseType
        });

        const prompt = `你是台灣法律搜尋助手。請將以下${caseType}案件的法律問題擴充為更精準的搜尋查詢，用於搜尋相關的判決書案例。

**重要：請務必使用繁體中文回應，不可使用簡體中文。**

用戶問題：「${userQuery}」

請提供：
1. 3-5個核心法律概念關鍵字（例如 "修繕義務", "不完全給付", "瑕疵擔保"）。請避免使用 "民法", "刑法" 等籠統的法典名稱。
2. 可能相關的具體法條（例如 "民法第429條"）。
3. 一句擴充後的精準語意描述（限30字內，用於向量搜尋）。

**注意：所有回應內容必須使用繁體中文。**

請確保回應是有效的 JSON 格式：
{
  "keywords": ["關鍵字1", "關鍵字2"],
  "laws": ["民法第xxx條"],
  "enhanced": "擴充後的精準描述"
}`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.2,
            max_tokens: 200,
            response_format: { type: "json_object" }
        });

        const enhanced = JSON.parse(response.choices[0].message.content);
        const duration = Date.now() - startTime;

        logger.info(`✨ GPT 優化完成: ${enhanced.keywords?.length || 0}個關鍵字`, {
            event: 'semantic_query_enhancement',
            operation: 'semantic_query_enhancement',
            status: 'completed',
            userId,
            userQuery,
            enhanced: enhanced.enhanced,
            keywordCount: enhanced.keywords?.length || 0,
            lawCount: enhanced.laws?.length || 0,
            keywordsJson: JSON.stringify(enhanced.keywords || []),
            lawsJson: JSON.stringify(enhanced.laws || []),
            duration
        });

        return enhanced;

    } catch (error) {
        const duration = Date.now() - startTime;

        logger.error(`❌ GPT 優化失敗: ${error.message}`, {
            event: 'semantic_query_enhancement',
            operation: 'semantic_query_enhancement',
            status: 'failed',
            userId,
            userQuery,
            caseType,
            duration,
            error: error.message,
            stack: error.stack
        });

        throw new Error(`查詢優化失敗: ${error.message}`);
    }
}

/**
 * 從 AI 獲取多個分類的名稱
 */
async function getClusterNamesFromAI(representativeIssues, userQuery, caseType) {
    try {
        const issuesText = representativeIssues.map((issue, index) => `${index + 1}. ${issue.question}`).join('\n');
        const prompt = `你是台灣法律搜尋助手。使用者查詢了關於「${userQuery}」的${caseType}問題。
以下是從搜尋結果中自動分出的 ${representativeIssues.length} 個爭點群組的代表性問題：
---
${issuesText}
---
請為這 ${representativeIssues.length} 個群組，各生成一個最精煉、最準確的分類名稱（限 10 字內）。
請嚴格按照以下 JSON 格式回應，key 是從 "0" 到 "${representativeIssues.length - 1}" 的字串：
{
  "0": "分類名稱一",
  "1": "分類名稱二"
}`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.5,
            max_tokens: 500,
            response_format: { type: "json_object" }
        });

        const clusterNames = JSON.parse(response.choices[0].message.content);
        console.log(`[SemanticSearch] AI 命名分類結果:`, clusterNames);
        return clusterNames;

    } catch (error) {
        console.error('[SemanticSearch] AI 命名分類失敗:', error);
        // 如果失敗，返回預設名稱
        const fallbackNames = {};
        for (let i = 0; i < representativeIssues.length; i++) {
            fallbackNames[i] = `爭點類別 ${i + 1}`;
        }
        return fallbackNames;
    }
}


/**
 * 獲取文本的向量表示
 */
async function getEmbedding(text) {
    try {
        console.log(`[SemanticSearch] 正在獲取向量 (${text.length} 字)`);
        
        const response = await openai.embeddings.create({
            model: EMBEDDING_MODEL,
            input: text.trim(),
            dimensions: 1536,
        });

        if (response.data?.[0]?.embedding) {
            const embedding = response.data[0].embedding;
            console.log(`[SemanticSearch] 成功獲取向量 (維度: ${embedding.length})`);
            return embedding;
        } else {
            throw new Error('向量化回應格式錯誤');
        }
        
    } catch (error) {
        console.error('[SemanticSearch] 向量化失敗:', error);
        throw new Error(`向量化失敗: ${error.message}`);
    }
}

/**
 * 構建混合查詢
 */
function buildHybridQuery(queryVector, enhancedData, caseType, filters = {}) {
    // 案件類型篩選
    let caseTypeFilter;
    if (caseType === "民事") {
        caseTypeFilter = {
            bool: {
                should: [
                    { prefix: { "case_type": "民事" } },
                    { prefix: { "case_type": "家事" } }
                ],
                minimum_should_match: 1
            }
        };
    } else if (caseType === "刑事") {
        caseTypeFilter = { prefix: { "case_type": "刑事" } };
    } else if (caseType === "行政") {
        caseTypeFilter = {
            bool: {
                should: [
                    { wildcard: { "case_type": "*行政*" } },
                    { wildcard: { "case_type": "*訴願*" } }
                ],
                minimum_should_match: 1
            }
        };
    }

    // 建立篩選條件
    const filterClauses = [caseTypeFilter];
    
    // 加入其他篩選條件
    if (filters.court?.length > 0) {
        filterClauses.push({ terms: { "court.exact": filters.court } });
    }
    
    if (filters.dateRange?.start) {
        filterClauses.push({
            range: { "JDATE": { gte: filters.dateRange.start } }
        });
    }

    // KNN 向量搜尋配置
    const knnQuery = {
        field: "legal_issues_embedding",
        query_vector: queryVector,
        k: 50,
        num_candidates: 100,
        filter: filterClauses
    };

    // 關鍵字加強查詢
    const keywordQueries = [];
    
    // 加入關鍵字查詢
    if (enhancedData.keywords?.length > 0) {
        enhancedData.keywords.forEach(keyword => {
            keywordQueries.push({
                nested: {
                    path: "legal_issues",
                    query: {
                        multi_match: {
                            query: keyword,
                            fields: ["legal_issues.question^2", "legal_issues.answer"],
                            type: "best_fields", // 優化：使用 best_fields 提高精準度
                            boost: 0.5 // 優化：降低關鍵字權重
                        }
                    }
                }
            });
        });
    }

    // 加入法條查詢
    if (enhancedData.laws?.length > 0) {
        keywordQueries.push({
            terms: {
                "legal_basis": enhancedData.laws,
                boost: 1.5 // 優化：略微降低法條權重
            }
        });
    }

    return {
        knn: knnQuery,
        query: keywordQueries.length > 0 ? {
            bool: {
                should: keywordQueries,
                minimum_should_match: 1
            }
        } : undefined
    };
}

// 新增：將 hit 格式化的輔助函數
function formatHit(hit) {
    const source = hit._source;
    const highlight = hit.highlight || {};
    
    let matchedIssue = null;
    if (source.legal_issues?.length > 0) {
        if (highlight['legal_issues.question']?.[0] || highlight['legal_issues.answer']?.[0]) {
            matchedIssue = {
                question: highlight['legal_issues.question']?.[0] || source.legal_issues[0].question,
                answer: highlight['legal_issues.answer']?.[0] || source.legal_issues[0].answer,
                cited_para_id: source.legal_issues[0].cited_para_id
            };
        } else {
            matchedIssue = source.legal_issues[0];
        }
    }

    return {
        id: source.JID || source.id,
        title: source.JTITLE,
        court: source.court,
        date: source.JDATE,
        caseType: Array.isArray(source.case_type) ? source.case_type[0] : source.case_type,
        verdict: source.verdict_type,
        summary: source.summary_ai,
        tags: source.tags || [],
        mainReasons: source.main_reasons_ai || [],
        relevanceScore: hit._score,
        matchedIssue: matchedIssue,
        allIssues: source.legal_issues || []
    };
}


/**
 * 執行語意搜尋
 */
export async function performSemanticSearch(userQuery, caseType, filters = {}, page = 1, pageSize = 10, userId = null) {
    const startTime = Date.now();

    const querySummary = `"${userQuery.substring(0, 30)}${userQuery.length > 30 ? '...' : ''}"`;

    logger.info(`🎯 語意搜尋: ${querySummary}`, {
        event: 'judgment_search',
        operation: 'judgment_semantic_search',
        status: 'started',
        userId,
        userQuery,
        queryLength: userQuery.length,
        caseType,
        filter_court: filters.court || '全部',
        filter_dateRange: filters.startDate && filters.endDate ?
            `${filters.startDate} ~ ${filters.endDate}` : '不限',
        page,
        pageSize
    });

    try {
        // 步驟 1: 驗證輸入
        if (!userQuery || userQuery.trim().length < 10) {
            throw new Error('查詢內容至少需要 10 個字');
        }

        if (!['民事', '刑事', '行政'].includes(caseType)) {
            throw new Error('請選擇有效的案件類型');
        }

        // 步驟 2: GPT 優化查詢
        const enhancedData = await enhanceQuery(userQuery, caseType, userId);

        // 步驟 3: 向量化
        const queryVector = await getEmbedding(enhancedData.enhanced || userQuery);
        
        // 步驟 4: 構建查詢
        const hybridQuery = buildHybridQuery(queryVector, enhancedData, caseType, filters);
        
        // 步驟 5: 執行搜尋
        console.log(`[SemanticSearch] 執行 ES 搜尋...`);
        
        const searchBody = {
            knn: hybridQuery.knn,
            from: 0,
            size: 100,
            _source: {
                includes: [
                    "id", "JID", "JTITLE", "JDATE", "court",
                    "case_type", "verdict_type", "summary_ai",
                    "legal_issues.question", "legal_issues.answer", "legal_issues.cited_para_id",
                    "main_reasons_ai", "tags"
                ]
            },
            docvalue_fields: [
                "legal_issues_embedding"
            ],
            highlight: {
                fields: {
                    "legal_issues.question": {
                        fragment_size: 150,
                        number_of_fragments: 1
                    },
                    "legal_issues.answer": {
                        fragment_size: 200,
                        number_of_fragments: 1
                    }
                }
            }
        };

        if (hybridQuery.query) {
            searchBody.query = hybridQuery.query;
        }

        const esResult = await esClient.search({
            index: ES_INDEX_NAME,
            body: searchBody
        });

        const elapsedTime = Date.now() - startTime;
        console.log(`[SemanticSearch] 搜尋完成，耗時 ${elapsedTime}ms`);

        // 步驟 6: 處理與分類結果
        const rawHits = esResult.hits.hits;
        const total = esResult.hits.total.value;

        const hitsWithVectors = rawHits
            .map((hit) => {
                const vector = hit.fields?.['legal_issues_embedding'];
                return {
                    hit: hit,
                    vector: vector
                };
            })
            .filter(item => item.vector && Array.isArray(item.vector) && item.vector.length > 0);

        // 如果可用於分群的結果太少，直接返回扁平結果
        if (hitsWithVectors.length < 5) {
            console.log(`[SemanticSearch] 可分群結果不足 (${hitsWithVectors.length})，返回扁平結果。`);
            const results = rawHits.map(hit => formatHit(hit));
            return {
                success: true,
                results: results,
                total: results.length,
                totalPages: Math.ceil(results.length / pageSize),
                currentPage: page,
                searchMode: 'semantic',
                originalQuery: userQuery,
                enhancedQuery: enhancedData,
                executionTime: elapsedTime,
                message: `找到 ${total} 個相關爭點的判決`
            };
        }

        // 動態決定 K 值
        const numClusters = Math.max(2, Math.min(Math.floor(hitsWithVectors.length / 3), 8));
        
        const vectors = hitsWithVectors.map(item => item.vector[0]);
        
        console.log(`[SemanticSearch] 執行 K-Means 分群，K=${numClusters}`);
        const kmeansResult = kmeans(vectors, numClusters, { initialization: 'kmeans++' });

        // 初始化群組
        const clusters = Array.from({ length: numClusters }, () => ({ clusterName: '', items: [] }));

        hitsWithVectors.forEach((item, index) => {
            const clusterIndex = kmeansResult.clusters[index];
            if (clusterIndex !== undefined) {
                clusters[clusterIndex].items.push(formatHit(item.hit));
            }
        });
        
        // 過濾掉可能產生的空群組
        const populatedClusters = clusters.filter(c => c.items.length > 0);

        // 為每個群組找出代表性爭點並請求 AI 命名
        const representativeIssues = populatedClusters
            .map(cluster => cluster.items[0]?.matchedIssue)
            .filter(issue => issue);

        // 如果沒有代表性爭點，也返回扁平結果
        if (representativeIssues.length === 0) {
             console.log(`[SemanticSearch] 分群後無代表性爭點，返回扁平結果。`);
             const results = rawHits.map(hit => formatHit(hit));
             return {
                success: true,
                results: results,
                total: results.length,
                totalPages: Math.ceil(results.length / pageSize),
                currentPage: page,
                searchMode: 'semantic',
                originalQuery: userQuery,
                enhancedQuery: enhancedData,
                executionTime: elapsedTime,
                message: `找到 ${total} 個相關爭點的判決`
            };
        }

        const clusterNames = await getClusterNamesFromAI(representativeIssues, userQuery, caseType);

        // 將 AI 返回的名稱賦給群組
        populatedClusters.forEach((cluster, index) => {
            cluster.clusterName = clusterNames[index] || `爭點類別 ${index + 1}`;
        });

        const duration = Date.now() - startTime;

        // 記錄成功
        logger.business(`✅ 語意搜尋完成: ${hitsWithVectors.length}筆, ${populatedClusters.length}個爭點 (${duration}ms)`, {
            event: 'judgment_search',
            operation: 'judgment_semantic_search',
            status: 'completed',
            userId,
            userQuery,
            caseType,
            resultCount: hitsWithVectors.length,
            clusterCount: populatedClusters.length,
            duration,
            searchMode: 'semantic_clustered'
        });

        // 性能監控
        if (duration > 5000) {
            logger.performance(`⚠️ 語意搜尋較慢: ${duration}ms (${hitsWithVectors.length}筆, ${populatedClusters.length}個爭點)`, {
                event: 'judgment_search',
                operation: 'judgment_semantic_search',
                status: 'slow_query',
                userId,
                userQuery,
                duration,
                resultCount: hitsWithVectors.length,
                clusterCount: populatedClusters.length,
                threshold: 5000
            });
        }

        return {
            success: true,
            totalResults: hitsWithVectors.length,
            searchMode: 'semantic_clustered',
            clusters: populatedClusters,
            originalQuery: userQuery,
            enhancedQuery: enhancedData,
            executionTime: elapsedTime,
            message: `找到 ${rawHits.length} 個相關判決，並分為 ${populatedClusters.length} 個爭點類別`
        };

    } catch (error) {
        const duration = Date.now() - startTime;

        logger.error(`❌ 語意搜尋失敗: ${error.message}`, {
            event: 'judgment_search',
            operation: 'judgment_semantic_search',
            status: 'failed',
            userId,
            userQuery,
            caseType,
            filter_court: filters.court || '全部',
            filter_dateRange: filters.startDate && filters.endDate ?
                `${filters.startDate} ~ ${filters.endDate}` : '不限',
            duration,
            error: error.message,
            stack: error.stack
        });

        throw error;
    }
}


/**
 * 獲取相關爭點建議（用於自動完成）
 */
export async function getSuggestedIssues(partialQuery, caseType) {
    try {
        const result = await esClient.search({
            index: ES_INDEX_NAME,
            size: 0,
            query: {
                bool: {
                    must: [
                        {
                            nested: {
                                path: "legal_issues",
                                query: {
                                    match: {
                                        "legal_issues.question": {
                                            query: partialQuery,
                                            analyzer: "standard"
                                        }
                                    }
                                }
                            }
                        }
                    ],
                    filter: caseType ? [{ prefix: { "case_type": caseType } }] : []
                }
            },
            aggs: {
                issues: {
                    nested: { path: "legal_issues" },
                    aggs: {
                        unique_questions: {
                            terms: {
                                field: "legal_issues.question.exact",
                                size: 10
                            }
                        }
                    }
                }
            }
        });

        const suggestions = result.aggregations?.issues?.unique_questions?.buckets || [];
        return suggestions.map(b => ({
            text: b.key,
            count: b.doc_count
        }));

    } catch (error) {
        console.error('[SemanticSearch] 獲取建議失敗:', error);
        return [];
    }
}