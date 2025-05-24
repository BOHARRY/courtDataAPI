// services/aiSuccessAnalysisService.js
import esClient from '../config/elasticsearch.js';
import { OpenAI } from 'openai';
import { OPENAI_API_KEY, OPENAI_MODEL_NAME_EMBEDDING, OPENAI_MODEL_NAME_CHAT } from '../config/environment.js';
import { formatEsResponse } from '../utils/response-formatter.js';
// 引入新的標準化結果函數，以及 NEUTRAL_OUTCOME_CODES
import { getStandardizedOutcomeForAnalysis } from '../utils/case-analyzer.js';
import { NEUTRAL_OUTCOME_CODES } from '../utils/constants.js';

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});
const ES_INDEX_NAME = 'search-boooook';
const EMBEDDING_MODEL = OPENAI_MODEL_NAME_EMBEDDING || 'text-embedding-3-large';
const CHAT_MODEL = OPENAI_MODEL_NAME_CHAT || 'gpt-4.1';


async function getEmbeddingForText(text) {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        // 為了讓前端能捕獲到具體的錯誤，我們可以拋出帶有statusCode的錯誤
        const error = new Error('getEmbeddingForText: 輸入文本不能為空。');
        // error.statusCode = 400; // Bad Request (可選)
        throw error;
    }
    try {
        console.log(`[AIEmbedding] 正在為文本獲取 embedding (模型: ${EMBEDDING_MODEL})...`);
        const response = await openai.embeddings.create({
            model: EMBEDDING_MODEL,
            input: text.trim(),
        });
        if (response.data && response.data[0] && response.data[0].embedding) {
            console.log(`[AIEmbedding] 成功獲取文本 embedding。`);
            return response.data[0].embedding;
        } else {
            console.error('[AIEmbedding] OpenAI embedding API 回應格式不符預期:', response);
            const error = new Error('OpenAI embedding API 回應格式錯誤。');
            // error.statusCode = 502; // Bad Gateway (可選)
            throw error;
        }
    } catch (error) {
        const serviceError = new Error(`無法生成文本向量：${error.message}`);
        serviceError.statusCode = error.response?.status || 500;
        serviceError.details = { internal_code: 'EMBEDDING_FAILED' };
        throw serviceError;
    }
}

/**
 * 判斷一個標準化的案件結果代碼是否算作「勝訴」，考慮使用者視角。
 * @param {string} neutralOutcomeCode - 案件的結果代碼 (來自 NEUTRAL_OUTCOME_CODES)。
 * @param {string} caseTypeSelected - "民事", "刑事", "行政"。
 * @param {string} [userPerspective="plaintiff"] - 分析視角，對於民事和行政案件，可以是 "plaintiff" 或 "defendant"。
 *                                              對於刑事案件，通常是 "defendant" (被告有利) 或 "prosecution" (檢方/告訴人有利)。
 * @returns {boolean} - 是否算作勝訴。
 */
function isConsideredWin(neutralOutcomeCode, caseTypeSelected, userPerspective = "plaintiff") {
    if (!neutralOutcomeCode) return false;

    if (caseTypeSelected === "民事") {
        if (userPerspective === "plaintiff") { // 原告視角
            return [
                NEUTRAL_OUTCOME_CODES.CIVIL_P_WIN_FULL,
                NEUTRAL_OUTCOME_CODES.CIVIL_P_WIN_PARTIAL,
                // NEUTRAL_OUTCOME_CODES.CIVIL_P_WIN_MAJOR,
                // NEUTRAL_OUTCOME_CODES.CIVIL_P_WIN_MINOR,
                NEUTRAL_OUTCOME_CODES.CIVIL_APPEAL_DISMISSED_FAVOR_P, // 被告上訴被駁回
                NEUTRAL_OUTCOME_CODES.CIVIL_D_LOSE_FULL // 被告完全敗訴 (等同原告完全勝訴)
            ].includes(neutralOutcomeCode);
        } else if (userPerspective === "defendant") { // 被告視角
            return [
                NEUTRAL_OUTCOME_CODES.CIVIL_D_WIN_FULL, // 被告完全勝訴 (原告之訴駁回)
                NEUTRAL_OUTCOME_CODES.CIVIL_P_LOSE_FULL, // 原告完全敗訴
                // NEUTRAL_OUTCOME_CODES.CIVIL_D_MITIGATE_MAJOR, // 如果有定義這些更細緻的被告有利結果
                // NEUTRAL_OUTCOME_CODES.CIVIL_D_MITIGATE_PARTIAL,
                // NEUTRAL_OUTCOME_CODES.CIVIL_D_MITIGATE_MINOR,
                NEUTRAL_OUTCOME_CODES.CIVIL_APPEAL_DISMISSED_FAVOR_D // 原告上訴被駁回
            ].includes(neutralOutcomeCode);
        }
    } else if (caseTypeSelected === "刑事") {
        // 刑事案件，userPerspective 可以是 'defendant' 或 'prosecution'
        if (userPerspective === "defendant") { // 被告視角 (追求無罪、輕判)
            return [
                NEUTRAL_OUTCOME_CODES.CRIMINAL_ACQUITTED,
                NEUTRAL_OUTCOME_CODES.CRIMINAL_CHARGE_DISMISSED_NO_PROSECUTION, // 免訴
                NEUTRAL_OUTCOME_CODES.CRIMINAL_CHARGE_DISMISSED_NOT_ACCEPTED,   // 不受理
                NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_PROBATION,
                NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_FINE_ONLY,
                NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_FINE_CONVERTIBLE,
                NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_PARTIAL_WIN, // 如部分有罪部分無罪
                // NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_SIG_REDUCED,
                // NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_SLIGHT_REDUCED,
                NEUTRAL_OUTCOME_CODES.CRIMINAL_APPEAL_DISMISSED_FAVOR_D // 例如檢方上訴被駁回，對被告有利
            ].includes(neutralOutcomeCode);
        } else if (userPerspective === "prosecution") { // 檢方/告訴人視角 (追求定罪)
            return [
                NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_AS_EXPECTED_OR_SENTENCED,
                // NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_AGGRAVATED, // 如果有定義
                NEUTRAL_OUTCOME_CODES.CRIMINAL_APPEAL_DISMISSED_AGAINST_D // 被告上訴被駁回 (維持有罪)
            ].includes(neutralOutcomeCode);
        }
    } else if (caseTypeSelected === "行政") {
        if (userPerspective === "plaintiff") { // 人民/原告視角
            return [
                NEUTRAL_OUTCOME_CODES.ADMIN_WIN_REVOKE_FULL,
                NEUTRAL_OUTCOME_CODES.ADMIN_WIN_REVOKE_PARTIAL,
                NEUTRAL_OUTCOME_CODES.ADMIN_WIN_OBLIGATION,
                NEUTRAL_OUTCOME_CODES.ADMIN_APPEAL_DISMISSED_FAVOR_P // 行政機關上訴被駁回
            ].includes(neutralOutcomeCode);
        } else if (userPerspective === "defendant") { // 行政機關/被告視角
            return [
                NEUTRAL_OUTCOME_CODES.ADMIN_LOSE_DISMISSED, // 原告訴請駁回 (對行政機關是勝訴)
                NEUTRAL_OUTCOME_CODES.ADMIN_APPEAL_DISMISSED_AGAINST_P // 原告上訴被駁回 (對行政機關是勝訴)
            ].includes(neutralOutcomeCode);
        }
    }
    return false; // 默認情況
}

export async function analyzeSuccessFactors(caseTypeSelected, caseSummaryText) {
    console.log(`[AISuccessAnalysisService] 開始分析 - 案件類型: ${caseTypeSelected}, 摘要長度: ${caseSummaryText.length}`);

    let queryVector;
    try {
        queryVector = await getEmbeddingForText(caseSummaryText);
    } catch (error) {
        console.error('[AISuccessAnalysisService] 文本向量化失敗:', error);
        // 直接返回給控制器的錯誤結構
        const serviceError = new Error(error.message || '文本向量化失敗。');
        serviceError.statusCode = error.statusCode || 500; // 保留原始 status code
        // serviceError.details = { internal_code: 'EMBEDDING_FAILED' };
        throw serviceError;
    }

    const esCaseTypeFilter = caseTypeSelected;

    try {
        console.log(`[AISuccessAnalysisService] 正在從 ES 搜尋相似案件 (類型: ${esCaseTypeFilter})...`);
        const knnQuery = {
            field: "text_embedding",
            query_vector: queryVector,
            k: 50,
            num_candidates: 100,
            filter: [
                { term: { "case_type.keyword": esCaseTypeFilter } }
                // 可以在此加入更多固定篩選，例如 is_ruling: false (只看判決不看裁定)
                // { term: { "is_ruling": false } }
            ]
        };

        const esResult = await esClient.search({
            index: ES_INDEX_NAME,
            knn: knnQuery,
            _source: ["JID", "verdict_type", "summary_ai_full", "JFULL", "citations", "main_reasons_ai", "JTITLE", "case_type"],
            size: 30
        });

        const formattedResponse = formatEsResponse(esResult, 30);
        const similarCases = formattedResponse.hits;
        const analyzedCaseCount = similarCases.length;

        console.log(`[AISuccessAnalysisService] 找到 ${analyzedCaseCount} 件相似案件。`);

        if (analyzedCaseCount < 5) {
            return {
                status: 'insufficient_data',
                analyzedCaseCount: analyzedCaseCount,
                estimatedWinRate: null,
                keyJudgementPoints: [],
                commonCitedCases: [],
                message: `找到的相似${caseTypeSelected}案件數量過少 (${analyzedCaseCount}件)，無法進行有效分析。請嘗試提供更詳細的案情描述。`
            };
        }

        let winCount = 0;
        const validCasesForAISummary = []; // 用於 AI 摘要的勝訴案例

        for (const caseDoc of similarCases) {
            // 使用新的 getStandardizedOutcomeForAnalysis 函數
            const outcome = getStandardizedOutcomeForAnalysis(
                caseDoc.verdict_type, // ES 中的 verdict_type
                caseTypeSelected      // 使用者選擇的案件主類型
            );

            // 判斷勝訴時，也考慮 isSubstantiveOutcome
            // userPerspective 在 isConsideredWin 內部根據 caseTypeSelected 處理
            if (outcome.isSubstantiveOutcome && isConsideredWin(outcome.neutralOutcomeCode, caseTypeSelected)) {
                winCount++;
                // 確保有足夠內容給 AI 分析
                if (caseDoc.summary_ai_full || (caseDoc.JFULL && caseDoc.JFULL.length > 100) || (caseDoc.main_reasons_ai && caseDoc.main_reasons_ai.length > 0)) {
                    validCasesForAISummary.push(caseDoc);
                }
            }
        }

        const estimatedWinRate = analyzedCaseCount > 0 ? parseFloat(((winCount / analyzedCaseCount) * 100).toFixed(1)) : 0;
        console.log(`[AISuccessAnalysisService] 勝訴案件數: ${winCount} (基於 isSubstantiveOutcome 和 isConsideredWin), 總分析案件數: ${analyzedCaseCount}, 勝訴率: ${estimatedWinRate}%`);
        console.log(`[AISuccessAnalysisService] 將有 ${validCasesForAISummary.length} 件案例用於 AI 摘要和援引分析。`);


        let keyJudgementPoints = [];
        let commonCitedCases = [];
        const MIN_CASES_FOR_AI_ANALYSIS = 3; // 最少需要多少勝訴案例才進行AI分析

        if (validCasesForAISummary.length >= MIN_CASES_FOR_AI_ANALYSIS) {
            // 1. 提煉裁判要點摘要
            try {
                console.log(`[AISuccessAnalysisService] 準備為 ${validCasesForAISummary.length} 件勝訴案例生成裁判要點摘要...`);
                const textsForSummary = validCasesForAISummary.slice(0, 10).map( // 最多取10個案例
                    c => {
                        // 優先使用 summary_ai_full，其次是 JFULL 的前1000字，再次是 main_reasons_ai
                        let content = c.summary_ai_full;
                        if (!content && c.JFULL) content = c.JFULL.substring(0, 1000);
                        if (!content && c.main_reasons_ai && c.main_reasons_ai.length > 0) content = c.main_reasons_ai.join(' ');
                        return `案件 JID ${c.JID}:\n摘要: ${content || '無詳細內容可供分析'}\n---`;
                    }
                ).join('\n\n');

                // 根據案件類型調整 Prompt 中的視角描述
                let perspectiveDescription = "原告勝訴";
                if (caseTypeSelected === "刑事") perspectiveDescription = "被告獲得有利結果（如無罪、免訴、不受理、輕判等）";
                else if (caseTypeSelected === "行政") perspectiveDescription = "原告（人民）勝訴（如行政處分被撤銷）";

                const summaryPrompt = `你是一位專業的台灣法律AI助手。請基於以下多份相似${caseTypeSelected}案件的「勝訴」判決摘要（分析視角為：${perspectiveDescription}），總結出法院通常支持勝訴方的「3到5個關鍵裁判要點或常見論述模式」。
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
                        // 備用解析：如果JSON解析結果為空，但原始回應看起來像列表
                        if (keyJudgementPoints.length === 0 && (content.includes("\n- ") || content.includes("\n* ") || content.match(/\n\d+\.\s/))) {
                            keyJudgementPoints = content.split(/\n- |\n\* |\n\d+\.\s/)
                                .map(s => s.replace(/^- |^\* |^\d+\.\s/, "").trim())
                                .filter(s => s.length > 10 && !s.toLowerCase().includes("json")); // 過濾掉可能的json標籤
                        }
                        // 最後手段：如果還是空的，且原始 content 有效，則整個放入
                        if (keyJudgementPoints.length === 0 && content.trim().length > 10 && !content.trim().startsWith("{") && !content.trim().startsWith("[")) {
                            const cleanedContent = content.replace(/```json\n|\n```|"/g, "").trim(); // 移除常見的 markdown 和引號
                            if (cleanedContent.length > 10) keyJudgementPoints = [cleanedContent];
                        }
                        if (keyJudgementPoints.length === 0) { // 如果上述都失敗
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
                console.error('[AISuccessAnalysisService] 生成裁判要點摘要失敗:', aiError.response ? JSON.stringify(aiError.response.data, null, 2) : aiError.message);
                keyJudgementPoints = [`AI裁判要點分析時發生錯誤: ${aiError.message}`];
            }

            // 2. 分析常見援引判例
            try {
                console.log(`[AISuccessAnalysisService] 開始分析 ${validCasesForAISummary.length} 件勝訴案例的常見援引判例...`);
                const citationCounts = {};
                validCasesForAISummary.forEach(caseDoc => {
                    if (caseDoc.citations && Array.isArray(caseDoc.citations)) {
                        caseDoc.citations.forEach(jid => {
                            if (typeof jid === 'string' && jid.trim() !== "" && jid.length > 5) { // 增加JID長度檢查
                                citationCounts[jid.trim()] = (citationCounts[jid.trim()] || 0) + 1;
                            }
                        });
                    }
                });
                const sortedCitations = Object.entries(citationCounts)
                    .sort(([, countA], [, countB]) => countB - countA)
                    .slice(0, 5); // 取前5個
                commonCitedCases = sortedCitations.map(([jid, count]) => {
                    const citedCaseDetails = similarCases.find(c => c.JID === jid); // 從原始相似案例中找標題
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
        console.error('[AISuccessAnalysisService] ES 搜尋或結果處理失敗:', error.meta ? JSON.stringify(error.meta.body, null, 2) : error);
        if (error instanceof SyntaxError) {
            const serviceError = new Error('處理搜尋引擎回應時發生格式錯誤，請稍後再試。');
            serviceError.statusCode = 500;
            throw serviceError;
        }
        const serviceError = new Error(error.message || '執行相似案件搜尋時發生錯誤。');
        serviceError.statusCode = error.statusCode || 500;
        throw serviceError;
    }
}