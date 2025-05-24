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
        console.error('[AISuccessAnalysisService] 文本向量化失敗:', error.message, error.details);
        throw error;
    }

    let typeFilterQuery;
    const esCaseTypeMainKeyword = caseTypeSelected;

    if (esCaseTypeMainKeyword === "民事") {
        typeFilterQuery = {
            bool: {
                should: [
                    { prefix: { "case_type": "民事" } },
                    { prefix: { "case_type": "家事" } }
                ],
                minimum_should_match: 1
            }
        };
    } else if (esCaseTypeMainKeyword === "刑事") {
        typeFilterQuery = { prefix: { "case_type": "刑事" } };
    } else if (esCaseTypeMainKeyword === "行政") {
        typeFilterQuery = {
            bool: {
                should: [
                    { wildcard: { "case_type": "*行政*" } },
                    { wildcard: { "case_type": "*訴願*" } }
                ],
                minimum_should_match: 1
            }
        };
    } else {
        console.warn(`[AISuccessAnalysisService] 未知的案件主類型: ${esCaseTypeMainKeyword}，將不進行案件類型篩選。`);
        typeFilterQuery = { match_all: {} };
    }

    try {
        console.log(`[AISuccessAnalysisService] 正在從 ES 搜尋相似案件 (主類型: ${esCaseTypeMainKeyword})...`);

        const knnQuery = { // <--- knnQuery 定義
            field: "text_embedding",
            query_vector: queryVector,
            k: 50,
            num_candidates: 100,
            filter: typeFilterQuery ? [typeFilterQuery] : undefined // 只有當 typeFilterQuery 有效時才加入 filter
        };
        // 如果 typeFilterQuery 是 {match_all:{}}，filter 可能是 [ {match_all:{}} ]，這通常是允許的
        // 但如果希望在 match_all 時不傳 filter，可以這樣:
        // filter: (typeFilterQuery && Object.keys(typeFilterQuery)[0] !== 'match_all') ? [typeFilterQuery] : undefined


        // 將打印語句移到這裡
        // console.log(`[AISuccessAnalysisService] Elasticsearch KNN Query (to be sent):`, JSON.stringify({ knn: knnQuery, _source: ["JID", "case_type", "verdict_type", "verdict"], size: 10 }, null, 2));


        const esResult = await esClient.search({
            index: ES_INDEX_NAME,
            knn: knnQuery,
            _source: ["JID", "verdict_type", "summary_ai_full", "JFULL", "citations", "main_reasons_ai", "JTITLE", "case_type", "verdict"],
            size: 30
        });

        // ... (後續的 formattedResponse, similarCases, analyzedCaseCount, 遍歷和 AI 分析邏輯不變) ...
        const formattedResponse = formatEsResponse(esResult, 30);
        const similarCases = formattedResponse.hits;
        const analyzedCaseCount = similarCases.length;

        console.log(`[AISuccessAnalysisService] 找到 ${analyzedCaseCount} 件相似案件。`);

        if (analyzedCaseCount < 1) {
            return {
                status: 'insufficient_data',
                analyzedCaseCount: analyzedCaseCount,
                estimatedWinRate: null,
                keyJudgementPoints: [],
                commonCitedCases: [],
                message: `找到的相似${caseTypeSelected}案件數量過少 (${analyzedCaseCount}件)，無法進行有效分析。請嘗試提供更詳細的案情描述或檢查案件類型選擇。`
            };
        }

        // 🔥 新增：金額分析變數
        const monetaryAnalysis = {
            cases: [],
            totalClaimed: 0,
            totalGranted: 0,
            percentageDistribution: {
                '0-20%': 0,
                '21-40%': 0,
                '41-60%': 0,
                '61-80%': 0,
                '81-100%': 0
            }
        };

        // 🔥 新增：判決細節分析
        const verdictDetails = {
            '完全勝訴': 0,
            '大部分勝訴': 0,
            '部分勝訴': 0,
            '小部分勝訴': 0,
            '完全敗訴': 0,
            '和解': 0,
            '其他': 0
        };

        // 🔥 新增：收集律師策略評論
        const lawyerComments = {
            highSuccess: [], // percentage_awarded > 60
            lowSuccess: []   // percentage_awarded < 30
        };

        let winCount = 0;
        const validCasesForAISummary = [];
        let analysisPerspective = caseTypeSelected === "刑事" ? "defendant" : "plaintiff";
        console.log(`[AISuccessAnalysisService] 分析視角設定為: ${analysisPerspective} (針對 ${caseTypeSelected} 案件)`);

        console.log(`\n--- [AISuccessAnalysisService] 遍歷 ${analyzedCaseCount} 件相似案件進行勝訴判斷 ---`);
        for (let i = 0; i < similarCases.length; i++) {
            const caseDoc = similarCases[i];
            const sourceVerdictType = caseDoc.verdict_type;

            // 原有的勝訴判斷邏輯保持
            const outcome = getStandardizedOutcomeForAnalysis(sourceVerdictType, caseTypeSelected);
            const consideredWin = isConsideredWin(outcome.neutralOutcomeCode, caseTypeSelected, analysisPerspective);

            if (outcome.isSubstantiveOutcome && consideredWin) {
                winCount++;
                if (caseDoc.summary_ai_full || (caseDoc.JFULL && caseDoc.JFULL.length > 100)) {
                    validCasesForAISummary.push(caseDoc);
                }
            }

            // 🔥 新增：分析 lawyerperformance 數據
            if (caseDoc.lawyerperformance && Array.isArray(caseDoc.lawyerperformance)) {
                caseDoc.lawyerperformance.forEach(lp => {
                    if (lp.side === 'plaintiff' && caseTypeSelected === '民事') {
                        // 分析金額數據
                        if (lp.claim_type === 'monetary' &&
                            !isNaN(parseFloat(lp.claim_amount)) &&
                            !isNaN(parseFloat(lp.granted_amount))) {

                            const claimed = parseFloat(lp.claim_amount);
                            const granted = parseFloat(lp.granted_amount);
                            const percentage = parseFloat(lp.percentage_awarded) || ((granted / claimed) * 100);

                            monetaryAnalysis.cases.push({
                                claimed,
                                granted,
                                percentage,
                                jid: caseDoc.JID
                            });

                            monetaryAnalysis.totalClaimed += claimed;
                            monetaryAnalysis.totalGranted += granted;

                            // 分類到百分比區間
                            if (percentage <= 20) monetaryAnalysis.percentageDistribution['0-20%']++;
                            else if (percentage <= 40) monetaryAnalysis.percentageDistribution['21-40%']++;
                            else if (percentage <= 60) monetaryAnalysis.percentageDistribution['41-60%']++;
                            else if (percentage <= 80) monetaryAnalysis.percentageDistribution['61-80%']++;
                            else monetaryAnalysis.percentageDistribution['81-100%']++;
                        }

                        // 分析判決細節
                        if (lp.verdict) {
                            const verdictText = lp.verdict.toLowerCase();
                            if (verdictText.includes('完全勝訴')) verdictDetails['完全勝訴']++;
                            else if (verdictText.includes('大部分勝訴')) verdictDetails['大部分勝訴']++;
                            else if (verdictText.includes('部分勝訴') && !verdictText.includes('小部分')) verdictDetails['部分勝訴']++;
                            else if (verdictText.includes('小部分勝訴')) verdictDetails['小部分勝訴']++;
                            else if (verdictText.includes('完全敗訴')) verdictDetails['完全敗訴']++;
                            else if (verdictText.includes('和解')) verdictDetails['和解']++;
                            else verdictDetails['其他']++;
                        }

                        // 收集律師評論
                        if (lp.comment && lp.percentage_awarded !== undefined) {
                            const pctAwarded = parseFloat(lp.percentage_awarded);
                            if (pctAwarded > 60) {
                                lawyerComments.highSuccess.push({
                                    comment: lp.comment,
                                    percentage: pctAwarded,
                                    jid: caseDoc.JID
                                });
                            } else if (pctAwarded < 30) {
                                lawyerComments.lowSuccess.push({
                                    comment: lp.comment,
                                    percentage: pctAwarded,
                                    jid: caseDoc.JID
                                });
                            }
                        }
                    }
                });
            }
        }
        console.log(`--- [AISuccessAnalysisService] 遍歷結束 ---\n`);

        const estimatedWinRate = analyzedCaseCount > 0 ? parseFloat(((winCount / analyzedCaseCount) * 100).toFixed(1)) : 0;
        console.log(`[AISuccessAnalysisService] 勝訴案件數: ${winCount} (基於 isSubstantiveOutcome 和 isConsideredWin), 總分析案件數: ${analyzedCaseCount}, 勝訴率: ${estimatedWinRate}%`);
        console.log(`[AISuccessAnalysisService] 將有 ${validCasesForAISummary.length} 件案例用於 AI 摘要和援引分析。`);

        // 🔥 新增：計算金額統計數據
        let monetaryStats = null;
        if (monetaryAnalysis.cases.length > 0) {
            const sortedByPercentage = monetaryAnalysis.cases.sort((a, b) => a.percentage - b.percentage);
            const avgClaimed = Math.round(monetaryAnalysis.totalClaimed / monetaryAnalysis.cases.length);
            const avgGranted = Math.round(monetaryAnalysis.totalGranted / monetaryAnalysis.cases.length);
            const avgPercentage = parseFloat(((avgGranted / avgClaimed) * 100).toFixed(1));

            // 計算四分位數
            const getQuartile = (arr, q) => {
                const pos = (arr.length - 1) * q;
                const base = Math.floor(pos);
                const rest = pos - base;
                if (arr[base + 1] !== undefined) {
                    return arr[base].percentage + rest * (arr[base + 1].percentage - arr[base].percentage);
                } else {
                    return arr[base].percentage;
                }
            };

            monetaryStats = {
                avgClaimedAmount: avgClaimed,
                avgGrantedAmount: avgGranted,
                avgPercentageAwarded: avgPercentage,
                distribution: monetaryAnalysis.percentageDistribution,
                quartiles: {
                    q1: parseFloat(getQuartile(sortedByPercentage, 0.25).toFixed(1)),
                    median: parseFloat(getQuartile(sortedByPercentage, 0.5).toFixed(1)),
                    q3: parseFloat(getQuartile(sortedByPercentage, 0.75).toFixed(1))
                },
                totalCases: monetaryAnalysis.cases.length
            };
        }

        // 🔥 新增：生成律師策略洞察
        let strategyInsights = null;
        if (lawyerComments.highSuccess.length >= 2 || lawyerComments.lowSuccess.length >= 2) {
            try {
                const strategyPrompt = `你是一位專業的台灣法律AI助手。請分析以下${caseTypeSelected}案件中，律師表現的評論，找出成功和失敗的關鍵因素。

                高獲准案件（獲准>60%）的律師表現評論：
                ${lawyerComments.highSuccess.slice(0, 5).map(c => `- ${c.comment} (獲准${c.percentage}%)`).join('\n')}

                低獲准案件（獲准<30%）的律師表現評論：
                ${lawyerComments.lowSuccess.slice(0, 5).map(c => `- ${c.comment} (獲准${c.percentage}%)`).join('\n')}

                請總結出：
                1. 三個最關鍵的致勝策略（從高獲准案件中提取）
                2. 三個最常見的失敗原因（從低獲准案件中提取）
                3. 一個關鍵洞察或建議

                請以 JSON 格式回應：
                {
                "winningStrategies": ["策略1", "策略2", "策略3"],
                "losingReasons": ["原因1", "原因2", "原因3"],
                "keyInsight": "關鍵洞察"
                }`;

                const strategyResponse = await openai.chat.completions.create({
                    model: CHAT_MODEL,
                    messages: [{ role: 'user', content: strategyPrompt }],
                    temperature: 0.3,
                    response_format: { type: "json_object" }
                });

                if (strategyResponse.choices?.[0]?.message?.content) {
                    strategyInsights = JSON.parse(strategyResponse.choices[0].message.content);
                }
            } catch (error) {
                console.error('[AISuccessAnalysisService] 生成策略洞察失敗:', error);
            }
        }

        let keyJudgementPoints = [];
        let commonCitedCases = [];
        const MIN_CASES_FOR_AI_ANALYSIS = 3;

        if (validCasesForAISummary.length >= MIN_CASES_FOR_AI_ANALYSIS) {
            // ... (AI 摘要和援引判例的 try/catch 邏輯) ...
            try {
                console.log(`[AISuccessAnalysisService] 準備為 ${validCasesForAISummary.length} 件勝訴案例生成裁判要點摘要...`);
                const textsForSummary = validCasesForAISummary.slice(0, 10).map(
                    c => {
                        let content = c.summary_ai_full;
                        if (!content && c.JFULL) content = c.JFULL.substring(0, 1000);
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
            monetaryStats,          // 新增
            verdictDistribution: verdictDetails,  // 新增
            strategyInsights,       // 新增
            keyJudgementPoints,
            commonCitedCases,
            message: `AI分析完成。共分析 ${analyzedCaseCount} 件相似案件。`
        };

    } catch (error) {
        console.error('[AISuccessAnalysisService] ES 搜尋或結果處理失敗:', error.meta ? JSON.stringify(error.meta.body, null, 2) : error.message, error.stack);
        let statusCode = 500;
        let message = '執行相似案件搜尋時發生未知錯誤。';
        let details = { internal_code: 'ES_SEARCH_FAILED', originalError: error.message };

        if (error.meta && error.meta.body && error.meta.body.error && error.meta.body.error.type) {
            message = `搜尋引擎錯誤: ${error.meta.body.error.reason || error.meta.body.error.type}`;
            details.es_error_type = error.meta.body.error.type;
            details.es_error_reason = error.meta.body.error.reason;
            if (error.meta.statusCode) statusCode = error.meta.statusCode;
        } else if (error.statusCode) {
            statusCode = error.statusCode;
            message = error.message;
            if (error.details) details = { ...details, ...error.details };
        } else if (error instanceof ReferenceError) { // 捕獲 ReferenceError
            message = `程式內部參考錯誤: ${error.message}`;
            details.internal_code = 'REFERENCE_ERROR';
        }


        const serviceError = new Error(message);
        serviceError.statusCode = statusCode;
        serviceError.details = details;
        throw serviceError;
    }
}