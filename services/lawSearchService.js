// services/lawSearchService.js
import esClient from '../config/elasticsearch.js';
import { OpenAI } from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { OPENAI_API_KEY, OPENAI_MODEL_NAME_EMBEDDING } from '../config/environment.js';

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

const anthropic = new Anthropic({
    apiKey: process.env.CLAUDE_API_KEY,
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
        console.log(`[LawSearch] 使用 claude-opus-4 優化法條查詢: "${userQuery}"`);

        const prompt = `你是專業的台灣法律搜尋助手，請分析以下問題並推薦最相關的台灣法條。

**使用繁體中文回應**

用戶查詢：「${userQuery}」
${context ? `額外上下文：「${context}」` : ''}

## 🎯 查詢分析指引：
1. **案由識別**：如果查詢包含「：」分隔符，前半部分通常是案由，後半部分是具體案件描述
2. **案件描述解析**：重點關注具體的事實情況、爭議焦點、當事人關係
3. **法律關係判斷**：根據案件描述判斷涉及的法律關係（契約、侵權、物權、親屬等）

## 分析要求：
1. 識別問題涉及的法律爭議類型（刑事、民事侵權、契約、行政等）
2. 判斷各方當事人可能的法律責任和權利義務
3. **特別注意具體案件情況的特殊規定**（如租賃糾紛的特別條款、買賣瑕疵擔保、勞動關係等）
4. **優先考慮實務中常用的條文**

## 法條推薦原則：
- 以案件描述的具體情況為核心，推薦最直接適用的條文
- 刑事條文對應正確罪名（如縱火→刑法173-175條，非271條）
- 民事條文要涵蓋請求權基礎和抗辯事由
- 程序法條文在必要時一併推薦

## 輸出要求：
請提供10個最相關法條，並確保：
- 法條與案件描述高度相關
- 包含主要請求權基礎和可能的抗辯條文
- 法規簡稱：勞基法、消保法、租賃條例等

請確保回應是有效的 JSON 格式，不要包含任何其他文字，只回傳純 JSON：
{
  "recommended_articles": ["刑法第XX條", "民法第XX條"],
  "backup_keywords": ["關鍵字1", "關鍵字2", "關鍵字3"],
  "enhanced": "30字內精準描述"
}`;

        // console.log(`[LawSearch] 使用 Claude Opus 4 優化法條查詢: "${userQuery}"`);

        const response = await anthropic.messages.create({
            model: "claude-opus-4-20250514",
            max_tokens: 2000,
            temperature: 0.2,
            messages: [{
                role: "user",
                content: prompt
            }]
        });

        // 🔧 修復：處理 Claude 返回的 markdown 格式響應
        let responseText = response.content[0].text.trim();

        // 移除可能的 markdown 代碼塊標記
        if (responseText.startsWith('```json')) {
            responseText = responseText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (responseText.startsWith('```')) {
            responseText = responseText.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        console.log(`[LawSearch] Claude 原始響應:`, response.content[0].text);
        console.log(`[LawSearch] 清理後的響應:`, responseText);

        const enhanced = JSON.parse(responseText);
        console.log(`[LawSearch] Claude Opus 4 查詢優化結果:`, enhanced);
        return enhanced;

    } catch (error) {
        console.error('[LawSearch] Claude 優化查詢失敗:', error);

        // 🎯 降級機制：返回基本的查詢結構，不中斷搜索流程
        console.log(`[LawSearch] 使用降級機制，返回基本查詢結構`);
        return {
            recommended_articles: [],
            backup_keywords: [userQuery.trim()],
            enhanced: userQuery.trim()
        };
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
 * 法條語意搜索 - 包含降級機制
 */
export async function performSemanticLawSearch(userQuery, context, page, pageSize) {
    const startTime = Date.now();

    try {
        // 步驟 1: 驗證輸入
        if (!userQuery || userQuery.trim().length < 5) {
            throw new Error('查詢內容至少需要 5 個字');
        }

        let enhancedData;
        let queryVector;
        let useBasicSearch = false;

        try {
            // 步驟 2: Claude 優化查詢（可能失敗）
            enhancedData = await enhanceLawQuery(userQuery, context);
            console.log(`[LawSearch] Claude 優化成功:`, enhancedData);
        } catch (optimizationError) {
            console.warn(`[LawSearch] Claude 優化失敗，使用基本查詢:`, optimizationError.message);
            enhancedData = {
                recommended_articles: [],
                backup_keywords: [userQuery.trim()],
                enhanced: userQuery.trim()
            };
        }

        try {
            // 步驟 3: 向量化（可能失敗）
            queryVector = await getEmbedding(enhancedData.enhanced || userQuery);
            console.log(`[LawSearch] 向量化成功，維度: ${queryVector.length}`);
        } catch (embeddingError) {
            console.warn(`[LawSearch] 向量化失敗，使用基本文字搜索:`, embeddingError.message);
            useBasicSearch = true;
        }

        let searchResult;

        if (useBasicSearch) {
            // 🎯 降級機制：使用基本文字搜索
            console.log(`[LawSearch] 執行降級文字搜尋...`);
            searchResult = await performBasicLawSearch(userQuery, page, pageSize);
        } else {
            // 步驟 4: 構建混合查詢
            const hybridQuery = buildSemanticLawQuery(queryVector, enhancedData);

            // 步驟 5: 執行語意搜尋
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

            searchResult = {
                articles,
                total: esResult.hits.hits.length, // KNN 搜索的總數
                page,
                pageSize,
                enhancedQuery: enhancedData,
                searchTime: esResult.took,
                searchType: 'semantic'
            };
        }

        const processingTime = Date.now() - startTime;
        console.log(`[LawSearch] 搜尋完成，耗時 ${processingTime}ms，找到 ${searchResult.articles.length} 條結果`);

        return {
            ...searchResult,
            processingTime
        };

    } catch (error) {
        console.error('[LawSearch] 語意搜尋失敗:', error);

        // 🎯 最終降級機制：如果所有方法都失敗，嘗試基本搜索
        try {
            console.log(`[LawSearch] 嘗試最終降級搜索...`);
            const fallbackResult = await performBasicLawSearch(userQuery, page, pageSize);
            const processingTime = Date.now() - startTime;

            return {
                ...fallbackResult,
                processingTime,
                searchType: 'fallback',
                warning: '部分搜索功能暫時無法使用，已使用基本搜索'
            };
        } catch (fallbackError) {
            console.error('[LawSearch] 最終降級搜索也失敗:', fallbackError);
            throw new Error('搜索服務暫時無法使用，請稍後再試');
        }
    }
}

/**
 * 基本法條搜索（降級機制）
 */
async function performBasicLawSearch(query, page, pageSize) {
    const from = (page - 1) * pageSize;

    const searchBody = {
        query: {
            multi_match: {
                query: query,
                fields: ["text_original^3", "plain_explanation^2", "typical_scenarios^1.5"],
                type: "best_fields",
                fuzziness: "AUTO"
            }
        },
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
                }
            }
        }
    };

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
        searchTime: esResult.took,
        searchType: 'basic'
    };
}

/**
 * 構建基於推薦法條的精準搜索查詢
 * 完全信任 GPT-4.1-mini 的推薦順序，絕對優先顯示 recommended_articles
 */
function buildSemanticLawQuery(queryVector, enhancedData) {
    const queries = [];

    // 1. 絕對優先：按 GPT 推薦順序搜尋法條
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
                                        { term: { "code_name": originalCodeName } }
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
                        boost: 100.0 - index  // 大幅提高權重，確保按順序排列
                    }
                });
            }
        });
    }

    // 2. 只有在找不到任何推薦法條時，才用備用關鍵字
    if (queries.length === 0 && enhancedData.backup_keywords?.length > 0) {
        enhancedData.backup_keywords.forEach(keyword => {
            queries.push({
                multi_match: {
                    query: keyword,
                    fields: ["text_original^2", "plain_explanation^1.5", "typical_scenarios"],
                    type: "best_fields",
                    boost: 1.0  // 低權重
                }
            });
        });
    }

    // 3. 構建查詢，不使用向量搜尋
    const hybridQuery = {
        query: {
            bool: {
                should: queries,
                minimum_should_match: queries.length > 0 ? 1 : 0
            }
        },
        sort: [
            { "_score": { "order": "desc" } }  // 按分數排序，確保權重生效
        ]
    };

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


/**
 * 使用 OpenAI Responses API (GPT-5-mini) 和 web_search 工具解析法條
 * @param {string} lawName - 法條名稱（例如：民法第184條）
 * @returns {Promise<Object>} 包含法條原文、出處來源、白話解析的物件
 */
export async function aiExplainLaw(lawName) {
    try {
        console.log(`[LawSearch] AI 解析法條 (使用 GPT-5-mini Responses API): ${lawName}`);

        const developerPrompt = `你是一名台灣法律專家，收到提問時，需主動於網路上搜尋相關且最新的法律依據，並依下列格式完整回覆：

**搜尋指引**：
1. **優先使用「全國法規資料庫」**（https://law.moj.gov.tw/）進行搜尋，這是台灣最權威的法規來源。
2. 搜尋時請使用完整法條名稱（例如：民法第184條）或使用 site:law.moj.gov.tw 限定搜尋範圍。
3. 依據搜尋結果，列出完整的法規內容原文。
4. **必須提供**該法規在全國法規資料庫的完整網址連結。
5. 以50字以內的白話文字，針對法條內容進行簡要解析，使一般民眾能快速理解重點。

請以 JSON 格式回應，包含以下欄位：
{
  "法條原文": "完整的法規條文原文（不含法條編號）",
  "出處來源": "全國法規資料庫的完整網址（必須以 https://law.moj.gov.tw/ 開頭）",
  "白話解析": "50字內的精簡直白說明",
  "查詢時間": "回應時間（ISO 8601 格式）"
}

**重要提醒**：
- 「出處來源」必須是有效的 HTTPS 網址，優先使用 https://law.moj.gov.tw/ 開頭的連結
- 如果無法找到全國法規資料庫的連結，可使用其他官方法規網站
- 不可只填寫文字說明，必須是可點擊的完整網址

必須以 JSON 格式回應，不要包含任何 markdown 標記或其他格式。`;

        // 使用 GPT-5-mini Responses API
        const response = await openai.responses.create({
            model: "gpt-5-mini",
            input: [
                {
                    role: "developer",
                    content: [
                        {
                            type: "input_text",
                            text: developerPrompt
                        }
                    ]
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "input_text",
                            text: lawName
                        }
                    ]
                }
            ],
            text: {
                format: {
                    type: "json_object"
                },
                verbosity: "medium"
            },
            reasoning: {
                effort: "medium"
            },
            tools: [
                {
                    type: "web_search",
                    user_location: {
                        type: "approximate"
                    },
                    search_context_size: "medium"
                }
            ],
            store: true,
            include: [
                "reasoning.encrypted_content",
                "web_search_call.action.sources"
            ]
        });

        // 解析 GPT-5 Responses API 的輸出格式
        let responseContent = "";

        // GPT-5 的 output 結構
        for (const outputItem of response.output) {
            if (outputItem.role === "assistant" && outputItem.content) {
                for (const contentItem of outputItem.content) {
                    if (contentItem.type === "output_text" && contentItem.text) {
                        responseContent += contentItem.text;
                    }
                }
            }
        }

        // 移除可能的 markdown 標記
        if (responseContent.includes('```json')) {
            responseContent = responseContent.split('```json')[1].split('```')[0].trim();
        } else if (responseContent.includes('```')) {
            responseContent = responseContent.split('```')[1].split('```')[0].trim();
        }

        const result = JSON.parse(responseContent);

        // 添加查詢時間（如果 AI 沒有提供）
        if (!result.查詢時間) {
            result.查詢時間 = new Date().toISOString();
        }

        console.log(`[LawSearch] AI 解析成功 (GPT-5-mini):`, {
            lawName,
            hasOriginalText: !!result.法條原文,
            hasSource: !!result.出處來源,
            hasExplanation: !!result.白話解析,
            sourceUrl: result.出處來源
        });

        return result;

    } catch (error) {
        console.error('[LawSearch] AI 解析失敗:', error);

        // 降級處理：返回基本信息
        return {
            法條原文: "抱歉，目前無法獲取法條原文，請稍後再試。",
            出處來源: "查詢失敗",
            白話解析: "AI 解析服務暫時無法使用，請稍後再試或聯繫客服。",
            查詢時間: new Date().toISOString(),
            error: error.message
        };
    }
}
