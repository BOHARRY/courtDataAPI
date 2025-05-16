// services/judgeService.js
import admin from 'firebase-admin';
import esClient from '../config/elasticsearch.js';
// 從 utils/judgeAnalysisUtils.js 導入實際函數
import { buildEsQueryForJudgeCases, aggregateJudgeCaseData } from '../utils/judgeAnalysisUtils.js';
// 從 services/aiAnalysisService.js 導入實際函數
import { triggerAIAnalysis } from './aiAnalysisService.js';

export const JUDGES_COLLECTION = 'judges'; // 導出以便 aiAnalysisService 可以引用
const ES_INDEX_NAME = 'search-boooook';
const DATA_FRESHNESS_THRESHOLD_HOURS = 24;

/**
 * 獲取特定法官的分析數據。
 * 會先檢查 Firestore 緩存，如果數據不存在、過期或不完整，
 * 則從 Elasticsearch 提取數據，進行基礎分析，並異步觸發 AI 深度分析。
 *
 * @param {string} judgeName - 法官姓名。
 * @returns {Promise<{status: string, data: object, processingStatus?: string, estimatedTimeRemaining?: number}>}
 *          status: "complete" | "partial"
 *          data: 法官分析數據
 *          processingStatus: "complete" | "partial" | "failed" (AI分析狀態)
 *          estimatedTimeRemaining: 預估 AI 分析剩餘時間 (秒)
 */
export async function getJudgeAnalytics(judgeName) {
    console.log(`[JudgeService] Getting analytics for judge: ${judgeName}`);
    const judgeDocRef = admin.firestore().collection(JUDGES_COLLECTION).doc(judgeName);

    try {
        const judgeDoc = await judgeDocRef.get();

        if (judgeDoc.exists) {
            const judgeData = judgeDoc.data();
            const lastUpdated = judgeData.lastUpdated?.toDate();
            const now = new Date();
            const hoursDiff = lastUpdated ? (now - lastUpdated) / (1000 * 60 * 60) : Infinity;

            console.log(`[JudgeService] Found judge ${judgeName} in Firestore. Last updated: ${lastUpdated}, Hours diff: ${hoursDiff.toFixed(2)}`);

            if (hoursDiff <= DATA_FRESHNESS_THRESHOLD_HOURS && judgeData.processingStatus === 'complete') {
                console.log(`[JudgeService] Data for ${judgeName} is fresh and complete. Returning from cache.`);
                return {
                    status: "complete",
                    data: { ...judgeData, name: judgeName, processingStatus: 'complete' },
                };
            } else if (hoursDiff <= DATA_FRESHNESS_THRESHOLD_HOURS && (judgeData.processingStatus === 'partial' || judgeData.processingStatus === 'pending-analysis')) {
                console.log(`[JudgeService] Data for ${judgeName} is fresh but AI analysis is partial. Returning cached base data, frontend will poll.`);
                // 即使AI是partial，基礎數據也可能是最新的，直接返回讓前端輪詢AI狀態
                return {
                    status: "partial", // 告訴前端基礎數據OK，但AI可能未完成
                    data: { ...judgeData, name: judgeName, processingStatus: judgeData.processingStatus },
                    // estimatedTimeRemaining: judgeData.estimatedTimeRemaining || 30, // 假設有存儲
                };
            }
            // 數據過期，或 AI 未完成/失敗，需要重新處理或至少重新觸發 AI
            console.log(`[JudgeService] Data for ${judgeName} is stale or AI not complete. Proceeding to refresh/re-analyze.`);
        } else {
            console.log(`[JudgeService] Judge ${judgeName} not found in Firestore. Fetching from ES.`);
        }

        // --- 從 Elasticsearch 獲取並處理數據 ---
        console.log(`[JudgeService] Fetching cases for judge ${judgeName} from Elasticsearch.`);
        const esQuery = buildEsQueryForJudgeCases(judgeName); // 需要實作此工具函數
        const esResult = await esClient.search({
            index: ES_INDEX_NAME,
            query: esQuery,
            size: 1000, // 獲取足夠案件進行分析，可配置
            _source: [ /* 需要的欄位，例如 JID, JDATE, case_type, verdict, legal_basis, JFULL (部分用於AI)等 */
                "JID", "JYEAR", "JCASE", "JNO", "JDATE", "JDATE_num", "JTITLE", "court",
                "case_type", "verdict", "verdict_type", "summary_ai", "judges", "main_reasons_ai",
                "legal_basis", "outcome_reasoning_strength", "SCORE", "JFULL" // JFULL 給 AI 用
            ],
            // 可以加入聚合，如果某些統計可以直接從 ES 聚合得到
        });

        if (!esResult.hits.hits || esResult.hits.hits.length === 0) {
            console.log(`[JudgeService] No cases found in ES for judge ${judgeName}.`);
            // 可以在 Firestore 中創建一個記錄標記此法官無案件，避免重複查詢 ES
            const noCaseData = {
                name: judgeName,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
                processingStatus: 'no_cases_found', // 特殊狀態
                caseStats: { totalCases: 0, recentCases: 0, caseTypes: [] },
                verdictDistribution: [],
                legalStats: { legalBasis: [], reasoningStrength: { high: 0, medium: 0, low: 0 } },
                caseTypeAnalysis: {},
                representativeCases: [],
                traits: [],
                tendency: null,
            };
            await judgeDocRef.set(noCaseData, { merge: true });
            return {
                status: "complete", // 因為已經確定無案件，所以算 "處理完成"
                data: noCaseData,
            };
        }

        console.log(`[JudgeService] Found ${esResult.hits.hits.length} cases for judge ${judgeName} in ES.`);
        // 對 ES 結果進行聚合分析，生成基礎統計數據
        const baseAnalyticsData = aggregateJudgeCaseData(esResult.hits.hits, judgeName); // 需要實作此工具函數

        const existingData = judgeDoc.exists ? judgeDoc.data() : {};
        const dataToStoreInFirestore = {
            name: judgeName,
            ...baseAnalyticsData,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            processingStatus: 'partial', // 初始設為 partial
            // 保留已有的 traits/tendency 直到新的分析完成，或者直接清空等待 AI 填充
            traits: existingData.traits || [],
            tendency: existingData.tendency || null,
            aiProcessedAt: existingData.aiProcessedAt || null, // 保留上次AI完成時間
            processingError: null, // 清除舊錯誤
        };

        console.log(`[JudgeService] Storing base analytics for ${judgeName} to Firestore.`);
        await judgeDocRef.set(dataToStoreInFirestore, { merge: true });

        // 異步觸發 AI 分析 (不需要 await)
        triggerAIAnalysis(judgeName, esResult.hits.hits.map(hit => hit._source), baseAnalyticsData) // <<--- 調用真實函數, 傳遞 baseAnalyticsData
            .then(() => console.log(`[JudgeService] AI analysis successfully triggered and completed for ${judgeName}.`))
            .catch(aiError => console.error(`[JudgeService] AI analysis process failed for ${judgeName}:`, aiError));

        return {
            status: "partial",
            data: { ...dataToStoreInFirestore, processingStatus: 'partial' },
            // estimatedTimeRemaining: 60, // 或從 AI 服務獲取一個初始預估
        };

    } catch (error) {
        console.error(`[JudgeService] Error in getJudgeAnalytics for ${judgeName}:`, error);
        // 考慮更新 Firestore 狀態為 failed
        try {
            await judgeDocRef.set({
                name: judgeName, // 確保文檔存在
                processingStatus: 'failed',
                processingError: error.message || 'Failed to process judge analytics.',
                lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
        } catch (fsError) {
            console.error(`[JudgeService] Failed to update Firestore with error status during getJudgeAnalytics for ${judgeName}:`, fsError);
        }
        throw error;
    }
}

// --- 後續將實作 analysis-status 和 reanalyze 的服務函數 ---
export async function getAIAnalysisStatus(judgeName) {
    console.log(`[JudgeService] Getting AI analysis status for judge: ${judgeName}`);
    const judgeDocRef = admin.firestore().collection(JUDGES_COLLECTION).doc(judgeName);
    const judgeDoc = await judgeDocRef.get();

    if (!judgeDoc.exists) {
        // 如果在 getJudgeAnalytics 中會創建 'no_cases_found' 記錄，這裡可能需要不同的處理
        // 或者前端在 fetchInitialData 失敗時就不會輪詢
        console.warn(`[JudgeService] Judge document not found when getting AI status for ${judgeName}.`);
        return { processingStatus: 'not_found_in_status_check' };
    }
    const data = judgeDoc.data();
    // 確保返回的數據結構與前端期望一致
    return {
        processingStatus: data.processingStatus || 'unknown',
        traits: data.traits || [],
        tendency: data.tendency || null,
        // estimatedTimeRemaining: data.estimatedTimeRemaining || (data.processingStatus === 'partial' ? 30 : 0),
        // processingError: data.processingError || null, // 可選，給前端更多錯誤信息
    };
}

export async function triggerReanalysis(judgeName) {
    console.log(`[JudgeService] Triggering reanalysis for judge: ${judgeName}`);
    const judgeDocRef = admin.firestore().collection(JUDGES_COLLECTION).doc(judgeName);
    const judgeDoc = await judgeDocRef.get();

    if (!judgeDoc.exists) {
        // 不應該發生，因為通常是已有記錄的法官才會有重新分析的按鈕
        const error = new Error(`Judge ${judgeName} not found for reanalysis.`);
        error.statusCode = 404;
        throw error;
    }

    console.log(`[JudgeService] Fetching latest cases for re-analysis of judge ${judgeName} from Elasticsearch.`);
    const esQuery = buildEsQueryForJudgeCases(judgeName); // <<--- 調用真實函數
    const esResult = await esClient.search({
        index: ES_INDEX_NAME,
        query: esQuery,
        size: 1000,
        _source: [
            "JID", "JYEAR", "JCASE", "JNO", "JDATE", "JDATE_num", "JTITLE", "court",
            "case_type", "verdict", "verdict_type", "summary_ai", "judges", "main_reasons_ai",
            "legal_basis", "outcome_reasoning_strength", "SCORE", "JFULL"
        ],
    });

    if (!esResult.hits.hits || esResult.hits.hits.length === 0) {
        await judgeDocRef.update({
            processingStatus: 'no_cases_found_on_reanalyze',
            traits: [],
            tendency: null,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            aiProcessedAt: null,
            processingError: 'Reanalysis triggered, but no cases found in ES.',
        });
        console.log(`[JudgeService] No cases found for ${judgeName} upon reanalysis trigger.`);
        return { status: "initiated_no_cases", message: "重新分析已啟動，但未找到該法官的相關案件。" };
    }

    // 重新聚合基礎數據，因為案件列表可能已更新
    const baseAnalyticsData = aggregateJudgeCaseData(esResult.hits.hits, judgeName); // <<--- 調用真實函數

    // 更新 Firestore 狀態以準備重新分析
    await judgeDocRef.update({
        ...baseAnalyticsData, // 更新基礎統計數據
        processingStatus: 'partial', // 重置為 partial
        traits: [], // 清除舊的 AI 結果
        tendency: null,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        aiProcessedAt: null,
        processingError: null,
    });

    // 異步觸發 AI 分析，傳入新的案件數據和新的基礎統計
    triggerAIAnalysis(judgeName, esResult.hits.hits.map(hit => hit._source), baseAnalyticsData) // <<--- 調用真實函數
        .then(() => console.log(`[JudgeService] AI re-analysis successfully triggered and completed for ${judgeName}.`))
        .catch(aiError => console.error(`[JudgeService] AI re-analysis process failed for ${judgeName}:`, aiError));

    return { status: "initiated", message: "重新分析已啟動" };
}

// --- 需要的輔助工具函數 (需要在 utils/judgeAnalysisUtils.js 中實作) ---
// stub for buildEsQueryForJudgeCases
// function buildEsQueryForJudgeCases(judgeName) {
//   console.warn("judgeAnalysisUtils.buildEsQueryForJudgeCases is not yet implemented. Returning match_all for now.");
//   return { term: { "judges.keyword": judgeName } }; // 假設 judges 欄位有 .keyword
// }

// stub for aggregateJudgeCaseData
// function aggregateJudgeCaseData(esHits, judgeName) {
//   console.warn("judgeAnalysisUtils.aggregateJudgeCaseData is not yet implemented. Returning mock data for now.");
//   // 這裡需要根據 esHits 內容進行複雜的統計計算
//   // 返回的結構應符合 Firestore judges 集合中 caseStats, verdictDistribution 等字段
//   return {
//     name: judgeName, // 確保返回的數據中包含法官姓名
//     caseStats: { totalCases: esHits.length, recentCases: esHits.length, caseTypes: [{type: "模擬類型", count: esHits.length, percent: 100}] },
//     verdictDistribution: [{result: "模擬結果", count: esHits.length, percent: 100}],
//     legalStats: { legalBasis: [{code: "模擬法條", count: esHits.length}], reasoningStrength: { high: 100, medium: 0, low: 0 }, consistencyScore: 90 },
//     caseTypeAnalysis: { civil: { count: esHits.length, plaintiffWinRate: 50, defendantWinRate: 50, partialWinRate: 0 } },
//     representativeCases: esHits.slice(0, 5).map(hit => ({ id: hit._id, title: hit._source.JTITLE, cause: hit._source.case_type, result: hit._source.verdict, year: hit._source.JYEAR, date: hit._source.JDATE }))
//   };
// }

// --- 需要的 AI 分析服務 (需要在 services/aiAnalysisService.js 中實作) ---
// stub for triggerAIAnalysis
// async function triggerAIAnalysis(judgeName, casesData) {
//   console.warn(`aiAnalysisService.triggerAIAnalysis is not yet implemented. Simulating AI analysis for ${judgeName}.`);
//   // 這裡將包含調用 OpenAI API 的邏輯
//   // 分析完成後，需要更新 Firestore 中對應法官的 traits, tendency, processingStatus, aiProcessedAt
//   return new Promise(resolve => setTimeout(() => {
//     const judgeDocRef = admin.firestore().collection(JUDGES_COLLECTION).doc(judgeName);
//     judgeDocRef.update({
//       traits: [{text: "模擬特徵 (AI)", icon: "💡", confidence: "高"}],
//       tendency: { dimensions: [{name: "模擬維度", score: 3, value: "中等", icon: "📊", explanation: "模擬解釋"}], chartData: {labels:["模擬維度"], data:[3]}},
//       processingStatus: 'complete',
//       aiProcessedAt: admin.firestore.FieldValue.serverTimestamp()
//     }).then(resolve).catch(err => {
//         console.error(`[AI Sim] Error updating Firestore after simulated AI analysis for ${judgeName}:`, err);
//         // 實際情況下，AI 分析失敗也需要更新 processingStatus
//         judgeDocRef.update({ processingStatus: 'failed', processingError: `Simulated AI error: ${err.message}` });
//         resolve(); // 即使更新失敗也 resolve，避免阻塞 triggerAIAnalysis 的 promise chain (如果有的話)
//     });
//   }, 5000)); // 模擬耗時
// }