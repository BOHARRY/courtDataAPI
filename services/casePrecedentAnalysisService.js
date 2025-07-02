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
        // 1. 生成查詢向量
        const queryVector = await generateEmbedding(caseDescription);
        const minScore = getThresholdValue(threshold);

        // 2. 構建 ES 查詢 - 修正查詢結構
        const searchBody = {
            size: 500, // 獲取更多結果用於統計分析
            min_score: minScore,
            query: {
                script_score: {
                    query: { match_all: {} },
                    script: {
                        source: "cosineSimilarity(params.query_vector, 'text_embedding') + 1.0",
                        params: {
                            query_vector: queryVector
                        }
                    }
                }
            },
            _source: [
                'JID', 'JTITLE', 'summary_ai_full', 'legal_issues',
                'verdict_type', 'court', 'case_type', 'JDATE', 'JYEAR'
            ]
        };

        console.log(`[casePrecedentAnalysisService] 執行向量搜索，門檻: ${minScore}`);
        const response = await esClient.search({
            index: ES_INDEX_NAME,
            body: searchBody
        });

        // 修正回應結構處理
        const hits = response.hits?.hits || response.body?.hits?.hits || [];
        console.log(`[casePrecedentAnalysisService] 搜索返回 ${hits.length} 個結果`);

        return hits.map(hit => ({
            id: hit._source?.JID || 'unknown',
            title: hit._source?.JTITLE || '無標題',
            summary: hit._source?.summary_ai_full || '',
            legalIssues: hit._source?.legal_issues || '',
            verdictType: hit._source?.verdict_type || '未知',
            court: hit._source?.court || '未知法院',
            caseType: hit._source?.case_type || '未知類型',
            year: hit._source?.JYEAR || '未知年份',
            similarity: (hit._score || 0) - 1.0, // 減去 1.0 因為我們在 script 中加了 1.0
            source: hit._source || {}
        }));
    } catch (error) {
        console.error('[casePrecedentAnalysisService] ES 搜索失敗:', error);
        console.error('[casePrecedentAnalysisService] 搜索查詢:', JSON.stringify(searchBody, null, 2));
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
        
        // 2. 分析判決分布
        const verdictAnalysis = analyzeVerdictDistribution(similarCases);
        
        // 3. 分析異常案例
        let anomalyAnalysis = null;
        if (verdictAnalysis.anomalies.length > 0) {
            const mainCases = similarCases.filter(c => c.verdictType === verdictAnalysis.mainPattern.verdict);
            const anomalyCases = similarCases.filter(c => 
                verdictAnalysis.anomalies.some(a => a.verdict === c.verdictType)
            );
            
            anomalyAnalysis = await analyzeAnomalies(mainCases, anomalyCases, analysisData.caseDescription);
        }
        
        // 4. 準備結果
        const result = {
            analysisType: 'case_precedent_analysis',
            totalSimilarCases: similarCases.length,
            verdictDistribution: verdictAnalysis.distribution,
            mainPattern: verdictAnalysis.mainPattern,
            anomalies: verdictAnalysis.anomalies,
            anomalyAnalysis,
            representativeCases: similarCases.slice(0, 5).map(c => ({
                id: c.id,
                title: c.title,
                verdictType: c.verdictType,
                similarity: Math.round(c.similarity * 100),
                summary: c.summary?.substring(0, 300)
            })),
            analysisParams: analysisData
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
