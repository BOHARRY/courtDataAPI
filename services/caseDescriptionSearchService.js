// services/caseDescriptionSearchService.js
/**
 * 案由搜尋服務
 * 實現四層檢索管線：
 * Layer 0: Query 正規化 + 關鍵詞群生成
 * Layer 1: 關鍵字大抓（ES）
 * Layer 2: 語義過濾（summary_ai_vector）
 * Layer 3: 法條一致性過濾
 * Layer 4: GPT sanity check
 */

import esClient from '../config/elasticsearch.js';
import { OpenAI } from 'openai';
import { OPENAI_API_KEY, OPENAI_MODEL_NAME_EMBEDDING } from '../config/environment.js';
import admin from 'firebase-admin';

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

const ES_INDEX_NAME = 'search-boooook';
const EMBEDDING_MODEL = OPENAI_MODEL_NAME_EMBEDDING || 'text-embedding-3-large';
const CACHE_COLLECTION = 'caseDescriptionSearchCache';

/**
 * Layer 0: 使用 GPT-4o-mini 正規化案情描述並生成關鍵詞群
 * 
 * @param {string} userCaseDescription - 使用者輸入的案情描述
 * @param {string} lawDomain - 案件類型（民事/刑事/行政）
 * @returns {Promise<Object>} 正規化結果
 */
async function normalizeAndExtractTerms(userCaseDescription, lawDomain) {
    try {
        console.log(`[CaseDescriptionSearch] Layer 0: 正規化案情描述...`);
        
        const prompt = `你是台灣法律專家。請將以下${lawDomain}案件的當事人描述，改寫成法院判決書風格的客觀摘要，並提取關鍵詞群。

**使用者案情描述**：
${userCaseDescription}

**任務**：
1. 將案情改寫成第三人稱、客觀、法院摘要風格
2. 提取四組關鍵詞（每組最多5個詞）：
   - parties_terms: 當事人關係用語（例如：承租人、出租人、樓上住戶）
   - technical_terms: 技術/事實用語（例如：漏水、押金、提前終止）
   - legal_action_terms: 請求/義務用語（例如：返還押金、修繕義務）
   - statute_terms: 相關法條（例如：民法第767條、租賃契約）

**回應格式**（必須是有效的 JSON）：
{
  "normalized_summary": "本件為...之${lawDomain}糾紛...",
  "parties_terms": ["當事人1", "當事人2"],
  "technical_terms": ["技術詞1", "技術詞2"],
  "legal_action_terms": ["請求1", "請求2"],
  "statute_terms": ["法條1", "法條2"]
}`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.1, // 低溫度確保穩定性
            max_tokens: 500,
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(response.choices[0].message.content);
        console.log(`[CaseDescriptionSearch] Layer 0 完成:`, result);
        
        return result;
        
    } catch (error) {
        console.error('[CaseDescriptionSearch] Layer 0 失敗:', error);
        throw new Error(`案情正規化失敗: ${error.message}`);
    }
}

/**
 * 生成 embedding 向量
 */
async function getEmbedding(text) {
    try {
        const response = await openai.embeddings.create({
            model: EMBEDDING_MODEL,
            input: text,
            dimensions: 1536
        });
        return response.data[0].embedding;
    } catch (error) {
        console.error('[CaseDescriptionSearch] Embedding 生成失敗:', error);
        throw new Error('無法生成向量表示');
    }
}

/**
 * Layer 1: 關鍵字大抓（ES bool query）
 *
 * @param {Object} termGroups - Layer 0 產出的關鍵詞群
 * @param {string} lawDomain - 案件類型（民事/刑事/行政）
 * @returns {Promise<Array>} 候選池 v0（約200筆）
 */
async function keywordBroadSearch(termGroups, lawDomain) {
    try {
        console.log(`[CaseDescriptionSearch] Layer 1: 關鍵字大抓...`);

        const { parties_terms, technical_terms, legal_action_terms, statute_terms } = termGroups;

        // 🔧 將中文案件類型映射為英文（ES 欄位值）
        const lawDomainMap = {
            '民事': 'civil',
            '刑事': 'criminal',
            '行政': 'administrative'
        };
        const esLawDomain = lawDomainMap[lawDomain] || lawDomain;
        console.log(`[CaseDescriptionSearch] 案件類型映射: ${lawDomain} -> ${esLawDomain}`);

        // 構建 should 查詢
        const shouldClauses = [];

        // 搜索欄位
        const searchFields = [
            'summary_ai_full',
            'JFULL',
            'JTITLE',
            'legal_claim_basis',
            'main_reasons_ai'
        ];

        // 添加各組詞彙的查詢
        [parties_terms, technical_terms, legal_action_terms, statute_terms].forEach((terms, index) => {
            if (terms && terms.length > 0) {
                terms.forEach(term => {
                    shouldClauses.push({
                        multi_match: {
                            query: term,
                            fields: searchFields,
                            type: 'best_fields',
                            boost: index === 3 ? 1.5 : 1.0 // statute_terms 權重較高
                        }
                    });
                });
            }
        });

        console.log(`[CaseDescriptionSearch] 構建的 should clauses 數量: ${shouldClauses.length}`);

        // 🔧 如果沒有任何關鍵詞,使用 match_all 查詢
        let query;
        if (shouldClauses.length === 0) {
            console.log('[CaseDescriptionSearch] ⚠️ 沒有提取到關鍵詞,使用 match_all 查詢');
            query = {
                bool: {
                    must: [
                        { match_all: {} }
                    ],
                    filter: [
                        { term: { stage0_case_type: esLawDomain } },
                        { term: { is_procedural: false } }
                    ]
                }
            };
        } else {
            query = {
                bool: {
                    should: shouldClauses,
                    minimum_should_match: 1, // 🔧 降低門檻：至少命中一個詞彙即可
                    filter: [
                        { term: { stage0_case_type: esLawDomain } }, // 🔧 使用正確的欄位名稱
                        { term: { is_procedural: false } }
                    ]
                }
            };
        }
        
        // 🔧 Debug: 輸出查詢結構
        console.log('[CaseDescriptionSearch] ES 查詢結構:', JSON.stringify(query, null, 2));

        const esResult = await esClient.search({
            index: ES_INDEX_NAME,
            query: query,
            _source: [
                'JID', 'court', 'JDATE', 'JTITLE',
                'summary_ai_full', 'legal_basis', 'legal_claim_basis',
                'disposition.class', 'summary_ai_vector',
                'plaintiff_combined_vector', 'defendant_combined_vector',
                'position_based_analysis'
            ],
            size: 200,
            sort: [
                { '_score': 'desc' },
                { 'JDATE': 'desc' }
            ]
        });

        const totalHits = typeof esResult.hits.total === 'number' ? esResult.hits.total : esResult.hits.total.value;
        console.log(`[CaseDescriptionSearch] ES 返回總數: ${totalHits}`);

        const candidates = esResult.hits.hits.map(hit => ({
            ...hit._source,
            keyword_score: hit._score
        }));

        console.log(`[CaseDescriptionSearch] Layer 1 完成: ${candidates.length} 筆候選`);
        return candidates;
        
    } catch (error) {
        console.error('[CaseDescriptionSearch] Layer 1 失敗:', error);
        throw new Error(`關鍵字搜索失敗: ${error.message}`);
    }
}

/**
 * Layer 2: 語義過濾（summary_ai_vector 相似度）
 * 
 * @param {Array} candidates - Layer 1 的候選池
 * @param {Array} queryVector - 正規化摘要的向量
 * @param {number} threshold - 相似度門檻（預設 0.70）
 * @returns {Array} 過濾後的候選池（約60筆）
 */
function semanticFilter(candidates, queryVector, threshold = 0.70) {
    console.log(`[CaseDescriptionSearch] Layer 2: 語義過濾（門檻: ${threshold}）...`);
    console.log(`[CaseDescriptionSearch] queryVector 長度: ${queryVector ? queryVector.length : 'null'}`);
    console.log(`[CaseDescriptionSearch] 候選數量: ${candidates.length}`);

    // 🔧 Debug: 檢查前 3 筆候選的 summary_ai_vector
    let hasVectorCount = 0;
    let noVectorCount = 0;
    const similarities = [];

    const filtered = candidates
        .map((candidate, index) => {
            if (!candidate.summary_ai_vector) {
                noVectorCount++;
                if (index < 3) {
                    console.log(`[CaseDescriptionSearch] 候選 ${index}: 無 summary_ai_vector`);
                }
                return null;
            }

            hasVectorCount++;

            // 計算 cosine similarity
            const similarity = cosineSimilarity(queryVector, candidate.summary_ai_vector);

            if (index < 3) {
                console.log(`[CaseDescriptionSearch] 候選 ${index}: similarity = ${similarity.toFixed(4)}`);
            }

            similarities.push(similarity);

            if (similarity >= threshold) {
                return {
                    ...candidate,
                    semantic_score: similarity
                };
            }
            return null;
        })
        .filter(c => c !== null)
        .sort((a, b) => b.semantic_score - a.semantic_score);

    // 🔧 Debug: 統計資訊
    console.log(`[CaseDescriptionSearch] 有向量: ${hasVectorCount}, 無向量: ${noVectorCount}`);
    if (similarities.length > 0) {
        const maxSim = Math.max(...similarities);
        const minSim = Math.min(...similarities);
        const avgSim = similarities.reduce((a, b) => a + b, 0) / similarities.length;
        console.log(`[CaseDescriptionSearch] 相似度範圍: ${minSim.toFixed(4)} ~ ${maxSim.toFixed(4)}, 平均: ${avgSim.toFixed(4)}`);
    }

    console.log(`[CaseDescriptionSearch] Layer 2 完成: ${filtered.length} 筆候選`);
    return filtered;
}

/**
 * 計算 cosine similarity
 */
function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) {
        return 0;
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Layer 3: 法條一致性過濾
 * 
 * @param {Array} candidates - Layer 2 的候選池
 * @returns {Array} 過濾後的候選池（約20-30筆）
 */
function lawAlignmentFilter(candidates) {
    console.log(`[CaseDescriptionSearch] Layer 3: 法條一致性過濾...`);
    
    // 從語義分數最高的前10筆統計核心法條
    const top10 = candidates.slice(0, 10);
    const statuteCount = {};
    
    top10.forEach(candidate => {
        const statutes = candidate.legal_basis || [];
        statutes.forEach(statute => {
            statuteCount[statute] = (statuteCount[statute] || 0) + 1;
        });
    });
    
    // 找出出現次數 >= 3 的法條作為 core_statutes
    const coreStatutes = Object.keys(statuteCount)
        .filter(statute => statuteCount[statute] >= 3);
    
    console.log(`[CaseDescriptionSearch] 核心法條:`, coreStatutes);
    
    // 計算每筆候選的 law_alignment_score
    const filtered = candidates
        .map(candidate => {
            const candidateStatutes = candidate.legal_basis || [];
            const matchCount = candidateStatutes.filter(s => coreStatutes.includes(s)).length;
            
            let law_alignment_score = 0;
            if (matchCount === 0) law_alignment_score = 0;
            else if (matchCount === 1) law_alignment_score = 1;
            else law_alignment_score = 2;
            
            return {
                ...candidate,
                law_alignment_score,
                core_statutes: coreStatutes
            };
        })
        .filter(c => c.law_alignment_score > 0) // 移除 score = 0 的案件
        .sort((a, b) => {
            // 綜合排序：語義分數 + 法條分數
            const scoreA = a.semantic_score * 0.7 + a.law_alignment_score * 0.3;
            const scoreB = b.semantic_score * 0.7 + b.law_alignment_score * 0.3;
            return scoreB - scoreA;
        });
    
    console.log(`[CaseDescriptionSearch] Layer 3 完成: ${filtered.length} 筆候選`);
    return filtered;
}

/**
 * Layer 4: GPT sanity check（型態保證）
 *
 * @param {Array} candidates - Layer 3 的候選池
 * @param {string} normalizedSummary - 正規化的案情摘要
 * @returns {Promise<Array>} 最終候選池（約10-20筆）
 */
async function gptSanityCheck(candidates, normalizedSummary) {
    console.log(`[CaseDescriptionSearch] Layer 4: GPT 型態檢查...`);

    const validCandidates = [];

    // 批次處理以提高效率
    for (const candidate of candidates) {
        try {
            const prompt = `你是台灣法律專家。請判斷以下兩個案件是否屬於「同一類型爭議」。

**使用者案情**（已正規化）：
${normalizedSummary}

**判決案件**：
- 案由：${candidate.JTITLE}
- 摘要：${candidate.summary_ai_full?.substring(0, 300)}
- 案件類型：${candidate.case_type}
- 法律依據：${candidate.legal_basis?.join('、') || '無'}

**判斷標準**（checklist）：
A. 是否為相同類型的法律關係？（例如：都是租賃、都是侵權）
B. 是否包含相似的請求或主張？
C. 是否不是完全不同領域？（例如：一個是買賣一個是繼承）

**回應格式**（必須是有效的 JSON）：
{
  "is_same_type": true/false,
  "reason": "一句話說明理由"
}`;

            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.1,
                max_tokens: 100,
                response_format: { type: "json_object" }
            });

            const result = JSON.parse(response.choices[0].message.content);

            if (result.is_same_type) {
                validCandidates.push({
                    ...candidate,
                    sanity_check_reason: result.reason
                });
            }

        } catch (error) {
            console.error(`[CaseDescriptionSearch] Layer 4 檢查失敗 (${candidate.JID}):`, error);
            // 繼續處理下一筆
        }
    }

    console.log(`[CaseDescriptionSearch] Layer 4 完成: ${validCandidates.length} 筆有效候選`);
    return validCandidates;
}

/**
 * 根據立場排序結果
 *
 * @param {Array} candidates - 候選池
 * @param {string} partySide - 立場（plaintiff/defendant）
 * @param {Array} queryVector - 查詢向量
 * @returns {Array} 排序後的結果（Top 5-10）
 */
function rankByPerspective(candidates, partySide, queryVector) {
    console.log(`[CaseDescriptionSearch] 根據立場排序: ${partySide}`);

    const vectorField = partySide === 'plaintiff'
        ? 'plaintiff_combined_vector'
        : 'defendant_combined_vector';

    const ranked = candidates.map(candidate => {
        // 計算立場向量相似度
        const perspectiveVector = candidate[vectorField];
        const perspectiveSimilarity = perspectiveVector
            ? cosineSimilarity(queryVector, perspectiveVector)
            : 0;

        // 綜合評分
        const finalScore =
            candidate.semantic_score * 0.4 +
            candidate.law_alignment_score * 0.3 +
            perspectiveSimilarity * 0.3;

        return {
            ...candidate,
            perspective_similarity: perspectiveSimilarity,
            final_score: finalScore
        };
    }).sort((a, b) => b.final_score - a.final_score);

    return ranked.slice(0, 10); // 返回 Top 10
}

/**
 * 生成快取 Key
 */
function generateCacheKey(lawDomain, queryVector) {
    // 使用向量的前10個維度生成簡化的 hash
    const vectorHash = queryVector.slice(0, 10)
        .map(v => v.toFixed(4))
        .join('_');
    return `${lawDomain}_${vectorHash}`;
}

/**
 * 從 Firebase 快取中獲取結果
 */
async function getCachedResults(cacheKey) {
    try {
        const db = admin.firestore();
        const docRef = db.collection(CACHE_COLLECTION).doc(cacheKey);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            console.log(`[CaseDescriptionSearch] 快取未命中: ${cacheKey}`);
            return null;
        }

        const data = docSnap.data();

        // 更新命中次數
        await docRef.update({
            hitCount: admin.firestore.FieldValue.increment(1),
            lastAccessedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`[CaseDescriptionSearch] ✅ 快取命中: ${cacheKey}`);
        return data.relevantCases;

    } catch (error) {
        console.error('[CaseDescriptionSearch] 快取查詢失敗:', error);
        return null;
    }
}

/**
 * 將結果存入 Firebase 快取
 */
async function saveCachedResults(cacheKey, relevantCases, normalizedSummary, termGroups) {
    try {
        const db = admin.firestore();
        const docRef = db.collection(CACHE_COLLECTION).doc(cacheKey);

        await docRef.set({
            relevantCases,
            normalizedSummary,
            termGroups,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            hitCount: 0,
            lastAccessedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`[CaseDescriptionSearch] ✅ 結果已快取: ${cacheKey}`);

    } catch (error) {
        console.error('[CaseDescriptionSearch] 快取儲存失敗:', error);
        // 不拋出錯誤，快取失敗不應影響主流程
    }
}

/**
 * 主要搜尋函數
 *
 * @param {string} userCaseDescription - 使用者案情描述
 * @param {string} lawDomain - 案件類型（民事/刑事/行政）
 * @param {string} partySide - 立場（plaintiff/defendant）
 * @param {number} page - 頁碼
 * @param {number} pageSize - 每頁數量
 * @returns {Promise<Object>} 搜尋結果
 */
export async function performCaseDescriptionSearch(
    userCaseDescription,
    lawDomain,
    partySide,
    page = 1,
    pageSize = 10
) {
    const startTime = Date.now();

    try {
        console.log(`[CaseDescriptionSearch] 開始搜尋...`);
        console.log(`案情長度: ${userCaseDescription.length} 字`);
        console.log(`案件類型: ${lawDomain}`);
        console.log(`立場: ${partySide}`);

        // Layer 0: 正規化 + 提取關鍵詞
        const layer0Result = await normalizeAndExtractTerms(userCaseDescription, lawDomain);
        const { normalized_summary, ...termGroups } = layer0Result;

        // 生成向量
        const queryVector = await getEmbedding(normalized_summary);

        // 檢查快取
        const cacheKey = generateCacheKey(lawDomain, queryVector);
        const cachedResults = await getCachedResults(cacheKey);

        let relevantCases;

        if (cachedResults) {
            // 使用快取結果
            relevantCases = cachedResults;
            console.log(`[CaseDescriptionSearch] 使用快取結果，跳過 Layer 1-4`);
        } else {
            // 執行完整檢索管線
            // Layer 1: 關鍵字大抓
            const layer1Candidates = await keywordBroadSearch(termGroups, lawDomain);

            // Layer 2: 語義過濾
            const layer2Candidates = semanticFilter(layer1Candidates, queryVector, 0.70);

            // Layer 3: 法條一致性過濾
            const layer3Candidates = lawAlignmentFilter(layer2Candidates);

            // Layer 4: GPT sanity check
            relevantCases = await gptSanityCheck(layer3Candidates, normalized_summary);

            // 存入快取
            await saveCachedResults(cacheKey, relevantCases, normalized_summary, termGroups);
        }

        // 最後一步：根據立場排序
        const rankedResults = rankByPerspective(relevantCases, partySide, queryVector);

        // 分頁
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        const paginatedResults = rankedResults.slice(start, end);

        const elapsedTime = Date.now() - startTime;
        console.log(`[CaseDescriptionSearch] 搜尋完成，耗時 ${elapsedTime}ms`);

        return {
            success: true,
            results: paginatedResults.map(formatResult),
            total: rankedResults.length,
            totalPages: Math.ceil(rankedResults.length / pageSize),
            currentPage: page,
            enhancedQuery: normalized_summary,
            cached: !!cachedResults,
            processingTime: elapsedTime
        };

    } catch (error) {
        console.error('[CaseDescriptionSearch] 搜尋失敗:', error);
        throw error;
    }
}

/**
 * 格式化結果供前端使用
 */
function formatResult(candidate) {
    return {
        id: candidate.JID,
        title: candidate.JTITLE,
        court: candidate.court,
        date: candidate.JDATE,
        caseType: candidate.case_type,
        verdict: candidate.disposition?.class,
        summary: candidate.summary_ai_full?.substring(0, 200) + '...',
        keyStatutes: candidate.legal_basis || [],
        whyRelevant: candidate.sanity_check_reason || '案情相似',
        scores: {
            semantic_score: candidate.semantic_score?.toFixed(2),
            law_alignment_score: candidate.law_alignment_score,
            final_score: candidate.final_score?.toFixed(2)
        }
    };
}


