// services/casePrecedentAnalysisService.js
import esClient from '../config/elasticsearch.js';
import { OpenAI } from 'openai';
import { OPENAI_API_KEY, OPENAI_MODEL_NAME_CHAT } from '../config/environment.js';
import admin from 'firebase-admin';
import { analyzeVerdictFromPositionData, analyzeVerdictDistribution, analyzeVerdictDistributionByPosition } from './verdictAnalysisService.js';

// 🆕 導入模組化組件 - Phase 2: 核心搜索邏輯
import {
    generateEmbedding,
    enrichCaseDescription
} from './casePrecedentAnalysis/core/embeddingService.js';
import {
    getThresholdValue,
    getCaseTypeFilter,
    getCourtLevelFilter,
    generateSearchAngles,
    getPositionBasedSearchStrategy,
    extractRelevantTags,
    buildBasicFilters
} from './casePrecedentAnalysis/core/searchStrategy.js';
import {
    performMultiAngleSearch
} from './casePrecedentAnalysis/core/multiAngleSearch.js';
import {
    mergeMultiAngleResults
} from './casePrecedentAnalysis/core/resultMerger.js';
import {
    ES_INDEX_NAME,
    EMBEDDING_MODEL,
    EMBEDDING_DIMENSIONS,
    KNN_CONFIG,
    ES_SOURCE_FIELDS,
    SEARCH_ANGLE_WEIGHTS
} from './casePrecedentAnalysis/utils/constants.js';
import {
    logMemoryUsage
} from './casePrecedentAnalysis/utils/memoryMonitor.js';

// 🆕 導入模組化組件 - Phase 3: AI 分析邏輯
import {
    summarizeStrategicInsights
} from './casePrecedentAnalysis/ai/insightSummarizer.js';
import {
    generateStrategicInsights,
    generatePositionStats
} from './casePrecedentAnalysis/analysis/strategicInsights.js';

// 🆕 導入模組化組件 - Phase 4: 任務管理
import {
    createAnalysisTask,
    createMainstreamAnalysisTask,
    updateTaskComplete,
    updateTaskFailed,
    updateTaskError,
    getOriginalTaskData,
    getTaskRef,
    validateAnalysisData
} from './casePrecedentAnalysis/task/taskManager.js';

// 🆕 導入模組化組件 - Phase 5: 判決分析
import {
    getCriticalCasesFromPool
} from './casePrecedentAnalysis/analysis/criticalCaseAnalyzer.js';
import {
    analyzeCriticalPattern
} from './casePrecedentAnalysis/analysis/criticalPatternAnalyzer.js';

// 🆕 導入模組化組件 - Phase 6: 案例處理
import {
    getJudgmentNodeData,
    batchGetJudgmentData
} from './casePrecedentAnalysis/case/caseDataFetcher.js';
import {
    generateAnomalyDetailsFromPool,
    generateAnomalyDetailsFromPoolSimplified,
    generateAnomalyDetails
} from './casePrecedentAnalysis/case/anomalyCaseProcessor.js';

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

const ANALYSIS_MODEL = OPENAI_MODEL_NAME_CHAT || 'gpt-4.1';

// 🗑️ 已移至 casePrecedentAnalysis/core/searchStrategy.js
// function getThresholdValue(threshold) { ... }

// 🗑️ 已移至 casePrecedentAnalysis/core/searchStrategy.js
// function getCaseTypeFilter(caseType) { ... }
// function getCourtLevelFilter(courtLevel) { ... }

// 🗑️ 已移至 casePrecedentAnalysis/core/embeddingService.js
// async function generateEmbedding(text) { ... }

// 🗑️ 已移至 casePrecedentAnalysis/core/embeddingService.js
// async function enrichCaseDescription(userInput) { ... }

// 🗑️ 已移至 casePrecedentAnalysis/core/searchStrategy.js
// function extractRelevantTags(caseDescription) { ... }

// 🗑️ 已移至 casePrecedentAnalysis/core/searchStrategy.js
// function generateSearchAngles(userInput, enrichment) { ... }

// 🗑️ 已移至 casePrecedentAnalysis/analysis/strategicInsights.js
// function generatePositionStats(similarCases, position) { ... }

/**
 * 🆕 清理文本中的引用標記
 * 移除「參P1, P2」、「見P3」、「(參P4, P5, P6, P7)」等引用標記
 */
function cleanCitationMarkers(text) {
    if (!text || typeof text !== 'string') return text;

    return text
        // 移除「參P1, P2, P3」格式
        .replace(/[（(]?參\s*P\d+(?:\s*,\s*P\d+)*[）)]?/g, '')
        // 移除「見P1」格式
        .replace(/[（(]?見\s*P\d+[）)]?/g, '')
        // 移除多餘的空格和標點
        .replace(/\s+/g, ' ')
        .replace(/、\s*、/g, '、')
        .replace(/，\s*，/g, '，')
        .trim();
}

// 🗑️ 已移至 casePrecedentAnalysis/ai/insightSummarizer.js
// async function summarizeStrategicInsights(...) { ... }

// 🗑️ 已移至 casePrecedentAnalysis/analysis/strategicInsights.js
// async function generateStrategicInsights(similarCases, position, verdictAnalysis) { ... }

// 🗑️ 已移至 casePrecedentAnalysis/core/searchStrategy.js
// function getPositionBasedSearchStrategy(position, caseType) { ... }

// 🗑️ 已移至 casePrecedentAnalysis/core/multiAngleSearch.js
// async function performMultiAngleSearch(...) { ... }

// 🗑️ 已移至 casePrecedentAnalysis/core/resultMerger.js
// function mergeMultiAngleResults(searchResults, userInput) { ... }
// function calculateLawyerValue(caseItem, userInput) { ... }
// function calculateFinalScore(caseItem, lawyerValue) { ... }
// function generateRecommendationReason(caseItem) { ... }

/**
 * 🆕 生成智能推薦建議
 */
function generateSmartRecommendations(similarCases, coverageStats, verdictAnalysis, multiAngleResults, userInput) {
    try {
        console.log(`[casePrecedentAnalysisService] 🧠 生成智能推薦建議`);

        const recommendations = {
            topRecommendation: '',
            nextSteps: [],
            strategicInsights: [],
            riskWarnings: []
        };

        // 1. 基於多角度搜尋效果的推薦
        if (coverageStats.intersectionCases >= 5) {
            recommendations.topRecommendation = `發現 ${coverageStats.intersectionCases} 個高度相關案例，建議重點研究這些多角度命中的案例，它們最能代表您案件的核心特徵。`;
        } else if (coverageStats.intersectionCases >= 2) {
            recommendations.topRecommendation = `發現 ${coverageStats.intersectionCases} 個高度相關案例，建議深入分析這些案例的共同點和差異。`;
        } else {
            recommendations.topRecommendation = `多角度搜尋發現了不同面向的相關案例，建議從各個角度綜合分析以獲得全面視角。`;
        }

        // 2. 基於有利判決的策略建議
        // ✅ 修復: analyzeVerdictDistribution() 返回的是 { mostCommon, distribution } 而不是 { mainPattern }
        const mainVerdict = verdictAnalysis.mostCommon || '未知';
        const mainPercentage = verdictAnalysis.distribution?.[mainVerdict]?.percentage || 0;

        if (mainPercentage >= 70) {
            if (mainVerdict.includes('勝訴') || mainVerdict.includes('准許')) {
                recommendations.nextSteps.push('主流判決結果有利，建議參考成功案例的論證策略');
                recommendations.nextSteps.push('重點分析勝訴案例的證據組織和法律適用方式');
            } else {
                recommendations.nextSteps.push('主流判決結果不利，建議尋找異常成功案例的突破點');
                recommendations.riskWarnings.push('需要特別注意常見的敗訴原因並提前準備應對策略');
            }
        } else if (mainPercentage >= 50) {
            recommendations.nextSteps.push('判決結果分歧較大，建議深入分析影響判決的關鍵因素');
            recommendations.nextSteps.push('準備多套論證策略以應對不同的審理重點');
        } else {
            recommendations.nextSteps.push('判決結果高度分歧，建議全面分析各種可能的判決路徑');
            recommendations.riskWarnings.push('案件結果不確定性較高，建議考慮和解等替代方案');
        }

        // 3. 基於搜尋角度效果的建議
        const mostEffectiveAngle = multiAngleResults
            .filter(r => r.success)
            .sort((a, b) => (b.resultCount || 0) - (a.resultCount || 0))[0];

        if (mostEffectiveAngle) {
            recommendations.strategicInsights.push(
                `「${mostEffectiveAngle.config.displayName}」角度發現最多相關案例，建議從此角度深化論證`
            );
        }

        // 4. 基於案例質量的建議
        const highValueCases = similarCases.filter(c =>
            c.multiAngleData?.isIntersection && c.multiAngleData?.finalScore > 0.7
        );

        if (highValueCases.length >= 3) {
            recommendations.nextSteps.push(`優先研究 ${highValueCases.length} 個高價值案例的判決理由和事實認定`);
        }

        // 5. 基於異常案例的風險提示
        // ✅ 修復: analyzeVerdictDistribution() 沒有 anomalies 屬性
        // 暫時跳過異常案例的風險提示
        // if (verdictAnalysis.anomalies && verdictAnalysis.anomalies.length > 0) {
        //     recommendations.riskWarnings.push('發現異常判決模式，建議分析這些案例的特殊情況以避免類似風險');
        // }

        // 6. 實務操作建議
        recommendations.nextSteps.push('建議使用「歸納主流判決」功能進一步分析成功要素');

        if (similarCases.length >= 30) {
            recommendations.nextSteps.push('樣本數量充足，分析結果具有統計意義');
        } else {
            recommendations.riskWarnings.push('樣本數量較少，建議擴大搜尋範圍或調整關鍵詞');
        }

        console.log(`[casePrecedentAnalysisService] 🎯 智能推薦生成完成:`, recommendations);
        return recommendations;

    } catch (error) {
        console.error('[casePrecedentAnalysisService] 智能推薦生成失敗:', error);
        return {
            topRecommendation: '建議深入分析發現的相關案例，重點關注判決理由和事實認定。',
            nextSteps: ['分析主流判決模式', '研究異常案例特點', '準備多元化論證策略'],
            strategicInsights: [],
            riskWarnings: []
        };
    }
}

/**
 * 執行 ES 向量搜索（保留原有函數作為備用）
 */
async function searchSimilarCases(caseDescription, courtLevel, caseType, threshold) {
    try {
        logMemoryUsage('Start-SearchSimilarCases');

        // 1. 生成查詢向量
        const queryVector = await generateEmbedding(caseDescription);
        logMemoryUsage('After-GenerateEmbedding');
        const minScore = getThresholdValue(threshold);

        // 2. 構建 ES KNN 查詢 - 平衡統計意義和性能穩定性
        const knnQuery = {
            field: "legal_issues_vector",  // ✅ 修正：使用法律爭點向量
            query_vector: queryVector,
            k: 50, // 增加到 50 個案例，提供更好的統計意義
            num_candidates: 100 // 適度增加候選數量
        };

        console.log(`[casePrecedentAnalysisService] 執行 KNN 向量搜索，k=${knnQuery.k}`);

        // 添加超時控制
        const searchPromise = esClient.search({
            index: ES_INDEX_NAME,
            knn: knnQuery,
            _source: [
                'JID', 'JTITLE', 'verdict_type', 'court', 'JYEAR',
                'summary_ai', // 🆕 案例摘要信息（必需用於案例列表顯示）
                'main_reasons_ai', // 🆕 勝負關鍵因素分析需要
                // 🚨 新增所有立場導向向量欄位和相關資料
                'position_based_analysis', // 🆕 包含所有立場分析欄位（plaintiff_perspective, defendant_perspective 等）
                'plaintiff_combined_vector',
                'defendant_combined_vector',
                'replicable_strategies_vector',
                'main_reasons_ai_vector',
                'text_embedding',
                'legal_issues_vector' // ✅ 修正: legal_issues_embedding → legal_issues_vector
            ],
            size: 50, // 與 k 保持一致
            timeout: '30s' // 設定 ES 查詢超時
        });

        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('ES 查詢超時 (30秒)')), 30000)
        );

        const response = await Promise.race([searchPromise, timeoutPromise]);
        logMemoryUsage('After-ES-Search');

        // 修正回應結構處理 - 參考 semanticSearchService.js 的成功模式
        const hits = response.hits?.hits || [];
        // console.log(`[casePrecedentAnalysisService] 搜索返回 ${hits.length} 個結果`);
        // console.log(`[casePrecedentAnalysisService] 完整回應結構:`, JSON.stringify(response, null, 2));

        // 3. 根據用戶設定的相似度閾值篩選結果
        const filteredHits = hits.filter(hit => {
            const similarity = hit._score || 0;
            return similarity >= minScore;
        });

        console.log(`[casePrecedentAnalysisService] 原始結果: ${hits.length} 個，篩選後: ${filteredHits.length} 個 (閾值: ${minScore})`);

        // 記錄前幾個案例的分數以便調試
        if (hits.length > 0) {
            console.log(`[casePrecedentAnalysisService] 前5個案例分數:`, hits.slice(0, 5).map(hit => ({
                title: hit._source?.JTITLE?.substring(0, 30) + '...',
                score: hit._score,
                percentage: Math.round((hit._score || 0) * 100) + '%'
            })));
        }

        return filteredHits.map(hit => ({
            id: hit._source?.JID || 'unknown',
            title: hit._source?.JTITLE || '無標題',
            summary: '', // 移除詳細摘要減少記憶體使用
            legalIssues: '', // 移除法律爭點減少記憶體使用
            verdictType: hit._source?.verdict_type || '未知',
            court: hit._source?.court || '未知法院',
            caseType: '', // 簡化案件類型
            year: hit._source?.JYEAR || '未知年份',
            similarity: (hit._score || 0), // KNN 查詢不需要減 1.0
            source: hit._source || {}
        }));
    } catch (error) {
        console.error('[casePrecedentAnalysisService] ES 搜索失敗:', error);
        console.error('[casePrecedentAnalysisService] KNN 查詢:', JSON.stringify(knnQuery, null, 2));
        throw new Error(`搜索相似案例時發生錯誤: ${error.message}`);
    }
}

/**
 * 🆕 分析勝負關鍵因素排名
 */
async function analyzeKeyFactors(cases, position = 'neutral') {
    console.log(`[casePrecedentAnalysisService] 開始分析勝負關鍵因素，立場: ${position}，案例數: ${cases.length}`);

    if (cases.length === 0) {
        return { winFactors: [], loseFactors: [], factorAnalysis: null };
    }

    // 🧪 臨時測試：如果沒有真實數據，返回測試數據
    console.log(`[analyzeKeyFactors] 🔍 檢查 ${cases.length} 個案例的 main_reasons_ai 數據...`);

    let realDataCount = 0;
    const hasRealData = cases.some((case_, index) => {
        const reasons1 = case_.judgmentNodeData?.main_reasons_ai;
        const reasons2 = case_.source?.main_reasons_ai;
        const reasons = reasons1 || reasons2;

        console.log(`[analyzeKeyFactors] 案例 ${index + 1}/${cases.length} (${case_.id}):`, {
            hasJudgmentNodeData: !!case_.judgmentNodeData,
            hasSource: !!case_.source,
            reasons1Type: typeof reasons1,
            reasons1IsArray: Array.isArray(reasons1),
            reasons1Length: reasons1?.length,
            reasons2Type: typeof reasons2,
            reasons2IsArray: Array.isArray(reasons2),
            reasons2Length: reasons2?.length,
            finalReasons: reasons,
            finalReasonsValid: reasons && Array.isArray(reasons) && reasons.length > 0
        });

        if (reasons && Array.isArray(reasons) && reasons.length > 0) {
            realDataCount++;
            return true;
        }
        return false;
    });

    console.log(`[analyzeKeyFactors] 🔍 檢查結果: ${realDataCount}/${cases.length} 個案例有有效的 main_reasons_ai 數據`);

    // 🔧 如果沒有完整數據，嘗試獲取完整的判決數據
    if (!hasRealData) {
        console.log(`[analyzeKeyFactors] 🔄 沒有找到 main_reasons_ai 數據，嘗試獲取完整判決數據...`);

        // 獲取前10個案例的完整數據進行分析（避免過多API調用）
        const sampleCases = cases.slice(0, 10);
        const casesWithFullData = [];

        for (const case_ of sampleCases) {
            try {
                const fullData = await getJudgmentNodeData(case_.id);
                if (fullData && fullData.main_reasons_ai && Array.isArray(fullData.main_reasons_ai) && fullData.main_reasons_ai.length > 0) {
                    casesWithFullData.push({
                        ...case_,
                        judgmentNodeData: fullData
                    });
                }
            } catch (error) {
                console.log(`[analyzeKeyFactors] 獲取案例 ${case_.id} 完整數據失敗:`, error.message);
            }
        }

        console.log(`[analyzeKeyFactors] 🔄 獲取完整數據結果: ${casesWithFullData.length}/${sampleCases.length} 個案例有 main_reasons_ai 數據`);

        if (casesWithFullData.length > 0) {
            // 使用獲取到的完整數據重新分析
            return await analyzeKeyFactorsWithFullData(casesWithFullData, position);
        }
    }

    if (!hasRealData) {
        console.log(`[casePrecedentAnalysisService] ⚠️ 相關判決資料不足，無法進行勝負關鍵因素統計分析`);
        return {
            dataStatus: 'insufficient',
            message: '相關判決資料不足，無法進行統計分析',
            suggestion: '建議：1) 擴大搜尋範圍 2) 調整搜尋關鍵詞 3) 降低相似度門檻',
            availableData: {
                caseCount: cases.length,
                dataCompleteness: `${realDataCount}/${cases.length}`,
                position: position
            },
            winFactors: [],
            loseFactors: [],
            factorAnalysis: null
        };
    }

    // 收集所有 main_reasons_ai 數據
    const allReasons = [];
    const winCases = [];
    const loseCases = [];

    cases.forEach(case_ => {
        // 🔧 修正數據路徑：main_reasons_ai 在 judgmentNodeData 中
        const reasons = case_.judgmentNodeData?.main_reasons_ai || case_.source?.main_reasons_ai || [];
        // 🔧 修正判決類型路徑：verdict_type 在 judgmentNodeData 中
        const verdict = case_.judgmentNodeData?.verdict_type || case_.verdictType || '';

        // 🧪 調試：檢查每個案例的 main_reasons_ai 數據
        console.log(`[analyzeKeyFactors] 案例 ${case_.id}: verdict=${verdict}, main_reasons_ai=`, reasons);
        console.log(`[analyzeKeyFactors] 🔍 數據路徑檢查: judgmentNodeData=`, !!case_.judgmentNodeData, 'source=', !!case_.source);

        // 🔍 詳細檢查 position_based_analysis 數據
        console.log(`[analyzeKeyFactors] 🔍 position_based_analysis 檢查:`);
        console.log(`  - case_.positionAnalysis 存在: ${!!case_.positionAnalysis}`);
        console.log(`  - case_.source?.position_based_analysis 存在: ${!!case_.source?.position_based_analysis}`);
        if (case_.positionAnalysis) {
            console.log(`  - positionAnalysis 內容:`, JSON.stringify(case_.positionAnalysis, null, 2));
        }
        if (case_.source?.position_based_analysis) {
            console.log(`  - source.position_based_analysis 內容:`, JSON.stringify(case_.source.position_based_analysis, null, 2));
        }

        // ✅ 使用 position_based_analysis 數據判斷勝負
        let verdictAnalysis;
        try {
            verdictAnalysis = analyzeVerdictFromPositionData(case_, position);
            console.log(`[analyzeKeyFactors] ✅ 案例 ${case_.id} 勝負分析成功:`, {
                isWin: verdictAnalysis.isWin,
                isPartialWin: verdictAnalysis.isPartialWin,
                isLose: verdictAnalysis.isLose,
                overallResult: verdictAnalysis.overallResult
            });
        } catch (error) {
            // 如果缺少 position_based_analysis 數據，跳過此案例
            console.warn(`[analyzeKeyFactors] ⚠️ 案例 ${case_.id} 缺少 position_based_analysis 數據，跳過分析`);
            console.warn(`[analyzeKeyFactors] ⚠️ 錯誤詳情:`, error.message);
            return; // 跳過此案例
        }

        const isWinCase = verdictAnalysis.isWin;
        const isLoseCase = verdictAnalysis.isLose;
        const isPartialCase = verdictAnalysis.isPartial;

        const reasonArray = Array.isArray(reasons) ? reasons : (reasons ? [reasons] : []);
        reasonArray.forEach(reason => {
            if (reason && reason.trim()) {
                allReasons.push({
                    reason: reason.trim(),
                    isWin: isWinCase,
                    isLose: isLoseCase,
                    caseId: case_.id,
                    verdict: verdict
                });

                if (isWinCase) {
                    winCases.push({ ...case_, reasons: reasonArray });
                } else if (isLoseCase) {
                    loseCases.push({ ...case_, reasons: reasonArray });
                }
            }
        });
    });

    // ✅ 檢查是否有有效的分析數據
    if (winCases.length === 0 && loseCases.length === 0) {
        console.log(`[analyzeKeyFactors] ⚠️ 所有案例都缺少 position_based_analysis 數據，無法進行分析`);
        return {
            dataStatus: 'insufficient',
            message: '所有案例都缺少立場分析數據，無法進行統計分析',
            suggestion: '建議：1) 檢查資料庫數據完整性 2) 聯繫技術支援',
            availableData: {
                caseCount: cases.length,
                dataCompleteness: `0/${cases.length}`,
                position: position
            },
            winFactors: [],
            loseFactors: [],
            factorAnalysis: null
        };
    }

    // 統計勝訴因素
    const winReasonStats = {};
    const loseReasonStats = {};

    allReasons.forEach(item => {
        if (item.isWin) {
            winReasonStats[item.reason] = (winReasonStats[item.reason] || 0) + 1;
        }
        if (item.isLose) {
            loseReasonStats[item.reason] = (loseReasonStats[item.reason] || 0) + 1;
        }
    });

    // 計算勝訴因素排名（出現在勝訴案例中的頻率）
    const winFactors = Object.entries(winReasonStats)
        .map(([reason, count]) => {
            const totalWinCases = winCases.length;
            const percentage = totalWinCases > 0 ? Math.round((count / totalWinCases) * 100) : 0;
            return {
                factor: reason,
                count,
                percentage,
                type: 'win',
                description: `${percentage}% 的勝訴案例具備此要素`
            };
        })
        .filter(item => item.count >= 1) // ✅ 降低閾值：至少出現1次（用於調試）
        .sort((a, b) => b.percentage - a.percentage)
        .slice(0, 5); // 取前5名

    // 計算敗訴因素排名（出現在敗訴案例中的頻率）
    const loseFactors = Object.entries(loseReasonStats)
        .map(([reason, count]) => {
            const totalLoseCases = loseCases.length;
            const percentage = totalLoseCases > 0 ? Math.round((count / totalLoseCases) * 100) : 0;
            return {
                factor: reason,
                count,
                percentage,
                type: 'lose',
                description: `${percentage}% 的敗訴案例存在此問題`
            };
        })
        .filter(item => item.count >= 1) // ✅ 降低閾值：至少出現1次（用於調試）
        .sort((a, b) => b.percentage - a.percentage)
        .slice(0, 5); // 取前5名

    const factorAnalysis = {
        totalCases: cases.length,
        winCases: winCases.length,
        loseCases: loseCases.length,
        position: position,
        winRate: cases.length > 0 ? Math.round((winCases.length / cases.length) * 100) : 0
    };

    console.log(`[casePrecedentAnalysisService] 勝負因素分析完成，勝訴因素: ${winFactors.length} 個，敗訴因素: ${loseFactors.length} 個`);

    return {
        winFactors,
        loseFactors,
        factorAnalysis
    };
}

// ✅ analyzeVerdictDistribution() 已移至 verdictAnalysisService.js

/**
 * 🆕 使用完整數據分析勝負關鍵因素
 */
async function analyzeKeyFactorsWithFullData(casesWithFullData, position = 'neutral') {
    console.log(`[analyzeKeyFactorsWithFullData] 開始分析 ${casesWithFullData.length} 個有完整數據的案例，立場: ${position}`);

    // 收集所有 main_reasons_ai 數據
    const allReasons = [];
    const winCases = [];
    const loseCases = [];

    casesWithFullData.forEach(case_ => {
        // 🚨 修復：使用多重數據源獲取 main_reasons_ai
        const reasons = case_.judgmentNodeData?.main_reasons_ai || case_.source?.main_reasons_ai || [];
        const verdict = case_.judgmentNodeData?.verdict_type || case_.verdictType || '';

        console.log(`[analyzeKeyFactorsWithFullData] 案例 ${case_.id}: verdict=${verdict}, main_reasons_ai=`, reasons);
        console.log(`[analyzeKeyFactorsWithFullData] 🔍 數據來源檢查:`, {
            hasJudgmentNodeData: !!case_.judgmentNodeData,
            hasSource: !!case_.source,
            judgmentNodeData_main_reasons: case_.judgmentNodeData?.main_reasons_ai,
            source_main_reasons: case_.source?.main_reasons_ai
        });

        // ✅ 使用 position_based_analysis 數據判斷勝負
        let verdictAnalysis;
        try {
            verdictAnalysis = analyzeVerdictFromPositionData(case_, position);
        } catch (error) {
            // 如果缺少 position_based_analysis 數據，跳過此案例
            console.warn(`[analyzeKeyFactorsWithFullData] ⚠️ 案例 ${case_.id} 缺少 position_based_analysis 數據，跳過分析`);
            return; // 跳過此案例
        }

        const isWinCase = verdictAnalysis.isWin;
        const isLoseCase = verdictAnalysis.isLose;
        const isPartialCase = verdictAnalysis.isPartial;

        const reasonArray = Array.isArray(reasons) ? reasons : (reasons ? [reasons] : []);
        reasonArray.forEach(reason => {
            if (reason && reason.trim()) {
                allReasons.push({
                    reason: reason.trim(),
                    isWin: isWinCase,
                    isLose: isLoseCase,
                    verdict: verdict,
                    caseId: case_.id
                });

                if (isWinCase) {
                    winCases.push({ caseId: case_.id, reason: reason.trim(), verdict });
                }
                if (isLoseCase) {
                    loseCases.push({ caseId: case_.id, reason: reason.trim(), verdict });
                }
            }
        });
    });

    console.log(`[analyzeKeyFactorsWithFullData] 收集到 ${allReasons.length} 個理由，勝訴案例: ${winCases.length}，敗訴案例: ${loseCases.length}`);

    // ✅ 檢查是否有有效的分析數據
    if (winCases.length === 0 && loseCases.length === 0) {
        console.log(`[analyzeKeyFactorsWithFullData] ⚠️ 所有案例都缺少 position_based_analysis 數據，無法進行分析`);
        return {
            dataStatus: 'insufficient',
            message: '所有案例都缺少立場分析數據，無法進行統計分析',
            suggestion: '建議：1) 檢查資料庫數據完整性 2) 聯繫技術支援',
            availableData: {
                caseCount: casesWithFullData.length,
                dataCompleteness: `0/${casesWithFullData.length}`,
                position: position
            },
            winFactors: [],
            loseFactors: [],
            factorAnalysis: null
        };
    }

    // 🆕 語義合併相似理由
    const mergedWinFactors = winCases.length > 0 ? await mergeSemanticReasons(winCases.map(c => c.reason), 'win') : {};
    const mergedLoseFactors = loseCases.length > 0 ? await mergeSemanticReasons(loseCases.map(c => c.reason), 'lose') : {};

    console.log(`[analyzeKeyFactorsWithFullData] 語義合併完成，勝訴因素: ${Object.keys(mergedWinFactors).length} 類，敗訴因素: ${Object.keys(mergedLoseFactors).length} 類`);

    // 統計合併後的勝訴關鍵因素
    const winFactorCounts = {};
    winCases.forEach(item => {
        // 找到這個理由被合併到哪個類別
        const mergedCategory = findMergedCategory(item.reason, mergedWinFactors);
        const categoryName = mergedCategory || item.reason; // 如果沒找到合併類別，使用原理由
        winFactorCounts[categoryName] = (winFactorCounts[categoryName] || 0) + 1;
    });

    // 統計合併後的敗訴風險因素
    const loseFactorCounts = {};
    loseCases.forEach(item => {
        // 找到這個理由被合併到哪個類別
        const mergedCategory = findMergedCategory(item.reason, mergedLoseFactors);
        const categoryName = mergedCategory || item.reason; // 如果沒找到合併類別，使用原理由
        loseFactorCounts[categoryName] = (loseFactorCounts[categoryName] || 0) + 1;
    });

    // 轉換為排序後的數組
    const winFactors = Object.entries(winFactorCounts)
        .map(([factor, count]) => ({
            factor,
            count,
            percentage: Math.round((count / winCases.length) * 100),
            type: 'win',
            description: `${Math.round((count / winCases.length) * 100)}% 的勝訴案例具備此要素`
        }))
        .sort((a, b) => b.count - a.count);

    const loseFactors = Object.entries(loseFactorCounts)
        .map(([factor, count]) => ({
            factor,
            count,
            percentage: Math.round((count / loseCases.length) * 100),
            type: 'lose',
            description: `${Math.round((count / loseCases.length) * 100)}% 的敗訴案例存在此問題`
        }))
        .sort((a, b) => b.count - a.count);

    // 🆕 計算原始關鍵字統計（未合併）
    const originalWinFactorCounts = {};
    winCases.forEach(item => {
        originalWinFactorCounts[item.reason] = (originalWinFactorCounts[item.reason] || 0) + 1;
    });

    const originalLoseFactorCounts = {};
    loseCases.forEach(item => {
        originalLoseFactorCounts[item.reason] = (originalLoseFactorCounts[item.reason] || 0) + 1;
    });

    // 轉換為排序後的原始關鍵字數組
    const originalWinFactors = Object.entries(originalWinFactorCounts)
        .map(([factor, count]) => ({
            factor,
            count,
            percentage: Math.round((count / winCases.length) * 100),
            type: 'win',
            description: `${count} 個案例提及此要素`
        }))
        .sort((a, b) => b.count - a.count);

    const originalLoseFactors = Object.entries(originalLoseFactorCounts)
        .map(([factor, count]) => ({
            factor,
            count,
            percentage: Math.round((count / loseCases.length) * 100),
            type: 'lose',
            description: `${count} 個案例存在此問題`
        }))
        .sort((a, b) => b.count - a.count);

    const result = {
        // 🆕 統整後的排名（AI合併）
        winFactors: winFactors.slice(0, 5),
        loseFactors: loseFactors.slice(0, 5),

        // 🆕 原始關鍵字列表
        originalWinFactors: originalWinFactors.slice(0, 10), // 顯示更多原始關鍵字
        originalLoseFactors: originalLoseFactors.slice(0, 10),

        factorAnalysis: {
            totalCases: casesWithFullData.length,
            winCases: winCases.length,
            loseCases: loseCases.length,
            position: position,
            winRate: winCases.length > 0 ? Math.round((winCases.length / (winCases.length + loseCases.length)) * 100) : 0,
            dataSource: 'real_data',
            // 🆕 語義合併信息
            semanticMerging: {
                originalWinReasons: winCases.length,
                mergedWinCategories: Object.keys(mergedWinFactors).length,
                originalLoseReasons: loseCases.length,
                mergedLoseCategories: Object.keys(mergedLoseFactors).length,
                mergedWinFactors: mergedWinFactors,
                mergedLoseFactors: mergedLoseFactors
            }
        }
    };

    console.log(`[analyzeKeyFactorsWithFullData] 分析完成，勝訴因素: ${result.winFactors.length} 個，敗訴因素: ${result.loseFactors.length} 個`);
    return result;
}

/**
 * ❌ 已廢棄: analyzeVerdictOutcome()
 *
 * 此函數已移至 verdictAnalysisService.js 並被 analyzeVerdictFromPositionData() 替代。
 *
 * 舊邏輯存在嚴重錯誤：
 * - 將所有 "部分勝訴部分敗訴" 案例都標記為 isWin = true
 * - 導致被告分析勝率虛高 (96% 而非實際的 31.2%)
 *
 * 根據 ES 查詢驗證 (2025-10-11):
 * - "部分勝訴部分敗訴" 案例中，只有 3.3% 是被告的 major_victory
 * - 58.6% 是 partial_success，38.1% 是 major_defeat
 *
 * @deprecated 使用 analyzeVerdictFromPositionData() 替代
 */

/**
 * 🆕 使用 GPT-4o mini 合併語義相似的理由
 */
async function mergeSemanticReasons(reasons, type = 'win') {
    if (reasons.length === 0) return {};

    try {
        console.log(`[mergeSemanticReasons] 開始合併 ${reasons.length} 個${type === 'win' ? '勝訴' : '敗訴'}理由`);

        const prompt = `請將以下法律判決理由按照語義相似性進行分類合併。

理由列表：
${reasons.map((reason, index) => `${index + 1}. ${reason}`).join('\n')}

請按照以下規則分類：
1. 將語義相似的理由歸為同一類
2. 為每一類選擇一個簡潔明確的類別名稱，最多不超過8字
3. 類別名稱應該是法律專業術語，便於律師理解
4. 請避免使用籠統概念如「侵權問題」「法律問題」，若可能請具體指出**法律爭點**或**法律效果**
5. 如果某個理由很獨特，可以單獨成類
6. 所有文字請使用繁體中文

請以純JSON格式回應，不要包含任何markdown標記或說明文字：
{
  "類別名稱1": ["理由1", "理由2"],
  "類別名稱2": ["理由3"],
  ...
}

錯誤示範：
{
  "侵權問題": ["原告請求駁回"]
}

正確示範：
{
  "時效抗辯": ["請求已逾時效"],
  "舉證不足": ["原告無法證明損害"],
  "因果關係不成立": ["事故與傷害無直接關聯"]
}

重要：只返回JSON對象，不要添加任何其他文字或格式標記。`;

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: '你是專業的法律分析助手，擅長將相似的法律理由進行分類整理，並提供給資深律師高度判斷價值。'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.1,
            max_tokens: 1000
        });

        // 🔧 處理 GPT 可能返回的 markdown 格式
        let responseContent = response.choices[0].message.content.trim();

        // 移除可能的 markdown 代碼塊標記
        if (responseContent.startsWith('```json')) {
            responseContent = responseContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (responseContent.startsWith('```')) {
            responseContent = responseContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        console.log(`[mergeSemanticReasons] 🔧 清理後的響應:`, responseContent.substring(0, 200) + '...');

        const mergedReasons = JSON.parse(responseContent);
        console.log(`[mergeSemanticReasons] 合併完成，${reasons.length} 個理由合併為 ${Object.keys(mergedReasons).length} 類`);
        console.log(`[mergeSemanticReasons] 合併結果:`, mergedReasons);

        return mergedReasons;

    } catch (error) {
        console.error(`[mergeSemanticReasons] 語義合併失敗:`, error);
        // 如果合併失敗，返回原始理由（每個理由單獨成類）
        const fallbackResult = {};
        reasons.forEach(reason => {
            fallbackResult[reason] = [reason];
        });
        return fallbackResult;
    }
}

/**
 * 🆕 找到理由對應的合併類別
 */
function findMergedCategory(reason, mergedFactors) {
    for (const [category, reasonList] of Object.entries(mergedFactors)) {
        if (reasonList.includes(reason)) {
            return category;
        }
    }
    return null;
}

/**
 * 使用 AI 分析異常案例的關鍵差異
 */
async function analyzeAnomalies(mainCases, anomalyCases, caseDescription) {
    if (anomalyCases.length === 0) {
        return null;
    }

    try {
        const prompt = `你是一位資深的法律分析師。請分析以下案例數據，找出異常判決結果的關鍵差異因素。

用戶案件描述：
${caseDescription}

主流判決案例（${mainCases.length}件）：
${mainCases.slice(0, 3).map((c, i) => `${i+1}. ${c.summary?.substring(0, 200)}...`).join('\n')}

異常判決案例（${anomalyCases.length}件）：
${anomalyCases.map((c, i) => `${i+1}. 判決：${c.verdictType} - ${c.summary?.substring(0, 200)}...`).join('\n')}

請分析並回答：
1. 異常案例與主流案例的關鍵差異是什麼？
2. 這些差異因素對判決結果有什麼影響？
3. 對於類似的案件，律師應該注意哪些風險或機會？

請以 JSON 格式回應：
{
  "keyDifferences": ["差異1", "差異2", "差異3"],
  "riskFactors": ["風險因素1", "風險因素2"],
  "opportunities": ["機會點1", "機會點2"],
  "strategicInsights": "整體策略建議"
}`;

        const response = await openai.chat.completions.create({
            model: ANALYSIS_MODEL,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            response_format: { type: "json_object" }
        });

        return JSON.parse(response.choices[0].message.content);
    } catch (error) {
        console.error('[casePrecedentAnalysisService] AI 異常分析失敗:', error);
        return null;
    }
}

/**
 * (背景執行) 真正的分析函式
 */
async function executeAnalysisInBackground(taskId, analysisData, userId) {
    // 🆕 使用任務管理模組獲取任務引用
    const taskRef = getTaskRef(taskId);

    try {
        logMemoryUsage('Start-Analysis');
        console.log(`🟢 [ANALYSIS-START] ===== 開始執行多角度案件有利判決分析 =====`);
        console.log(`🟢 [ANALYSIS-START] 任務ID: ${taskId}`);
        console.log(`🟢 [ANALYSIS-START] 用戶ID: ${userId}`);
        console.log(`🟢 [ANALYSIS-START] 分析參數:`, {
            caseType: analysisData.caseType,
            courtLevel: analysisData.courtLevel,
            threshold: analysisData.threshold,
            position: analysisData.position
        });

        // 🆕 1. AI事由補足與分析
        console.log(`🟢 [CHECKPOINT-1] 開始 AI 事由補足`);
        const enrichment = await enrichCaseDescription(analysisData.caseDescription);
        console.log(`🟢 [CHECKPOINT-1] ✅ 事由補足完成:`, enrichment);

        // 🆕 2. 生成四角度搜尋策略
        console.log(`🟢 [CHECKPOINT-2] 開始生成搜尋角度`);
        const searchAngles = generateSearchAngles(analysisData.caseDescription, enrichment);
        console.log(`🟢 [CHECKPOINT-2] ✅ 生成搜尋角度:`, Object.keys(searchAngles));
        console.log(`🟢 [CHECKPOINT-2] 搜尋角度詳情:`, searchAngles);

        // 🆕 3. 執行立場導向的多角度並行搜尋
        console.log(`🟢 [CHECKPOINT-3] 開始執行多角度並行搜尋`);
        console.log(`🟢 [CHECKPOINT-3] 搜尋參數:`, {
            courtLevel: analysisData.courtLevel,
            caseType: analysisData.caseType,
            threshold: analysisData.threshold,
            position: analysisData.position || 'neutral'
        });

        const multiAngleResults = await performMultiAngleSearch(
            searchAngles,
            analysisData.courtLevel,
            analysisData.caseType,
            analysisData.threshold,
            analysisData.position || 'neutral', // 🆕 新增立場參數
            analysisData.caseDescription // ✅ 新增案件描述參數（用於 tags 過濾）
        );
        console.log(`🟢 [CHECKPOINT-3] ✅ 多角度搜尋完成，結果數量:`, multiAngleResults.length);

        // 🆕 4. 智能合併結果（傳入用戶輸入用於價值評估）
        console.log(`🟢 [CHECKPOINT-4] 開始智能合併結果`);
        const similarCases = mergeMultiAngleResults(multiAngleResults, analysisData.caseDescription);
        console.log(`🟢 [CHECKPOINT-4] ✅ 合併完成，最終案例數量: ${similarCases.length}`);

        if (similarCases.length === 0) {
            console.error(`🔴 [ANALYSIS-ERROR] 未找到符合條件的相似案例`);
            throw new Error('未找到符合條件的相似案例');
        }

        console.log(`🟢 [CHECKPOINT-5] 🎯 多角度搜尋完成，找到 ${similarCases.length} 個相似案例`);

        // 統計多角度搜尋效果
        const intersectionCases = similarCases.filter(c => c.multiAngleData?.isIntersection);
        const coverageStats = {
            totalCases: similarCases.length,
            intersectionCases: intersectionCases.length,
            coverageImprovement: intersectionCases.length > 0 ? Math.round((intersectionCases.length / similarCases.length) * 100) : 0
        };
        console.log(`[casePrecedentAnalysisService] 📊 搜尋效果統計:`, coverageStats);

        // 檢查案例數量是否少於期望值，提供透明的提醒
        let sampleSizeNote = '';
        if (similarCases.length < 50) {
            sampleSizeNote = `\n📋 樣本數量說明：資料庫中共找到 ${similarCases.length} 個相似案例（期望50個）`;
            if (similarCases.length < 30) {
                sampleSizeNote += '\n⚠️ 樣本數量較少，統計結果僅供參考，建議擴大搜索範圍或調整關鍵詞';
            } else {
                sampleSizeNote += '\n✅ 樣本數量足夠進行統計分析';
            }
            console.log(`[casePrecedentAnalysisService] ${sampleSizeNote.replace(/\n/g, ' ')}`);
        }

        // 2. 分析判決分布
        console.log('[casePrecedentAnalysisService] 案例樣本數據:', similarCases.slice(0, 3).map(c => ({
            id: c.id,
            verdictType: c.verdictType,
            title: c.title
        })));

        // ✅ 使用新的判決分布分析（基於 overall_result）
        const position = analysisData.position || 'defendant';  // 預設為被告
        const verdictAnalysis = analyzeVerdictDistributionByPosition(similarCases, position);
        logMemoryUsage('After-VerdictAnalysis');
        console.log(`[casePrecedentAnalysisService] 判決分布分析完成 (${position})，主流模式: ${verdictAnalysis.mostCommon} (${verdictAnalysis.distribution?.[verdictAnalysis.mostCommon]?.percentage}%)`);
        console.log(`[casePrecedentAnalysisService] 判決分布:`, verdictAnalysis.distribution);

        // 🆕 2.5. 分析勝負關鍵因素排名
        let keyFactorsAnalysis = null;
        try {
            console.log(`[casePrecedentAnalysisService] 🎯 開始勝負因素分析，立場: ${analysisData.position || 'neutral'}`);
            keyFactorsAnalysis = await analyzeKeyFactors(similarCases, analysisData.position || 'neutral');

            // ✅ 檢查是否返回了有效的分析結果
            if (keyFactorsAnalysis && keyFactorsAnalysis.dataStatus === 'insufficient') {
                console.log(`[casePrecedentAnalysisService] ⚠️ 勝負因素分析數據不足: ${keyFactorsAnalysis.message}`);
            } else if (keyFactorsAnalysis) {
                console.log(`[casePrecedentAnalysisService] 勝負因素分析完成，勝訴因素: ${keyFactorsAnalysis.winFactors?.length || 0} 個，敗訴因素: ${keyFactorsAnalysis.loseFactors?.length || 0} 個`);
                console.log(`[casePrecedentAnalysisService] 🧪 勝訴因素詳情:`, keyFactorsAnalysis.winFactors);
                console.log(`[casePrecedentAnalysisService] 🧪 敗訴因素詳情:`, keyFactorsAnalysis.loseFactors);
            } else {
                console.log(`[casePrecedentAnalysisService] ⚠️ 勝負因素分析返回 null 或 undefined`);
            }
        } catch (error) {
            console.error(`[casePrecedentAnalysisService] ❌ 勝負因素分析失敗:`, error);
            keyFactorsAnalysis = null;
        }

        // 3. 分析異常案例（方案 B：簡化版，不調用 ES 獲取完整數據）
        let anomalyAnalysis = null;
        let anomalyDetails = {};

        // ✅ 啟用異常案例分析
        if (verdictAnalysis && verdictAnalysis.anomalies && verdictAnalysis.anomalies.length > 0) {
            console.log(`[casePrecedentAnalysisService] 🎯 發現 ${verdictAnalysis.anomalies.length} 種異常判決模式`);

            // 簡化的異常分析，不調用 OpenAI
            anomalyAnalysis = {
                keyDifferences: ["案件事實差異", "法律適用差異", "舉證程度差異"],
                riskFactors: ["證據不足風險", "法律適用風險"],
                opportunities: ["完整舉證機會", "法律論述機會"],
                strategicInsights: `發現 ${verdictAnalysis.anomalies.length} 種異常判決模式，建議深入分析差異因素。`
            };

            console.log('[casePrecedentAnalysisService] 異常分析完成，將在案例池生成後創建詳細數據');
        } else {
            console.log('[casePrecedentAnalysisService] 沒有發現異常案例');
        }

        // 🆕 5. 生成智能推薦建議
        const smartRecommendations = generateSmartRecommendations(
            similarCases,
            coverageStats,
            verdictAnalysis,
            multiAngleResults,
            analysisData.caseDescription
        );

        // 🆕 6. 準備增強的多角度分析結果
        // ✅ 修復: 使用正確的數據結構
        const mainVerdict = verdictAnalysis.mostCommon || '未知';
        const mainPercentage = verdictAnalysis.distribution?.[mainVerdict]?.percentage || 0;

        const summaryText = `🎯 多角度案件有利判決分析完成！

📊 分析了 ${similarCases.length} 個相似案例
🔍 多角度搜尋效果：${coverageStats.intersectionCases} 個高度相關案例 (${coverageStats.coverageImprovement}% 覆蓋提升)
🎯 主流判決模式：${mainVerdict} (${mainPercentage}%)
✅ 未發現顯著異常模式

${anomalyAnalysis ? `💡 關鍵洞察：${anomalyAnalysis.strategicInsights}` : ''}${sampleSizeNote}

🔍 搜尋角度分析：
${Object.entries(searchAngles).map(([name, config]) => {
    const angleResults = multiAngleResults.find(r => r.angleName === name);
    return `• ${config.displayName}：「${config.query}」(${angleResults?.resultCount || 0}筆)`;
}).join('\n')}

🎯 智能推薦：
${smartRecommendations.topRecommendation}

📋 下一步建議：
${smartRecommendations.nextSteps.map(step => `• ${step}`).join('\n')}`;

        const result = {
            // 保持與 summarizeCommonPointsService 一致的格式
            report: {
                summaryText,
                citations: {} // 案件有利判決分析不需要引用
            },
            analyzedCount: similarCases.length,

            // 🆕 增強的案件有利判決分析數據
            casePrecedentData: {
                analysisType: 'multi_angle_favorable_judgment_analysis', // 🆕 標記為多角度有利判決分析
                totalSimilarCases: similarCases.length,
                expectedSampleSize: 50,
                sampleSizeAdequate: similarCases.length >= 30,
                sampleSizeNote: sampleSizeNote.replace(/\n/g, ' ').trim(),

                // 🆕 多角度搜尋數據
                multiAngleData: {
                    searchAngles: searchAngles,
                    angleResults: multiAngleResults.map(r => ({
                        angleName: r.angleName,
                        query: r.config.query,
                        resultCount: r.resultCount,
                        success: r.success,
                        displayName: r.config.displayName,
                        searchStrategy: r.searchStrategy // 🆕 記錄搜索策略
                    })),
                    coverageStats: coverageStats,
                    intersectionCases: intersectionCases.length,
                    totalProcessedResults: multiAngleResults.reduce((sum, r) => sum + (r.resultCount || 0), 0),
                    // 🆕 智能推薦數據
                    smartRecommendations: smartRecommendations
                },

                // 🆕 立場導向分析數據
                positionBasedAnalysis: {
                    selectedPosition: analysisData.position || 'neutral',
                    positionStats: generatePositionStats(similarCases, analysisData.position || 'neutral'),
                    strategicInsights: await generateStrategicInsights(similarCases, analysisData.position || 'neutral', verdictAnalysis)
                },

                // ✅ 修復: 將 distribution 對象轉換為前端期望的數組格式
                verdictDistribution: Object.entries(verdictAnalysis.distribution || {}).map(([verdict, stats]) => ({
                    verdict: verdict,
                    percentage: stats.percentage || 0,
                    count: stats.count || 0,
                    overallResult: stats.overallResult  // 保留原始 overall_result 值
                })),
                // ✅ 修復: 構建 mainPattern 和 anomalies 以符合前端期望
                mainPattern: {
                    verdict: verdictAnalysis.mostCommon || '未知',
                    percentage: verdictAnalysis.distribution?.[verdictAnalysis.mostCommon]?.percentage || 0,
                    count: verdictAnalysis.distribution?.[verdictAnalysis.mostCommon]?.count || 0
                },
                anomalies: verdictAnalysis.anomalies || [],  // ✅ 返回實際的異常案例
                anomalyAnalysis,
                anomalyDetails,

                // 🆕 勝負關鍵因素排名分析
                keyFactorsAnalysis: keyFactorsAnalysis,

                // 🆕 增強的代表性案例（包含完整摘要信息，從5筆增加到20筆，包含AI摘要和關鍵理由）
                representativeCases: similarCases.slice(0, 20).map(c => ({
                    id: c.id,
                    title: c.title,
                    verdictType: c.verdictType,
                    court: c.court,
                    year: c.year,
                    similarity: Math.round(c.similarity * 100),

                    // 🆕 增強摘要信息（不包含向量和JFULL）
                    summary_ai: c.source?.summary_ai || `${c.court || '未知法院'} ${c.year || '未知年份'}年判決，判決結果：${c.verdictType || '未知'}`,
                    main_reasons_ai: Array.isArray(c.source?.main_reasons_ai)
                        ? c.source.main_reasons_ai
                        : (c.source?.main_reasons_ai ? [c.source.main_reasons_ai] : []),

                    // 🆕 完整案例基本信息
                    JTITLE: c.source?.JTITLE || c.title || '無標題',
                    JYEAR: c.source?.JYEAR || c.year || '未知年份',
                    JID: c.source?.JID || c.id || '無ID',
                    verdict_type: c.source?.verdict_type || c.verdictType || '未知判決',

                    // 🆕 多角度發現信息（過濾 undefined 值）
                    ...(c.multiAngleData && (
                        c.multiAngleData.appearances !== undefined ||
                        c.multiAngleData.sourceAngles !== undefined ||
                        c.multiAngleData.isIntersection !== undefined ||
                        c.multiAngleData.totalScore !== undefined
                    ) ? {
                        multiAngleInfo: {
                            ...(c.multiAngleData.appearances !== undefined && { appearances: c.multiAngleData.appearances }),
                            ...(c.multiAngleData.sourceAngles !== undefined && { sourceAngles: c.multiAngleData.sourceAngles }),
                            ...(c.multiAngleData.isIntersection !== undefined && { isIntersection: c.multiAngleData.isIntersection }),
                            ...(c.multiAngleData.totalScore !== undefined && { totalScore: Math.round(c.multiAngleData.totalScore * 100) })
                        }
                    } : {}),

                    // 🆕 完整立場分析數據（包含 strategic_value）
                    ...(c.positionAnalysis ? {
                        position_based_analysis: c.positionAnalysis
                    } : {})
                })),
                analysisParams: analysisData,

                // 🚨 增強：案例池（包含基本摘要信息，避免 Firestore 大小限制）
                casePool: {
                    allCases: similarCases.map(case_ => ({
                        id: case_.id,
                        title: case_.title,
                        verdictType: case_.verdictType,
                        court: case_.court,
                        year: case_.year,
                        similarity: case_.similarity,

                        // 🆕 增加基本摘要信息（不包含向量和JFULL）
                        summary_ai: case_.source?.summary_ai || `${case_.court || '未知法院'} ${case_.year || '未知年份'}年判決`,
                        main_reasons_ai: Array.isArray(case_.source?.main_reasons_ai)
                            ? case_.source.main_reasons_ai.slice(0, 3) // 限制最多3個理由，控制大小
                            : (case_.source?.main_reasons_ai ? [case_.source.main_reasons_ai] : []),

                        // 🆕 完整案例標識信息
                        JID: case_.source?.JID || case_.id || '無ID',
                        JTITLE: case_.source?.JTITLE || case_.title || '無標題',

                        // 🚨 保留引用信息
                        hasFullData: !!case_.source,

                        // 🆕 完整立場分析數據（包含 strategic_value）
                        ...(case_.positionAnalysis ? {
                            position_based_analysis: case_.positionAnalysis
                        } : {}),
                        ...(case_.multiAngleData ? {
                            multiAngleData: {
                                ...(case_.multiAngleData.isIntersection !== undefined && { isIntersection: case_.multiAngleData.isIntersection }),
                                ...(case_.multiAngleData.appearances !== undefined && { appearances: case_.multiAngleData.appearances }),
                                ...(case_.multiAngleData.sourceAngles !== undefined && { sourceAngles: case_.multiAngleData.sourceAngles })
                            }
                        } : {})
                    })),
                    caseIds: similarCases.map(c => c.id).filter(id => id !== undefined),
                    // ✅ 修復: 使用正確的數據結構
                    mainPattern: {
                        verdict: verdictAnalysis.mostCommon || '',
                        percentage: verdictAnalysis.distribution?.[verdictAnalysis.mostCommon]?.percentage || 0,
                        cases: similarCases
                            .filter(c => c.verdictType === verdictAnalysis.mostCommon && c.id)
                            .map(c => c.id)
                    },
                    anomalies: verdictAnalysis.anomalies || [],  // ✅ 返回實際的異常案例
                    searchMetadata: {
                        courtLevel: analysisData.courtLevel,
                        caseType: analysisData.caseType,
                        threshold: analysisData.threshold,
                        position: analysisData.position || 'neutral',
                        timestamp: new Date().toISOString(),
                        totalCases: similarCases.length,
                        searchAngles: Object.keys(searchAngles)
                    }
                }
            }
        };

        // 🚨 生成異常案例詳情（基於案例池 - 方案 B：簡化版）
        if (verdictAnalysis && verdictAnalysis.anomalies && verdictAnalysis.anomalies.length > 0) {
            console.log(`[casePrecedentAnalysisService] 🎯 開始生成異常案例詳情（簡化版）`);
            result.casePrecedentData.anomalyDetails = await generateAnomalyDetailsFromPoolSimplified(
                verdictAnalysis.anomalies,
                result.casePrecedentData.casePool
            );
            console.log(`[casePrecedentAnalysisService] ✅ 異常案例詳情生成完成，類型數: ${Object.keys(result.casePrecedentData.anomalyDetails).length}`);
        } else {
            result.casePrecedentData.anomalyDetails = {};
            console.log(`[casePrecedentAnalysisService] 沒有異常案例，跳過詳情生成`);
        }

        // 5. 🆕 使用任務管理模組更新任務狀態為完成
        await updateTaskComplete(taskRef, result);

        console.log(`[casePrecedentAnalysisService] 分析完成，任務ID: ${taskId}`);

    } catch (error) {
        console.error(`[casePrecedentAnalysisService] 背景執行失敗，任務ID: ${taskId}`, error);

        // 🆕 使用任務管理模組更新任務狀態為失敗
        await updateTaskFailed(taskRef, error);
    }
}

/**
 * (入口函式) 啟動案件有利判決分析任務
 */
export async function startCasePrecedentAnalysis(analysisData, userId) {
    // 🆕 使用任務管理模組驗證數據
    validateAnalysisData(analysisData);

    // 🆕 使用任務管理模組創建任務
    const { taskId, taskRef } = await createAnalysisTask(analysisData, userId);

    // **非同步執行**，不等待其完成
    executeAnalysisInBackground(taskId, analysisData, userId);

    return { taskId };
}

// 🗑️ 已移至 casePrecedentAnalysis/case/caseDataFetcher.js
// async function getJudgmentNodeData(caseId) { ... }

// �️ 已移至 casePrecedentAnalysis/case/anomalyCaseProcessor.js
// async function generateAnomalyDetailsFromPoolSimplified(anomalies, casePool) { ... }

// �️ 已移至 casePrecedentAnalysis/case/anomalyCaseProcessor.js
// async function generateAnomalyDetailsFromPool(anomalies, casePool) { ... }

// 🗑️ 已移至 casePrecedentAnalysis/case/anomalyCaseProcessor.js
// async function generateAnomalyDetails(anomalies, allCases) { ... }

/**
 * 創建測試異常詳情數據（當實際數據不可用時）
 */
function createTestAnomalyDetails(anomalies) {
    const testDetails = {};

    for (const anomaly of anomalies) {
        testDetails[anomaly.verdict] = [
            {
                id: `test_${anomaly.verdict}_1`,
                title: `${anomaly.verdict}案例 A`,
                court: '台北地方法院',
                year: '2023',
                similarity: 0.75,
                summary: `台北地方法院 2023年判決，判決結果：${anomaly.verdict}`,
                keyDifferences: [
                    "證據認定標準與主流案例不同",
                    "法律條文解釋角度存在差異",
                    "事實認定的重點有所偏移"
                ],
                riskFactors: [
                    { factor: "證據充分性風險", level: "high" },
                    { factor: "法律適用風險", level: "medium" },
                    { factor: "事實認定風險", level: "medium" }
                ]
            },
            {
                id: `test_${anomaly.verdict}_2`,
                title: `${anomaly.verdict}案例 B`,
                court: '新北地方法院',
                year: '2022',
                similarity: 0.68,
                summary: `新北地方法院 2022年判決，判決結果：${anomaly.verdict}`,
                keyDifferences: [
                    "當事人舉證策略不同",
                    "法官對爭點的理解有差異",
                    "適用法條的選擇不同"
                ],
                riskFactors: [
                    { factor: "舉證策略風險", level: "high" },
                    { factor: "爭點理解風險", level: "medium" },
                    { factor: "法條適用風險", level: "low" }
                ]
            }
        ];
    }

    return testDetails;
}

// 🗑️ 已移至 casePrecedentAnalysis/analysis/criticalCaseAnalyzer.js
// async function getCriticalCasesFromPool(casePool, position, maxCount = 10) { ... }

/**
 * 🆕 獲取主流判決案例的詳細數據（包含 summary_ai_full）- 使用立場導向搜索 (已棄用)
 */
async function getMainstreamCasesWithSummary(caseDescription, courtLevel, caseType, threshold, mainVerdictType, position = 'neutral') {
    try {
        console.log(`[getMainstreamCasesWithSummary] 開始獲取主流判決案例: ${mainVerdictType}，立場: ${position}`);

        // 🆕 1. 使用與初始搜索相同的立場導向策略
        const queryVector = await generateEmbedding(caseDescription);
        const minScore = getThresholdValue(threshold);
        const searchStrategy = getPositionBasedSearchStrategy(position, caseType); // ✅ 傳入 caseType

        const knnQuery = {
            field: searchStrategy.primaryVectorField,
            query_vector: queryVector,
            k: 50,
            num_candidates: 100
        };

        // 🆕 構建包含立場過濾的查詢
        const searchQuery = {
            index: ES_INDEX_NAME,
            knn: knnQuery,
            _source: [
                'JID', 'JTITLE', 'verdict_type', 'court', 'JYEAR', 'summary_ai_full',
                'main_reasons_ai', // 🆕 勝負關鍵因素分析需要
                'position_based_analysis', // 🆕 新增立場分析資料（包含所有立場分析欄位）
                // 🚨 新增所有立場導向向量欄位和相關資料
                'plaintiff_combined_vector',
                'defendant_combined_vector',
                'replicable_strategies_vector',
                'main_reasons_ai_vector',
                'text_embedding',
                'legal_issues_vector', // ✅ 修正: legal_issues_embedding → legal_issues_vector
                'key_metrics' // 🆕 金額分析需要（包含 civil_metrics.claim_amount 和 granted_amount）
            ],
            size: 50,
            timeout: '30s'
        };

        // 🆕 如果有立場過濾條件，添加到查詢中
        if (searchStrategy.filterQuery) {
            searchQuery.query = searchStrategy.filterQuery;
        }

        const response = await esClient.search(searchQuery);

        const hits = response.hits?.hits || [];

        // 2. 篩選出主流判決類型且符合相似度閾值的案例
        const mainStreamCases = hits
            .filter(hit => {
                const similarity = hit._score || 0;
                const verdictType = hit._source?.verdict_type || '';
                return similarity >= minScore && verdictType === mainVerdictType;
            })
            .slice(0, 10) // 取前10名
            .map((hit, index) => ({
                id: hit._source?.JID || 'unknown',
                title: hit._source?.JTITLE || '無標題',
                court: hit._source?.court || '未知法院',
                year: hit._source?.JYEAR || '未知年份',
                verdictType: hit._source?.verdict_type || '未知',
                similarity: hit._score || 0,
                summaryAiFull: hit._source?.summary_ai_full || '',
                positionAnalysis: hit._source?.position_based_analysis || null, // 🆕 添加立場分析資料
                citationIndex: index + 1 // 用於引用編號 [1], [2], ...
            }));

        console.log(`[getMainstreamCasesWithSummary] 找到 ${mainStreamCases.length} 個主流判決案例`);
        return mainStreamCases;

    } catch (error) {
        console.error('[getMainstreamCasesWithSummary] 獲取主流案例失敗:', error);
        throw error;
    }
}

/**
 * 🆕 根據立場生成專業的分析提示詞
 */
function getPositionPrompt(position, caseDescription, mainPattern, caseSummaries) {
    const baseInfo = `**用戶案件描述：**
${caseDescription}

**主流判決模式：** ${mainPattern.verdict} (${mainPattern.count}件，${mainPattern.percentage}%)

🎯 **重要說明：以下案例來自智慧洞察分析的同一案例池，確保分析一致性**

**主流判決案例（來自智慧洞察案例池）：**
${caseSummaries}`;

    const commonRequirements = `
**重要要求：**
- 每個分析點都必須引用具體的判決書，使用格式 [數字]
- 引用要精準，確保引用的判決書確實支持該論點
- 分析要深入，不只是表面描述
- 提供可操作的策略建議`;

    switch (position) {
        case 'plaintiff':
            return `你是資深原告律師，擁有豐富的訴訟經驗。請從原告方角度分析以下案例，重點關注如何為原告爭取最佳結果。

${baseInfo}

請從原告律師的專業角度進行分析：

1. **原告勝訴關鍵要素**：分析這些案例中原告成功的共同因素和制勝要點
2. **有效攻擊策略**：原告律師使用的成功攻擊策略和論證模式
3. **關鍵舉證要點**：原告需要重點準備的證據類型和舉證策略
4. **常見敗訴陷阱**：原告方應該避免的錯誤和風險點
5. **可複製的勝訴模式**：適用於用戶案件的具體攻擊策略建議

**分析重點**：如何幫助原告最大化勝訴機會，提供實戰可用的策略指導
${commonRequirements}

請以JSON格式回應：
{
  "summaryText": "原告方主流判決分析摘要...",
  "plaintiffSuccessFactors": ["原告勝訴要素1 [1][3]", "原告勝訴要素2 [2][5]", ...],
  "attackStrategies": ["攻擊策略1 [2][5]", "攻擊策略2 [3][7]", ...],
  "evidenceRequirements": ["舉證要點1 [1][2]", "舉證要點2 [4][6]", ...],
  "commonPitfalls": ["常見陷阱1 [4][6]", "常見陷阱2 [7][9]", ...],
  "replicableStrategies": ["可複製策略1 [2][6]", "可複製策略2 [3][8]", ...],
  "citations": {
    "1": "判決書標題1 (法院 年份)",
    "2": "判決書標題2 (法院 年份)",
    ...
  }
}`;

        case 'defendant':
            return `你是資深被告律師，擁有豐富的抗辯經驗。請從被告方角度分析以下案例，重點關注如何為被告建立有效防禦。

${baseInfo}

請從被告律師的專業角度進行分析：

1. **被告成功防禦要素**：分析這些案例中被告抗辯成功的共同因素和關鍵要點
2. **有效防禦策略**：被告律師使用的成功防禦策略和抗辯模式
3. **原告方弱點識別**：原告常見的攻擊漏洞、舉證不足和策略缺陷
4. **關鍵抗辯要點**：被告需要重點準備的抗辯理由和防禦證據
5. **可複製的防禦模式**：適用於用戶案件的具體防禦策略建議

**分析重點**：如何幫助被告最大化勝訴或減損機會，提供實戰可用的防禦指導
${commonRequirements}

請以JSON格式回應：
{
  "summaryText": "被告方主流判決分析摘要...",
  "defenseSuccessFactors": ["防禦成功要素1 [1][3]", "防禦成功要素2 [2][5]", ...],
  "defenseStrategies": ["防禦策略1 [2][5]", "防禦策略2 [3][7]", ...],
  "plaintiffWeaknesses": ["原告弱點1 [1][2]", "原告弱點2 [4][6]", ...],
  "counterargumentPoints": ["抗辯要點1 [4][6]", "抗辯要點2 [7][9]", ...],
  "replicableDefenses": ["可複製防禦1 [2][6]", "可複製防禦2 [3][8]", ...],
  "citations": {
    "1": "判決書標題1 (法院 年份)",
    "2": "判決書標題2 (法院 年份)",
    ...
  }
}`;

        default: // 'neutral'
            return `你是資深法律分析師。請客觀分析以下案例的判決模式，提供中性的專業見解。

${baseInfo}

請進行客觀的專業分析：

1. **判決關鍵要素**：分析影響判決結果的主要因素和決定性要點
2. **法院重視的證據類型**：識別法院在判決中特別重視的證據種類
3. **常見論證邏輯**：歸納法院在類似案件中的推理模式和判決邏輯
4. **判決理由共同點**：提取判決書中反覆出現的理由和法律見解
5. **策略建議**：基於主流模式為用戶案件提供中性的專業建議

**分析重點**：提供客觀、平衡的法律分析，幫助理解判決規律
${commonRequirements}

請以JSON格式回應：
{
  "summaryText": "主流判決分析摘要...",
  "keySuccessFactors": ["關鍵要素1 [1][3]", "關鍵要素2 [2][5]", ...],
  "evidenceTypes": ["證據類型1 [1][2]", "證據類型2 [4][6]", ...],
  "reasoningPatterns": ["推理模式1 [2][7]", "推理模式2 [3][8]", ...],
  "commonReasons": ["共同理由1 [1][4]", "共同理由2 [5][9]", ...],
  "strategicRecommendations": ["建議1 [2][6]", "建議2 [3][7]", ...],
  "citations": {
    "1": "判決書標題1 (法院 年份)",
    "2": "判決書標題2 (法院 年份)",
    ...
  }
}`;
    }
}

// 🗑️ 已移至 casePrecedentAnalysis/ai/criticalAnalysisPrompts.js
// function getCriticalAnalysisPrompt(position, caseDescription, distribution, caseSummaries) { ... }


// 🗑️ 已移至 casePrecedentAnalysis/analysis/criticalCaseAnalyzer.js
// function prepareEnrichedCaseSummaries(mainStreamCases, position) { ... }

/**
 * 🆕 使用 AI 分析主流判決模式 - 立場導向版本
 */
async function analyzeMainstreamPattern(caseDescription, mainStreamCases, mainPattern, position = 'neutral') {
    try {
        console.log(`[analyzeMainstreamPattern] 開始分析主流判決模式，立場: ${position}`);

        // 🆕 準備包含立場分析的案例摘要文本
        const caseSummaries = prepareEnrichedCaseSummaries(mainStreamCases, position);

        // 🆕 使用立場導向的提示詞
        const prompt = getPositionPrompt(position, caseDescription, mainPattern, caseSummaries);

        const response = await openai.chat.completions.create({
            model: ANALYSIS_MODEL,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            response_format: { type: "json_object" }
        });

        const analysisResult = JSON.parse(response.choices[0].message.content);

        // 🔧 修正：確保引用格式與共同點歸納一致（包含 judgementId 和 originalText）
        // 🆕 添加完整的判決書信息以支持點擊開啟
        const citations = {};
        mainStreamCases.forEach((case_, index) => {
            citations[index + 1] = {
                // 🆕 添加完整的判決書信息
                JID: case_.id || case_.JID,  // 判決書唯一識別碼
                JTITLE: case_.title,  // 判決書標題
                judgementId: `${case_.title} (${case_.court} ${case_.year}年)`,  // 顯示用的判決書ID
                originalText: case_.summaryAiFull || '無摘要',  // 🔧 修復：使用正確的駝峰命名 summaryAiFull
                court: case_.court,  // 法院
                year: case_.year,  // 年份
                // 🆕 添加其他可能有用的字段
                verdict_type: case_.verdict_type || case_.verdictType,  // 判決類型
                summary_ai: case_.summaryAiFull || ''  // 🔧 修復：使用正確的駝峰命名 summaryAiFull
            };
        });

        analysisResult.citations = citations;

        // 🆕 添加立場信息到結果中
        analysisResult.position = position;
        analysisResult.analysisType = position === 'plaintiff' ? '原告方分析' :
                                     position === 'defendant' ? '被告方分析' : '中性分析';

        console.log(`[analyzeMainstreamPattern] 主流判決分析完成，立場: ${position}`);
        return analysisResult;

    } catch (error) {
        console.error('[analyzeMainstreamPattern] AI分析失敗:', error);
        throw error;
    }
}

// 🗑️ 已移至 casePrecedentAnalysis/analysis/criticalPatternAnalyzer.js
// async function analyzeCriticalPattern(caseDescription, criticalCases, distribution, position = 'defendant') { ... }


/**
 * 歸納主流判決分析
 * @param {string} taskId - 原始案件有利判決分析的任務ID
 * @param {string} userId - 用戶ID
 * @returns {Promise<{taskId: string}>} 新的分析任務ID
 */
export async function startMainstreamAnalysis(originalTaskId, userId) {
    // 1. 🆕 使用任務管理模組獲取原始分析結果
    const originalResult = await getOriginalTaskData(originalTaskId);

    // 2. 🆕 使用任務管理模組創建新的分析任務
    const { taskId } = await createMainstreamAnalysisTask(originalTaskId, userId);

    // 3. 非同步執行分析
    executeMainstreamAnalysisInBackground(taskId, originalResult, userId);

    return { taskId };
}

/**
 * (背景執行) 主流判決分析函式
 */
async function executeMainstreamAnalysisInBackground(taskId, originalResult, userId) {
    // 🆕 使用任務管理模組獲取任務引用
    const taskRef = getTaskRef(taskId);

    try {
        console.log(`[casePrecedentAnalysisService] 開始執行主流判決分析，任務ID: ${taskId}`);

        const casePrecedentData = originalResult.casePrecedentData;
        const mainPattern = casePrecedentData.mainPattern;
        const analysisParams = casePrecedentData.analysisParams;

        // 檢查是否有足夠的主流案例
        if (!mainPattern || mainPattern.count < 5) {
            throw new Error('主流判決案例數量不足，無法進行分析');
        }

        // 🚨 4. 從案例池中獲取重大判決案例（優先重大勝訴+重大敗訴）
        const { casePool } = casePrecedentData;
        const position = analysisParams.position || 'defendant';
        console.log(`[casePrecedentAnalysisService] 🎯 從案例池獲取重大判決案例，立場: ${position}`);

        const { cases: criticalCases, distribution } = await getCriticalCasesFromPool(casePool, position, 10);

        if (criticalCases.length < 3) {
            throw new Error(`案例池中重大判決案例數量不足: ${criticalCases.length} 個`);
        }

        console.log(`[casePrecedentAnalysisService] ✅ 獲取了 ${criticalCases.length} 件重大判決案例，分布: 重大勝訴 ${distribution.majorVictory} 件, 重大敗訴 ${distribution.majorDefeat} 件, 部分勝訴 ${distribution.partialSuccess} 件`);

        // 5. 使用 AI 分析重大判決模式 - 🆕 傳遞立場參數和案例分布
        const analysisResult = await analyzeCriticalPattern(
            analysisParams.caseDescription,
            criticalCases,
            distribution,
            position
        );

        // 6. 🆕 使用任務管理模組更新任務狀態為完成
        const result = {
            report: analysisResult,
            analyzedCount: criticalCases.length,
            mainPattern: mainPattern,
            originalCaseDescription: analysisParams.caseDescription
        };
        await updateTaskComplete(taskRef, result);

        console.log(`[casePrecedentAnalysisService] 重大判決分析完成，任務ID: ${taskId}`);

    } catch (error) {
        console.error(`[casePrecedentAnalysisService] 主流判決分析失敗，任務ID: ${taskId}`, error);

        // 🆕 使用任務管理模組更新任務狀態為錯誤
        await updateTaskError(taskRef, error);
    }
}
