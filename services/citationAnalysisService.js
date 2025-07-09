// services/citationAnalysisService.js
import admin from 'firebase-admin';
import OpenAI from 'openai';
import { OPENAI_API_KEY } from '../config/environment.js';
import esClient from '../config/elasticsearch.js';

// Elasticsearch 索引名稱
const ES_INDEX_NAME = 'search-boooook';

// 初始化 OpenAI 客戶端
const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

/**
 * 文本清理函數 - 複製自前端 highlightUtils.js
 * 用於統一文本格式，確保精確匹配
 */
function getCleanText(text) {
    if (typeof text !== 'string' || !text) return '';
    return text
        .replace(/\s/g, '') // 移除所有空白字符 (包括 \n, \r, \t, 空格等)
        .replace(/，/g, ',') // 全形逗號 -> 半形
        .replace(/。/g, '.') // 全形句號 -> 半形
        .replace(/（/g, '(') // 全形括號 -> 半形
        .replace(/）/g, ')'); // 全形括號 -> 半形
}

/**
 * 獲取判決書完整數據（用於援引分析）
 */
async function getJudgmentNodeData(caseId) {
    try {
        const response = await esClient.get({
            index: ES_INDEX_NAME,
            id: caseId,
            _source: [
                'JID', 'JTITLE', 'court', 'verdict_type',
                'summary_ai', 'main_reasons_ai',
                'legal_issues', 'citations', 'JFULL',
                'CourtInsightsStart', 'CourtInsightsEND',
                // 立場分析相關欄位
                'position_based_analysis',
                'plaintiff_perspective',
                'defendant_perspective'
            ]
        });

        console.log(`[getJudgmentNodeData] 成功獲取案例 ${caseId} 數據`);
        return response._source;
    } catch (error) {
        console.error(`[getJudgmentNodeData] 獲取案例 ${caseId} 詳細數據失敗:`, error);
        return null;
    }
}

/**
 * 🎯 援引判例分析服務
 * 基於案例池中的判決書，分析和推薦援引判例
 */

/**
 * 從單個案例中提取援引判例的前後文脈絡
 */
function extractCitationContext(citation, JFULL, CourtInsightsStart, CourtInsightsEND) {
    if (!JFULL || !citation) {
        return {
            citation,
            found: false,
            inCourtInsight: false,
            context: null,
            position: -1
        };
    }

    try {
        // 使用與爭點變色相同的清理邏輯
        const cleanJfull = getCleanText(JFULL);
        const cleanCitation = getCleanText(citation);
        
        // 找到援引判例在文本中的位置
        const citationIndex = cleanJfull.indexOf(cleanCitation);
        
        if (citationIndex === -1) {
            return {
                citation,
                found: false,
                inCourtInsight: false,
                context: null,
                position: -1
            };
        }

        // 判斷是否在法院見解內
        let inCourtInsight = false;
        if (CourtInsightsStart && CourtInsightsEND) {
            const cleanStartTag = getCleanText(CourtInsightsStart);
            const cleanEndTag = getCleanText(CourtInsightsEND);
            
            const startIndex = cleanJfull.indexOf(cleanStartTag);
            const endIndex = cleanJfull.indexOf(cleanEndTag, startIndex);
            
            if (startIndex !== -1 && endIndex !== -1) {
                inCourtInsight = citationIndex >= startIndex && citationIndex < endIndex;
            }
        }

        // 提取前後文（前後各300字，提供更多上下文）
        const contextLength = 300;
        const contextStart = Math.max(0, citationIndex - contextLength);
        const contextEnd = Math.min(cleanJfull.length, citationIndex + cleanCitation.length + contextLength);
        
        const beforeContext = cleanJfull.substring(contextStart, citationIndex);
        const afterContext = cleanJfull.substring(citationIndex + cleanCitation.length, contextEnd);
        
        return {
            citation,
            found: true,
            inCourtInsight,
            context: {
                before: beforeContext,
                citation: cleanCitation,
                after: afterContext,
                fullContext: cleanJfull.substring(contextStart, contextEnd)
            },
            position: citationIndex
        };

    } catch (error) {
        console.error('[extractCitationContext] 錯誤:', error);
        return {
            citation,
            found: false,
            inCourtInsight: false,
            context: null,
            position: -1,
            error: error.message
        };
    }
}

/**
 * 從案例池中提取所有援引判例並進行統計分析
 * 注意：案例池中的數據可能已精簡，需要從 ES 獲取完整數據
 */
async function extractCitationsFromCases(cases) {
    console.log(`[extractCitationsFromCases] 開始分析 ${cases.length} 個案例的援引判例`);

    const citationMap = new Map();
    let totalCitationsFound = 0;
    let casesWithCitations = 0;

    // 🚨 優化：逐個處理案例，避免在內存中保留大型 JFULL 數據
    for (let caseIndex = 0; caseIndex < cases.length; caseIndex++) {
        const case_ = cases[caseIndex];
        // 檢查案例是否有 citations 數據
        let citations = case_.source?.citations || [];
        let JFULL = case_.source?.JFULL || '';
        let CourtInsightsStart = case_.source?.CourtInsightsStart || '';
        let CourtInsightsEND = case_.source?.CourtInsightsEND || '';

        // 如果案例池中沒有完整數據，從 ES 獲取（但不保存到內存中）
        if (citations.length === 0 || !JFULL) {
            try {
                const fullData = await getJudgmentNodeData(case_.id);
                if (fullData) {
                    citations = fullData.citations || [];
                    JFULL = fullData.JFULL || '';
                    CourtInsightsStart = fullData.CourtInsightsStart || '';
                    CourtInsightsEND = fullData.CourtInsightsEND || '';
                }
            } catch (error) {
                console.error(`[extractCitationsFromCases] 獲取案例 ${case_.id} 完整數據失敗:`, error);
                continue; // 跳過這個案例
            }
        }

        if (citations.length === 0) {
            continue; // 跳過沒有援引的案例
        }

        casesWithCitations++;
        console.log(`[extractCitationsFromCases] 案例 ${caseIndex + 1}: ${case_.title} - 發現 ${citations.length} 個援引`);

        for (const citation of citations) {
            if (!citation || typeof citation !== 'string') {
                continue; // 跳過無效的援引
            }

            totalCitationsFound++;

            // 初始化援引判例記錄
            if (!citationMap.has(citation)) {
                citationMap.set(citation, {
                    citation,
                    occurrences: [],
                    usageCount: 0,
                    inCourtInsightCount: 0,
                    casesUsed: new Set(),
                    totalContexts: []
                });
            }

            const citationRecord = citationMap.get(citation);

            // 提取前後文脈絡
            const context = extractCitationContext(
                citation,
                JFULL,
                CourtInsightsStart,
                CourtInsightsEND
            );

            // 🚨 記錄使用情況（精簡版，不保存完整 context）
            citationRecord.occurrences.push({
                caseId: case_.id,
                caseTitle: case_.title,
                court: case_.court,
                year: case_.year,
                verdictType: case_.verdictType,
                similarity: case_.similarity,
                found: context.found,
                inCourtInsight: context.inCourtInsight
                // 🚨 不保存完整的 context 數據
            });

            citationRecord.usageCount++;
            citationRecord.casesUsed.add(case_.id);

            if (context.inCourtInsight) {
                citationRecord.inCourtInsightCount++;
            }

            // 🚨 不保存 totalContexts 以節省內存
        }

        // 🚨 清理變量，釋放內存
        JFULL = null;
        CourtInsightsStart = null;
        CourtInsightsEND = null;
    }

    const citationStats = Array.from(citationMap.values());
    
    console.log(`[extractCitationsFromCases] 統計完成:`);
    console.log(`- 總案例數: ${cases.length}`);
    console.log(`- 有援引的案例: ${casesWithCitations}`);
    console.log(`- 總援引次數: ${totalCitationsFound}`);
    console.log(`- 獨特援引判例: ${citationStats.length}`);

    return citationStats;
}

/**
 * 計算援引判例的稀有度和價值評分
 */
function calculateCitationValue(citationRecord, totalCases) {
    const { usageCount, inCourtInsightCount, casesUsed, totalContexts } = citationRecord;

    // 1. 稀有度評分 (0-40分)
    const usageFrequency = usageCount / totalCases;
    const rarenessScore = Math.min(40, (1 - usageFrequency) * 40);

    // 2. 位置價值評分 (0-30分)
    const courtInsightRatio = usageCount > 0 ? inCourtInsightCount / usageCount : 0;
    const positionScore = courtInsightRatio * 30;

    // 3. 脈絡豐富度評分 (0-20分)
    const contextScore = Math.min(20, totalContexts.length * 2);

    // 4. 跨案例價值評分 (0-10分)
    const crossCaseScore = Math.min(10, casesUsed.size * 2);

    const totalScore = rarenessScore + positionScore + contextScore + crossCaseScore;

    // 評級分類
    let grade, category;
    if (totalScore >= 80) {
        grade = 'S級寶石';
        category = 'rare-gem';
    } else if (totalScore >= 60) {
        grade = 'A級精品';
        category = 'high-value';
    } else if (totalScore >= 40) {
        grade = 'B級實用';
        category = 'practical';
    } else {
        grade = 'C級一般';
        category = 'common';
    }

    return {
        totalScore: Math.round(totalScore),
        grade,
        category,
        breakdown: {
            rareness: Math.round(rarenessScore),
            position: Math.round(positionScore),
            context: Math.round(contextScore),
            crossCase: Math.round(crossCaseScore)
        },
        metrics: {
            usageCount,
            inCourtInsightCount,
            courtInsightRatio: Math.round(courtInsightRatio * 100),
            casesUsed: casesUsed.size,
            contextsAvailable: totalContexts.length
        }
    };
}

/**
 * 為援引判例添加價值評估
 */
function enrichCitationsWithValue(citationStats, totalCases) {
    console.log(`[enrichCitationsWithValue] 為 ${citationStats.length} 個援引判例計算價值評分`);

    return citationStats.map(citationRecord => {
        const valueAssessment = calculateCitationValue(citationRecord, totalCases);

        return {
            ...citationRecord,
            casesUsed: Array.from(citationRecord.casesUsed), // 轉換 Set 為 Array
            valueAssessment
        };
    }).sort((a, b) => b.valueAssessment.totalScore - a.valueAssessment.totalScore);
}

/**
 * 主要的援引判例分析函數
 */
async function analyzeCitationsFromCasePool(casePool, position, caseDescription, originalPositionStats = null) {
    try {
        console.log(`[analyzeCitationsFromCasePool] 開始分析援引判例，立場: ${position}`);

        if (!casePool?.allCases || casePool.allCases.length === 0) {
            throw new Error('案例池為空或無效');
        }

        // 1. 提取所有援引判例（異步獲取完整數據）
        const citationStats = await extractCitationsFromCases(casePool.allCases);

        if (citationStats.length === 0) {
            return {
                totalCitations: 0,
                uniqueCitations: 0,
                recommendations: [],
                summary: '在相關案例中未發現任何援引判例',
                analysisMetadata: {
                    basedOnCases: casePool.allCases.length,
                    position,
                    timestamp: new Date().toISOString(),
                    hasData: false
                }
            };
        }

        // 2. 計算價值評估
        const enrichedCitations = enrichCitationsWithValue(citationStats, casePool.allCases.length);

        // 3. 篩選高價值援引（總分 >= 40 或在法院見解內被引用）
        const valuableCitations = enrichedCitations.filter(citation =>
            citation.valueAssessment.totalScore >= 40 ||
            citation.inCourtInsightCount > 0
        );

        // 🆕 優化排序邏輯：優先考慮法院見解內援引和稀有度
        valuableCitations.sort((a, b) => {
            // 首先按法院見解內引用次數排序（最重要）
            if (b.inCourtInsightCount !== a.inCourtInsightCount) {
                return b.inCourtInsightCount - a.inCourtInsightCount;
            }
            // 其次按稀有度排序（稀有度高的優先，避免忽略關鍵刁鑽援引）
            if (b.valueAssessment.rarityScore !== a.valueAssessment.rarityScore) {
                return b.valueAssessment.rarityScore - a.valueAssessment.rarityScore;
            }
            // 最後按總分排序
            return b.valueAssessment.totalScore - a.valueAssessment.totalScore;
        });

        console.log(`[analyzeCitationsFromCasePool] 發現 ${valuableCitations.length} 個有價值的援引判例，已按重要性重新排序`);

        // 4. 🆕 兩階段 AI 分析：先篩選重要性，再逐個深度分析
        const aiRecommendations = await generateCitationRecommendationsTwoStage(
            valuableCitations,
            position,
            caseDescription,
            casePool
        );

        // 🚨 精簡數據以避免 Firestore 大小限制
        const compactCitations = enrichedCitations.map(citation => ({
            citation: citation.citation,
            usageCount: citation.usageCount,
            inCourtInsightCount: citation.inCourtInsightCount,
            valueAssessment: citation.valueAssessment,
            // 🚨 移除大型數據：不保存 totalContexts 和完整的 occurrences
            sampleCases: citation.occurrences.slice(0, 3).map(occ => ({
                caseId: occ.caseId,
                caseTitle: occ.caseTitle,
                found: occ.context?.found || false,
                inCourtInsight: occ.context?.inCourtInsight || false
                // 🚨 不保存完整的 context 數據
            }))
        }));

        return {
            totalCitations: citationStats.reduce((sum, c) => sum + c.usageCount, 0),
            uniqueCitations: citationStats.length,
            valuableCitations: compactCitations.slice(0, 15), // 限制前15個最有價值的
            // 🚨 移除 allCitations 以節省空間
            recommendations: aiRecommendations.recommendations,
            summary: aiRecommendations.summary,
            analysisMetadata: {
                basedOnCases: casePool.allCases.length,
                position,
                caseDescription,
                timestamp: new Date().toISOString(),
                hasData: true,
                aiAnalysisStatus: aiRecommendations.aiAnalysisStatus
            },
            // 🆕 傳遞原始分析的 positionStats
            originalPositionStats
        };

    } catch (error) {
        console.error('[analyzeCitationsFromCasePool] 分析失敗:', error);
        throw error;
    }
}

/**
 * 創建 AI 分析 Prompt（借鑒用戶提供的 Python 代碼設計）
 */
function createCitationRecommendationPrompt(valuableCitations, position, caseDescription, casePool) {
    const positionLabel = position === 'plaintiff' ? '原告' : position === 'defendant' ? '被告' : '中性';

    // 🆕 為 AI 分析重新獲取上下文數據
    const citationDataWithContext = [];

    for (const citation of valuableCitations.slice(0, 10)) {
        // 從案例池中重新提取該援引的上下文
        const contextSamples = [];

        for (const case_ of casePool.allCases.slice(0, 20)) { // 限制檢查範圍避免超時
            if (!case_.source?.citations || !Array.isArray(case_.source.citations)) continue;

            if (case_.source.citations.includes(citation.citation)) {
                // 重新提取上下文
                const context = extractCitationContext(
                    citation.citation,
                    case_.source?.JFULL || '',
                    case_.source?.CourtInsightsStart || '',
                    case_.source?.CourtInsightsEND || ''
                );

                if (context.found && context.context) {
                    contextSamples.push({
                        fullContext: context.context,
                        inCourtInsight: context.inCourtInsight,
                        caseTitle: case_.title
                    });
                }
            }

            if (contextSamples.length >= 3) break; // 最多3個樣本
        }

        citationDataWithContext.push({
            citation: citation.citation,
            usageCount: citation.usageCount,
            inCourtInsightCount: citation.inCourtInsightCount,
            valueScore: citation.valueAssessment.totalScore,
            grade: citation.valueAssessment.grade,
            rarityScore: citation.valueAssessment.rarityScore,
            // 🆕 提供實際的上下文樣本
            sampleContexts: contextSamples
                .sort((a, b) => {
                    // 優先法院見解內的上下文
                    if (a.inCourtInsight !== b.inCourtInsight) {
                        return b.inCourtInsight - a.inCourtInsight;
                    }
                    // 其次選擇較長的上下文
                    return b.fullContext.length - a.fullContext.length;
                })
                .slice(0, 2)
                .map(ctx => ({
                    context: ctx.fullContext.substring(0, 400), // 增加到400字符
                    inCourtInsight: ctx.inCourtInsight,
                    fromCase: ctx.caseTitle
                }))
        });
    }

    return `你是專業的法律分析師。請基於以下資料，為${positionLabel}立場的律師推薦援引判例。

案件描述：${caseDescription}
律師立場：${positionLabel}

可用的援引判例分析：
${JSON.stringify(citationDataWithContext, null, 2)}

🎯 **分析重點**：
- 仔細閱讀每個判例的 sampleContexts（前後文脈絡）
- 從上下文推斷該判例的具體法律適用場景
- 分析該判例在原判決書中解決了什麼具體法律問題
- 評估該判例與當前案件的相關性和適用性

請分析並推薦最有價值的援引判例，並以 JSON 格式回應：
{
  "recommendations": [
    {
      "citation": "判例名稱",
      "recommendationLevel": "強烈推薦|建議考慮|謹慎使用",
      "reason": "基於上下文分析的具體推薦理由，必須引用實際的上下文片段作為證據（50-100字）",
      "usageStrategy": "具體使用時機和策略，僅基於上下文中明確顯示的適用場景（30-50字）",
      "contextEvidence": "支持此推薦的上下文片段（直接引用）",
      "riskWarning": "注意事項，特別是上下文不足的警告（如有）",
      "confidence": "高|中|低",
      "uncertaintyNote": "如果上下文不足以確定適用場景，請明確說明"
    }
  ],
  "summary": "整體建議摘要，強調分析的局限性（100字內）"
}

重要原則：
1. **嚴格基於上下文**：只基於 sampleContexts 中的實際內容進行分析，不要推測或補充
2. **保守推薦**：如果上下文不足以明確判斷該判例的適用場景，必須標記為"謹慎使用"
3. **避免過度解讀**：不要從有限的上下文中推斷過多信息
4. **具體引用內容**：在推薦理由中引用實際的上下文片段，證明你的分析
5. **優先法院見解**：優先推薦在法院見解內被引用的判例（inCourtInsightCount > 0）
6. **重視稀有價值**：高 rarityScore 的援引可能是致勝關鍵，即使使用次數少
7. **明確不確定性**：如果對判例的適用場景不確定，明確說明"需要進一步確認"
8. **絕對不瞎掰**：寧可說"上下文不足以判斷"也不要編造適用場景
9. **引用驗證**：在分析中引用具體的上下文片段來支持你的結論
10. 請使用繁體中文回應，並確保回應是有效的 JSON 格式`;
}

/**
 * 🆕 兩階段 AI 分析：先篩選重要性，再逐個深度分析
 */
async function generateCitationRecommendationsTwoStage(valuableCitations, position, caseDescription, casePool) {
    try {
        console.log(`[generateCitationRecommendationsTwoStage] 開始兩階段分析，立場: ${position}`);

        if (valuableCitations.length === 0) {
            return {
                recommendations: [],
                summary: '未發現有價值的援引判例',
                aiAnalysisStatus: 'no_data'
            };
        }

        // 🎯 階段一：重要性篩選（快速評估）
        const topCitations = await selectTopCitationsForAnalysis(valuableCitations, position, caseDescription);

        if (topCitations.length === 0) {
            return {
                recommendations: [],
                summary: '經 AI 篩選後，未發現適合當前案件的援引判例',
                aiAnalysisStatus: 'filtered_out'
            };
        }

        console.log(`[generateCitationRecommendationsTwoStage] 階段一篩選出 ${topCitations.length} 個重要援引`);

        // 🎯 階段二：逐個深度分析
        const detailedRecommendations = [];
        for (const citation of topCitations) {
            const recommendation = await analyzeSingleCitation(citation, position, caseDescription, casePool);
            if (recommendation) {
                detailedRecommendations.push(recommendation);
            }
        }

        // 生成整體摘要
        const summary = generateOverallSummary(detailedRecommendations, position);

        return {
            recommendations: detailedRecommendations,
            summary,
            aiAnalysisStatus: 'success',
            analysisMethod: 'two_stage_detailed'
        };

    } catch (error) {
        console.error('[generateCitationRecommendationsTwoStage] 兩階段分析失敗:', error);
        return {
            recommendations: [],
            summary: 'AI 分析過程中發生錯誤',
            aiAnalysisStatus: 'error',
            error: error.message
        };
    }
}

/**
 * 🎯 階段一：AI 快速篩選最重要的援引判例
 */
async function selectTopCitationsForAnalysis(valuableCitations, position, caseDescription) {
    try {
        const positionLabel = position === 'plaintiff' ? '原告' : position === 'defendant' ? '被告' : '中性';

        // 準備簡化的援引數據（只包含基本信息）
        const simplifiedCitations = valuableCitations.slice(0, 15).map(citation => ({
            citation: citation.citation,
            usageCount: citation.usageCount,
            inCourtInsightCount: citation.inCourtInsightCount,
            valueScore: citation.valueAssessment.totalScore,
            grade: citation.valueAssessment.grade,
            rarityScore: citation.valueAssessment.rarityScore
        }));

        const prompt = `你是專業的法律分析師。請從以下援引判例中，快速篩選出最適合當前案件的 3-5 個判例進行深度分析。

案件描述：${caseDescription}
律師立場：${positionLabel}

可選援引判例：
${JSON.stringify(simplifiedCitations, null, 2)}

篩選標準：
1. 優先選擇在法院見解內被引用的判例（inCourtInsightCount > 0）
2. 考慮稀有度和價值分數的平衡
3. 選擇最可能與當前案件相關的判例
4. 最多選擇 5 個，最少選擇 3 個

請以 JSON 格式回應：
{
  "selectedCitations": [
    {
      "citation": "判例名稱",
      "selectionReason": "選擇理由（30字內）"
    }
  ],
  "totalSelected": 數量
}

請使用繁體中文回應，並確保回應是有效的 JSON 格式。`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "你是專業的法律分析師，專門協助律師篩選最相關的援引判例。" },
                { role: "user", content: prompt }
            ],
            temperature: 0.3,
            max_tokens: 1000
        });

        // 🔧 修復：處理 AI 可能返回的 markdown 格式
        let responseContent = response.choices[0].message.content.trim();

        // 移除可能的 markdown 代碼塊標記
        if (responseContent.startsWith('```json')) {
            responseContent = responseContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (responseContent.startsWith('```')) {
            responseContent = responseContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        const result = JSON.parse(responseContent);

        // 根據 AI 篩選結果，返回對應的完整援引數據
        const selectedCitations = [];
        for (const selected of result.selectedCitations) {
            const fullCitation = valuableCitations.find(c => c.citation === selected.citation);
            if (fullCitation) {
                selectedCitations.push(fullCitation);
            }
        }

        console.log(`[selectTopCitationsForAnalysis] AI 篩選出 ${selectedCitations.length} 個重要援引`);
        return selectedCitations;

    } catch (error) {
        console.error('[selectTopCitationsForAnalysis] 篩選失敗:', error);
        // 如果 AI 篩選失敗，回退到基於分數的篩選
        return valuableCitations.slice(0, 3);
    }
}

/**
 * 🎯 階段二：對單個援引判例進行深度分析
 */
async function analyzeSingleCitation(citation, position, caseDescription, casePool) {
    try {
        const positionLabel = position === 'plaintiff' ? '原告' : position === 'defendant' ? '被告' : '中性';

        // 為這個特定援引重新提取上下文
        const contextSamples = [];

        for (const case_ of casePool.allCases.slice(0, 10)) { // 限制檢查範圍
            if (!case_.source?.citations || !Array.isArray(case_.source.citations)) continue;

            if (case_.source.citations.includes(citation.citation)) {
                const context = extractCitationContext(
                    citation.citation,
                    case_.source?.JFULL || '',
                    case_.source?.CourtInsightsStart || '',
                    case_.source?.CourtInsightsEND || ''
                );

                if (context.found && context.context) {
                    contextSamples.push({
                        context: context.context.fullContext,
                        inCourtInsight: context.inCourtInsight,
                        fromCase: case_.title
                    });
                }
            }

            if (contextSamples.length >= 2) break; // 最多2個樣本
        }

        const prompt = `你是專業的法律分析師。請專注分析這一個援引判例，提供精確的推薦。

案件描述：${caseDescription}
律師立場：${positionLabel}

援引判例：${citation.citation}
使用次數：${citation.usageCount}
法院見解引用次數：${citation.inCourtInsightCount}
稀有度等級：${citation.valueAssessment.grade}

上下文樣本：
${JSON.stringify(contextSamples, null, 2)}

請仔細分析上下文，並以 JSON 格式回應：
{
  "citation": "${citation.citation}",
  "recommendationLevel": "強烈推薦|建議考慮|謹慎使用",
  "reason": "基於上下文的具體推薦理由，必須引用實際內容（50-100字）",
  "usageStrategy": "具體使用時機，僅基於上下文明確顯示的場景（30-50字）",
  "contextEvidence": "支持此推薦的關鍵上下文片段（直接引用）",
  "riskWarning": "注意事項或限制（如有）",
  "confidence": "高|中|低",
  "uncertaintyNote": "如果上下文不足，請明確說明"
}

重要原則：
1. 只基於提供的上下文進行分析，不要推測
2. 必須引用具體的上下文片段作為證據
3. 如果上下文不足以判斷適用場景，明確標記
4. 絕對不要編造或推測法律適用場景
5. 請使用繁體中文回應`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "你是專業的法律分析師，專門提供精確的援引判例分析。你必須嚴格基於提供的上下文，不能推測或編造。" },
                { role: "user", content: prompt }
            ],
            temperature: 0.1, // 降低溫度，提高一致性
            max_tokens: 800
        });

        // 🔧 修復：處理 AI 可能返回的 markdown 格式
        let responseContent = response.choices[0].message.content.trim();

        // 移除可能的 markdown 代碼塊標記
        if (responseContent.startsWith('```json')) {
            responseContent = responseContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (responseContent.startsWith('```')) {
            responseContent = responseContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        const result = JSON.parse(responseContent);
        console.log(`[analyzeSingleCitation] 完成單個分析: ${citation.citation}`);
        return result;

    } catch (error) {
        console.error(`[analyzeSingleCitation] 分析失敗 ${citation.citation}:`, error);
        return null;
    }
}

/**
 * 生成整體摘要
 */
function generateOverallSummary(recommendations, position) {
    const positionLabel = position === 'plaintiff' ? '原告' : position === 'defendant' ? '被告' : '中性';
    const strongCount = recommendations.filter(r => r.recommendationLevel === '強烈推薦').length;
    const considerCount = recommendations.filter(r => r.recommendationLevel === '建議考慮').length;
    const cautiousCount = recommendations.filter(r => r.recommendationLevel === '謹慎使用').length;

    return `為${positionLabel}立場分析了 ${recommendations.length} 個重要援引判例：${strongCount} 個強烈推薦，${considerCount} 個建議考慮，${cautiousCount} 個謹慎使用。建議優先使用強烈推薦的判例，並仔細評估上下文適用性。`;
}

/**
 * 使用 AI 生成援引判例推薦
 */
async function generateCitationRecommendations(valuableCitations, position, caseDescription, casePool) {
    try {
        console.log(`[generateCitationRecommendations] 開始 AI 分析，立場: ${position}`);

        if (valuableCitations.length === 0) {
            return {
                recommendations: [],
                summary: '未發現有價值的援引判例',
                aiAnalysisStatus: 'no_data'
            };
        }

        const prompt = createCitationRecommendationPrompt(valuableCitations, position, caseDescription, casePool);

        // 🆕 升級到 GPT-4o：提升分析品質，減少瞎掰風險
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: "你是專業的法律分析師，請使用繁體中文回應，並以 JSON 格式提供分析結果。特別注意：絕對不要編造或推測不確定的信息，寧可保守也不要瞎掰。"
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.1, // 保持低溫度確保一致性
            max_tokens: 2500, // 稍微增加 token 限制，因為 GPT-4o 分析更詳細
            response_format: { type: "json_object" }
        });

        if (!response?.choices?.[0]?.message?.content) {
            throw new Error('AI 分析回應為空');
        }

        // 🔧 修復：處理 AI 可能返回的 markdown 格式
        let responseContent = response.choices[0].message.content.trim();

        // 移除可能的 markdown 代碼塊標記
        if (responseContent.startsWith('```json')) {
            responseContent = responseContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (responseContent.startsWith('```')) {
            responseContent = responseContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        const aiResult = JSON.parse(responseContent);

        console.log(`[generateCitationRecommendations] AI 分析完成，推薦 ${aiResult.recommendations?.length || 0} 個判例`);

        // 🆕 增強推薦結果：添加統計數據
        const enhancedRecommendations = (aiResult.recommendations || []).map(rec => {
            const originalCitation = valuableCitations.find(vc => vc.citation === rec.citation);
            return {
                ...rec,
                // 🆕 添加統計數據用於前端顯示
                usageCount: originalCitation?.usageCount || 0,
                inCourtInsightCount: originalCitation?.inCourtInsightCount || 0,
                valueAssessment: originalCitation?.valueAssessment || null
            };
        });

        return {
            recommendations: enhancedRecommendations,
            summary: aiResult.summary || '分析完成',
            aiAnalysisStatus: 'success',
            analysisTimestamp: new Date().toISOString()
        };

    } catch (error) {
        console.error('[generateCitationRecommendations] AI 分析失敗:', error);

        // 降級處理：提供基於規則的推薦
        const fallbackRecommendations = valuableCitations.slice(0, 5).map(citation => ({
            citation: citation.citation,
            recommendationLevel: citation.valueAssessment.totalScore >= 70 ? '建議考慮' : '謹慎使用',
            reason: `基於統計分析：使用次數 ${citation.usageCount}，價值評分 ${citation.valueAssessment.totalScore}`,
            usageStrategy: citation.inCourtInsightCount > 0 ? '此判例曾被法院見解採納' : '建議作為輔助論證',
            riskWarning: citation.valueAssessment.totalScore < 50 ? '數據支持度較低，請謹慎使用' : null,
            confidence: '中',
            // 🆕 添加統計數據用於前端顯示
            usageCount: citation.usageCount,
            inCourtInsightCount: citation.inCourtInsightCount,
            valueAssessment: citation.valueAssessment
        }));

        return {
            recommendations: fallbackRecommendations,
            summary: 'AI 分析暫時不可用，提供基於統計的推薦',
            aiAnalysisStatus: 'fallback',
            error: error.message
        };
    }
}

/**
 * 啟動援引判例分析任務（入口函數）
 */
async function startCitationAnalysis(originalTaskId, userId) {
    if (!originalTaskId || !originalTaskId.trim()) {
        const error = new Error('原始分析任務ID為必填欄位');
        error.statusCode = 400;
        throw error;
    }

    const db = admin.firestore();

    // 1. 檢查原始任務是否存在且已完成
    const originalTaskRef = db.collection('aiAnalysisTasks').doc(originalTaskId);
    const originalTaskDoc = await originalTaskRef.get();

    if (!originalTaskDoc.exists) {
        const error = new Error('找不到指定的原始分析任務');
        error.statusCode = 404;
        throw error;
    }

    const originalTaskData = originalTaskDoc.data();

    if (originalTaskData.status !== 'complete') {
        const error = new Error('原始分析任務尚未完成，無法進行援引分析');
        error.statusCode = 400;
        throw error;
    }

    // 檢查案例池數據的路徑（可能在 result.casePool 或 result.casePrecedentData.casePool）
    const casePool = originalTaskData.result?.casePool || originalTaskData.result?.casePrecedentData?.casePool;

    if (!casePool) {
        console.log('[startCitationAnalysis] 原始任務結果結構:', JSON.stringify(originalTaskData.result, null, 2));
        const error = new Error('原始分析結果中缺少案例池數據');
        error.statusCode = 400;
        throw error;
    }

    // 2. 創建新的援引分析任務
    const taskRef = db.collection('aiAnalysisTasks').doc();
    const taskId = taskRef.id;

    const taskData = {
        userId,
        taskId,
        originalTaskId,
        analysisType: 'citation_analysis',
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await taskRef.set(taskData);
    console.log(`[citationAnalysisService] 援引分析任務 ${taskId} 已創建`);

    // 3. 非同步執行分析
    executeCitationAnalysisInBackground(taskId, originalTaskData, userId);

    return { taskId };
}

/**
 * 背景執行援引分析
 */
async function executeCitationAnalysisInBackground(taskId, originalTaskData, userId) {
    const db = admin.firestore();
    const taskRef = db.collection('aiAnalysisTasks').doc(taskId);

    try {
        console.log(`[executeCitationAnalysisInBackground] 開始執行援引分析任務: ${taskId}`);

        // 更新狀態為處理中
        await taskRef.update({
            status: 'processing',
            processingStartedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // 獲取案例池數據（檢查兩個可能的路徑）
        const casePool = originalTaskData.result?.casePool || originalTaskData.result?.casePrecedentData?.casePool;

        if (!casePool) {
            throw new Error('無法找到案例池數據');
        }

        // 🆕 獲取原始分析的 positionStats 數據
        const originalPositionStats = originalTaskData.result?.casePrecedentData?.positionBasedAnalysis?.positionStats;

        // 執行援引分析
        const analysisResult = await analyzeCitationsFromCasePool(
            casePool,
            originalTaskData.analysisData.position || 'neutral',
            originalTaskData.analysisData.caseDescription,
            originalPositionStats // 🆕 傳遞原始的 positionStats
        );

        // 保存結果
        await taskRef.update({
            status: 'complete',
            result: analysisResult,
            completedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`[executeCitationAnalysisInBackground] 援引分析任務 ${taskId} 完成`);

    } catch (error) {
        console.error(`[executeCitationAnalysisInBackground] 援引分析任務 ${taskId} 失敗:`, error);

        await taskRef.update({
            status: 'failed',
            error: error.message,
            failedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }
}

export {
    extractCitationContext,
    extractCitationsFromCases,
    calculateCitationValue,
    enrichCitationsWithValue,
    analyzeCitationsFromCasePool,
    generateCitationRecommendations,
    startCitationAnalysis
};
