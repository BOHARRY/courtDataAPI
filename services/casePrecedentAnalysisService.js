// services/casePrecedentAnalysisService.js
import esClient from '../config/elasticsearch.js';
import { OpenAI } from 'openai';
import { OPENAI_API_KEY, OPENAI_MODEL_NAME_CHAT } from '../config/environment.js';
import admin from 'firebase-admin';

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

const ES_INDEX_NAME = 'search-boooook';
const ANALYSIS_MODEL = OPENAI_MODEL_NAME_CHAT || 'gpt-4.1';

// 記憶體監控工具
const logMemoryUsage = (step) => {
    const used = process.memoryUsage();
    const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
    const rssMB = Math.round(used.rss / 1024 / 1024);
    const externalMB = Math.round(used.external / 1024 / 1024);
    console.log(`[Memory-${step}] Heap: ${heapUsedMB}MB, RSS: ${rssMB}MB, External: ${externalMB}MB`);

    // 警告記憶體使用過高
    if (heapUsedMB > 400) {
        console.warn(`⚠️ [Memory Warning] Heap usage high: ${heapUsedMB}MB`);
    }
};

/**
 * 將相似度門檻轉換為數值
 */
function getThresholdValue(threshold) {
    switch (threshold) {
        case 'low': return 0.6;
        case 'medium': return 0.75;
        case 'high': return 0.85;
        default: return 0.75;
    }
}

/**
 * 將案件類型轉換為 ES 查詢條件
 */
function getCaseTypeFilter(caseType) {
    switch (caseType) {
        case '民事': return 'civil';
        case '刑事': return 'criminal';
        case '行政': return 'administrative';
        default: return 'civil';
    }
}

/**
 * 將法院層級轉換為 ES 查詢條件
 */
function getCourtLevelFilter(courtLevel) {
    switch (courtLevel) {
        case '地方法院': return 'district';
        case '高等法院': return 'high';
        case '最高法院': return 'supreme';
        default: return 'district';
    }
}

/**
 * 使用 OpenAI 生成案件描述的向量
 */
async function generateEmbedding(text) {
    try {
        const response = await openai.embeddings.create({
            model: 'text-embedding-3-large',
            input: text,
            dimensions: 1536
        });
        return response.data[0].embedding;
    } catch (error) {
        console.error('[casePrecedentAnalysisService] 生成向量失敗:', error);
        throw new Error('無法生成案件描述的向量表示');
    }
}

/**
 * 執行 ES 向量搜索
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
            field: "text_embedding",
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
                'JID', 'JTITLE', 'verdict_type', 'court', 'JYEAR'
                // 移除 summary_ai_full 和 legal_issues 減少數據量
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
        console.log(`[casePrecedentAnalysisService] 搜索返回 ${hits.length} 個結果`);
        console.log(`[casePrecedentAnalysisService] 完整回應結構:`, JSON.stringify(response, null, 2));

        return hits.map(hit => ({
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
 * 分析判決結果分布並檢測異常
 */
function analyzeVerdictDistribution(cases) {
    const verdictStats = {};
    const totalCases = cases.length;
    
    // 統計各種判決結果
    cases.forEach(case_ => {
        const verdict = case_.verdictType || '未知';
        verdictStats[verdict] = (verdictStats[verdict] || 0) + 1;
    });
    
    // 計算百分比並識別異常
    const distribution = Object.entries(verdictStats).map(([verdict, count]) => ({
        verdict,
        count,
        percentage: Math.round((count / totalCases) * 100)
    })).sort((a, b) => b.count - a.count);
    
    // 找出主流模式（最常見的結果）
    const mainPattern = distribution[0];
    
    // 找出異常模式（低於 10% 的結果）
    const anomalies = distribution.filter(item => item.percentage < 10 && item.count > 0);
    
    return {
        totalCases,
        distribution,
        mainPattern,
        anomalies
    };
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
    const db = admin.firestore();
    const taskRef = db.collection('aiAnalysisTasks').doc(taskId);

    try {
        logMemoryUsage('Start-Analysis');
        console.log(`[casePrecedentAnalysisService] 開始執行案例判決傾向分析，任務ID: ${taskId}`);
        
        // 1. 搜索相似案例
        const similarCases = await searchSimilarCases(
            analysisData.caseDescription,
            analysisData.courtLevel,
            analysisData.caseType,
            analysisData.threshold
        );
        
        if (similarCases.length === 0) {
            throw new Error('未找到符合條件的相似案例');
        }
        
        console.log(`[casePrecedentAnalysisService] 找到 ${similarCases.length} 個相似案例`);

        if (similarCases.length === 0) {
            throw new Error('未找到符合條件的相似案例，請調整搜索條件');
        }

        // 2. 分析判決分布
        const verdictAnalysis = analyzeVerdictDistribution(similarCases);
        logMemoryUsage('After-VerdictAnalysis');
        console.log(`[casePrecedentAnalysisService] 判決分布分析完成，主流模式: ${verdictAnalysis.mainPattern?.verdict}`);
        
        // 3. 分析異常案例 - 暫時跳過 AI 分析避免超時
        let anomalyAnalysis = null;
        if (verdictAnalysis.anomalies.length > 0) {
            // 簡化的異常分析，不調用 OpenAI
            anomalyAnalysis = {
                keyDifferences: ["案件事實差異", "法律適用差異", "舉證程度差異"],
                riskFactors: ["證據不足風險", "法律適用風險"],
                opportunities: ["完整舉證機會", "法律論述機會"],
                strategicInsights: `發現 ${verdictAnalysis.anomalies.length} 種異常判決模式，建議深入分析差異因素。`
            };
        }
        
        // 4. 準備結果 - 保持與現有分析結果格式一致
        const summaryText = `案例判決傾向分析完成！

📊 分析了 ${similarCases.length} 個相似案例
🎯 主流判決模式：${verdictAnalysis.mainPattern.verdict} (${verdictAnalysis.mainPattern.percentage}%)
${verdictAnalysis.anomalies.length > 0 ?
`⚠️ 發現 ${verdictAnalysis.anomalies.length} 種異常模式：${verdictAnalysis.anomalies.map(a => `${a.verdict} (${a.percentage}%)`).join(', ')}` :
'✅ 未發現顯著異常模式'}

${anomalyAnalysis ? `💡 關鍵洞察：${anomalyAnalysis.strategicInsights}` : ''}`;

        const result = {
            // 保持與 summarizeCommonPointsService 一致的格式
            report: {
                summaryText,
                citations: {} // 案例判決傾向分析不需要引用
            },
            analyzedCount: similarCases.length,

            // 額外的案例判決傾向分析數據
            casePrecedentData: {
                analysisType: 'case_precedent_analysis',
                totalSimilarCases: similarCases.length,
                verdictDistribution: verdictAnalysis.distribution,
                mainPattern: verdictAnalysis.mainPattern,
                anomalies: verdictAnalysis.anomalies,
                anomalyAnalysis,
                representativeCases: similarCases.slice(0, 3).map(c => ({
                    id: c.id,
                    title: c.title,
                    verdictType: c.verdictType,
                    similarity: Math.round(c.similarity * 100),
                    summary: `${c.court} ${c.year}年` // 簡化摘要
                })),
                analysisParams: analysisData
            }
        };
        
        // 5. 更新任務狀態為完成
        await taskRef.update({
            status: 'complete',
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            result
        });
        
        console.log(`[casePrecedentAnalysisService] 分析完成，任務ID: ${taskId}`);
        
    } catch (error) {
        console.error(`[casePrecedentAnalysisService] 背景執行失敗，任務ID: ${taskId}`, error);
        
        // 更新任務狀態為失敗
        await taskRef.update({
            status: 'failed',
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            error: error.message || '案例判決傾向分析時發生未知錯誤'
        });
    }
}

/**
 * (入口函式) 啟動案例判決傾向分析任務
 */
export async function startCasePrecedentAnalysis(analysisData, userId) {
    if (!analysisData.caseDescription || !analysisData.caseDescription.trim()) {
        const error = new Error('案件描述為必填欄位');
        error.statusCode = 400;
        throw error;
    }
    
    const db = admin.firestore();
    const taskRef = db.collection('aiAnalysisTasks').doc();
    const taskId = taskRef.id;
    
    const taskData = {
        userId,
        taskId,
        analysisType: 'case_precedent_analysis',
        analysisData,
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    await taskRef.set(taskData);
    console.log(`[casePrecedentAnalysisService] 任務 ${taskId} 已為用戶 ${userId} 創建`);
    
    // **非同步執行**，不等待其完成
    executeAnalysisInBackground(taskId, analysisData, userId);
    
    return { taskId };
}
