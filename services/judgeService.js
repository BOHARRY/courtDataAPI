// services/judgeService.js
import admin from 'firebase-admin';
import esClient from '../config/elasticsearch.js';
// 從 utils/judgeAnalysisUtils.js 導入實際函數
import { buildEsQueryForJudgeCases, aggregateJudgeCaseData } from '../utils/judgeAnalysisUtils.js';
// 🗑️ 已移除: triggerAIAnalysis import (AI 分析功能已廢棄)

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
        console.log(`[JudgeService] Elasticsearch Query for judge ${judgeName} (from buildEsQueryForJudgeCases):`, JSON.stringify(esQuery, null, 2)); // <--- 加上這行
        const esResult = await esClient.search({
            index: ES_INDEX_NAME,
            query: esQuery,
            size: 1000, // 獲取足夠案件進行分析，可配置
            _source: [ /* 需要的欄位，例如 JID, JDATE, case_type, verdict, legal_basis, JFULL (部分用於AI)等 */
                "JID", "JYEAR", "JCASE", "JNO", "JDATE", "JDATE_num", "JTITLE", "court",
                "case_type", "stage0_case_type", "verdict", "verdict_type", "summary_ai", "judges", "main_reasons_ai",
                "legal_basis", "outcome_reasoning_strength", "SCORE", "JFULL",
                "key_metrics", // 新版金額數據結構 (包含 civil_metrics, criminal_metrics, administrative_metrics)
                "lawyerperformance" // 向下兼容舊數據
            ],
            // 可以加入聚合，如果某些統計可以直接從 ES 聚合得到
        });

        if (!esResult.hits.hits || esResult.hits.hits.length === 0) {
            console.log(`[JudgeService] No cases found in ES for judge ${judgeName}.`);
            // 可以在 Firestore 中創建一個記錄標記此法官無案件，避免重複查詢 ES
            const noCaseDataForFirestore = {
                name: judgeName,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
                processingStatus: 'no_cases_found', // 特殊狀態
                caseStats: { totalCases: 0, recentCases: 0, caseTypes: [] },
                verdictDistribution: [],
                legalStats: { legalBasis: [], reasoningStrength: { high: 0, medium: 0, low: 0 } },
                caseTypeAnalysis: {},
                representativeCases: [],
                // 🗑️ 已移除: traits 和 tendency 欄位
            };
            await judgeDocRef.set(noCaseDataForFirestore, { merge: true });

            // 返回給前端的數據,將 serverTimestamp() 替換為 ISO 字串
            const noCaseDataForResponse = {
                ...noCaseDataForFirestore,
                lastUpdated: new Date().toISOString(),
            };

            return {
                status: "complete", // 因為已經確定無案件，所以算 "處理完成"
                data: noCaseDataForResponse,
            };
        }

        console.log(`[JudgeService] Found ${esResult.hits.hits.length} cases for judge ${judgeName} in ES.`);
        // 對 ES 結果進行聚合分析，生成基礎統計數據
        const baseAnalyticsData = aggregateJudgeCaseData(esResult.hits.hits, judgeName); // 需要實作此工具函數

        // 🗑️ 移除 AI 分析: traits 和 tendency 功能已廢棄,不再生成
        const dataToStoreInFirestore = {
            name: judgeName,
            ...baseAnalyticsData,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            processingStatus: 'complete', // 🔧 直接設為 complete,不再等待 AI 分析
            processingError: null,
        };

        console.log(`[JudgeService] Storing base analytics for ${judgeName} to Firestore.`);
        await judgeDocRef.set(dataToStoreInFirestore, { merge: true });

        // 🗑️ 已移除: AI 分析觸發 (traits/tendency 功能已廢棄)
        // triggerAIAnalysis(...) 不再調用

        // 返回給前端的數據,將 serverTimestamp() 替換為 ISO 字串
        const responseData = {
            ...dataToStoreInFirestore,
            lastUpdated: new Date().toISOString(),
            processingStatus: 'complete' // 🔧 直接返回 complete
        };

        return {
            status: "complete", // 🔧 改為 complete
            data: responseData,
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
// 🗑️ 已廢棄: getAIAnalysisStatus 函數不再需要,因為 AI 分析功能已移除
// 前端不再需要輪詢 AI 分析狀態
export async function getAIAnalysisStatus(judgeName) {
    console.log(`[JudgeService] ⚠️ DEPRECATED: getAIAnalysisStatus called for ${judgeName}, but AI analysis is disabled.`);
    const judgeDocRef = admin.firestore().collection(JUDGES_COLLECTION).doc(judgeName);
    const judgeDoc = await judgeDocRef.get();

    if (!judgeDoc.exists) {
        console.warn(`[JudgeService] Judge document not found when getting AI status for ${judgeName}.`);
        return { processingStatus: 'not_found_in_status_check' };
    }
    const data = judgeDoc.data();
    // 🗑️ 返回 complete 狀態,不再返回 traits/tendency
    return {
        processingStatus: data.processingStatus || 'complete',
        // 🗑️ 已移除: traits 和 tendency 欄位
    };
}

// 🗑️ 已廢棄: triggerReanalysis 函數不再需要,因為 AI 分析功能已移除
export async function triggerReanalysis(judgeName) {
    console.log(`[JudgeService] ⚠️ DEPRECATED: triggerReanalysis called for ${judgeName}, but AI analysis is disabled.`);
    const judgeDocRef = admin.firestore().collection(JUDGES_COLLECTION).doc(judgeName);
    const judgeDoc = await judgeDocRef.get();

    if (!judgeDoc.exists) {
        const error = new Error(`Judge ${judgeName} not found for reanalysis.`);
        error.statusCode = 404;
        throw error;
    }

    console.log(`[JudgeService] Fetching latest cases for re-analysis of judge ${judgeName} from Elasticsearch.`);
    const esQuery = buildEsQueryForJudgeCases(judgeName);
    const esResult = await esClient.search({
        index: ES_INDEX_NAME,
        query: esQuery,
        size: 1000,
        _source: [
            "JID", "JYEAR", "JCASE", "JNO", "JDATE", "JDATE_num", "JTITLE", "court",
            "case_type", "stage0_case_type", "verdict", "verdict_type", "summary_ai", "judges", "main_reasons_ai",
            "legal_basis", "outcome_reasoning_strength", "SCORE", "JFULL",
            "lawyerperformance"
        ],
    });

    if (!esResult.hits.hits || esResult.hits.hits.length === 0) {
        await judgeDocRef.update({
            processingStatus: 'no_cases_found_on_reanalyze',
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            processingError: 'Reanalysis triggered, but no cases found in ES.',
        });
        console.log(`[JudgeService] No cases found for ${judgeName} upon reanalysis trigger.`);
        return { status: "initiated_no_cases", message: "重新分析已啟動，但未找到該法官的相關案件。" };
    }

    // 重新聚合基礎數據，因為案件列表可能已更新
    const baseAnalyticsData = aggregateJudgeCaseData(esResult.hits.hits, judgeName);

    // 🔧 更新 Firestore,直接設為 complete (不再等待 AI 分析)
    await judgeDocRef.update({
        ...baseAnalyticsData,
        processingStatus: 'complete', // 🔧 直接設為 complete
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        processingError: null,
    });

    // 🗑️ 已移除: AI 分析觸發
    // triggerAIAnalysis(...) 不再調用

    return { status: "complete", message: "重新分析已完成" }; // 🔧 改為 complete
}