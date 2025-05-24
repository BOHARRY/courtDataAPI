// services/aiSuccessAnalysisService.js
import esClient from '../config/elasticsearch.js';
import { OpenAI } from 'openai';
import { OPENAI_API_KEY, OPENAI_MODEL_NAME_EMBEDDING, OPENAI_MODEL_NAME_CHAT } from '../config/environment.js';
import { formatEsResponse } from '../utils/response-formatter.js';
import { getStandardizedOutcomeForAnalysis } from '../utils/case-analyzer.js'; // 假設此函數已更新並能處理 verdict_type 陣列
import { NEUTRAL_OUTCOME_CODES } from '../utils/constants.js';

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});
const ES_INDEX_NAME = 'search-boooook';
const EMBEDDING_MODEL = OPENAI_MODEL_NAME_EMBEDDING || 'text-embedding-3-large';
const CHAT_MODEL = OPENAI_MODEL_NAME_CHAT || 'gpt-4.1'; // 與您 README.md 中一致

async function getEmbeddingForText(text) {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        const error = new Error('輸入文本不能為空。');
        error.statusCode = 400; // Bad Request
        error.details = { internal_code: 'EMPTY_INPUT_TEXT' };
        throw error;
    }
    try {
        console.log(`[AIEmbedding] 正在為文本獲取 embedding (模型: ${EMBEDDING_MODEL})...`);
        const response = await openai.embeddings.create({
            model: EMBEDDING_MODEL,
            input: text.trim(),
            dimensions: 1536, // 確保使用正確的維度
        });
        if (response.data && response.data[0] && response.data[0].embedding) {
            const embedding = response.data[0].embedding;
            console.log(`[AIEmbedding] 成功獲取文本 embedding。 Generated queryVector (維度: ${embedding.length}, 前 5 dims): [${embedding.slice(0, 5).join(', ')}, ...]`); // <--- 更新日誌，檢查維度
            if (embedding.length !== 1536) { // <--- 增加一個額外檢查
                console.error(`[AIEmbedding] 嚴重錯誤：OpenAI 返回的 embedding 維度 (${embedding.length}) 與期望的 1536 不符！`);
                const error = new Error('OpenAI 返回的 embedding 維度與系統配置不符。');
                error.statusCode = 500;
                error.details = { internal_code: 'OPENAI_DIMENSION_MISMATCH', expected: 1536, received: embedding.length };
                throw error;
            }
            return embedding;
        } else {
            console.error('[AIEmbedding] OpenAI embedding API 回應格式不符預期:', response);
            const error = new Error('OpenAI embedding API 回應格式錯誤。');
            error.statusCode = 502; // Bad Gateway
            error.details = { internal_code: 'OPENAI_EMBEDDING_BAD_RESPONSE' };
            throw error;
        }
    } catch (error) {
        console.error('[AIEmbedding] 調用 OpenAI embedding API 失敗:', error.response ? JSON.stringify(error.response.data, null, 2) : error.message, error.stack);
        const serviceError = new Error(`無法生成文本向量：${error.message}`);
        serviceError.statusCode = error.response?.status || 500;
        serviceError.details = { internal_code: 'EMBEDDING_API_CALL_FAILED', originalError: error.message };
        throw serviceError;
    }
}

function isConsideredWin(neutralOutcomeCode, caseTypeSelected, userPerspective = "plaintiff") {
    // ... (這裡使用您最新確認過的 isConsideredWin 函數邏輯)
    if (!neutralOutcomeCode) return false;
    if (caseTypeSelected === "民事") {
        if (userPerspective === "plaintiff") {
            return [
                NEUTRAL_OUTCOME_CODES.CIVIL_P_WIN_FULL,
                NEUTRAL_OUTCOME_CODES.CIVIL_P_WIN_PARTIAL,
                NEUTRAL_OUTCOME_CODES.CIVIL_APPEAL_DISMISSED_FAVOR_P,
                NEUTRAL_OUTCOME_CODES.CIVIL_D_LOSE_FULL
            ].includes(neutralOutcomeCode);
        } else if (userPerspective === "defendant") {
            return [
                NEUTRAL_OUTCOME_CODES.CIVIL_D_WIN_FULL,
                NEUTRAL_OUTCOME_CODES.CIVIL_P_LOSE_FULL,
                NEUTRAL_OUTCOME_CODES.CIVIL_APPEAL_DISMISSED_FAVOR_D
            ].includes(neutralOutcomeCode);
        }
    } else if (caseTypeSelected === "刑事") {
        if (userPerspective === "defendant") {
            return [
                NEUTRAL_OUTCOME_CODES.CRIMINAL_ACQUITTED,
                NEUTRAL_OUTCOME_CODES.CRIMINAL_CHARGE_DISMISSED_NO_PROSECUTION,
                NEUTRAL_OUTCOME_CODES.CRIMINAL_CHARGE_DISMISSED_NOT_ACCEPTED,
                NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_PROBATION,
                NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_FINE_ONLY,
                NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_FINE_CONVERTIBLE,
                NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_PARTIAL_WIN,
                NEUTRAL_OUTCOME_CODES.CRIMINAL_APPEAL_DISMISSED_FAVOR_D
            ].includes(neutralOutcomeCode);
        } else if (userPerspective === "prosecution") {
            return [
                NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_AS_EXPECTED_OR_SENTENCED,
                NEUTRAL_OUTCOME_CODES.CRIMINAL_APPEAL_DISMISSED_AGAINST_D
            ].includes(neutralOutcomeCode);
        }
    } else if (caseTypeSelected === "行政") {
        if (userPerspective === "plaintiff") {
            return [
                NEUTRAL_OUTCOME_CODES.ADMIN_WIN_REVOKE_FULL,
                NEUTRAL_OUTCOME_CODES.ADMIN_WIN_REVOKE_PARTIAL,
                NEUTRAL_OUTCOME_CODES.ADMIN_WIN_OBLIGATION,
                NEUTRAL_OUTCOME_CODES.ADMIN_APPEAL_DISMISSED_FAVOR_P
            ].includes(neutralOutcomeCode);
        } else if (userPerspective === "defendant") {
            return [
                NEUTRAL_OUTCOME_CODES.ADMIN_LOSE_DISMISSED,
                NEUTRAL_OUTCOME_CODES.ADMIN_APPEAL_DISMISSED_AGAINST_P
            ].includes(neutralOutcomeCode);
        }
    }
    return false;
}

export async function analyzeSuccessFactors(caseTypeSelected, caseSummaryText) {
    console.log(`[AISuccessAnalysisService] 開始分析 - 案件類型: ${caseTypeSelected}, 摘要長度: ${caseSummaryText.length}`);

    let queryVector;
    try {
        queryVector = await getEmbeddingForText(caseSummaryText);
    } catch (error) {
        // getEmbeddingForText 已經拋出帶 statusCode 的錯誤
        console.error('[AISuccessAnalysisService] 文本向量化失敗:', error.message, error.details);
        throw error; // 直接向上拋出
    }

    // --- 修正 case_type 的 filter ---
    let typeFilterQuery;
    const esCaseTypeMainKeyword = caseTypeSelected; // "民事", "刑事", "行政"

    if (esCaseTypeMainKeyword === "民事") {
        // 匹配所有以 "民事" 或 "家事" 開頭的 case_type
        typeFilterQuery = {
            bool: {
                should: [
                    { prefix: { "case_type": "民事" } }, // case_type 是 keyword，prefix 可用
                    { prefix: { "case_type": "家事" } }  // 家事也算廣義民事
                ],
                minimum_should_match: 1
            }
        };
    } else if (esCaseTypeMainKeyword === "刑事") {
        typeFilterQuery = { prefix: { "case_type": "刑事" } };
    } else if (esCaseTypeMainKeyword === "行政") {
        // 行政案件的 case_type 可能更多樣，例如 "行政訴訟" "行政處分" "訴願" 等
        // 這裡使用 wildcard 匹配包含 "行政" 或 "訴願" 的
        typeFilterQuery = {
            bool: {
                should: [
                    { wildcard: { "case_type": "*行政*" } },
                    { wildcard: { "case_type": "*訴願*" } }
                    // 也可以用 terms 列舉您已知的行政 case_type
                ],
                minimum_should_match: 1
            }
        };
    } else {
        // 不應發生，因為控制器已驗證 caseTypeSelected
        console.warn(`[AISuccessAnalysisService] 未知的案件主類型: ${esCaseTypeMainKeyword}，將不進行案件類型篩選。`);
        typeFilterQuery = { match_all: {} }; // 或者返回錯誤
    }

    try {
        console.log(`[AISuccessAnalysisService] Elasticsearch KNN Query:`, JSON.stringify({ knn: knnQuery, _source: ["JID", "case_type", "verdict_type", "verdict"], size: 10 }, null, 2));
        const knnQuery = {
            field: "text_embedding",
            query_vector: queryVector,
            k: 50,
            num_candidates: 100, // 可以根據數據量和性能調整
            filter: [typeFilterQuery] // <--- 使用修正後的 typeFilterQuery
        };

        // console.log(`[AISuccessAnalysisService] Elasticsearch KNN Query:`, JSON.stringify({ knn: knnQuery, _source: ["JID", "case_type"], size: 10 }, null, 2));

        const esResult = await esClient.search({
            index: ES_INDEX_NAME,
            knn: knnQuery,
            _source: ["JID", "verdict_type", "summary_ai_full", "JFULL", "citations", "main_reasons_ai", "JTITLE", "case_type", "verdict"],
            size: 30 // 獲取 Top 30 相似且符合類型的案件
        });

        const formattedResponse = formatEsResponse(esResult, 30);
        const similarCases = formattedResponse.hits;
        const analyzedCaseCount = similarCases.length;

        console.log(`[AISuccessAnalysisService] 找到 ${analyzedCaseCount} 件相似案件。`);

        if (analyzedCaseCount < 5) { // 閾值可以調整
            return {
                status: 'insufficient_data',
                analyzedCaseCount: analyzedCaseCount,
                estimatedWinRate: null,
                keyJudgementPoints: [],
                commonCitedCases: [],
                message: `找到的相似${caseTypeSelected}案件數量過少 (${analyzedCaseCount}件)，無法進行有效分析。請嘗試提供更詳細的案情描述或檢查案件類型選擇。`
            };
        }

        let winCount = 0;
        const validCasesForAISummary = [];
        let analysisPerspective = caseTypeSelected === "刑事" ? "defendant" : "plaintiff";
        console.log(`[AISuccessAnalysisService] 分析視角設定為: ${analysisPerspective} (針對 ${caseTypeSelected} 案件)`);

        console.log(`\n--- [AISuccessAnalysisService] 遍歷 ${analyzedCaseCount} 件相似案件進行勝訴判斷 ---`);
        for (let i = 0; i < similarCases.length; i++) {
            const caseDoc = similarCases[i];
            const sourceVerdictType = caseDoc.verdict_type; // 可能是字串或陣列

            console.log(`\n[Case ${i+1}] JID: ${caseDoc.JID}`);
            console.log(`  原始 verdict_type from ES:`, sourceVerdictType);
            // console.log(`  原始 verdict from ES:`, caseDoc.verdict); // 如果需要也可以打印

            const outcome = getStandardizedOutcomeForAnalysis(
                sourceVerdictType,
                caseTypeSelected
            );

            console.log(`  getStandardizedOutcomeForAnalysis -> neutralOutcomeCode: ${outcome.neutralOutcomeCode}`);
            console.log(`  getStandardizedOutcomeForAnalysis -> description: "${outcome.description}"`);
            console.log(`  getStandardizedOutcomeForAnalysis -> isSubstantiveOutcome: ${outcome.isSubstantiveOutcome}`);

            const consideredWin = isConsideredWin(outcome.neutralOutcomeCode, caseTypeSelected, analysisPerspective);
            console.log(`  isConsideredWin (${analysisPerspective} perspective) -> ${consideredWin}`);

            if (outcome.isSubstantiveOutcome && consideredWin) {
                winCount++;
                console.log(`  ^^^ 判定為勝訴！ WinCount: ${winCount}`);
                if (caseDoc.summary_ai_full || (caseDoc.JFULL && caseDoc.JFULL.length > 100) || (caseDoc.main_reasons_ai && caseDoc.main_reasons_ai.length > 0)) {
                    validCasesForAISummary.push(caseDoc);
                }
            }
        }
        console.log(`--- [AISuccessAnalysisService] 遍歷結束 ---\n`);


        const estimatedWinRate = analyzedCaseCount > 0 ? parseFloat(((winCount / analyzedCaseCount) * 100).toFixed(1)) : 0;
        console.log(`[AISuccessAnalysisService] 勝訴案件數: ${winCount} (基於 isSubstantiveOutcome 和 isConsideredWin), 總分析案件數: ${analyzedCaseCount}, 勝訴率: ${estimatedWinRate}%`);
        console.log(`[AISuccessAnalysisService] 將有 ${validCasesForAISummary.length} 件案例用於 AI 摘要和援引分析。`);

        let keyJudgementPoints = [];
        let commonCitedCases = [];
        const MIN_CASES_FOR_AI_ANALYSIS = 3;

        if (validCasesForAISummary.length >= MIN_CASES_FOR_AI_ANALYSIS) {
            // 1. 提煉裁判要點摘要
            try {
                console.log(`[AISuccessAnalysisService] 準備為 ${validCasesForAISummary.length} 件勝訴案例生成裁判要點摘要...`);
                const textsForSummary = validCasesForAISummary.slice(0, 10).map(
                    c => {
                        let content = c.summary_ai_full;
                        if (!content && c.JFULL) content = c.JFULL.substring(0, 1000); // 限制長度避免超長
                        if (!content && c.main_reasons_ai && Array.isArray(c.main_reasons_ai) && c.main_reasons_ai.length > 0) content = c.main_reasons_ai.join(' ');
                        return `案件 JID ${c.JID}:\n摘要: ${content || '無詳細內容可供分析'}\n---`;
                    }
                ).join('\n\n');

                let perspectiveDescriptionForPrompt = "原告勝訴";
                if (caseTypeSelected === "刑事") perspectiveDescriptionForPrompt = "被告獲得有利結果（如無罪、免訴、不受理、輕判等）";
                else if (caseTypeSelected === "行政") perspectiveDescriptionForPrompt = "原告（人民）勝訴（如行政處分被撤銷）";

                const summaryPrompt = `你是一位專業的台灣法律AI助手。請基於以下多份相似${caseTypeSelected}案件的「勝訴」判決摘要（分析視角為：${perspectiveDescriptionForPrompt}），總結出法院通常支持勝訴方的「3到5個關鍵裁判要點或常見論述模式」。
                請直接以 JSON 格式的陣列返回，陣列中每個元素是一個字串，代表一個要點。例如：["要點一：...", "要點二：..." ]
                分析的案情主軸是關於：「${caseSummaryText.substring(0, 150)}...」
                相關勝訴判決摘要如下：
                ${textsForSummary}`;

                console.log(`[AISuccessAnalysisService] 裁判要點 Prompt (前500字): ${summaryPrompt.substring(0, 500)}...`);
                const summaryResponse = await openai.chat.completions.create({
                    model: CHAT_MODEL,
                    messages: [{ role: 'user', content: summaryPrompt }],
                    temperature: 0.3,
                    response_format: { type: "json_object" },
                });

                if (summaryResponse.choices && summaryResponse.choices[0] && summaryResponse.choices[0].message.content) {
                    const content = summaryResponse.choices[0].message.content;
                    console.log(`[AISuccessAnalysisService] OpenAI 裁判要點回應: ${content}`);
                    try {
                        const parsedJson = JSON.parse(content);
                        if (Array.isArray(parsedJson)) {
                            keyJudgementPoints = parsedJson.filter(p => typeof p === 'string' && p.length > 5);
                        } else if (typeof parsedJson === 'object' && parsedJson !== null) {
                            const arrayKey = Object.keys(parsedJson).find(k => Array.isArray(parsedJson[k]));
                            if (arrayKey) {
                                keyJudgementPoints = parsedJson[arrayKey].filter(p => typeof p === 'string' && p.length > 5);
                            }
                        }
                        if (keyJudgementPoints.length === 0 && (content.includes("\n- ") || content.includes("\n* ") || content.match(/\n\d+\.\s/))) {
                            keyJudgementPoints = content.split(/\n- |\n\* |\n\d+\.\s/)
                                .map(s => s.replace(/^- |^\* |^\d+\.\s/, "").trim())
                                .filter(s => s.length > 10 && !s.toLowerCase().includes("json"));
                        }
                        if (keyJudgementPoints.length === 0 && content.trim().length > 10 && !content.trim().startsWith("{") && !content.trim().startsWith("[")) {
                            const cleanedContent = content.replace(/```json\n|\n```|"/g, "").trim();
                            if (cleanedContent.length > 10) keyJudgementPoints = [cleanedContent];
                        }
                        if (keyJudgementPoints.length === 0) {
                            console.warn("[AISuccessAnalysisService] AI裁判要點回應無法有效解析為列表。內容:", content);
                            keyJudgementPoints = ["AI裁判要點分析結果格式需進一步處理。"];
                        }
                    } catch (jsonError) {
                        console.error('[AISuccessAnalysisService] 解析AI裁判要點JSON失敗:', jsonError, '原始內容:', content);
                        const cleanedContent = content.replace(/```json\n|\n```|"/g, "").trim();
                        if (cleanedContent.length > 10 && !cleanedContent.startsWith("{") && !cleanedContent.startsWith("[")) {
                            keyJudgementPoints = [cleanedContent];
                        } else {
                            keyJudgementPoints = ["AI裁判要點分析中，請稍後查看詳細報告（格式解析錯誤）。"];
                        }
                    }
                } else {
                    keyJudgementPoints = ["AI裁判要點分析暫時無法生成（無有效回應）。"];
                }
                console.log(`[AISuccessAnalysisService] 生成的裁判要點:`, keyJudgementPoints);
            } catch (aiError) {
                console.error('[AISuccessAnalysisService] 生成裁判要點摘要失敗:', aiError.response ? JSON.stringify(aiError.response.data, null, 2) : aiError.message, aiError.stack);
                keyJudgementPoints = [`AI裁判要點分析時發生錯誤: ${aiError.message}`];
            }

            // 2. 分析常見援引判例
            try {
                console.log(`[AISuccessAnalysisService] 開始分析 ${validCasesForAISummary.length} 件勝訴案例的常見援引判例...`);
                const citationCounts = {};
                validCasesForAISummary.forEach(caseDoc => {
                    if (caseDoc.citations && Array.isArray(caseDoc.citations)) {
                        caseDoc.citations.forEach(jid => {
                            if (typeof jid === 'string' && jid.trim() !== "" && jid.length > 5) {
                                citationCounts[jid.trim()] = (citationCounts[jid.trim()] || 0) + 1;
                            }
                        });
                    }
                });
                const sortedCitations = Object.entries(citationCounts)
                    .sort(([, countA], [, countB]) => countB - countA)
                    .slice(0, 5);
                commonCitedCases = sortedCitations.map(([jid, count]) => {
                    const citedCaseDetails = similarCases.find(c => c.JID === jid);
                    return { jid, title: citedCaseDetails?.JTITLE || jid, count };
                });
                console.log(`[AISuccessAnalysisService] 生成的常見援引判例:`, commonCitedCases);
            } catch (citationError) {
                console.error('[AISuccessAnalysisService] 分析常見援引判例失敗:', citationError);
                commonCitedCases = [{ jid: "ERROR_ANALYZING_CITATIONS", title: "分析常見援引判例時發生錯誤。" }];
            }
        } else {
            const reason = analyzedCaseCount < 5 ? "相似案件數量過少" : `符合勝訴標準且內容充足的案例 (${validCasesForAISummary.length}) 不足 ${MIN_CASES_FOR_AI_ANALYSIS} 件`;
            keyJudgementPoints = [`${reason}，AI裁判要點分析無法進行。`];
            commonCitedCases = [];
            console.log(`[AISuccessAnalysisService] ${reason}，不進行AI要點和援引判例分析。`);
        }

        return {
            status: 'complete',
            analyzedCaseCount,
            estimatedWinRate,
            keyJudgementPoints,
            commonCitedCases,
            message: `AI勝訴案由分析完成。共分析 ${analyzedCaseCount} 件相似案件，其中 ${winCount} 件符合勝訴標準。`
        };

    } catch (error) {
        console.error('[AISuccessAnalysisService] ES 搜尋或結果處理失敗:', error.meta ? JSON.stringify(error.meta.body, null, 2) : error.message, error.stack);
        let statusCode = 500;
        let message = '執行相似案件搜尋時發生未知錯誤。';
        let details = { internal_code: 'ES_SEARCH_FAILED', originalError: error.message };

        if (error.meta && error.meta.body && error.meta.body.error && error.meta.body.error.type) {
            // 更具體的 ES 錯誤
            message = `搜尋引擎錯誤: ${error.meta.body.error.reason || error.meta.body.error.type}`;
            details.es_error_type = error.meta.body.error.type;
            details.es_error_reason = error.meta.body.error.reason;
            if (error.meta.statusCode) statusCode = error.meta.statusCode;
        } else if (error.statusCode) { // 如果是我們自己拋出的帶 statusCode 的錯誤
            statusCode = error.statusCode;
            message = error.message;
            if (error.details) details = { ...details, ...error.details };
        }

        const serviceError = new Error(message);
        serviceError.statusCode = statusCode;
        serviceError.details = details;
        throw serviceError;
    }
}