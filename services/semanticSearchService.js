// services/semanticSearchService.js
import esClient from '../config/elasticsearch.js';
import { OpenAI } from 'openai';
import { OPENAI_API_KEY, OPENAI_MODEL_NAME_EMBEDDING } from '../config/environment.js';
import { kmeans } from 'ml-kmeans';

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

const ES_INDEX_NAME = 'search-boooook';
const EMBEDDING_MODEL = OPENAI_MODEL_NAME_EMBEDDING || 'text-embedding-3-large';

/**
 * 使用 GPT-4o-mini 優化用戶的查詢
 */
async function enhanceQuery(userQuery, caseType) {
    try {
        console.log(`[SemanticSearch] 使用 GPT-4o-mini 優化查詢: "${userQuery}"`);
        
        const prompt = `你是台灣法律搜尋助手。請將以下${caseType}案件的法律問題擴充為更精準的搜尋查詢。

用戶問題：「${userQuery}」

請提供：
1. 3-5個核心法律概念關鍵字
2. 可能相關的法條（如有）
3. 擴充後的語意描述（限30字內，用於向量搜尋）

請確保回應是有效的 JSON 格式：
{
  "keywords": ["關鍵字1", "關鍵字2"],
  "laws": ["民法第xxx條"],
  "enhanced": "擴充後的精準描述"
}`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.3,
            max_tokens: 200,
            response_format: { type: "json_object" }
        });

        const enhanced = JSON.parse(response.choices[0].message.content);
        console.log(`[SemanticSearch] 查詢優化結果:`, enhanced);
        return enhanced;
        
    } catch (error) {
        console.error('[SemanticSearch] GPT 優化查詢失敗:', error);
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
        k: 50,  // 增加候選數量
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
                            type: "phrase",
                            boost: 1.5
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
                boost: 2.0
            }
        });
    }

    return {
        knn: knnQuery,
        query: keywordQueries.length > 0 ? {
            bool: {
                should: keywordQueries,
                minimum_should_match: 1 // 必須至少匹配一個關鍵字條件
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
                cited_para_id: source.legal_issues[0].cited_para_id,
                legal_issues_embedding: source.legal_issues[0].legal_issues_embedding // 確保向量被傳遞
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
export async function performSemanticSearch(userQuery, caseType, filters = {}, page = 1, pageSize = 10) {
    const startTime = Date.now();
    
    try {
        // 步驟 1: 驗證輸入
        if (!userQuery || userQuery.trim().length < 10) {
            throw new Error('查詢內容至少需要 10 個字');
        }
        
        if (!['民事', '刑事', '行政'].includes(caseType)) {
            throw new Error('請選擇有效的案件類型');
        }

        // 步驟 2: GPT 優化查詢
        const enhancedData = await enhanceQuery(userQuery, caseType);
        
        // 步驟 3: 向量化
        const queryVector = await getEmbedding(enhancedData.enhanced || userQuery);
        
        // 步驟 4: 構建查詢
        const hybridQuery = buildHybridQuery(queryVector, enhancedData, caseType, filters);
        
        // 步驟 5: 執行搜尋
        console.log(`[SemanticSearch] 執行 ES 搜尋...`);
        
        const searchBody = {
            // min_score: 1.5, // 移除絕對分數門檻，改用排名限制
            knn: hybridQuery.knn,
            from: 0, // 從第一個結果開始
            size: 100, // 一次性獲取前 100 名的結果
            _source: {
                includes: [
                    "id", "JID", "JTITLE", "JDATE", "court",
                    "case_type", "verdict_type", "summary_ai",
                    "legal_issues.question", "legal_issues.answer", "legal_issues.cited_para_id", "legal_issues.legal_issues_embedding", // 精確指定需要的 nested 欄位
                    "main_reasons_ai", "tags"
                ]
            },
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

        // 如果結果太少，不進行分類，直接返回
        if (rawHits.length < 10) {
            const results = rawHits.map(hit => formatHit(hit));
            return {
                success: true,
                results: results,
                total: results.length, // 使用實際返回的結果數量
                totalPages: Math.ceil(results.length / pageSize),
                currentPage: page,
                searchMode: 'semantic',
                originalQuery: userQuery,
                enhancedQuery: enhancedData,
                executionTime: elapsedTime,
                message: `找到 ${total} 個相關爭點的判決`
            };
        }

        // 提取向量用於分群
        const hitsWithVectors = rawHits.map(hit => ({ 
            hit: hit, 
            vector: hit._source.legal_issues?.[0]?.legal_issues_embedding 
        })).filter(item => item.vector && Array.isArray(item.vector));
        
        if (hitsWithVectors.length < 10) {
             const results = rawHits.map(hit => formatHit(hit));
             return {
                success: true,
                results: results,
                total: results.length, // 使用實際返回的結果數量
                totalPages: Math.ceil(results.length / pageSize),
                currentPage: page,
                searchMode: 'semantic',
                originalQuery: userQuery,
                enhancedQuery: enhancedData,
                executionTime: elapsedTime,
                message: `找到 ${total} 個相關爭點的判決`
            };
        }

        const vectors = hitsWithVectors.map(item => item.vector);

        // 執行 K-Means 分群
        const kmeansResult = kmeans(vectors, 10, { initialization: 'kmeans++' });
        
        // 初始化群組
        const clusters = Array.from({ length: 10 }, () => ({ clusterName: '', items: [] }));
        
        hitsWithVectors.forEach((item, index) => {
            const clusterIndex = kmeansResult.clusters[index];
            if (clusterIndex !== undefined) {
                clusters[clusterIndex].items.push(formatHit(item.hit));
            }
        });

        // 為每個群組找出代表性爭點並請求 AI 命名
        const representativeIssues = clusters
            .map(cluster => cluster.items[0]?.matchedIssue)
            .filter(issue => issue); // 過濾掉沒有代表的空群組

        if (representativeIssues.length === 0) {
            // 如果沒有任何代表性爭點，也直接返回扁平結果
            const results = rawHits.map(hit => formatHit(hit));
            return {
               success: true,
               results: results,
               total: results.length, // 使用實際返回的結果數量
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
        let nameIndex = 0;
        clusters.forEach((cluster) => {
            if(cluster.items.length > 0) {
                cluster.clusterName = clusterNames[nameIndex] || `爭點類別 ${nameIndex + 1}`;
                nameIndex++;
            }
        });

        return {
            success: true,
            totalResults: hitsWithVectors.length, // 使用分群前的實際數量
            searchMode: 'semantic_clustered',
            clusters: clusters.filter(c => c.items.length > 0), // 過濾掉空群組
            originalQuery: userQuery,
            enhancedQuery: enhancedData,
            executionTime: elapsedTime,
            message: `找到 ${rawHits.length} 個相關判決，並分為 ${clusters.filter(c => c.items.length > 0).length} 個爭點類別`
        };

    } catch (error) {
        console.error('[SemanticSearch] 搜尋失敗:', error);
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