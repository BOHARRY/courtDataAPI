// services/lawSearchService.js
import esClient from '../config/elasticsearch.js';
import { OpenAI } from 'openai';
import { OPENAI_API_KEY, OPENAI_MODEL_NAME_EMBEDDING } from '../config/environment.js';

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

const ES_INDEX_NAME = 'law_boook';
const EMBEDDING_MODEL = OPENAI_MODEL_NAME_EMBEDDING || 'text-embedding-3-large';

/**
 * 使用 GPT-4o-mini 優化法條查詢
 */
async function enhanceLawQuery(userQuery, context = '') {
    try {
        console.log(`[LawSearch] 使用 GPT-4o-mini 優化法條查詢: "${userQuery}"`);
        
        const prompt = `你是台灣法律搜尋助手。請將以下法律問題擴充為更精準的法條搜尋查詢。

用戶問題：「${userQuery}」
${context ? `額外上下文：「${context}」` : ''}

請提供：
1. 3-5個核心法律概念關鍵字（例如 "侵權行為", "損害賠償", "契約責任"）
2. 可能相關的法典名稱（例如 "民法", "刑法", "行政程序法"）
3. 可能的條號範圍（例如 "第184條至第191條"）
4. 一句擴充後的精準語意描述（限30字內，用於向量搜尋）

請確保回應是有效的 JSON 格式：
{
  "keywords": ["關鍵字1", "關鍵字2"],
  "codes": ["法典名稱1", "法典名稱2"],
  "article_hints": ["條號提示"],
  "enhanced": "擴充後的精準描述"
}`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.2,
            max_tokens: 300,
            response_format: { type: "json_object" }
        });

        const enhanced = JSON.parse(response.choices[0].message.content);
        console.log(`[LawSearch] 查詢優化結果:`, enhanced);
        return enhanced;
        
    } catch (error) {
        console.error('[LawSearch] GPT 優化查詢失敗:', error);
        throw new Error(`查詢優化失敗: ${error.message}`);
    }
}

/**
 * 獲取文本的向量表示
 */
async function getEmbedding(text) {
    try {
        console.log(`[LawSearch] 正在獲取向量 (${text.length} 字)`);
        
        const response = await openai.embeddings.create({
            model: EMBEDDING_MODEL,
            input: text.trim(),
            dimensions: 1536,
        });

        if (response.data?.[0]?.embedding) {
            const embedding = response.data[0].embedding;
            console.log(`[LawSearch] 成功獲取向量 (維度: ${embedding.length})`);
            return embedding;
        } else {
            throw new Error('向量化回應格式錯誤');
        }
        
    } catch (error) {
        console.error('[LawSearch] 向量化失敗:', error);
        throw new Error(`向量化失敗: ${error.message}`);
    }
}

/**
 * 法條精準搜索
 */
export async function searchLawArticles({ query, code_name, article_number, search_type, page, pageSize }) {
    try {
        console.log(`[LawSearch] 執行法條精準搜索:`, { query, code_name, article_number, search_type });

        const must = [];
        const should = [];
        const filter = [];

        // 條號精確搜索
        if (article_number) {
            must.push({
                bool: {
                    should: [
                        { term: { "article_number": article_number } },
                        { term: { "article_number_str": article_number } },
                        { term: { "article_number_numeric": parseFloat(article_number) || article_number } }
                    ],
                    minimum_should_match: 1
                }
            });
        }

        // 法典名稱篩選
        if (code_name) {
            filter.push({
                term: { "code_name": code_name }
            });
        }

        // 關鍵字搜索
        if (query) {
            const queryFields = search_type === 'exact' ? 
                // 精確搜索
                [
                    { match_phrase: { "text_original": { query, boost: 3 } } },
                    { match_phrase: { "plain_explanation": { query, boost: 2 } } },
                    { match_phrase: { "typical_scenarios": { query, boost: 1.5 } } }
                ] :
                // 模糊搜索
                [
                    { multi_match: { 
                        query, 
                        fields: ["text_original^3", "plain_explanation^2", "typical_scenarios^1.5", "synonyms"],
                        type: "best_fields",
                        fuzziness: search_type === 'fuzzy' ? "AUTO" : 0
                    }}
                ];

            should.push(...queryFields);
        }

        // 構建查詢
        const esQuery = {
            bool: {}
        };

        if (must.length > 0) esQuery.bool.must = must;
        if (should.length > 0) {
            esQuery.bool.should = should;
            if (must.length === 0) {
                esQuery.bool.minimum_should_match = 1;
            }
        }
        if (filter.length > 0) esQuery.bool.filter = filter;

        // 如果沒有任何查詢條件，返回所有結果
        if (must.length === 0 && should.length === 0 && filter.length === 0) {
            esQuery = { match_all: {} };
        }

        const from = (page - 1) * pageSize;

        const searchBody = {
            query: esQuery,
            from,
            size: pageSize,
            sort: [
                { "_score": { "order": "desc" } },
                { "code_name": { "order": "asc" } },
                { "article_number_numeric": { "order": "asc" } }
            ],
            highlight: {
                fields: {
                    "text_original": {
                        fragment_size: 200,
                        number_of_fragments: 2
                    },
                    "plain_explanation": {
                        fragment_size: 150,
                        number_of_fragments: 1
                    }
                }
            }
        };

        console.log(`[LawSearch] ES 查詢:`, JSON.stringify(searchBody, null, 2));

        const esResult = await esClient.search({
            index: ES_INDEX_NAME,
            body: searchBody
        });

        const articles = esResult.hits.hits.map(hit => formatLawArticle(hit));
        
        return {
            articles,
            total: esResult.hits.total.value,
            page,
            pageSize,
            totalPages: Math.ceil(esResult.hits.total.value / pageSize),
            searchTime: esResult.took
        };

    } catch (error) {
        console.error('[LawSearch] 法條搜索失敗:', error);
        throw error;
    }
}

/**
 * 法條語意搜索
 */
export async function performSemanticLawSearch(userQuery, context, page, pageSize) {
    const startTime = Date.now();

    try {
        // 步驟 1: 驗證輸入
        if (!userQuery || userQuery.trim().length < 5) {
            throw new Error('查詢內容至少需要 5 個字');
        }

        // 步驟 2: GPT 優化查詢
        const enhancedData = await enhanceLawQuery(userQuery, context);

        // 步驟 3: 向量化
        const queryVector = await getEmbedding(enhancedData.enhanced || userQuery);

        // 步驟 4: 構建混合查詢
        const hybridQuery = buildSemanticLawQuery(queryVector, enhancedData);

        // 步驟 5: 執行搜尋
        console.log(`[LawSearch] 執行語意搜尋...`);

        const from = (page - 1) * pageSize;

        const searchBody = {
            knn: hybridQuery.knn,
            from,
            size: pageSize,
            _source: {
                includes: [
                    "code_name", "volume", "chapter", "section", "subsection",
                    "article_number", "article_number_str", "text_original",
                    "plain_explanation", "typical_scenarios", "synonyms",
                    "upload_timestamp"
                ]
            },
            highlight: {
                fields: {
                    "text_original": {
                        fragment_size: 200,
                        number_of_fragments: 2
                    },
                    "plain_explanation": {
                        fragment_size: 150,
                        number_of_fragments: 1
                    },
                    "typical_scenarios": {
                        fragment_size: 100,
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

        const articles = esResult.hits.hits.map(hit => formatLawArticle(hit));

        const processingTime = Date.now() - startTime;
        console.log(`[LawSearch] 語意搜尋完成，耗時 ${processingTime}ms，找到 ${articles.length} 條結果`);

        return {
            articles,
            total: esResult.hits.hits.length, // KNN 搜索的總數
            page,
            pageSize,
            enhancedQuery: enhancedData,
            searchTime: esResult.took,
            processingTime
        };

    } catch (error) {
        console.error('[LawSearch] 語意搜尋失敗:', error);
        throw error;
    }
}

/**
 * 構建語意搜索的混合查詢
 */
function buildSemanticLawQuery(queryVector, enhancedData) {
    // KNN 向量搜尋配置
    const knnQuery = {
        field: "embedding_vector",
        query_vector: queryVector,
        k: 5,
        num_candidates: 10
    };

    // 關鍵字加強查詢
    const keywordQueries = [];

    // 加入關鍵字查詢
    if (enhancedData.keywords?.length > 0) {
        enhancedData.keywords.forEach(keyword => {
            keywordQueries.push({
                multi_match: {
                    query: keyword,
                    fields: ["text_original^2", "plain_explanation^1.5", "typical_scenarios"],
                    type: "best_fields",
                    boost: 5.0
                }
            });
        });
    }

    // 加入法典名稱查詢
    if (enhancedData.codes?.length > 0) {
        enhancedData.codes.forEach(code => {
            keywordQueries.push({
                term: {
                    "code_name": {
                        value: code,
                        boost: 0.5
                    }
                }
            });
        });
    }

    // 加入條號提示查詢
    if (enhancedData.article_hints?.length > 0) {
        enhancedData.article_hints.forEach(hint => {
            keywordQueries.push({
                multi_match: {
                    query: hint,
                    fields: ["article_number^3", "article_number_str^3"],
                    type: "phrase",
                    boost: 10.0  // 條號匹配給予最高權重
                }
            });
        });
    }

    let hybridQuery = { knn: knnQuery };

    // 如果有關鍵字查詢，加入混合搜索
    if (keywordQueries.length > 0) {
        hybridQuery.query = {
            bool: {
                should: keywordQueries,
                minimum_should_match: 1
            }
        };
    }

    return hybridQuery;
}

/**
 * 獲取法條詳細內容
 */
export async function getLawArticleById(id) {
    try {
        const esResult = await esClient.get({
            index: ES_INDEX_NAME,
            id: id
        });

        if (esResult.found) {
            return {
                id: esResult._id,
                ...esResult._source
            };
        }

        return null;

    } catch (error) {
        if (error.statusCode === 404) {
            return null;
        }
        console.error('[LawSearch] 獲取法條詳情失敗:', error);
        throw error;
    }
}

/**
 * 獲取法條搜索建議
 */
export async function getLawSearchSuggestions(query, type = 'all') {
    try {
        const suggestions = [];

        // 法典名稱建議
        if (type === 'all' || type === 'code') {
            const codeAgg = await esClient.search({
                index: ES_INDEX_NAME,
                body: {
                    size: 0,
                    aggs: {
                        codes: {
                            terms: {
                                field: "code_name",
                                include: `.*${query}.*`,
                                size: 5
                            }
                        }
                    }
                }
            });

            codeAgg.aggregations.codes.buckets.forEach(bucket => {
                suggestions.push({
                    type: 'code',
                    text: bucket.key,
                    count: bucket.doc_count
                });
            });
        }

        // 條號建議
        if (type === 'all' || type === 'article') {
            const articleQuery = {
                bool: {
                    should: [
                        { wildcard: { "article_number_str": `*${query}*` } },
                        { prefix: { "article_number_str": query } }
                    ]
                }
            };

            const articleResult = await esClient.search({
                index: ES_INDEX_NAME,
                body: {
                    query: articleQuery,
                    size: 5,
                    _source: ["code_name", "article_number_str"]
                }
            });

            articleResult.hits.hits.forEach(hit => {
                suggestions.push({
                    type: 'article',
                    text: `${hit._source.code_name}第${hit._source.article_number_str}條`,
                    code_name: hit._source.code_name,
                    article_number: hit._source.article_number_str
                });
            });
        }

        return suggestions.slice(0, 10); // 限制返回數量

    } catch (error) {
        console.error('[LawSearch] 獲取搜索建議失敗:', error);
        return [];
    }
}

/**
 * 格式化法條搜索結果
 */
function formatLawArticle(hit) {
    const source = hit._source;

    return {
        id: hit._id,
        code_name: source.code_name,
        volume: source.volume,
        chapter: source.chapter,
        section: source.section,
        subsection: source.subsection,
        article_number: source.article_number,
        article_number_str: source.article_number_str,
        text_original: source.text_original,
        plain_explanation: source.plain_explanation,
        typical_scenarios: source.typical_scenarios,
        synonyms: source.synonyms,
        upload_timestamp: source.upload_timestamp,
        relevanceScore: hit._score,
        highlights: hit.highlight || {}
    };
}
