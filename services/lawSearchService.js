// services/lawSearchService.js
import esClient from '../config/elasticsearch.js';
import { OpenAI } from 'openai';
import { OPENAI_API_KEY, OPENAI_MODEL_NAME_EMBEDDING } from '../config/environment.js';

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

const ES_INDEX_NAME = 'law_boook';
const EMBEDDING_MODEL = OPENAI_MODEL_NAME_EMBEDDING || 'text-embedding-3-large';

// 法典名稱對應表 - 處理 GPT 回傳的完整名稱與資料庫簡稱的對應
const LAW_CODE_MAPPING = {
    '勞動基準法': '勞基法',
    '消費者保護法': '消保法',
    '租賃住宅市場發展及管理條例': '租賃條例',
    '道路交通管理處罰條例': '道交條例',
    '公寓大廈管理條例': '公寓大廈條例',
    '個人資料保護法': '個資法',
    '著作權法': '著作權法', // 保持一致
    '民法': '民法',
    '刑法': '刑法',
    '憲法': '憲法',
    '行政程序法': '行政程序法',
    '公平交易法': '公平法'
};

/**
 * 使用 GPT-4o-mini 優化法條查詢
 */
async function enhanceLawQuery(userQuery, context = '') {
    try {
        console.log(`[LawSearch] 使用 GPT-4o-mini 優化法條查詢: "${userQuery}"`);
        
        const prompt = `你是專業的台灣法律搜尋助手。請針對以下法律問題進行深度分析，並推薦最相關的台灣法條。

**重要：請務必使用繁體中文回應，不可使用簡體中文。**

用戶問題：「${userQuery}」
${context ? `額外上下文：「${context}」` : ''}

## 分析步驟：
1. **識別法律關係類型**：
   - 契約關係（買賣、租賃、僱傭、承攬等）
   - 侵權行為（故意、過失、特殊侵權）
   - 物權關係（所有權、用益物權、擔保物權）
   - 身分關係（婚姻、親子、繼承）
   - 公法關係（行政、刑事、憲法）

2. **確定適用法律領域**：
   - 民法（總則、債權、物權、親屬、繼承）
   - 特別法（消保法、勞基法、公寓大廈管理條例等）
   - 刑法（分則各罪）
   - 行政法規
   - 憲法基本權利

3. **精準定位相關條文**：
   - 優先推薦直接適用的條文
   - 避免推薦無關領域的條文
   - 考慮條文的適用順序和重要性

## 請提供：
1. **10個最相關的具體台灣法條**（按重要性排序，請使用以下標準格式）：
   - 勞動基準法 → 使用 "勞基法第XX條"
   - 消費者保護法 → 使用 "消保法第XX條"
   - 租賃住宅市場發展及管理條例 → 使用 "租賃條例第XX條"
   - 道路交通管理處罰條例 → 使用 "道交條例第XX條"
   - 個人資料保護法 → 使用 "個資法第XX條"
   - 公平交易法 → 使用 "公平法第XX條"
   - 其他法典保持原名（如 "民法第XX條", "刑法第XX條"）
2. **3-5個精準的補充關鍵字**（用於備用搜尋）
3. **一句精準的搜尋描述**（限30字內）

**注意事項：**
- 所有回應內容必須使用繁體中文
- 請確保推薦的法條與問題的法律關係直接相關
- 避免推薦不同法律領域的無關條文
- 優先推薦特別法，再推薦一般法

請確保回應是有效的 JSON 格式：
{
  "recommended_articles": [
    "消保法第19條",
    "民法第354條",
    "消保法第7條",
    "民法第359條",
    "刑法第339條",
    "民法第365條",
    "公平法第21條",
    "民法第184條",
    "消保法第51條",
    "民法第195條"
  ],
  "backup_keywords": ["消費者權益", "商品瑕疵", "網路購物"],
  "enhanced": "網路購物商品瑕疵退貨法律責任"
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
 * 構建基於推薦法條的精準搜索查詢
 */
function buildSemanticLawQuery(queryVector, enhancedData) {
    const queries = [];

    // 1. 優先搜尋推薦的法條
    if (enhancedData.recommended_articles?.length > 0) {
        enhancedData.recommended_articles.forEach((article, index) => {
            // 解析法條格式，例如 "民法第425條"
            const match = article.match(/^(.+?)第(.+?)條$/);
            if (match) {
                const originalCodeName = match[1];
                const articleNumber = match[2];

                // 使用對應表轉換法典名稱
                const mappedCodeName = LAW_CODE_MAPPING[originalCodeName] || originalCodeName;

                queries.push({
                    bool: {
                        must: [
                            {
                                bool: {
                                    should: [
                                        { term: { "code_name": mappedCodeName } },
                                        { term: { "code_name": originalCodeName } }  // 也嘗試原始名稱
                                    ]
                                }
                            },
                            {
                                bool: {
                                    should: [
                                        { term: { "article_number_str": articleNumber } },
                                        { term: { "article_number": `第${articleNumber}條` } }
                                    ]
                                }
                            }
                        ],
                        boost: 20.0 - index  // 按推薦順序給予權重
                    }
                });
            }
        });
    }

    // 2. 如果推薦法條不足，用備用關鍵字補充
    if (enhancedData.backup_keywords?.length > 0) {
        enhancedData.backup_keywords.forEach(keyword => {
            queries.push({
                multi_match: {
                    query: keyword,
                    fields: ["text_original^2", "plain_explanation^1.5", "typical_scenarios"],
                    type: "best_fields",
                    boost: 2.0
                }
            });
        });
    }

    // 3. 向量搜尋作為最後的補充（權重很低）
    const hybridQuery = {
        query: {
            bool: {
                should: queries,
                minimum_should_match: 1
            }
        }
    };

    // 只有在推薦法條很少時才加入向量搜尋
    if (enhancedData.recommended_articles?.length < 5) {
        hybridQuery.knn = {
            field: "embedding_vector",
            query_vector: queryVector,
            k: 3,
            num_candidates: 5,
            boost: 0.1  // 很低的權重
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
