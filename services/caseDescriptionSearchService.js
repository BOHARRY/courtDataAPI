// services/caseDescriptionSearchService.js
/**
 * 案由搜尋服務
 * 實現四層檢索管線：
 * Layer 0: Query 正規化 + 關鍵詞群生成
 * Layer 1: 關鍵字大抓（ES）
 * Layer 2: 語義過濾（summary_ai_vector）
 * Layer 3: 法條一致性過濾
 * Layer 4: GPT sanity check（並行處理）
 */

import esClient from '../config/elasticsearch.js';
import { OpenAI } from 'openai';
import { OPENAI_API_KEY, OPENAI_MODEL_NAME_EMBEDDING } from '../config/environment.js';
import admin from 'firebase-admin';
import pLimit from 'p-limit';
import crypto from 'crypto';
import logger from '../utils/logger.js';

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
 * @throws {Error} 如果輸入與法律案由無關
 */
async function normalizeAndExtractTerms(userCaseDescription, lawDomain, userId = null) {
    const startTime = Date.now();

    try {
        const descPreview = `"${userCaseDescription.substring(0, 30)}${userCaseDescription.length > 30 ? '...' : ''}"`;

        logger.info(`📝 正規化案情: ${descPreview}`, {
            event: 'case_description_normalization',
            operation: 'case_description_normalization',
            status: 'started',
            userId,
            descriptionLength: userCaseDescription.length,
            lawDomain
        });

        const prompt = `你是台灣法律專家。請先判斷使用者輸入是否與法律案由相關，然後進行處理。

**使用者案情描述**：
${userCaseDescription}

**第一步：案由相關性檢查**
請判斷使用者輸入是否描述了一個法律糾紛、案件或法律問題。
- 如果是法律相關（例如：合約糾紛、侵權行為、刑事案件、行政訴訟等），設定 is_legal_case: true
- 如果完全無關（例如：天氣、美食、化妝品、日常閒聊等），設定 is_legal_case: false，並說明原因

**第二步：正規化與關鍵詞提取**（僅在 is_legal_case: true 時執行）
1. 將案情改寫成第三人稱、客觀、法院摘要風格
2. 提取四組關鍵詞（每組最多5個詞）：
   - parties_terms: 當事人關係用語（例如：承租人、出租人、樓上住戶）
   - technical_terms: 技術/事實用語（例如：漏水、押金、提前終止）
   - legal_action_terms: 請求/義務用語（例如：返還押金、修繕義務）
   - statute_terms: 相關法條（例如：民法第767條、租賃契約）

**回應格式**（必須是有效的 JSON）：
{
  "is_legal_case": true/false,
  "rejection_reason": "如果 is_legal_case 為 false，請用一句話說明為什麼這不是法律案由",
  "normalized_summary": "本件為...之${lawDomain}糾紛...",
  "parties_terms": ["當事人1", "當事人2"],
  "technical_terms": ["技術詞1", "技術詞2"],
  "legal_action_terms": ["請求1", "請求2"],
  "statute_terms": ["法條1", "法條2"]
}

**注意**：如果 is_legal_case 為 false，normalized_summary 和所有 terms 陣列可以為空。`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            temperature: 0, // 🆕 完全確定性，消除變異
            max_tokens: 600,  // 🆕 增加 token 限制以容納新欄位
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(response.choices[0].message.content);
        const duration = Date.now() - startTime;

        // 🆕 檢查案由相關性
        if (result.is_legal_case === false) {
            const reason = result.rejection_reason || '您的輸入似乎與法律案由無關';

            logger.business(`🚫 案情被拒絕: ${reason}`, {
                event: 'case_description_normalization',
                operation: 'case_description_normalization',
                status: 'rejected',
                userId,
                descriptionLength: userCaseDescription.length,
                rejectionReason: reason,
                duration
            });

            throw new Error(`INVALID_CASE_DESCRIPTION: ${reason}`);
        }

        const totalTerms = (result.parties_terms?.length || 0) +
                          (result.technical_terms?.length || 0) +
                          (result.legal_action_terms?.length || 0) +
                          (result.statute_terms?.length || 0);

        logger.info(`✅ 正規化完成: ${totalTerms} 個關鍵詞`, {
            event: 'case_description_normalization',
            operation: 'case_description_normalization',
            status: 'completed',
            userId,
            normalizedSummary: result.normalized_summary,
            totalTerms,
            termCount_parties: result.parties_terms?.length || 0,
            termCount_technical: result.technical_terms?.length || 0,
            termCount_legalAction: result.legal_action_terms?.length || 0,
            termCount_statute: result.statute_terms?.length || 0,
            partiesTermsJson: JSON.stringify(result.parties_terms || []),
            technicalTermsJson: JSON.stringify(result.technical_terms || []),
            legalActionTermsJson: JSON.stringify(result.legal_action_terms || []),
            statuteTermsJson: JSON.stringify(result.statute_terms || []),
            duration
        });

        return result;

    } catch (error) {
        const duration = Date.now() - startTime;

        // 如果是 INVALID_CASE_DESCRIPTION，直接拋出
        if (error.message.startsWith('INVALID_CASE_DESCRIPTION')) {
            throw error;
        }

        logger.error(`❌ 正規化失敗: ${error.message}`, {
            event: 'case_description_normalization',
            operation: 'case_description_normalization',
            status: 'failed',
            userId,
            descriptionLength: userCaseDescription.length,
            lawDomain,
            duration,
            error: error.message,
            stack: error.stack
        });

        throw error;
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

        // 🔧 動態計算 minimum_should_match
        // 策略：至少命中 30% 的詞彙，但最少 2 個，最多不超過總數
        const totalClauses = shouldClauses.length;
        const minimumMatch = Math.max(2, Math.min(totalClauses, Math.ceil(totalClauses * 0.3)));
        console.log(`[CaseDescriptionSearch] minimum_should_match: ${minimumMatch} (總詞彙: ${totalClauses})`);

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
                    minimum_should_match: minimumMatch, // 🔧 動態調整門檻
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
                // 🟢 必要欄位（Layer 2-4 需要）
                'JID',                          // 識別
                'summary_ai_vector',            // Layer 2 語義過濾
                'legal_basis',                  // Layer 3 法條一致性
                'plaintiff_combined_vector',    // 立場排序
                'defendant_combined_vector',    // 立場排序

                // 🟡 可選欄位（快取預覽）
                'summary_ai_full'               // 快取中的簡短摘要

                // 🔴 移除不必要的欄位：
                // - court, JDATE, JTITLE（從 batchGetFullJudgmentData 獲取）
                // - legal_claim_basis, disposition.class, position_based_analysis（沒有使用）
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
 * @param {number} threshold - 相似度門檻（預設 0.55）
 * @returns {Array} 過濾後的候選池（約60筆）
 */
function semanticFilter(candidates, queryVector, threshold = 0.55) {
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

    // 🔧 處理空候選池
    if (candidates.length === 0) {
        console.log(`[CaseDescriptionSearch] Layer 3 完成: 0 筆候選（輸入為空）`);
        return [];
    }

    // 從語義分數最高的前10筆統計核心法條
    const top10 = candidates.slice(0, 10);
    const statuteCount = {};

    top10.forEach(candidate => {
        const statutes = candidate.legal_basis || [];
        statutes.forEach(statute => {
            statuteCount[statute] = (statuteCount[statute] || 0) + 1;
        });
    });

    // 🆕 動態門檻：至少 30% 的候選包含該法條，最少 2 次
    const candidateCount = Math.min(candidates.length, 10);
    const threshold = Math.max(2, Math.ceil(candidateCount * 0.3));

    const coreStatutes = Object.keys(statuteCount)
        .filter(statute => statuteCount[statute] >= threshold);

    console.log(`[CaseDescriptionSearch] 核心法條 (門檻 ${threshold}/${candidateCount}):`, coreStatutes);

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
        // 🆕 不過濾，保留所有候選（即使 law_alignment_score = 0）
        // 這樣可以避免在候選數量少時出現 0 筆結果
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
 * Layer 4: GPT sanity check（型態保證）- 並行處理版本
 *
 * @param {Array} candidates - Layer 3 的候選池
 * @param {string} normalizedSummary - 正規化的案情摘要
 * @returns {Promise<Array>} 最終候選池（約10-20筆）
 */
async function gptSanityCheck(candidates, normalizedSummary) {
    console.log(`[CaseDescriptionSearch] Layer 4: GPT 型態檢查 (並行模式)...`);
    console.log(`[CaseDescriptionSearch] 候選數量: ${candidates.length}, 並發數: 10`);

    const startTime = Date.now();
    const limit = pLimit(10); // 🚀 最多 10 個並行請求

    // 創建並行任務陣列
    const tasks = candidates.map((candidate, index) =>
        limit(async () => {
            try {
                // 處理 summary_ai_full 可能是陣列的情況
                let summaryText = '';
                if (Array.isArray(candidate.summary_ai_full)) {
                    summaryText = candidate.summary_ai_full[0] || '';
                } else if (typeof candidate.summary_ai_full === 'string') {
                    summaryText = candidate.summary_ai_full;
                }

                const prompt = `你是台灣法律專家。請判斷以下兩個案件是否屬於「同一類型爭議」。

**使用者案情**（已正規化）：
${normalizedSummary}

**判決案件**：
- 案由：${candidate.JTITLE}
- 摘要：${summaryText.substring(0, 300)}
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

                console.log(`[Layer 4] 🚀 處理候選 ${index + 1}/${candidates.length}: ${candidate.JID}`);

                const response = await openai.chat.completions.create({
                    model: "gpt-4.1-nano",  // 🆕 升級到 GPT-4.1-nano（更快更便宜）
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0, // 🆕 完全確定性，消除變異
                    max_tokens: 100,
                    response_format: { type: "json_object" }
                });

                const result = JSON.parse(response.choices[0].message.content);

                if (result.is_same_type) {
                    console.log(`[Layer 4] ✅ 候選 ${index + 1} 通過: ${result.reason}`);
                    return {
                        ...candidate,
                        sanity_check_reason: result.reason
                    };
                } else {
                    console.log(`[Layer 4] ❌ 候選 ${index + 1} 拒絕: ${result.reason}`);
                    return null;
                }

            } catch (error) {
                console.error(`[Layer 4] ⚠️ 候選 ${index + 1} 檢查失敗 (${candidate.JID}):`, error.message);
                return null; // 失敗時返回 null，不中斷其他任務
            }
        })
    );

    // 等待所有任務完成
    const results = await Promise.all(tasks);

    // 過濾掉 null（失敗或拒絕的候選）
    const validCandidates = results.filter(r => r !== null);

    const elapsedTime = Date.now() - startTime;
    const successRate = ((validCandidates.length / candidates.length) * 100).toFixed(1);

    console.log(`[CaseDescriptionSearch] Layer 4 完成: ${validCandidates.length}/${candidates.length} 筆通過 (${successRate}%)`);
    console.log(`[CaseDescriptionSearch] Layer 4 耗時: ${elapsedTime}ms (平均 ${(elapsedTime / candidates.length).toFixed(0)}ms/筆)`);

    return validCandidates;
}

/**
 * 從 Elasticsearch 批次獲取立場向量
 * 用於從快取恢復時補充被移除的向量資料
 */
async function batchGetPerspectiveVectors(jids) {
    try {
        const esResult = await esClient.search({
            index: ES_INDEX_NAME,
            query: {
                terms: { JID: jids }
            },
            _source: ['JID', 'plaintiff_combined_vector', 'defendant_combined_vector'],
            size: jids.length
        });

        const vectorMap = {};
        esResult.hits.hits.forEach(hit => {
            vectorMap[hit._source.JID] = {
                plaintiff_combined_vector: hit._source.plaintiff_combined_vector,
                defendant_combined_vector: hit._source.defendant_combined_vector
            };
        });

        console.log(`[CaseDescriptionSearch] 已獲取 ${Object.keys(vectorMap).length} 筆立場向量`);
        return vectorMap;

    } catch (error) {
        console.error('[CaseDescriptionSearch] 獲取立場向量失敗:', error);
        return {};
    }
}

/**
 * 🆕 計算勝負加權分數
 * 根據 overall_result 給予不同的加權分數
 *
 * @param {string} overallResult - 勝負結果（major_victory, substantial_victory, etc.）
 * @returns {number} 加權分數（0.0 - 1.0）
 */
function calculateVictoryBonus(overallResult) {
    const bonusMap = {
        // 勝訴方向（4 級）
        'major_victory': 1.0,          // 完全勝訴 +100%
        'substantial_victory': 0.8,    // 實質勝訴 +80%
        'minor_victory': 0.6,          // 形式勝訴 +60%
        'partial_success': 0.4,        // 部分勝訴 +40%（中性）

        // 敗訴方向（3 級）
        'minor_defeat': 0.2,           // 形式敗訴 +20%
        'substantial_defeat': 0.1,     // 實質敗訴 +10%
        'major_defeat': 0.0            // 完全敗訴 +0%
    };

    return bonusMap[overallResult] !== undefined ? bonusMap[overallResult] : 0.4; // 預設中性
}

/**
 * 根據立場排序結果
 * 🆕 優化: 將勝負結果納入排序權重，優先顯示該立場的勝訴案例
 *
 * @param {Array} candidates - 候選池
 * @param {string} partySide - 立場（plaintiff/defendant）
 * @param {Array} queryVector - 查詢向量
 * @returns {Array} 排序後的結果
 */
function rankByPerspective(candidates, partySide, queryVector) {
    console.log(`[CaseDescriptionSearch] 根據立場排序: ${partySide}`);

    const vectorField = partySide === 'plaintiff'
        ? 'plaintiff_combined_vector'
        : 'defendant_combined_vector';

    const ranked = candidates.map(candidate => {
        // 1. 計算立場向量相似度
        const perspectiveVector = candidate[vectorField];
        const perspectiveSimilarity = perspectiveVector
            ? cosineSimilarity(queryVector, perspectiveVector)
            : 0;

        // 🆕 2. 計算勝負加權分數
        const positionAnalysis = candidate.position_based_analysis;
        const perspective = partySide === 'plaintiff'
            ? positionAnalysis?.plaintiff_perspective
            : positionAnalysis?.defendant_perspective;

        const victoryBonus = calculateVictoryBonus(perspective?.overall_result);

        // 🆕 3. 綜合評分（加入勝負權重）
        // 調整權重分配：語義 35% + 法條 25% + 立場 25% + 勝負 15%
        const finalScore =
            candidate.semantic_score * 0.35 +           // 語義相似度 35%
            candidate.law_alignment_score * 0.25 +      // 法條對齊度 25%
            perspectiveSimilarity * 0.25 +              // 立場相似度 25%
            victoryBonus * 0.15;                        // 🆕 勝負加權 15%

        return {
            ...candidate,
            perspective_similarity: perspectiveSimilarity,
            victory_bonus: victoryBonus,  // 🆕 保存勝負加權分數
            final_score: finalScore
        };
    }).sort((a, b) => b.final_score - a.final_score);

    // 🔧 返回全部候選（已排序），不截斷
    // 分頁邏輯在主函數中處理，這裡只負責排序

    // 🆕 統計勝負分布
    const victoryCount = ranked.filter(c => c.victory_bonus >= 0.6).length;
    const defeatCount = ranked.filter(c => c.victory_bonus <= 0.2).length;
    const partialCount = ranked.filter(c => c.victory_bonus > 0.2 && c.victory_bonus < 0.6).length;

    console.log(`[CaseDescriptionSearch] 勝負分布: 勝訴 ${victoryCount} 筆, 部分勝訴 ${partialCount} 筆, 敗訴 ${defeatCount} 筆`);

    return ranked;
}

/**
 * 生成快取 Key
 * 🆕 使用原始輸入的 hash，而不是向量，以提高快取命中率
 */
function generateCacheKey(lawDomain, userCaseDescription) {
    // 標準化輸入：去除空白、轉小寫
    const normalized = userCaseDescription.trim().toLowerCase();

    // 生成 MD5 hash（取前 16 字元）
    const hash = crypto
        .createHash('md5')
        .update(normalized)
        .digest('hex')
        .substring(0, 16);

    return `${lawDomain}_${hash}`;
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
 * 精簡候選資料以符合 Firestore 1MB 限制
 * 只保留恢復排序需要的欄位，前端需要的完整資料從 batchGetFullJudgmentData 獲取
 */
function simplifyCandidate(candidate) {
    return {
        // 🟢 識別（必要）
        JID: candidate.JID,

        // 🟢 Layer 3 恢復需要（必要）
        legal_basis: candidate.legal_basis || [],

        // 🟢 分數和排序資訊（必要，用於恢復排序）
        keyword_score: candidate.keyword_score,
        semantic_score: candidate.semantic_score,
        law_alignment_score: candidate.law_alignment_score,
        sanity_check_reason: candidate.sanity_check_reason,
        core_statutes: candidate.core_statutes,

        // 🟡 快速預覽（可選，截斷到 500 字元以節省空間）
        summary_ai_full: Array.isArray(candidate.summary_ai_full)
            ? candidate.summary_ai_full[0]?.substring(0, 500)
            : candidate.summary_ai_full?.substring(0, 500)

        // � 移除的欄位（從 batchGetFullJudgmentData 獲取）：
        // - JTITLE, JDATE, JYEAR, JCASE, JNO, court（基本資訊）
        // - case_type, stage0_case_type, verdict_type（案件分類）
        // - JFULL（完整判決書）
        // - summary_ai_vector（向量，12 KB）
        // - plaintiff_combined_vector, defendant_combined_vector（向量，12 KB）
        // - legal_issues, citable_paragraphs（nested，可能很大）
    };
}

/**
 * 將結果存入 Firebase 快取
 */
async function saveCachedResults(cacheKey, relevantCases, normalizedSummary, termGroups) {
    try {
        const db = admin.firestore();
        const docRef = db.collection(CACHE_COLLECTION).doc(cacheKey);

        // 🔧 精簡候選資料以符合 Firestore 1MB 限制
        const simplifiedCases = relevantCases.map(simplifyCandidate);

        await docRef.set({
            relevantCases: simplifiedCases,  // 🆕 使用精簡版本
            normalizedSummary,
            termGroups,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            hitCount: 0,
            lastAccessedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`[CaseDescriptionSearch] ✅ 結果已快取: ${cacheKey} (${simplifiedCases.length} 筆精簡候選)`);

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
    pageSize = 10,
    userId = null
) {
    const startTime = Date.now();

    logger.info('開始執行案由搜尋', {
        userId,
        operation: 'case_description_search',
        descriptionLength: userCaseDescription.length,
        lawDomain,
        partySide,
        page,
        pageSize
    });

    try {

        // 🆕 檢查快取（使用原始輸入）
        const cacheKey = generateCacheKey(lawDomain, userCaseDescription);
        const cachedResults = await getCachedResults(cacheKey);

        let queryVector;
        let layer0Result;
        let normalized_summary;
        let termGroups;

        if (cachedResults) {
            logger.info(`⚡ 案由搜尋快取命中: ${cachedResults.length} 筆結果`, {
                event: 'judgment_search',
                operation: 'case_description_search',
                status: 'cache_hit',
                userId,
                cacheKey,
                cachedResultCount: cachedResults.length
            });

            // 快取命中，仍需生成向量用於立場排序
            layer0Result = await normalizeAndExtractTerms(userCaseDescription, lawDomain, userId);
            normalized_summary = layer0Result.normalized_summary;
            termGroups = layer0Result;
            delete termGroups.normalized_summary;
            queryVector = await getEmbedding(normalized_summary);
        } else {
            logger.info(`🔍 案由搜尋: ${lawDomain} | ${partySide}`, {
                event: 'judgment_search',
                operation: 'case_description_search',
                status: 'started',
                userId,
                lawDomain,
                partySide,
                descriptionLength: userCaseDescription.length,
                cacheKey
            });

            // 快取未命中，執行完整流程
            layer0Result = await normalizeAndExtractTerms(userCaseDescription, lawDomain, userId);
            normalized_summary = layer0Result.normalized_summary;
            termGroups = layer0Result;
            delete termGroups.normalized_summary;
            queryVector = await getEmbedding(normalized_summary);
        }

        let relevantCases;

        if (cachedResults) {
            // 使用快取結果
            relevantCases = cachedResults;
            console.log(`[CaseDescriptionSearch] 使用快取結果，跳過 Layer 1-4`);

            // 🔧 從 ES 批次獲取立場向量（用於排序，不持久化）
            const jids = relevantCases.map(c => c.JID);
            const vectorMap = await batchGetPerspectiveVectors(jids);

            // 🔧 臨時補充立場向量（僅用於本次排序）
            relevantCases = relevantCases.map(candidate => ({
                ...candidate,
                plaintiff_combined_vector: vectorMap[candidate.JID]?.plaintiff_combined_vector,
                defendant_combined_vector: vectorMap[candidate.JID]?.defendant_combined_vector
            }));

            console.log(`[CaseDescriptionSearch] 已補充 ${Object.keys(vectorMap).length} 筆立場向量用於排序`);
        } else {
            // 執行完整檢索管線
            // Layer 1: 關鍵字大抓
            const layer1Candidates = await keywordBroadSearch(termGroups, lawDomain);

            // Layer 2: 語義過濾（門檻 0.61，根據實測相似度範圍調整）
            const layer2Candidates = semanticFilter(layer1Candidates, queryVector, 0.61);

            // Layer 3: 法條一致性過濾
            const layer3Candidates = lawAlignmentFilter(layer2Candidates);

            // Layer 4: GPT sanity check
            relevantCases = await gptSanityCheck(layer3Candidates, normalized_summary);

            // 🔧 存入快取（精簡版，不包含向量）
            await saveCachedResults(cacheKey, relevantCases, normalized_summary, termGroups);
        }

        // 最後一步：根據立場排序（使用臨時補充的向量或原始向量）
        const rankedResults = rankByPerspective(relevantCases, partySide, queryVector);

        // 分頁
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        const paginatedResults = rankedResults.slice(start, end);

        // 🆕 批次獲取當前頁的完整判決資料
        const jidsToFetch = paginatedResults.map(r => r.JID);
        const fullDataMap = await batchGetFullJudgmentData(jidsToFetch);

        const elapsedTime = Date.now() - startTime;

        // 記錄成功
        logger.business(`✅ 案由搜尋完成: ${rankedResults.length} 筆結果 (${cachedResults ? '快取' : '檢索'}, ${elapsedTime}ms)`, {
            event: 'judgment_search',
            operation: 'case_description_search',
            status: 'completed',
            userId,
            descriptionLength: userCaseDescription.length,
            lawDomain,
            partySide,
            resultCount: rankedResults.length,
            cached: !!cachedResults,
            duration: elapsedTime,
            page,
            pageSize
        });

        // 性能監控
        if (elapsedTime > 8000) {
            logger.performance(`⚠️ 案由搜尋較慢: ${elapsedTime}ms (${rankedResults.length} 筆結果, ${cachedResults ? '快取' : '檢索'})`, {
                event: 'judgment_search',
                operation: 'case_description_search',
                status: 'slow_query',
                userId,
                lawDomain,
                partySide,
                duration: elapsedTime,
                resultCount: rankedResults.length,
                cached: !!cachedResults,
                threshold: 8000
            });
        }

        return {
            success: true,
            results: paginatedResults.map(candidate => formatResult(candidate, fullDataMap[candidate.JID])),
            candidateList: rankedResults.map(r => ({
                JID: r.JID,
                keyword_score: r.keyword_score,
                semantic_score: r.semantic_score,
                law_alignment_score: r.law_alignment_score,
                perspective_similarity: r.perspective_similarity,
                victory_bonus: r.victory_bonus,  // 🆕 勝負加權分數
                final_score: r.final_score,
                sanity_check_reason: r.sanity_check_reason
            })),  // 🆕 返回完整的候選列表（包含分數，已排序）
            total: rankedResults.length,
            totalPages: Math.ceil(rankedResults.length / pageSize),
            currentPage: page,
            enhancedQuery: normalized_summary,
            cached: !!cachedResults,
            processingTime: elapsedTime
        };

    } catch (error) {
        const elapsedTime = Date.now() - startTime;

        logger.error(`❌ 案由搜尋失敗: ${error.message}`, {
            event: 'judgment_search',
            operation: 'case_description_search',
            status: 'failed',
            userId,
            descriptionLength: userCaseDescription.length,
            lawDomain,
            partySide,
            duration: elapsedTime,
            error: error.message,
            stack: error.stack
        });

        throw error;
    }
}

/**
 * 🆕 批次獲取完整判決資料（使用 ES mget API）
 * 只在最後階段獲取必要的完整資料，避免在 Layer 1-4 傳輸大量無用資料
 */
async function batchGetFullJudgmentData(jids) {
    try {
        console.log(`[CaseDescriptionSearch] 批次獲取 ${jids.length} 筆完整判決資料...`);

        const result = await esClient.mget({
            index: ES_INDEX_NAME,
            body: {
                ids: jids
            },
            _source: [
                // 基本資訊
                'JID', 'court', 'JDATE', 'JTITLE',
                'JYEAR', 'JCASE', 'JNO',  // 🆕 JID 格式化所需欄位

                // 摘要和理由
                'summary_ai',           // AI 摘要（陣列）
                'summary_ai_full',      // 完整摘要（陣列）
                'main_reasons_ai',      // 判決理由（陣列）

                // 爭點和段落
                'legal_issues',         // 爭點資訊（nested）
                'citable_paragraphs',   // 可引用段落（nested）

                // 完整判決文和法院見解
                'JFULL',                // 完整判決文
                'CourtInsightsStart',   // 法院見解起始
                'CourtInsightsEND',     // 法院見解結束

                // 難度和分數
                'SCORE',                // 難度分數

                // 法條和案件類型
                'legal_basis',
                'case_type',
                'verdict_type',

                // 🆕 立場分析（原告/被告勝敗結果）
                'position_based_analysis',  // ✅ 包含 plaintiff_perspective 和 defendant_perspective

                // 其他前端可能需要的欄位
                'tags',
                'disposition'
            ]
        });

        // 建立 JID -> 完整資料的映射
        const dataMap = {};
        if (result && result.docs) {
            result.docs.forEach(doc => {
                if (doc.found && doc._source) {
                    dataMap[doc._id] = doc._source;
                }
            });
        }

        console.log(`[CaseDescriptionSearch] 成功獲取 ${Object.keys(dataMap).length}/${jids.length} 筆完整資料`);
        return dataMap;

    } catch (error) {
        console.error('[CaseDescriptionSearch] 批次獲取完整資料失敗:', error);
        return {};
    }
}

/**
 * 格式化結果供前端使用
 * 合併輕量級候選資料 + 完整判決資料
 */
function formatResult(candidate, fullData) {
    // 處理 summary_ai_full 可能是陣列的情況（用於簡短摘要）
    let summaryText = '';
    if (Array.isArray(candidate.summary_ai_full)) {
        summaryText = candidate.summary_ai_full[0] || '';
    } else if (typeof candidate.summary_ai_full === 'string') {
        summaryText = candidate.summary_ai_full;
    }

    // 🆕 處理 summary_ai 陣列 -> 字串（前端期望字串格式）
    let summaryAiString = '';
    if (fullData?.summary_ai) {
        if (Array.isArray(fullData.summary_ai)) {
            summaryAiString = fullData.summary_ai[0] || '';
        } else {
            summaryAiString = fullData.summary_ai;
        }
    }

    // 🔧 正確的合併邏輯：先展開 fullData，再覆蓋案由搜尋特有的欄位
    // 不要用 ...candidate 覆蓋，因為 candidate 中可能沒有某些欄位（會是 undefined）
    return {
        ...fullData,  // 展開完整資料（包括 JTITLE, JDATE, court, verdict_type, summary_ai, legal_issues, JFULL 等）

        // 🟢 只覆蓋案由搜尋特有的欄位
        id: candidate.JID,
        title: fullData?.JTITLE || '',
        summary: summaryText.substring(0, 200) + '...',  // 簡短摘要供列表顯示
        summary_ai: summaryAiString,  // 🆕 轉換為字串格式

        // 🟢 案由搜索特有的分數和排序資訊（明確覆蓋，不用 ...candidate）
        keyword_score: candidate.keyword_score,
        semantic_score: candidate.semantic_score,
        law_alignment_score: candidate.law_alignment_score,
        perspective_similarity: candidate.perspective_similarity,
        victory_bonus: candidate.victory_bonus,  // 🆕 勝負加權分數
        final_score: candidate.final_score,
        whyRelevant: candidate.sanity_check_reason || '案情相似',
        caseDescriptionScores: {
            semantic_score: candidate.semantic_score?.toFixed(2),
            law_alignment_score: candidate.law_alignment_score,
            perspective_similarity: candidate.perspective_similarity?.toFixed(2),
            victory_bonus: candidate.victory_bonus?.toFixed(2),  // 🆕 勝負加權分數
            final_score: candidate.final_score?.toFixed(2)
        }
    };
}


