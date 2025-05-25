// services/aiSuccessAnalysisService.js
import esClient from '../config/elasticsearch.js';
import { OpenAI } from 'openai';
import { OPENAI_API_KEY, OPENAI_MODEL_NAME_EMBEDDING, OPENAI_MODEL_NAME_CHAT } from '../config/environment.js';
import { formatEsResponse } from '../utils/response-formatter.js';
import { getStandardizedOutcomeForAnalysis } from '../utils/case-analyzer.js';
import { NEUTRAL_OUTCOME_CODES } from '../utils/constants.js';

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});
const ES_INDEX_NAME = 'search-boooook';
const EMBEDDING_MODEL = OPENAI_MODEL_NAME_EMBEDDING || 'text-embedding-3-large';
const CHAT_MODEL = OPENAI_MODEL_NAME_CHAT || 'gpt-4.1';

async function getEmbeddingForText(text) {
    // ... (此函數保持不變，您已確認其運作正常) ...
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
            dimensions: 1536, 
        });
        if (response.data && response.data[0] && response.data[0].embedding) {
            const embedding = response.data[0].embedding;
            console.log(`[AIEmbedding] 成功獲取文本 embedding。 Generated queryVector (維度: ${embedding.length}, 前 5 dims): [${embedding.slice(0, 5).join(', ')}, ...]`);
            if (embedding.length !== 1536) { 
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
            error.statusCode = 502; 
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
    // ... (此函數保持不變，基於之前的討論，其邏輯是正確的) ...
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
    const esCaseTypeMainKeyword = caseTypeSelected; // 假設 caseTypeSelected 直接對應 ES 的主要類型關鍵字

    if (esCaseTypeMainKeyword === "民事") {
        typeFilterQuery = { bool: { should: [{ prefix: { "case_type": "民事" } }, { prefix: { "case_type": "家事" } }], minimum_should_match: 1 } };
    } else if (esCaseTypeMainKeyword === "刑事") {
        typeFilterQuery = { prefix: { "case_type": "刑事" } };
    } else if (esCaseTypeMainKeyword === "行政") {
        typeFilterQuery = { bool: { should: [{ wildcard: { "case_type": "*行政*" } }, { wildcard: { "case_type": "*訴願*" } }], minimum_should_match: 1 } };
    } else {
        console.warn(`[AISuccessAnalysisService] 未知的案件主類型: ${esCaseTypeMainKeyword}，將不進行案件類型篩選。`);
        typeFilterQuery = { match_all: {} };
    }

    try {
        console.log(`[AISuccessAnalysisService] 正在從 ES 搜尋相似案件 (主類型: ${esCaseTypeMainKeyword})...`);
        const knnQuery = { field: "text_embedding", query_vector: queryVector, k: 50, num_candidates: 100, filter: typeFilterQuery ? [typeFilterQuery] : undefined };
        
        const esResult = await esClient.search({
            index: ES_INDEX_NAME,
            knn: knnQuery,
            _source: [ // 確保請求了 lawyerperformance 及其內部所需欄位
                "JID", "verdict_type", "summary_ai_full", "JFULL", "citations", 
                "main_reasons_ai", "JTITLE", "case_type", "verdict", "lawyerperformance" // <--- 確保 lawyerperformance 在 _source 中
            ],
            size: 30 
        });

        const formattedResponse = formatEsResponse(esResult, 30);
        const similarCases = formattedResponse.hits;
        const analyzedCaseCount = similarCases.length;

        console.log(`[AISuccessAnalysisService] 找到 ${analyzedCaseCount} 件相似案件。`);

        if (analyzedCaseCount < 1) { // 可以考慮提高這個下限，例如 analyzedCaseCount < 5
            return {
                status: 'insufficient_data',
                analyzedCaseCount: analyzedCaseCount,
                estimatedWinRate: null,
                monetaryStats: null,         // --- MODIFICATION: 確保初始返回 null ---
                verdictDistribution: {},     // --- MODIFICATION: 確保初始返回空對象 ---
                strategyInsights: null,      // --- MODIFICATION: 確保初始返回 null ---
                keyJudgementPoints: [`找到的相似${caseTypeSelected}案件數量過少 (${analyzedCaseCount}件)，無法進行深入分析。`],
                commonCitedCases: [],
                message: `找到的相似${caseTypeSelected}案件數量過少 (${analyzedCaseCount}件)，無法進行有效分析。請嘗試提供更詳細的案情描述或檢查案件類型選擇。`
            };
        }

        const monetaryAnalysis = { cases: [], totalClaimed: 0, totalGranted: 0, percentageDistribution: { '0-20%': 0, '21-40%': 0, '41-60%': 0, '61-80%': 0, '81-100%': 0 } };
        const verdictDetails = { '完全勝訴': 0, '大部分勝訴': 0, '部分勝訴': 0, '小部分勝訴': 0, '完全敗訴': 0, '和解': 0, '其他': 0 };
        const lawyerComments = { highSuccess: [], lowSuccess: [] };

        let winCount = 0;
        const validCasesForAISummary = [];
        let analysisPerspective = caseTypeSelected === "刑事" ? "defendant" : "plaintiff";
        
        console.log(`[AISuccessAnalysisService] 分析視角設定為: ${analysisPerspective} (針對 ${caseTypeSelected} 案件)`);
        console.log(`\n--- [AISuccessAnalysisService] 遍歷 ${analyzedCaseCount} 件相似案件進行詳細分析 ---`);

        for (let i = 0; i < similarCases.length; i++) {
            const caseDoc = similarCases[i];
            // --- MODIFICATION START: 增加對 caseDoc 和 caseDoc.lawyerperformance 的日誌 ---
            // console.log(`[AISuccessAnalysisService] Processing caseDoc ${i + 1}/${analyzedCaseCount}, JID: ${caseDoc.JID}`);
            // if (!caseDoc.lawyerperformance) {
            //     console.log(`  [DEBUG] JID: ${caseDoc.JID} - lawyerperformance 欄位不存在或為 undefined。`);
            // } else if (!Array.isArray(caseDoc.lawyerperformance)) {
            //     console.log(`  [DEBUG] JID: ${caseDoc.JID} - lawyerperformance 欄位不是一個陣列。實際類型: ${typeof caseDoc.lawyerperformance}, 內容:`, caseDoc.lawyerperformance);
            // } else if (caseDoc.lawyerperformance.length === 0) {
            //     console.log(`  [DEBUG] JID: ${caseDoc.JID} - lawyerperformance 陣列為空。`);
            // }
            // --- MODIFICATION END ---

            const sourceVerdictType = caseDoc.verdict_type;
            const outcome = getStandardizedOutcomeForAnalysis(sourceVerdictType, caseTypeSelected);
            const consideredWin = isConsideredWin(outcome.neutralOutcomeCode, caseTypeSelected, analysisPerspective);

            if (outcome.isSubstantiveOutcome && consideredWin) {
                winCount++;
                if (caseDoc.summary_ai_full || (caseDoc.JFULL && caseDoc.JFULL.length > 100)) {
                    validCasesForAISummary.push(caseDoc);
                }
            }

            if (caseDoc.lawyerperformance && Array.isArray(caseDoc.lawyerperformance)) {
                caseDoc.lawyerperformance.forEach((lp, lpIndex) => {
                    // --- MODIFICATION START: 增加對每個 lp 的詳細日誌 ---
                    // console.log(`  [DEBUG] JID: ${caseDoc.JID}, lawyerperformance[${lpIndex}]:`, JSON.stringify(lp));
                    // --- MODIFICATION END ---

                    if (lp && typeof lp === 'object' && lp.side === 'plaintiff' && caseTypeSelected === '民事') { // 確保 lp 是物件
                        // --- MODIFICATION START: 金額分析邏輯增強 ---
                        const claimAmountStr = String(lp.claim_amount || '0').trim();
                        const grantedAmountStr = String(lp.granted_amount || '0').trim();
                        const percentageAwardedStr = String(lp.percentage_awarded || '0').trim();

                        const claimed = parseFloat(claimAmountStr);
                        const granted = parseFloat(grantedAmountStr);
                        
                        // console.log(`    [Monetary DEBUG] JID: ${caseDoc.JID}, lp.side: ${lp.side}, lp.claim_type: ${lp.claim_type}, claim_amount_str: "${claimAmountStr}", granted_amount_str: "${grantedAmountStr}", percentage_awarded_str: "${percentageAwardedStr}"`);

                        if (lp.claim_type === 'monetary' && !isNaN(claimed) && !isNaN(granted)) {
                            // console.log(`      [Monetary DEBUG] Valid monetary case found. Claimed: ${claimed}, Granted: ${granted}`);
                            let percentage = 0;
                            if (!isNaN(parseFloat(percentageAwardedStr)) && parseFloat(percentageAwardedStr) >= 0 && parseFloat(percentageAwardedStr) <= 1000 ) { // 假設 percentage_awarded 比較可信，且範圍合理
                                percentage = parseFloat(percentageAwardedStr);
                            } else if (claimed > 0) {
                                percentage = Math.max(0, Math.min(100, (granted / claimed) * 100)); // 確保在 0-100 之間
                            } else if (granted > 0) { // 如果請求金額為0但判准金額大於0，視為100% (雖然罕見)
                                percentage = 100;
                            }
                            // console.log(`      [Monetary DEBUG] Calculated Percentage: ${percentage}`);


                            monetaryAnalysis.cases.push({ claimed, granted, percentage: parseFloat(percentage.toFixed(1)), jid: caseDoc.JID });
                            monetaryAnalysis.totalClaimed += claimed;
                            monetaryAnalysis.totalGranted += granted;

                            if (percentage <= 20) monetaryAnalysis.percentageDistribution['0-20%']++;
                            else if (percentage <= 40) monetaryAnalysis.percentageDistribution['21-40%']++;
                            else if (percentage <= 60) monetaryAnalysis.percentageDistribution['41-60%']++;
                            else if (percentage <= 80) monetaryAnalysis.percentageDistribution['61-80%']++;
                            else monetaryAnalysis.percentageDistribution['81-100%']++;
                        } else {
                            // console.log(`      [Monetary DEBUG] Skipped: claim_type not 'monetary' or amounts are NaN.`);
                        }
                        // --- MODIFICATION END ---

                        // --- MODIFICATION START: 判決細節分析邏輯修正 ---
                        if (lp.verdict && typeof lp.verdict === 'string') {
                            let actualVerdict = lp.verdict.toLowerCase().trim();
                            // 嘗試去除 "原告:" 或 "被告:" 前綴
                            if (actualVerdict.startsWith('原告:') || actualVerdict.startsWith('被告:')) {
                                actualVerdict = actualVerdict.substring(actualVerdict.indexOf(':') + 1).trim();
                            }
                            // console.log(`    [Verdict DEBUG] JID: ${caseDoc.JID}, Original lp.verdict: "${lp.verdict}", Processed actualVerdict: "${actualVerdict}"`);

                            if (actualVerdict.includes('完全勝訴')) verdictDetails['完全勝訴']++;
                            else if (actualVerdict.includes('大部分勝訴')) verdictDetails['大部分勝訴']++;
                            else if (actualVerdict.includes('部分勝訴') && !actualVerdict.includes('小部分')) verdictDetails['部分勝訴']++;
                            else if (actualVerdict.includes('小部分勝訴')) verdictDetails['小部分勝訴']++;
                            else if (actualVerdict.includes('完全敗訴')) verdictDetails['完全敗訴']++;
                            else if (actualVerdict.includes('和解')) verdictDetails['和解']++;
                            else if (actualVerdict) verdictDetails['其他']++; // 如果有文本但未匹配，計入其他
                        } else {
                            // console.log(`    [Verdict DEBUG] JID: ${caseDoc.JID}, lp.verdict is missing or not a string.`);
                        }
                        // --- MODIFICATION END ---

                        // --- MODIFICATION START: 收集律師策略評論邏輯增強 ---
                        if (lp.comment && typeof lp.comment === 'string' && lp.comment.trim() !== "" && lp.percentage_awarded !== undefined) {
                            const pctAwarded = parseFloat(String(lp.percentage_awarded).trim()); // 確保是數字
                            if (!isNaN(pctAwarded)) {
                                // console.log(`    [Comment DEBUG] JID: ${caseDoc.JID}, pctAwarded: ${pctAwarded}, comment: "${lp.comment.substring(0,30)}..."`);
                                if (pctAwarded > 60) {
                                    lawyerComments.highSuccess.push({ comment: lp.comment, percentage: pctAwarded, jid: caseDoc.JID });
                                } else if (pctAwarded < 30 && pctAwarded >= 0) { // 確保 percentage_awarded 不為負
                                    lawyerComments.lowSuccess.push({ comment: lp.comment, percentage: pctAwarded, jid: caseDoc.JID });
                                }
                            } else {
                                // console.log(`    [Comment DEBUG] JID: ${caseDoc.JID}, pctAwarded is NaN. Original: ${lp.percentage_awarded}`);
                            }
                        } else {
                            // console.log(`    [Comment DEBUG] JID: ${caseDoc.JID}, comment or percentage_awarded is missing/invalid.`);
                        }
                        // --- MODIFICATION END ---
                    }
                });
            }
        }
        console.log(`--- [AISuccessAnalysisService] 遍歷結束 ---\n`);
        // --- MODIFICATION START: 打印統計結果 ---
        console.log('[AISuccessAnalysisService] Monetary Analysis Cases Collected:', monetaryAnalysis.cases.length);
        console.log('[AISuccessAnalysisService] Verdict Details Collected:', JSON.stringify(verdictDetails, null, 2));
        console.log('[AISuccessAnalysisService] Lawyer Comments Collected - High Success:', lawyerComments.highSuccess.length, ', Low Success:', lawyerComments.lowSuccess.length);
        // --- MODIFICATION END ---


        const estimatedWinRate = analyzedCaseCount > 0 ? parseFloat(((winCount / analyzedCaseCount) * 100).toFixed(1)) : 0;
        console.log(`[AISuccessAnalysisService] 勝訴案件數: ${winCount}, 總分析案件數: ${analyzedCaseCount}, 勝訴率: ${estimatedWinRate}%`);
        console.log(`[AISuccessAnalysisService] 將有 ${validCasesForAISummary.length} 件案例用於 AI 摘要和援引分析。`);

        let monetaryStats = null;
        if (monetaryAnalysis.cases.length > 0) { // 確保有案例才計算
            const totalValidCasesForMonetary = monetaryAnalysis.cases.length;
            const avgClaimed = totalValidCasesForMonetary > 0 ? Math.round(monetaryAnalysis.totalClaimed / totalValidCasesForMonetary) : 0;
            const avgGranted = totalValidCasesForMonetary > 0 ? Math.round(monetaryAnalysis.totalGranted / totalValidCasesForMonetary) : 0;
            // --- MODIFICATION: 修正 avgPercentage 計算，基於收集到的 percentage 值計算平均 ---
            const sumOfPercentages = monetaryAnalysis.cases.reduce((sum, item) => sum + item.percentage, 0);
            const avgPercentage = totalValidCasesForMonetary > 0 ? parseFloat((sumOfPercentages / totalValidCasesForMonetary).toFixed(1)) : 0;


            const sortedPercentages = monetaryAnalysis.cases.map(c => c.percentage).sort((a, b) => a - b);
            const getQuartileValue = (arr, q) => {
                if (!arr || arr.length === 0) return 0;
                const pos = (arr.length - 1) * q;
                const base = Math.floor(pos);
                const rest = pos - base;
                if (arr[base + 1] !== undefined) {
                    return arr[base] + rest * (arr[base + 1] - arr[base]);
                } else {
                    return arr[base];
                }
            };
            monetaryStats = {
                avgClaimedAmount: avgClaimed,
                avgGrantedAmount: avgGranted,
                avgPercentageAwarded: avgPercentage, // 使用修正後的平均百分比
                distribution: monetaryAnalysis.percentageDistribution,
                quartiles: {
                    q1: parseFloat(getQuartileValue(sortedPercentages, 0.25).toFixed(1)) || 0,
                    median: parseFloat(getQuartileValue(sortedPercentages, 0.5).toFixed(1)) || 0,
                    q3: parseFloat(getQuartileValue(sortedPercentages, 0.75).toFixed(1)) || 0
                },
                totalCases: totalValidCasesForMonetary // 使用實際參與金額統計的案件數
            };
            console.log("[AISuccessAnalysisService] Calculated monetaryStats:", JSON.stringify(monetaryStats, null, 2));
        } else {
            console.log("[AISuccessAnalysisService] No valid cases for monetary stats calculation.");
        }


        let strategyInsights = null;
        // --- MODIFICATION START: 調整策略洞察的條件，並在無足夠評論時提供提示 ---
        if (lawyerComments.highSuccess.length >= 1 || lawyerComments.lowSuccess.length >= 1) { // 條件放寬到至少有1條評論
            if (lawyerComments.highSuccess.length < 1 && lawyerComments.lowSuccess.length < 1) { // 再次檢查，雖然上面已經判斷過
                 strategyInsights = { keyInsight: "相似案件中律師評論數據不足，無法生成深入的策略洞察。" };
            } else {
                try {
                    const winningCommentsText = lawyerComments.highSuccess.length > 0 ? lawyerComments.highSuccess.slice(0, 5).map(c => `- ${c.comment} (獲准${c.percentage.toFixed(0)}%)`).join('\n') : "無足夠高獲准案件評論可供分析。";
                    const losingCommentsText = lawyerComments.lowSuccess.length > 0 ? lawyerComments.lowSuccess.slice(0, 5).map(c => `- ${c.comment} (獲准${c.percentage.toFixed(0)}%)`).join('\n') : "無足夠低獲准案件評論可供分析。";

                    const strategyPrompt = `你是一位專業的台灣法律AI助手。請分析以下相似${caseTypeSelected}案件中，原告律師表現的評論，找出可能的成功因素和風險點。

                    高獲准案件（請求金額獲准比例 > 60%）的律師表現評論：
                    ${winningCommentsText}

                    低獲准案件（請求金額獲准比例 < 30%）的律師表現評論：
                    ${losingCommentsText}

                    請總結出（如果資訊不足，請說明資訊不足）：
                    1. 一到三個可能的致勝策略或常見有利因素（主要從高獲准案件中提取，若無則說明）
                    2. 一到三個可能的風險點或常見不利因素（主要從低獲准案件中提取，若無則說明）
                    3. 一個綜合性的關鍵洞察或給使用者的建議 (若無特定洞察，可提供通用建議)

                    請以 JSON 格式回應：
                    {
                    "winningStrategies": ["策略1", ...],
                    "losingReasons": ["原因1", ...],
                    "keyInsight": "關鍵洞察或建議"
                    }`;
                    console.log("[AISuccessAnalysisService] Strategy Prompt (partial):", strategyPrompt.substring(0, 300) + "...");

                    const strategyResponse = await openai.chat.completions.create({
                        model: CHAT_MODEL,
                        messages: [{ role: 'user', content: strategyPrompt }],
                        temperature: 0.4, // 稍微提高一點彈性
                        response_format: { type: "json_object" }
                    });

                    if (strategyResponse.choices?.[0]?.message?.content) {
                        console.log("[AISuccessAnalysisService] OpenAI Strategy Response:", strategyResponse.choices[0].message.content);
                        strategyInsights = JSON.parse(strategyResponse.choices[0].message.content);
                    } else {
                        strategyInsights = { keyInsight: "AI策略洞察生成失敗，無有效回應。" };
                    }
                } catch (error) {
                    console.error('[AISuccessAnalysisService] 生成策略洞察失敗:', error.message);
                    strategyInsights = { keyInsight: `AI策略洞察生成時發生錯誤: ${error.message.substring(0,100)}...` };
                }
            }
        } else {
            strategyInsights = { keyInsight: "相似案件中律師評論數量不足，無法生成策略洞察。" };
            console.log("[AISuccessAnalysisService] Not enough lawyer comments to generate strategy insights.");
        }
        // --- MODIFICATION END ---
        console.log("[AISuccessAnalysisService] Generated strategyInsights:", JSON.stringify(strategyInsights, null, 2));

        let keyJudgementPoints = [];
        let commonCitedCases = [];
        const MIN_CASES_FOR_AI_POINT_ANALYSIS = 3; // 與之前的 MIN_CASES_FOR_AI_ANALYSIS 保持一致

        if (validCasesForAISummary.length >= MIN_CASES_FOR_AI_POINT_ANALYSIS) {
            try {
                // ... (裁判要點的 OpenAI 調用邏輯，這部分在上次日誌中看是正常的，保持不變) ...
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
                        // --- MODIFICATION START: 優先嘗試解析 parsedJson.result ---
                        if (parsedJson && parsedJson.result && Array.isArray(parsedJson.result)) {
                            keyJudgementPoints = parsedJson.result.filter(p => typeof p === 'string' && p.length > 5);
                        } else if (Array.isArray(parsedJson)) { // 保持原有備用邏輯
                            keyJudgementPoints = parsedJson.filter(p => typeof p === 'string' && p.length > 5);
                        } else if (typeof parsedJson === 'object' && parsedJson !== null) {
                            const arrayKey = Object.keys(parsedJson).find(k => Array.isArray(parsedJson[k]));
                            if (arrayKey) {
                                keyJudgementPoints = parsedJson[arrayKey].filter(p => typeof p === 'string' && p.length > 5);
                            }
                        }
                        // --- MODIFICATION END ---
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
            } catch (aiError) {
                console.error('[AISuccessAnalysisService] 生成裁判要點摘要失敗:', aiError.response ? JSON.stringify(aiError.response.data, null, 2) : aiError.message, aiError.stack);
                keyJudgementPoints = [`AI裁判要點分析時發生錯誤: ${aiError.message.substring(0,100)}...`];
            }
            console.log(`[AISuccessAnalysisService] 生成的裁判要點:`, JSON.stringify(keyJudgementPoints, null, 2));

            try {
                // ... (常見援引判例的邏輯，這部分在上次日誌中看是正常的，保持不變) ...
                console.log(`[AISuccessAnalysisService] 開始分析 ${validCasesForAISummary.length} 件勝訴案例的常見援引判例...`);
                const citationCounts = {};
                validCasesForAISummary.forEach(caseDoc => {
                    if (caseDoc.citations && Array.isArray(caseDoc.citations)) {
                        caseDoc.citations.forEach(jid => {
                            if (typeof jid === 'string' && jid.trim() !== "" && jid.length > 5) { // 增加長度檢查
                                citationCounts[jid.trim()] = (citationCounts[jid.trim()] || 0) + 1;
                            }
                        });
                    }
                });
                const sortedCitations = Object.entries(citationCounts)
                    .sort(([, countA], [, countB]) => countB - countA)
                    .slice(0, 5); // 取前5個
                commonCitedCases = sortedCitations.map(([jid, count]) => {
                    const citedCaseDetails = similarCases.find(c => c.JID === jid); // 從已獲取的 similarCases 找標題
                    return { jid, title: citedCaseDetails?.JTITLE || jid, count };
                });
            } catch (citationError) {
                console.error('[AISuccessAnalysisService] 分析常見援引判例失敗:', citationError);
                commonCitedCases = [{ jid: "ERROR_ANALYZING_CITATIONS", title: `分析常見援引判例時發生錯誤: ${citationError.message.substring(0,50)}...`, count: 0 }];
            }
             console.log(`[AISuccessAnalysisService] 生成的常見援引判例:`, JSON.stringify(commonCitedCases, null, 2));

        } else {
            const reason = analyzedCaseCount < 5 ? "相似案件數量過少" : `符合勝訴標準且內容充足的案例 (${validCasesForAISummary.length}) 不足 ${MIN_CASES_FOR_AI_POINT_ANALYSIS} 件`;
            keyJudgementPoints = [`${reason}，AI裁判要點分析無法進行。`];
            commonCitedCases = [{ jid: "NO_ENOUGH_CASES", title: `${reason}，無法分析常見援引判例。`, count: 0 }];
            console.log(`[AISuccessAnalysisService] ${reason}，不進行AI要點和援引判例分析。`);
        }

        return {
            status: 'complete',
            analyzedCaseCount,
            estimatedWinRate,
            monetaryStats,
            verdictDistribution: verdictDetails, // 使用更新後的 verdictDetails
            strategyInsights,
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
        }

        const serviceError = new Error(message);
        serviceError.statusCode = statusCode;
        serviceError.details = details;
        throw serviceError;
    }
}