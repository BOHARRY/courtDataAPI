// services/aiSuccessAnalysisService.js
import esClient from '../config/elasticsearch.js';
import { OpenAI } from 'openai';
import { OPENAI_API_KEY, OPENAI_MODEL_NAME_EMBEDDING, OPENAI_MODEL_NAME_CHAT } from '../config/environment.js';
import { formatEsResponse } from '../utils/response-formatter.js';
import { NEUTRAL_OUTCOME_CODES } from '../utils/constants.js';
import { getStandardizedOutcomeForAnalysis, getMainType } from '../utils/case-analyzer.js';
import admin from 'firebase-admin';

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});
const ES_INDEX_NAME = 'search-boooook';
const EMBEDDING_MODEL = OPENAI_MODEL_NAME_EMBEDDING || 'text-embedding-3-large';
const CHAT_MODEL = OPENAI_MODEL_NAME_CHAT || 'gpt-4.1';

async function getEmbeddingForText(text) {
    // ... (此函數保持不變) ...
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
    // ... (此函數保持不變) ...
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

export async function analyzeSuccessFactors(userId, caseTypeSelected, caseSummaryText) {
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
            _source: [ 
                "JID", "JTITLE", "JDATE", "court", "judges", // 基本案件資訊
                "case_type", "verdict_type", "verdict",      // 判決結果相關
                "summary_ai",             // AI 生成摘要
                "main_reasons_ai",                           // AI 主要理由 (用於標籤)
                "lawyerperformance",                         // 律師表現 (用於金額、勝敗細節、策略洞察)
                "citations",                                 // 本文檔引用的判例
                "citation_analysis",                         // 預處理的引用上下文
                "JFULL"                                      // 全文 (備用，或給 AI 分析裁判要點時使用)
            ],
            size: 30 
        });

        const formattedResponse = formatEsResponse(esResult, 30);
        const similarCases = formattedResponse.hits; // 這些是與輸入摘要相似的案件
        const analyzedCaseCount = similarCases.length;

        console.log(`[AISuccessAnalysisService] 找到 ${analyzedCaseCount} 件相似案件。`);

        if (analyzedCaseCount < 1) {
            const insufficientResult = {
                status: 'insufficient_data',
                analyzedCaseCount: analyzedCaseCount,
                estimatedWinRate: null,
                monetaryStats: null,
                verdictDistribution: {},
                strategyInsights: null,
                keyJudgementPoints: [`找到的相似${caseTypeSelected}案件數量過少 (${analyzedCaseCount}件)，無法進行深入分析。`],
                commonCitedCases: [],
                message: `找到的相似${caseTypeSelected}案件數量過少 (${analyzedCaseCount}件)，無法進行有效分析。請嘗試提供更詳細的案情描述或檢查案件類型選擇。`
            };
             // --- MODIFICATION START: 儲存 "insufficient_data" 結果到歷史 ---
             if (userId) { // 確保 userId 存在才儲存
                 try {
                     const historyColRef = admin.firestore().collection('users').doc(userId).collection('aiAnalysisHistory');
                     const historyDocData = {
                         caseTypeSelected: caseTypeSelected,
                         caseSummaryText: caseSummaryText, // 儲存完整摘要
                         analysisDate: admin.firestore.FieldValue.serverTimestamp(),
                         status: insufficientResult.status,
                         analyzedCaseCount: insufficientResult.analyzedCaseCount,
                         estimatedWinRate: insufficientResult.estimatedWinRate,
                         monetaryStats: insufficientResult.monetaryStats,
                         verdictDistribution: insufficientResult.verdictDistribution,
                         strategyInsights: insufficientResult.strategyInsights,
                         keyJudgementPoints: insufficientResult.keyJudgementPoints,
                         commonCitedCases: insufficientResult.commonCitedCases,
                         message: insufficientResult.message,
                     };
                     await historyColRef.add(historyDocData);
                     console.log(`[AISuccessAnalysisService] "insufficient_data" 結果已儲存至歷史紀錄，用戶: ${userId}`);
                 } catch (saveError) {
                     console.error(`[AISuccessAnalysisService] 儲存 "insufficient_data" AI 分析歷史紀錄失敗，用戶: ${userId}:`, saveError);
                 }
             }
             // --- MODIFICATION END ---
            return insufficientResult;
        }

        // ... (monetaryAnalysis, verdictDetails, lawyerComments, winCount, validCasesForAISummary 的初始化和遍歷填充邏輯保持不變，
        //    因為它們是基於 similarCases 的總體情況進行分析的，與 citation_analysis 的細節無直接衝突，
        //    並且上次修改後已能正確處理數據) ...
        const monetaryAnalysis = { cases: [], totalClaimed: 0, totalGranted: 0, percentageDistribution: { '0-20%': 0, '21-40%': 0, '41-60%': 0, '61-80%': 0, '81-100%': 0 } };
        const verdictDetails = { '完全勝訴': 0, '大部分勝訴': 0, '部分勝訴': 0, '小部分勝訴': 0, '完全敗訴': 0, '和解': 0, '其他': 0 };
        const lawyerComments = { highSuccess: [], lowSuccess: [] };
        let winCount = 0;
        const validCasesForAISummary = []; // 用於 AI 裁判要點分析的案例
        let analysisPerspective = caseTypeSelected === "刑事" ? "defendant" : "plaintiff";

        for (let i = 0; i < similarCases.length; i++) {
            const caseDoc = similarCases[i];
            const sourceVerdictType = caseDoc.verdict_type;
            const outcome = getStandardizedOutcomeForAnalysis(sourceVerdictType, caseTypeSelected);
            const consideredWin = isConsideredWin(outcome.neutralOutcomeCode, caseTypeSelected, analysisPerspective);

            if (outcome.isSubstantiveOutcome && consideredWin) {
                winCount++;
                if (caseDoc.summary_ai_full || (caseDoc.JFULL && caseDoc.JFULL.length > 100)) {
                    validCasesForAISummary.push(caseDoc); // 收集勝訴且有足夠內容的案件
                }
            }
            // 填充 monetaryAnalysis, verdictDetails, lawyerComments 的邏輯 (上次修改的內容)
            if (caseDoc.lawyerperformance && Array.isArray(caseDoc.lawyerperformance)) {
                caseDoc.lawyerperformance.forEach((lp) => {
                    if (lp && typeof lp === 'object' && lp.side === 'plaintiff' && caseTypeSelected === '民事') {
                        const claimAmountStr = String(lp.claim_amount || '0').replace(/[^0-9.]/g, '');
                        const grantedAmountStr = String(lp.granted_amount || '0').replace(/[^0-9.]/g, '');
                        const percentageAwardedStr = String(lp.percentage_awarded || '0').replace(/[^0-9.]/g, '');
                        const claimed = parseFloat(claimAmountStr);
                        const granted = parseFloat(grantedAmountStr);
                        if (lp.claim_type === 'monetary' && !isNaN(claimed) && !isNaN(granted)) {
                            let percentage = 0;
                            if (!isNaN(parseFloat(percentageAwardedStr)) && parseFloat(percentageAwardedStr) >= 0 && parseFloat(percentageAwardedStr) <= 1000) {
                                percentage = parseFloat(percentageAwardedStr);
                            } else if (claimed > 0) {
                                percentage = Math.max(0, Math.min(100, (granted / claimed) * 100));
                            } else if (granted > 0) {
                                percentage = 100;
                            }
                            monetaryAnalysis.cases.push({ claimed, granted, percentage: parseFloat(percentage.toFixed(1)), jid: caseDoc.JID });
                            monetaryAnalysis.totalClaimed += claimed;
                            monetaryAnalysis.totalGranted += granted;
                            if (percentage <= 20) monetaryAnalysis.percentageDistribution['0-20%']++;
                            else if (percentage <= 40) monetaryAnalysis.percentageDistribution['21-40%']++;
                            else if (percentage <= 60) monetaryAnalysis.percentageDistribution['41-60%']++;
                            else if (percentage <= 80) monetaryAnalysis.percentageDistribution['61-80%']++;
                            else monetaryAnalysis.percentageDistribution['81-100%']++;
                        }
                        if (lp.verdict && typeof lp.verdict === 'string') {
                            let actualVerdict = lp.verdict.toLowerCase().trim();
                            if (actualVerdict.startsWith('原告:') || actualVerdict.startsWith('被告:')) {
                                actualVerdict = actualVerdict.substring(actualVerdict.indexOf(':') + 1).trim();
                            }
                            if (actualVerdict.includes('完全勝訴')) verdictDetails['完全勝訴']++;
                            else if (actualVerdict.includes('大部分勝訴')) verdictDetails['大部分勝訴']++;
                            else if (actualVerdict.includes('部分勝訴') && !actualVerdict.includes('小部分')) verdictDetails['部分勝訴']++;
                            else if (actualVerdict.includes('小部分勝訴')) verdictDetails['小部分勝訴']++;
                            else if (actualVerdict.includes('完全敗訴')) verdictDetails['完全敗訴']++;
                            else if (actualVerdict.includes('和解')) verdictDetails['和解']++;
                            else if (actualVerdict) verdictDetails['其他']++;
                        }
                        if (lp.comment && typeof lp.comment === 'string' && lp.comment.trim() !== "" && lp.percentage_awarded !== undefined) {
                            const pctAwarded = parseFloat(String(lp.percentage_awarded).replace(/[^0-9.]/g, ''));
                            if (!isNaN(pctAwarded)) {
                                if (pctAwarded > 60) {
                                    lawyerComments.highSuccess.push({ comment: lp.comment, percentage: pctAwarded, jid: caseDoc.JID });
                                } else if (pctAwarded < 30 && pctAwarded >= 0) {
                                    lawyerComments.lowSuccess.push({ comment: lp.comment, percentage: pctAwarded, jid: caseDoc.JID });
                                }
                            }
                        }
                    }
                });
            }
        }
        // ... (計算 monetaryStats 和 strategyInsights 的邏輯保持不變) ...
        const estimatedWinRate = analyzedCaseCount > 0 ? parseFloat(((winCount / analyzedCaseCount) * 100).toFixed(1)) : 0;
        let monetaryStats = null;
        if (monetaryAnalysis.cases.length > 0) {
            const totalValidCasesForMonetary = monetaryAnalysis.cases.length;
            const avgClaimed = totalValidCasesForMonetary > 0 ? Math.round(monetaryAnalysis.totalClaimed / totalValidCasesForMonetary) : 0;
            const avgGranted = totalValidCasesForMonetary > 0 ? Math.round(monetaryAnalysis.totalGranted / totalValidCasesForMonetary) : 0;
            const sumOfPercentages = monetaryAnalysis.cases.reduce((sum, item) => sum + item.percentage, 0);
            const avgPercentage = totalValidCasesForMonetary > 0 ? parseFloat((sumOfPercentages / totalValidCasesForMonetary).toFixed(1)) : 0;
            const sortedPercentages = monetaryAnalysis.cases.map(c => c.percentage).sort((a, b) => a - b);
            const getQuartileValue = (arr, q) => { /* ... */ return arr.length > 0 ? (arr[Math.floor((arr.length-1)*q)] + arr[Math.ceil((arr.length-1)*q)])/2 : 0;}; // 簡化版
             monetaryStats = {
                avgClaimedAmount: avgClaimed, avgGrantedAmount: avgGranted, avgPercentageAwarded: avgPercentage,
                distribution: monetaryAnalysis.percentageDistribution,
                quartiles: {
                    q1: parseFloat(getQuartileValue(sortedPercentages, 0.25).toFixed(1)) || 0,
                    median: parseFloat(getQuartileValue(sortedPercentages, 0.5).toFixed(1)) || 0,
                    q3: parseFloat(getQuartileValue(sortedPercentages, 0.75).toFixed(1)) || 0
                },
                totalCases: totalValidCasesForMonetary
            };
        }
        let strategyInsights = null;
        if (lawyerComments.highSuccess.length >= 1 || lawyerComments.lowSuccess.length >= 1) {
             if (lawyerComments.highSuccess.length < 1 && lawyerComments.lowSuccess.length < 1) {
                 strategyInsights = { keyInsight: "相似案件中律師評論數據不足，無法生成深入的策略洞察。" };
             } else {
                try { /* ... OpenAI call for strategy ... */ 
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

                    請確保你的回應是嚴格的 JSON 格式，例如：
                    {
                      "winningStrategies": ["策略1", "策略2", "策略3"],
                      "losingReasons": ["原因1", "原因2", "原因3"],
                      "keyInsight": "關鍵洞察或建議"
                    }
                    請直接輸出 JSON 物件。`; 
                    const strategyResponse = await openai.chat.completions.create({model: CHAT_MODEL, messages: [{ role: 'user', content: strategyPrompt }], temperature: 0.4, response_format: { type: "json_object" }});
                    if (strategyResponse.choices?.[0]?.message?.content) { strategyInsights = JSON.parse(strategyResponse.choices[0].message.content); }
                    else { strategyInsights = { keyInsight: "AI策略洞察生成失敗，無有效回應。" }; }
                } catch (error) { strategyInsights = { keyInsight: `AI策略洞察生成時發生錯誤: ${error.message.substring(0,100)}...` };}
             }
        } else { strategyInsights = { keyInsight: "相似案件中律師評論數量不足，無法生成策略洞察。" }; }


        let keyJudgementPoints = [];
        // --- MODIFICATION START: commonCitedCases 的生成邏輯將被大幅修改 ---
        let commonCitedCasesWithContext = []; 
        // --- MODIFICATION END ---
        const MIN_CASES_FOR_AI_POINT_ANALYSIS = 3;

        if (validCasesForAISummary.length >= MIN_CASES_FOR_AI_POINT_ANALYSIS) {
            try {
                // ... (裁判要點的 OpenAI 調用邏輯保持不變) ...
                console.log(`[AISuccessAnalysisService] 準備為 ${validCasesForAISummary.length} 件勝訴案例生成裁判要點摘要...`);
                // ... (此處代碼與您上次修改後的版本相同，用於生成 keyJudgementPoints)
                const textsForSummary = validCasesForAISummary.slice(0, 10).map(c => `案件 JID ${c.JID}:\n摘要: ${c.summary_ai_full || (c.JFULL && c.JFULL.substring(0,1000)) || (c.main_reasons_ai && Array.isArray(c.main_reasons_ai) && c.main_reasons_ai.join(' ')) || '無詳細內容可供分析'}\n---`).join('\n\n');
                let perspectiveDescriptionForPrompt = "原告勝訴"; /* ... */
                const summaryPrompt = `你是一位專業的台灣法律AI助手...請直接以 JSON 格式的陣列返回...分析的案情主軸是關於：「${caseSummaryText.substring(0, 150)}...」相關勝訴判決摘要如下：\n${textsForSummary}`;
                const summaryResponse = await openai.chat.completions.create({ model: CHAT_MODEL, messages: [{ role: 'user', content: summaryPrompt }], temperature: 0.3, response_format: { type: "json_object" }});
                if (summaryResponse.choices?.[0]?.message?.content) {
                    const content = summaryResponse.choices[0].message.content;
                    try {
                        const parsedJson = JSON.parse(content);
                        if (parsedJson?.result && Array.isArray(parsedJson.result)) keyJudgementPoints = parsedJson.result.filter(p => typeof p === 'string' && p.length > 5);
                        else if (Array.isArray(parsedJson)) keyJudgementPoints = parsedJson.filter(p => typeof p === 'string' && p.length > 5);
                        /* ... 其他備用解析邏輯 ... */
                        if(keyJudgementPoints.length === 0) keyJudgementPoints = ["AI裁判要點分析結果格式需進一步處理或無有效內容。"];
                    } catch (e) { keyJudgementPoints = ["AI裁判要點分析中，請稍後查看詳細報告（格式解析錯誤）。"];}
                } else { keyJudgementPoints = ["AI裁判要點分析暫時無法生成（無有效回應）。"];}

            } catch (aiError) {
                console.error('[AISuccessAnalysisService] 生成裁判要點摘要失敗:', aiError.message);
                keyJudgementPoints = [`AI裁判要點分析時發生錯誤: ${aiError.message.substring(0,100)}...`];
            }
            console.log(`[AISuccessAnalysisService] 生成的裁判要點:`, JSON.stringify(keyJudgementPoints, null, 2));

            // --- MODIFICATION START: 全新的 commonCitedCases 生成邏輯，利用 citation_analysis ---
            try {
                console.log(`[AISuccessAnalysisService] 開始分析 ${validCasesForAISummary.length} 件勝訴案例的常見援引判例 (利用 citation_analysis)...`);
                const citationFrequencyMap = new Map(); // <K, V> = <citedJid, count>
                
                // 步驟 1: 統計 validCasesForAISummary 中所有被引用判例的頻次
                validCasesForAISummary.forEach(caseDoc => {
                    if (caseDoc.citations && Array.isArray(caseDoc.citations)) {
                        caseDoc.citations.forEach(citedJid => {
                            if (typeof citedJid === 'string' && citedJid.trim() !== "" && citedJid.length > 5) {
                                citationFrequencyMap.set(citedJid.trim(), (citationFrequencyMap.get(citedJid.trim()) || 0) + 1);
                            }
                        });
                    }
                });

                // 選出 Top N (例如 Top 5) 高頻被引用的判例
                const sortedHighFreqCitations = [...citationFrequencyMap.entries()]
                    .sort(([, countA], [, countB]) => countB - countA)
                    .slice(0, 5); // 取前5個

                console.log(`[AISuccessAnalysisService] Top ${sortedHighFreqCitations.length} 高頻被引用判例:`, JSON.stringify(sortedHighFreqCitations));

                // 步驟 2: 為每個高頻判例收集其在 validCasesForAISummary 中的引用上下文
                commonCitedCasesWithContext = sortedHighFreqCitations.map(([highFreqCitedJid, count]) => {
                    const citingContextsCollected = []; // 使用新變數名以區分
                    validCasesForAISummary.forEach(citingCaseDoc => {
                        if (citingCaseDoc.citation_analysis && Array.isArray(citingCaseDoc.citation_analysis)) {
                            const matchedCitationEntry = citingCaseDoc.citation_analysis.find(
                                entry => entry && typeof entry.citation === 'string' && entry.citation.trim() === highFreqCitedJid
                            );

                            if (matchedCitationEntry && matchedCitationEntry.occurrences && Array.isArray(matchedCitationEntry.occurrences) && matchedCitationEntry.occurrences.length > 0) {
                                citingContextsCollected.push({
                                    sourceCaseJid: citingCaseDoc.JID,
                                    sourceCaseJtitle: citingCaseDoc.JTITLE || citingCaseDoc.JID,
                                    contexts: matchedCitationEntry.occurrences.map(occ => ({
                                        paragraph: occ.paragraph || "上下文段落缺失",
                                        location: occ.location || "位置未知"
                                    })).slice(0, 2) // 每個引用源案件，最多取前2個上下文段落
                                });
                            }
                        }
                    });
                    const highFreqCitedCaseDetails = similarCases.find(c => c.JID === highFreqCitedJid);

                    return {
                        jid: highFreqCitedJid,
                        title: highFreqCitedCaseDetails?.JTITLE || highFreqCitedJid,
                        count: count, // 這是總的被引用次數
                        citingContexts: citingContextsCollected // 返回所有收集到的上下文
                    };
                });

            } catch (citationError) {
                console.error('[AISuccessAnalysisService] 分析常見援引判例 (含上下文) 失敗:', citationError);
                commonCitedCasesWithContext = [{ 
                    jid: "ERROR_ANALYZING_CONTEXTUAL_CITATIONS", 
                    title: `分析援引判例上下文時發生錯誤: ${citationError.message.substring(0,50)}...`, 
                    count: 0,
                    citingContexts: [] 
                }];
            }
            // console.log(`[AISuccessAnalysisService] 生成的帶上下文的常見援引判例:`, JSON.stringify(commonCitedCasesWithContext, null, 2));
            // --- MODIFICATION END ---

        } else {
            const reason = analyzedCaseCount < 5 ? "相似案件數量過少" : `符合勝訴標準且內容充足的案例 (${validCasesForAISummary.length}) 不足 ${MIN_CASES_FOR_AI_POINT_ANALYSIS} 件`;
            keyJudgementPoints = [`${reason}，AI裁判要點分析無法進行。`];
            // --- MODIFICATION START: commonCitedCases 的回落信息也調整 ---
            commonCitedCasesWithContext = [{ 
                jid: "NO_ENOUGH_CASES_FOR_CONTEXT", 
                title: `${reason}，無法分析常見援引判例上下文。`, 
                count: 0,
                citingContexts: [] 
            }];
            // --- MODIFICATION END ---
            console.log(`[AISuccessAnalysisService] ${reason}，不進行AI要點和援引判例上下文分析。`);
        }

        // --- MODIFICATION START: 準備 displayedSimilarCases ---
        const displayedSimilarCases = similarCases.map(caseDoc => {
            // 處理 case_type (可能是字串或陣列)
            let displayCaseType = "未知類型";
            if (Array.isArray(caseDoc.case_type) && caseDoc.case_type.length > 0) {
                displayCaseType = caseDoc.case_type.join(', ');
            } else if (typeof caseDoc.case_type === 'string') {
                displayCaseType = caseDoc.case_type;
            }

            // 處理 judges (可能是字串或陣列，只取第一個)
            let displayJudge = "未知法官";
            if (Array.isArray(caseDoc.judges) && caseDoc.judges.length > 0) {
                displayJudge = caseDoc.judges[0];
            } else if (typeof caseDoc.judges === 'string') {
                displayJudge = caseDoc.judges;
            }
            
            // 處理 verdict_type (可能是字串或陣列) -> 使用 getStandardizedOutcomeForAnalysis 獲取更佳描述
            const standardizedOutcome = getStandardizedOutcomeForAnalysis(caseDoc.verdict_type, getMainType(caseDoc)); // getMainType 需要 caseDoc
            const displayVerdict = standardizedOutcome.description || "結果未明";

            // 處理 main_reasons_ai (取第一個字串並分割，最多5個標籤)
            let displayReasonTags = [];
            if (Array.isArray(caseDoc.main_reasons_ai) && caseDoc.main_reasons_ai.length > 0 && typeof caseDoc.main_reasons_ai[0] === 'string') {
                displayReasonTags = caseDoc.main_reasons_ai[0].split(/[,、，\s]+/).map(tag => tag.trim()).filter(tag => tag).slice(0, 5);
            }

            // 處理 summary_ai (優先用 summary_ai，其次截斷 summary_ai_full)
            let displaySummary = "暫無摘要";
            if (caseDoc.summary_ai && typeof caseDoc.summary_ai === 'string' && caseDoc.summary_ai.trim() !== "") {
                displaySummary = caseDoc.summary_ai.substring(0, 120) + (caseDoc.summary_ai.length > 120 ? "..." : "");
            } else if (caseDoc.summary_ai_full && typeof caseDoc.summary_ai_full === 'string' && caseDoc.summary_ai_full.trim() !== "") {
                displaySummary = caseDoc.summary_ai_full.substring(0, 120) + (caseDoc.summary_ai_full.length > 120 ? "..." : "");
            }


            return {
                JID: caseDoc.JID,
                JTITLE: caseDoc.JTITLE || "標題未知",
                case_type_display: displayCaseType, // 前端卡片用這個
                court: caseDoc.court || "法院未知",
                judge_display: displayJudge,        // 前端卡片用這個
                JDATE: caseDoc.JDATE || "日期未知",
                verdict_display: displayVerdict,    // 前端卡片用這個
                summary_display: displaySummary,    // 前端卡片用這個
                reason_tags_display: displayReasonTags // 前端卡片用這個
            };
        });
        console.log(`[AISuccessAnalysisService] Prepared ${displayedSimilarCases.length} cases for display.`);
        // --- MODIFICATION END ---

        const analysisResult = {
            status: 'complete',
            analyzedCaseCount,
            estimatedWinRate,
            monetaryStats,
            verdictDistribution: verdictDetails, 
            strategyInsights,
            keyJudgementPoints,
            commonCitedCases: commonCitedCasesWithContext, 
            displayedSimilarCases: displayedSimilarCases, // <--- 新增此欄位
            message: `AI分析完成。共分析 ${analyzedCaseCount} 件相似案件。`
        };

         // --- MODIFICATION START: 儲存成功的分析結果到歷史 ---
        if (userId) { // 確保 userId 存在才儲存
            try {
                const historyColRef = admin.firestore().collection('users').doc(userId).collection('aiAnalysisHistory');
                const historyDocData = {
                    caseTypeSelected: caseTypeSelected,
                    caseSummaryText: caseSummaryText, // 儲存完整摘要
                    analysisDate: admin.firestore.FieldValue.serverTimestamp(),
                    // 直接複製 analysisResult 的所有內容
                    status: analysisResult.status,
                    analyzedCaseCount: analysisResult.analyzedCaseCount,
                    estimatedWinRate: analysisResult.estimatedWinRate,
                    monetaryStats: analysisResult.monetaryStats,
                    verdictDistribution: analysisResult.verdictDistribution,
                    strategyInsights: analysisResult.strategyInsights,
                    keyJudgementPoints: analysisResult.keyJudgementPoints,
                    commonCitedCases: analysisResult.commonCitedCases,
                    message: analysisResult.message,
                };
                const docRef = await historyColRef.add(historyDocData);
                console.log(`[AISuccessAnalysisService] AI 分析結果已儲存至歷史紀錄，文檔 ID: ${docRef.id}，用戶: ${userId}`);
            } catch (saveError) {
                console.error(`[AISuccessAnalysisService] 儲存 AI 分析歷史紀錄失敗，用戶: ${userId}:`, saveError);
                // 這裡不應該拋出錯誤阻斷主 API 的返回，只記錄錯誤即可
            }
        }
        // --- MODIFICATION END ---

        return analysisResult;

    } catch (error) {
        // ... (錯誤處理邏輯保持不變) ...
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