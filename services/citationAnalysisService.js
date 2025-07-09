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
 * 🔍 援引分析關鍵日誌系統 (簡化版)
 */
const CitationDebugLogger = {
    // 只記錄關鍵錯誤和成功信息
    logCritical: (stage, message, data = {}) => {
        console.log(`[Citation:${stage}] ${message}`, data);
    },

    // 只在匹配失敗時記錄詳細信息
    logMatchFailure: (citation, caseTitle, reason) => {
        console.log(`[Citation:MatchFail] "${citation}" in "${caseTitle}" - ${reason}`);
    },

    // 只記錄成功的匹配
    logMatchSuccess: (citation, caseTitle, strategy = 'exact') => {
        console.log(`[Citation:MatchOK] "${citation}" in "${caseTitle}" (${strategy})`);
    }
};

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
 * 🔧 生成判例名稱的數字格式變體
 * 處理阿拉伯數字 vs 中文數字的差異，以及後綴變體
 */
function generateNumberVariants(citationText) {
    const variants = [citationText];

    // 🆕 處理後綴變體 (如 "(一)", "㈠", "(1)" 等)
    const suffixPatterns = [
        /\(一\)$/g, /\(二\)$/g, /\(三\)$/g, /\(四\)$/g, /\(五\)$/g,
        /㈠$/g, /㈡$/g, /㈢$/g, /㈣$/g, /㈤$/g,
        /\(1\)$/g, /\(2\)$/g, /\(3\)$/g, /\(4\)$/g, /\(5\)$/g,
        /第1項$/g, /第2項$/g, /第3項$/g,
        // 🆕 司法院釋字常見後綴
        /解釋參照$/g, /解釋$/g, /參照$/g, /意旨$/g, /見解$/g,
        // 🆕 判決常見後綴
        /判決$/g, /判例$/g, /裁定$/g, /決議$/g, /函釋$/g
    ];

    // 生成移除後綴的版本
    for (const pattern of suffixPatterns) {
        const withoutSuffix = citationText.replace(pattern, '');
        if (withoutSuffix !== citationText && withoutSuffix.length > 10) {
            variants.push(withoutSuffix);
        }
    }

    // 🆕 生成添加後綴的版本（用於反向匹配）
    const commonSuffixes = ['解釋參照', '解釋', '參照', '意旨', '見解', '判決', '判例', '裁定', '決議'];
    for (const suffix of commonSuffixes) {
        if (!citationText.endsWith(suffix)) {
            variants.push(citationText + suffix);
        }
    }

    // 🆕 生成括號包圍的版本
    const bracketVariants = [];
    for (const variant of variants) {
        bracketVariants.push(`(${variant})`);
        bracketVariants.push(`（${variant}）`);
        bracketVariants.push(`「${variant}」`);
        bracketVariants.push(`【${variant}】`);
    }
    variants.push(...bracketVariants);



    // 阿拉伯數字 -> 中文數字映射
    const arabicToChinese = {
        '0': '○', '1': '一', '2': '二', '3': '三', '4': '四',
        '5': '五', '6': '六', '7': '七', '8': '八', '9': '九'
    };

    // 中文數字 -> 阿拉伯數字映射
    const chineseToArabic = {
        '○': '0', '一': '1', '二': '2', '三': '3', '四': '4',
        '五': '5', '六': '6', '七': '7', '八': '8', '九': '9'
    };

    // 對所有現有變體生成數字格式變體
    const currentVariants = [...variants];
    for (const variant of currentVariants) {
        // 生成阿拉伯數字版本
        let arabicVersion = variant;
        for (const [chinese, arabic] of Object.entries(chineseToArabic)) {
            arabicVersion = arabicVersion.replace(new RegExp(chinese, 'g'), arabic);
        }
        if (arabicVersion !== variant) {
            variants.push(arabicVersion);
        }

        // 生成中文數字版本
        let chineseVersion = variant;
        for (const [arabic, chinese] of Object.entries(arabicToChinese)) {
            chineseVersion = chineseVersion.replace(new RegExp(arabic, 'g'), chinese);
        }
        if (chineseVersion !== variant) {
            variants.push(chineseVersion);
        }
    }

    // 生成空格變體
    const spacedVariants = variants.map(v => v.replace(/([年度台上字第號])/g, ' $1 ').replace(/\s+/g, ' ').trim());
    variants.push(...spacedVariants);

    return [...new Set(variants)]; // 去重
}

/**
 * 🆕 階段一：GPT-4o-mini 快速初篩
 * 任務：寬鬆篩選，寧可錯殺不可放過，為 4o 減輕負擔
 */
async function miniQuickScreening(valuableCitations, position, caseDescription) {
    try {
        console.log(`[miniQuickScreening] 🚀 Mini 開始快速初篩 ${valuableCitations.length} 個援引`);

        const positionLabel = position === 'plaintiff' ? '原告' : position === 'defendant' ? '被告' : '中性';

        // 準備援引數據（包含上下文摘要）
        const citationsWithContext = valuableCitations.slice(0, 20).map(citation => {
            // 🔧 修復：安全地提取上下文摘要
            const contextSummary = citation.totalContexts && citation.totalContexts.length > 0
                ? citation.totalContexts.slice(0, 2).map(ctx => {
                    // context 是一個對象，包含 fullContext 屬性
                    const contextText = ctx.context?.fullContext || ctx.context?.before || '無上下文';
                    const displayText = typeof contextText === 'string'
                        ? contextText.substring(0, 100)
                        : '無上下文';

                    return `案例：${ctx.caseTitle || '未知'}，上下文：${displayText}...`;
                  }).join('\n')
                : '無可用上下文';

            return {
                citation: citation.citation,
                usageCount: citation.usageCount,
                inCourtInsightCount: citation.inCourtInsightCount,
                valueScore: citation.valueAssessment?.totalScore || 0,
                contextSummary: contextSummary
            };
        });

        const prompt = `你是法律助理，負責快速初篩援引判例。採用寬鬆標準，寧可多選不要漏掉重要的。

案件描述：${caseDescription}
分析立場：${positionLabel}

援引判例列表：
${citationsWithContext.map((c, i) => `${i+1}. ${c.citation}
   - 使用次數：${c.usageCount}
   - 法院見解內使用：${c.inCourtInsightCount}次
   - 價值分數：${c.valueScore}
   - 使用上下文：${c.contextSummary}
`).join('\n')}

請快速評估每個援引是否可能與案件相關，標準要寬鬆：
1. 可能相關就選擇（不確定也選）
2. 明顯無關才排除
3. 最多選擇15個，最少選擇5個

請以 JSON 格式回應：
{
  "selectedCitations": [
    {
      "citation": "援引名稱",
      "relevanceScore": 1-5,
      "quickReason": "可能相關的簡短原因"
    }
  ],
  "totalSelected": 數量,
  "screeningNote": "初篩說明"
}`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini", // 🆕 使用 Mini 模型
            messages: [
                { role: "system", content: "你是法律助理，負責快速初篩。採用寬鬆標準，寧可多選不要漏掉。" },
                { role: "user", content: prompt }
            ],
            temperature: 0.7, // 稍高溫度，允許更多可能性
            max_tokens: 1500,
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(response.choices[0].message.content);

        // 根據 Mini 篩選結果，返回對應的完整援引數據
        const selectedCitations = [];
        for (const selected of result.selectedCitations || []) {
            const fullCitation = valuableCitations.find(c => c.citation === selected.citation);
            if (fullCitation) {
                // 🆕 添加 Mini 的評估結果
                fullCitation.miniScreening = {
                    relevanceScore: selected.relevanceScore,
                    quickReason: selected.quickReason
                };
                selectedCitations.push(fullCitation);
            }
        }

        console.log(`[miniQuickScreening] ✅ Mini 篩選完成：${selectedCitations.length}/${valuableCitations.length} 個援引通過初篩`);
        return selectedCitations;

    } catch (error) {
        console.error('[miniQuickScreening] Mini 初篩失敗:', error);
        // 🔧 修復：如果 Mini 失敗，返回前10個並添加默認的 miniScreening
        console.log('[miniQuickScreening] 降級到基於分數的篩選');
        const fallbackCitations = valuableCitations.slice(0, 10);

        // 為降級的援引添加默認的 miniScreening 屬性
        fallbackCitations.forEach(citation => {
            citation.miniScreening = {
                relevanceScore: 3, // 默認中等相關性
                quickReason: 'Mini 初篩失敗，基於分數篩選'
            };
        });

        return fallbackCitations;
    }
}

/**
 * 🆕 批量提取所有援引的上下文
 * 這是新流程的核心改進：在統計階段就獲取完整上下文
 */
async function batchExtractContexts(citationMap, allCaseData) {
    console.log(`[batchExtractContexts] 🚀 開始批量提取 ${citationMap.size} 個援引的上下文`);

    let processedCitations = 0;
    let totalContextsFound = 0;

    // 對每個援引進行上下文提取
    for (const [citation, citationRecord] of citationMap) {
        processedCitations++;
        console.log(`[batchExtractContexts] 📝 處理援引 ${processedCitations}/${citationMap.size}: ${citation}`);

        // 在所有相關案例中尋找此援引的上下文
        for (const caseData of allCaseData) {
            // 檢查此案例是否包含此援引
            if (!caseData.citations.includes(citation)) {
                continue;
            }

            // 從 ES 獲取完整的 JFULL 數據
            try {
                const fullData = await getJudgmentNodeData(caseData.id);
                if (!fullData || !fullData.JFULL) {
                    console.warn(`[batchExtractContexts] ⚠️ 無法獲取案例 ${caseData.id} 的 JFULL 數據`);
                    continue;
                }

                // 提取上下文
                const context = extractCitationContext(
                    citation,
                    fullData.JFULL,
                    fullData.CourtInsightsStart || '',
                    fullData.CourtInsightsEND || ''
                );

                if (context.found) {
                    totalContextsFound++;

                    // 🆕 保存完整的上下文資訊
                    citationRecord.totalContexts.push({
                        caseId: caseData.id,
                        caseTitle: caseData.title,
                        context: context.context,
                        inCourtInsight: context.inCourtInsight,
                        position: context.position
                    });

                    // 更新對應的 occurrence 記錄
                    const occurrence = citationRecord.occurrences.find(occ => occ.caseId === caseData.id);
                    if (occurrence) {
                        occurrence.found = true;
                        occurrence.inCourtInsight = context.inCourtInsight;

                        if (context.inCourtInsight) {
                            citationRecord.inCourtInsightCount++;
                        }
                    }
                }

            } catch (error) {
                console.error(`[batchExtractContexts] ❌ 提取案例 ${caseData.id} 上下文失敗:`, error.message);
            }
        }
    }

    console.log(`[batchExtractContexts] ✅ 批量提取完成:`);
    console.log(`- 處理援引數: ${processedCitations}`);
    console.log(`- 找到上下文: ${totalContextsFound}`);
}

/**
 * 🆕 階段二：GPT-4o 嚴格驗證機制
 * 任務：擁有完全否決權，嚴格把關，確保推薦品質
 */
async function strictVerificationWith4o(miniFilteredCitations, position, caseDescription) {
    try {
        console.log(`[strictVerificationWith4o] 🛡️ 4o 開始嚴格驗證 ${miniFilteredCitations.length} 個援引`);

        const positionLabel = position === 'plaintiff' ? '原告' : position === 'defendant' ? '被告' : '中性';

        // 🔧 修復：準備詳細的援引數據（包含完整上下文）
        const detailedCitations = miniFilteredCitations.map(citation => {
            const contexts = citation.totalContexts || [];
            const contextDetails = contexts.slice(0, 3).map(ctx => {
                // context 是一個對象，包含 fullContext 屬性
                const contextText = ctx.context?.fullContext || ctx.context?.before || '無上下文';
                const displayText = typeof contextText === 'string'
                    ? contextText
                    : '無上下文';

                return `【案例：${ctx.caseTitle || '未知'}】\n${displayText}\n法院見解內：${ctx.inCourtInsight ? '是' : '否'}`;
            }).join('\n\n');

            return {
                citation: citation.citation,
                usageCount: citation.usageCount,
                inCourtInsightCount: citation.inCourtInsightCount,
                valueScore: citation.valueAssessment?.totalScore || 0,
                miniReason: citation.miniScreening?.quickReason || '無',
                contextDetails: contextDetails || '無可用上下文'
            };
        });

        const prompt = `你是資深法律專家，擁有完全的否決權。請嚴格評估每個援引判例的實際參考價值。

重要原則：
1. 如果援引與案件主題完全無關，直接給 0 分
2. 如果上下文顯示援引處理的是不同類型問題，給 1-3 分
3. 只有真正相關且有實質幫助的援引才給高分
4. 寧可嚴格也不要推薦無關的援引

案件描述：${caseDescription}
分析立場：${positionLabel}

待驗證援引：
${detailedCitations.map((c, i) => `${i+1}. ${c.citation}
   Mini 初篩理由：${c.miniReason}
   使用統計：${c.usageCount}次使用，${c.inCourtInsightCount}次在法院見解內
   價值分數：${c.valueScore}

   實際使用上下文：
   ${c.contextDetails}

   ---`).join('\n')}

請對每個援引進行嚴格評分（0-10分）：
- 9-10分：極高價值，強烈推薦
- 7-8分：有價值，值得參考
- 4-6分：一般參考價值
- 1-3分：低價值，前端可忽略
- 0分：完全無關，建議隱藏

請以 JSON 格式回應：
{
  "verifiedCitations": [
    {
      "citation": "援引名稱",
      "finalScore": 0-10,
      "verificationReason": "嚴格評估的詳細理由",
      "shouldDisplay": true/false,
      "riskWarning": "如果有風險的警告"
    }
  ],
  "verificationSummary": "整體驗證說明",
  "rejectedCount": 被否決的數量
}`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o", // 🆕 使用 4o 進行嚴格驗證
            messages: [
                { role: "system", content: "你是資深法律專家，擁有完全否決權。請嚴格把關，確保推薦品質。寧可嚴格也不要推薦無關援引。" },
                { role: "user", content: prompt }
            ],
            temperature: 0.1, // 低溫度，確保一致性
            max_tokens: 2000,
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(response.choices[0].message.content);

        // 根據 4o 驗證結果，過濾援引
        const verifiedCitations = [];
        for (const verified of result.verifiedCitations || []) {
            if (verified.finalScore >= 4) { // 只保留 4 分以上的援引
                const fullCitation = miniFilteredCitations.find(c => c.citation === verified.citation);
                if (fullCitation) {
                    // 🆕 添加 4o 的嚴格驗證結果
                    fullCitation.strictVerification = {
                        finalScore: verified.finalScore,
                        verificationReason: verified.verificationReason,
                        shouldDisplay: verified.shouldDisplay,
                        riskWarning: verified.riskWarning
                    };
                    verifiedCitations.push(fullCitation);
                }
            }
        }

        console.log(`[strictVerificationWith4o] ✅ 4o 驗證完成：${verifiedCitations.length}/${miniFilteredCitations.length} 個援引通過嚴格驗證`);
        console.log(`[strictVerificationWith4o] 被否決：${result.rejectedCount || 0} 個援引`);

        return verifiedCitations;

    } catch (error) {
        console.error('[strictVerificationWith4o] 4o 嚴格驗證失敗:', error);
        // 🔧 修復：如果 4o 失敗，返回前5個並添加默認的 strictVerification
        console.log('[strictVerificationWith4o] 降級到基於分數的篩選');
        const fallbackCitations = miniFilteredCitations.slice(0, 5);

        // 為降級的援引添加默認的 strictVerification 屬性
        fallbackCitations.forEach(citation => {
            citation.strictVerification = {
                finalScore: 5, // 默認中等分數
                verificationReason: '4o 驗證失敗，基於分數篩選',
                shouldDisplay: true,
                riskWarning: '未經嚴格驗證，請謹慎使用'
            };
        });

        return fallbackCitations;
    }
}

/**
 * 🆕 階段三：深度分析通過驗證的援引
 * 任務：對高品質援引進行詳細分析，提供具體建議
 */
async function deepAnalysisVerifiedCitations(verifiedCitations, position, caseDescription, casePool) {
    try {
        console.log(`[deepAnalysisVerifiedCitations] 🔍 開始深度分析 ${verifiedCitations.length} 個通過驗證的援引`);

        const recommendations = [];

        // 對每個通過驗證的援引進行深度分析
        for (const citation of verifiedCitations) {
            try {
                const analysis = await analyzeSingleVerifiedCitation(citation, position, caseDescription);
                if (analysis) {
                    // 🆕 整合三階段的分析結果（確保沒有 undefined 值）
                    const enhancedRecommendation = {
                        // 🔧 確保 analysis 的所有屬性都有默認值
                        citation: analysis.citation || citation.citation,
                        recommendationLevel: analysis.recommendationLevel || '謹慎使用',
                        reason: analysis.reason || '分析結果不完整',
                        usageStrategy: analysis.usageStrategy || '請謹慎評估使用',
                        contextEvidence: analysis.contextEvidence || '無可用證據',
                        riskWarning: analysis.riskWarning || null,
                        confidence: analysis.confidence || '低',
                        // Mini 初篩結果（提供默認值）
                        miniScreening: citation.miniScreening || {
                            relevanceScore: 0,
                            quickReason: '未經 Mini 初篩'
                        },
                        // 4o 嚴格驗證結果（提供默認值）
                        strictVerification: citation.strictVerification || {
                            finalScore: 0,
                            verificationReason: '未經嚴格驗證',
                            shouldDisplay: false,
                            riskWarning: null
                        },
                        // 統計數據（提供默認值）
                        usageCount: citation.usageCount || 0,
                        inCourtInsightCount: citation.inCourtInsightCount || 0,
                        valueAssessment: citation.valueAssessment || {
                            grade: 'C',
                            totalScore: 0
                        },
                        // 🆕 最終信心度（基於三階段結果）
                        finalConfidence: calculateFinalConfidence(citation)
                    };

                    recommendations.push(enhancedRecommendation);
                }
            } catch (error) {
                console.error(`[deepAnalysisVerifiedCitations] 分析援引失敗: ${citation.citation}`, error);
            }
        }

        // 根據最終分數排序
        recommendations.sort((a, b) => (b.strictVerification?.finalScore || 0) - (a.strictVerification?.finalScore || 0));

        console.log(`[deepAnalysisVerifiedCitations] ✅ 深度分析完成：${recommendations.length} 個最終推薦`);
        return recommendations;

    } catch (error) {
        console.error('[deepAnalysisVerifiedCitations] 深度分析失敗:', error);
        return [];
    }
}

/**
 * 🆕 分析單個通過驗證的援引
 */
async function analyzeSingleVerifiedCitation(citation, position, caseDescription) {
    try {
        const positionLabel = position === 'plaintiff' ? '原告' : position === 'defendant' ? '被告' : '中性';

        // 🔧 修復：準備最佳的上下文樣本
        const bestContexts = citation.totalContexts?.slice(0, 2) || [];
        const contextEvidence = bestContexts.map(ctx => {
            // context 是一個對象，包含 fullContext 屬性
            const contextText = ctx.context?.fullContext || ctx.context?.before || '無上下文';
            const displayText = typeof contextText === 'string'
                ? contextText
                : '無上下文';

            return `【${ctx.caseTitle || '未知'}】\n${displayText}\n(法院見解內：${ctx.inCourtInsight ? '是' : '否'})`;
        }).join('\n\n') || '無可用上下文';

        const prompt = `你是資深法律顧問，請對這個已通過嚴格驗證的援引判例提供具體的使用建議。

案件描述：${caseDescription}
分析立場：${positionLabel}

援引判例：${citation.citation}
4o 驗證分數：${citation.strictVerification?.finalScore || 0}/10
驗證理由：${citation.strictVerification?.verificationReason || '無'}

實際使用上下文：
${contextEvidence}

請提供具體的使用建議，並以 JSON 格式回應：

{
  "citation": "${citation.citation}",
  "recommendationLevel": "強烈推薦/建議考慮/謹慎使用",
  "reason": "基於上下文的具體推薦理由",
  "usageStrategy": "具體的使用策略和建議",
  "contextEvidence": "支持此推薦的上下文證據摘要",
  "riskWarning": "如果有的話，使用風險警告",
  "confidence": "高/中/低"
}`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "你是資深法律顧問，請基於實際上下文提供具體建議。" },
                { role: "user", content: prompt }
            ],
            temperature: 0.1,
            max_tokens: 800,
            response_format: { type: "json_object" }
        });

        return JSON.parse(response.choices[0].message.content);

    } catch (error) {
        console.error(`[analyzeSingleVerifiedCitation] 分析失敗: ${citation.citation}`, error);
        return null;
    }
}

/**
 * 🆕 計算最終信心度（基於三階段結果）
 */
function calculateFinalConfidence(citation) {
    const miniScore = citation.miniScreening?.relevanceScore || 0;
    const strictScore = citation.strictVerification?.finalScore || 0;
    const usageCount = citation.usageCount || 0;
    const inCourtCount = citation.inCourtInsightCount || 0;

    // 綜合評分
    let confidence = 0;

    // Mini 篩選貢獻 (20%)
    confidence += (miniScore / 5) * 20;

    // 4o 嚴格驗證貢獻 (50%)
    confidence += (strictScore / 10) * 50;

    // 使用統計貢獻 (20%)
    confidence += Math.min(usageCount / 5, 1) * 20;

    // 法院見解貢獻 (10%)
    confidence += Math.min(inCourtCount / 3, 1) * 10;

    if (confidence >= 80) return '極高';
    if (confidence >= 65) return '高';
    if (confidence >= 45) return '中';
    return '低';
}

/**
 * 🔧 構建上下文結果對象
 */
function buildContextResult(originalCitation, cleanJfull, matchedText, matchIndex, CourtInsightsStart, CourtInsightsEND) {
    // 判斷是否在法院見解內
    let inCourtInsight = false;
    if (CourtInsightsStart && CourtInsightsEND) {
        const cleanStartTag = getCleanText(CourtInsightsStart);
        const cleanEndTag = getCleanText(CourtInsightsEND);

        const startIndex = cleanJfull.indexOf(cleanStartTag);
        const endIndex = cleanJfull.indexOf(cleanEndTag, startIndex);

        if (startIndex !== -1 && endIndex !== -1) {
            inCourtInsight = matchIndex >= startIndex && matchIndex < endIndex;
        }
    }

    // 提取前後文（前後各300字）
    const contextLength = 300;
    const contextStart = Math.max(0, matchIndex - contextLength);
    const contextEnd = Math.min(cleanJfull.length, matchIndex + matchedText.length + contextLength);

    const beforeContext = cleanJfull.substring(contextStart, matchIndex);
    const afterContext = cleanJfull.substring(matchIndex + matchedText.length, contextEnd);

    return {
        citation: originalCitation,
        found: true,
        inCourtInsight,
        context: {
            before: beforeContext,
            citation: matchedText,
            after: afterContext,
            fullContext: cleanJfull.substring(contextStart, contextEnd)
        },
        position: matchIndex,
        matchStrategy: 'variant_matching'
    };
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

        // 🔍 調試：檢查是否包含幽靈援引
        if (response._source.citations && Array.isArray(response._source.citations)) {
            const suspiciousCitations = response._source.citations.filter(citation =>
                citation && citation.includes('司法院釋字第548號')
            );
            if (suspiciousCitations.length > 0) {
                console.error(`🚨 [GHOST_CITATION_DETECTED] 案例 ${caseId} 包含幽靈援引:`, suspiciousCitations);
                console.error(`🚨 [GHOST_CITATION_DETECTED] 案例標題: ${response._source.JTITLE}`);
                console.error(`🚨 [GHOST_CITATION_DETECTED] 所有援引:`, response._source.citations);
            }
        }

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
            position: -1,
            error: 'Missing required parameters'
        };
    }

    try {
        // 使用與爭點變色相同的清理邏輯
        const cleanJfull = getCleanText(JFULL);
        const cleanCitation = getCleanText(citation);

        // 找到援引判例在文本中的位置
        const citationIndex = cleanJfull.indexOf(cleanCitation);

        if (citationIndex === -1) {
            // 策略2：數字格式變換匹配
            const numberVariants = generateNumberVariants(cleanCitation);

            for (const variant of numberVariants) {
                const variantIndex = cleanJfull.indexOf(variant);
                if (variantIndex !== -1) {
                    CitationDebugLogger.logMatchSuccess(citation, 'JFULL', 'variant');
                    return buildContextResult(citation, cleanJfull, variant, variantIndex, CourtInsightsStart, CourtInsightsEND);
                }
            }



            // 所有策略都失敗
            CitationDebugLogger.logMatchFailure(citation, 'JFULL', 'no_text_match');
            return {
                citation,
                found: false,
                inCourtInsight: false,
                context: null,
                position: -1,
                error: 'No matching strategy succeeded'
            };
        }

        // ✅ 精確匹配成功
        CitationDebugLogger.logMatchSuccess(citation, 'JFULL', 'exact');
        return buildContextResult(citation, cleanJfull, cleanCitation, citationIndex, CourtInsightsStart, CourtInsightsEND);

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
 * 🆕 從案例池中提取所有援引判例並進行統計分析（改良版）
 * 新增功能：批量提取上下文，為後續 AI 分析提供完整資訊
 */
async function extractCitationsFromCases(cases) {
    console.log(`[extractCitationsFromCases] 🚀 開始改良版援引分析 - ${cases.length} 個案例`);

    const citationMap = new Map();
    let totalCitationsFound = 0;
    let casesWithCitations = 0;

    // 🆕 第一階段：收集所有援引並統計
    console.log(`[extractCitationsFromCases] 📊 第一階段：收集援引統計`);
    const allCaseData = []; // 暫存案例數據，用於後續上下文提取

    // 第一階段：快速收集所有援引統計
    for (let caseIndex = 0; caseIndex < cases.length; caseIndex++) {
        const case_ = cases[caseIndex];

        // 檢查案例是否有 citations 數據
        let citations = case_.source?.citations || [];

        // 如果案例池中沒有 citations，從 ES 獲取
        if (citations.length === 0) {
            try {
                const fullData = await getJudgmentNodeData(case_.id);
                if (fullData) {
                    citations = fullData.citations || [];
                } else {
                    CitationDebugLogger.logCritical('DataFetch', `ES返回空數據: ${case_.id}`);
                }
            } catch (error) {
                CitationDebugLogger.logCritical('DataFetch', `ES獲取失敗: ${case_.id}`, { error: error.message });
                continue; // 跳過這個案例
            }
        }

        if (citations.length === 0) {
            continue; // 跳過沒有援引的案例
        }

        casesWithCitations++;
        console.log(`[extractCitationsFromCases] 📋 案例 ${caseIndex + 1}: ${case_.title} - 發現 ${citations.length} 個援引`);

        // 🆕 暫存案例基本資訊，用於後續上下文提取
        allCaseData.push({
            id: case_.id,
            title: case_.title,
            court: case_.court,
            year: case_.year,
            verdictType: case_.verdictType,
            similarity: case_.similarity,
            citations: citations
        });

        // 統計每個援引的使用次數
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
                    totalContexts: [] // 🆕 將在第二階段填充
                });
            }

            const citationRecord = citationMap.get(citation);

            // 🆕 暫時記錄使用情況（不提取上下文）
            citationRecord.occurrences.push({
                caseId: case_.id,
                caseTitle: case_.title,
                court: case_.court,
                year: case_.year,
                verdictType: case_.verdictType,
                similarity: case_.similarity,
                found: false, // 將在第二階段確定
                inCourtInsight: false // 將在第二階段確定
            });

            citationRecord.usageCount++;
            citationRecord.casesUsed.add(case_.id);
        }
    }

    console.log(`[extractCitationsFromCases] 📊 第一階段完成 - 發現 ${citationMap.size} 個獨特援引`);

    // 🆕 第二階段：批量提取上下文
    console.log(`[extractCitationsFromCases] 🔍 第二階段：批量提取上下文`);
    await batchExtractContexts(citationMap, allCaseData);

    const citationStats = Array.from(citationMap.values());

    // 🔍 調試：檢查是否包含幽靈援引
    const ghostCitations = citationStats.filter(stat =>
        stat.citation && stat.citation.includes('司法院釋字第548號')
    );
    if (ghostCitations.length > 0) {
        console.error(`🚨 [GHOST_CITATION_FOUND] 在統計結果中發現幽靈援引:`, ghostCitations);
        console.error(`🚨 [GHOST_CITATION_FOUND] 幽靈援引詳情:`, ghostCitations[0]);
    }

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
async function analyzeCitationsFromCasePool(casePool, position, caseDescription, originalPositionStats = null, taskRef = null) {
    try {
        console.log(`[analyzeCitationsFromCasePool] 開始分析援引判例，立場: ${position}`);

        if (!casePool?.allCases || casePool.allCases.length === 0) {
            throw new Error('案例池為空或無效');
        }

        // 🆕 階段 1：提取援引判例
        if (taskRef) {
            await updateTaskProgress(taskRef, 1, 20, {
                totalCitations: 0,
                processed: 0,
                qualified: 0,
                verified: 0
            }, "正在從案例池中提取援引判例...", 140);
        }

        // 1. 提取所有援引判例（異步獲取完整數據）
        const citationStats = await extractCitationsFromCases(casePool.allCases);

        // 🆕 更新進度：援引判例提取完成
        if (taskRef) {
            await updateTaskProgress(taskRef, 1, 30, {
                totalCitations: citationStats.length,
                processed: citationStats.length,
                qualified: 0,
                verified: 0
            }, `發現 ${citationStats.length} 個援引判例，正在計算價值評估...`, 130);
        }

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

        // 🆕 更新進度：價值評估完成
        if (taskRef) {
            await updateTaskProgress(taskRef, 1, 40, {
                totalCitations: citationStats.length,
                processed: citationStats.length,
                qualified: valuableCitations.length,
                verified: 0
            }, `篩選出 ${valuableCitations.length} 個高價值援引，開始上下文分析...`, 120);
        }

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

        // 🆕 階段 2：開始 AI 分析
        if (taskRef) {
            await updateTaskProgress(taskRef, 2, 50, {
                totalCitations: citationStats.length,
                processed: citationStats.length,
                qualified: valuableCitations.length,
                verified: 0
            }, "開始三階段 AI 智能分析...", 110);
        }

        // 4. 🆕 三階段 AI 分析：Mini初篩 → 4o嚴格驗證 → 深度分析
        const aiRecommendations = await generateCitationRecommendationsThreeStage(
            valuableCitations,
            position,
            caseDescription,
            casePool,
            taskRef // 🆕 傳遞 taskRef 用於進度更新
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

        // 🆕 階段 5：整合最終結果
        if (taskRef) {
            await updateTaskProgress(taskRef, 5, 98, {
                totalCitations: citationStats.length,
                processed: citationStats.length,
                qualified: valuableCitations.length,
                verified: aiRecommendations.recommendations?.length || 0
            }, "正在整合分析結果...", 5);
        }

        const finalResult = {
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

        // 🆕 最終完成進度
        if (taskRef) {
            await updateTaskProgress(taskRef, 5, 100, {
                totalCitations: citationStats.length,
                processed: citationStats.length,
                qualified: valuableCitations.length,
                verified: aiRecommendations.recommendations?.length || 0
            }, "援引分析完成！", 0);
        }

        return finalResult;

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
 * 🆕 三階段 AI 分析：Mini初篩 → 4o嚴格驗證 → 深度分析
 * 新流程：確保數據可靠性，律師願意付費的關鍵
 */
async function generateCitationRecommendationsThreeStage(valuableCitations, position, caseDescription, casePool, taskRef = null) {
    try {
        console.log(`[generateCitationRecommendationsThreeStage] 🚀 開始三階段分析，立場: ${position}`);

        if (valuableCitations.length === 0) {
            return {
                recommendations: [],
                summary: '未發現有價值的援引判例',
                aiAnalysisStatus: 'no_data'
            };
        }

        // 🆕 階段 2：Mini 快速初篩
        if (taskRef) {
            await updateTaskProgress(taskRef, 2, 55, {
                totalCitations: valuableCitations.length,
                processed: valuableCitations.length,
                qualified: valuableCitations.length,
                verified: 0
            }, "Mini AI 正在快速評估援引相關性...", 105);
        }

        // 🎯 階段一：GPT-4o-mini 快速初篩（寬鬆標準）
        console.log(`[generateCitationRecommendationsThreeStage] 📋 階段一：Mini 快速初篩`);
        const miniFilteredCitations = await miniQuickScreening(valuableCitations, position, caseDescription);

        // 🆕 更新進度：Mini 初篩完成
        if (taskRef) {
            await updateTaskProgress(taskRef, 2, 65, {
                totalCitations: valuableCitations.length,
                processed: valuableCitations.length,
                qualified: miniFilteredCitations.length,
                verified: 0
            }, `Mini 初篩完成，${miniFilteredCitations.length} 個援引進入專家驗證...`, 95);
        }

        if (miniFilteredCitations.length === 0) {
            return {
                recommendations: [],
                summary: '經 Mini 初篩後，未發現相關的援引判例',
                aiAnalysisStatus: 'mini_filtered_out'
            };
        }

        // 🆕 階段 3：專家級品質驗證
        if (taskRef) {
            await updateTaskProgress(taskRef, 3, 70, {
                totalCitations: valuableCitations.length,
                processed: valuableCitations.length,
                qualified: miniFilteredCitations.length,
                verified: 0
            }, "專家級 AI 正在嚴格驗證推薦品質...", 85);
        }

        // 🎯 階段二：GPT-4o 嚴格驗證（否決權）
        console.log(`[generateCitationRecommendationsThreeStage] 🛡️ 階段二：4o 嚴格驗證`);
        const strictVerifiedCitations = await strictVerificationWith4o(miniFilteredCitations, position, caseDescription);

        // 🆕 更新進度：專家驗證完成
        if (taskRef) {
            await updateTaskProgress(taskRef, 3, 80, {
                totalCitations: valuableCitations.length,
                processed: valuableCitations.length,
                qualified: miniFilteredCitations.length,
                verified: strictVerifiedCitations.length
            }, `專家驗證完成，${strictVerifiedCitations.length} 個援引通過驗證，開始深度分析...`, 75);
        }

        if (strictVerifiedCitations.length === 0) {
            return {
                recommendations: [],
                summary: '經 GPT-4o 嚴格驗證後，所有援引判例均被認定為不相關或無參考價值',
                aiAnalysisStatus: 'strict_filtered_out'
            };
        }

        // 🆕 階段 4：個案化建議生成
        if (taskRef) {
            await updateTaskProgress(taskRef, 4, 85, {
                totalCitations: valuableCitations.length,
                processed: valuableCitations.length,
                qualified: miniFilteredCitations.length,
                verified: strictVerifiedCitations.length
            }, "正在為每個援引生成個案化使用建議...", 65);
        }

        // 🎯 階段三：深度分析（只針對通過驗證的援引）
        console.log(`[generateCitationRecommendationsThreeStage] 🔍 階段三：深度分析`);
        const finalRecommendations = await deepAnalysisVerifiedCitations(strictVerifiedCitations, position, caseDescription, casePool);

        // 🆕 更新進度：深度分析完成
        if (taskRef) {
            await updateTaskProgress(taskRef, 4, 95, {
                totalCitations: valuableCitations.length,
                processed: valuableCitations.length,
                qualified: miniFilteredCitations.length,
                verified: strictVerifiedCitations.length
            }, `深度分析完成，生成 ${finalRecommendations.length} 個專業建議...`, 15);
        }

        return {
            recommendations: finalRecommendations,
            summary: `經三階段 AI 驗證，推薦 ${finalRecommendations.length} 個高價值援引判例`,
            aiAnalysisStatus: 'three_stage_success',
            stageResults: {
                miniFiltered: miniFilteredCitations.length,
                strictVerified: strictVerifiedCitations.length,
                finalRecommended: finalRecommendations.length
            }
        };

    } catch (error) {
        console.error('[generateCitationRecommendationsThreeStage] 三階段分析失敗:', error);

        // 降級到原有的兩階段分析
        console.log('[generateCitationRecommendationsThreeStage] 降級到兩階段分析');
        return await generateCitationRecommendationsTwoStage(valuableCitations, position, caseDescription, casePool);
    }
}

/**
 * 🆕 兩階段 AI 分析：先篩選重要性，再逐個深度分析（保留作為降級方案）
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

        // 🔧 修復：使用與 extractCitationsFromCases 相同的數據獲取方式
        for (const case_ of casePool.allCases.slice(0, 10)) { // 限制檢查範圍
            try {
                // 🆕 重新獲取完整的案例數據（包含 citations 和 JFULL）
                const fullCaseData = await getJudgmentNodeData(case_.id);

                // 🔧 修復：getJudgmentNodeData 返回的是 _source，不需要再訪問 .source
                if (!fullCaseData?.citations || !Array.isArray(fullCaseData.citations)) {
                    continue;
                }

                const hasMatch = fullCaseData.citations.includes(citation.citation);

                if (hasMatch) {
                    CitationDebugLogger.logMatchSuccess(citation.citation, case_.title, 'exact');

                    const context = extractCitationContext(
                        citation.citation,
                        fullCaseData.JFULL || '',
                        fullCaseData.CourtInsightsStart || '',
                        fullCaseData.CourtInsightsEND || ''
                    );

                    if (context.found && context.context) {
                        contextSamples.push({
                            fullContext: context.context.fullContext,
                            beforeContext: context.context.before,
                            afterContext: context.context.after,
                            inCourtInsight: context.inCourtInsight,
                            fromCase: case_.title || '未知案例'
                        });
                    }
                } else {
                    // 🔧 精確匹配失敗，嘗試模糊匹配
                    const variants = generateNumberVariants(citation.citation);
                    let fuzzyMatch = false;

                    for (const variant of variants) {
                        if (fullCaseData.citations.includes(variant)) {
                            CitationDebugLogger.logMatchSuccess(citation.citation, case_.title, 'fuzzy');

                            const context = extractCitationContext(
                                variant, // 使用匹配的變體
                                fullCaseData.JFULL || '',
                                fullCaseData.CourtInsightsStart || '',
                                fullCaseData.CourtInsightsEND || ''
                            );

                            if (context.found && context.context) {
                                contextSamples.push({
                                    fullContext: context.context.fullContext,
                                    beforeContext: context.context.before,
                                    afterContext: context.context.after,
                                    inCourtInsight: context.inCourtInsight,
                                    fromCase: case_.title || '未知案例',
                                    matchType: 'fuzzy',
                                    originalCitation: citation.citation,
                                    matchedVariant: variant
                                });

                                fuzzyMatch = true;
                                break; // 找到一個匹配就足夠了
                            }
                        }
                    }

                    if (!fuzzyMatch) {
                        CitationDebugLogger.logMatchFailure(citation.citation, case_.title, 'no_variant_match');
                    }
                }

                if (contextSamples.length >= 2) break; // 最多2個樣本

            } catch (error) {
                CitationDebugLogger.logCritical('SingleAnalysis', `獲取案例數據失敗: ${case_.title}`, { error: error.message });
                continue;
            }
        }

        if (contextSamples.length === 0) {
            CitationDebugLogger.logCritical('SingleAnalysis', `未找到任何上下文: ${citation.citation}`);
            return {
                citation: citation.citation,
                recommendationLevel: "謹慎使用",
                reason: "未找到該判例在案例中的具體使用上下文，無法評估適用性",
                usageStrategy: "建議先查閱原判例內容再決定是否使用",
                contextEvidence: "無可用上下文",
                riskWarning: "缺乏上下文證據，使用前需謹慎評估",
                confidence: "低",
                uncertaintyNote: "未找到該判例的使用上下文"
            };
        }

        const prompt = `你是專業的法律分析師。請專注分析這一個援引判例，基於提供的實際使用上下文提供精確推薦。

案件描述：${caseDescription}
律師立場：${positionLabel}

援引判例：${citation.citation}
使用統計：
- 總使用次數：${citation.usageCount}
- 法院見解引用次數：${citation.inCourtInsightCount}
- 稀有度等級：${citation.valueAssessment.grade}

實際使用上下文：
${contextSamples.map((sample, index) => `
樣本 ${index + 1} (來源案例: ${sample.fromCase}):
${sample.inCourtInsight ? '【法院見解內引用】' : '【一般引用】'}

前文：${sample.beforeContext}
援引：${citation.citation}
後文：${sample.afterContext}

完整段落：
${sample.fullContext}
---
`).join('\n')}

分析要求：
1. 仔細閱讀每個上下文樣本，理解該判例在實際案例中的使用方式
2. 分析該判例與當前案件的相關性
3. 評估從${positionLabel}角度使用此判例的效果

請以 JSON 格式回應：
{
  "citation": "${citation.citation}",
  "recommendationLevel": "強烈推薦|建議考慮|謹慎使用",
  "reason": "基於實際上下文的推薦理由，必須引用具體使用場景（80-120字）",
  "usageStrategy": "具體使用建議，說明在什麼情況下引用此判例最有效（50-80字）",
  "contextEvidence": "支持推薦的關鍵上下文片段（直接引用最相關的部分）",
  "legalPrinciple": "該判例確立的法律原則或見解（基於上下文）",
  "applicabilityAnalysis": "與當前案件的適用性分析",
  "riskWarning": "使用此判例的注意事項或限制",
  "confidence": "高|中|低",
  "uncertaintyNote": "如果上下文顯示適用性有限，請說明原因"
}

分析原則：
1. 嚴格基於提供的實際使用上下文，不要推測
2. 重點分析該判例在上下文中解決的法律問題
3. 評估該法律問題與當前案件的相似性
4. 如果上下文顯示該判例處理的是不同類型的問題，要誠實指出
5. 必須使用繁體中文回應，確保 JSON 格式正確`;

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
 * 🆕 進度更新輔助函數
 */
async function updateTaskProgress(taskRef, stage, progress, stats, currentAction, estimatedRemaining = null) {
    // 🔧 確保數據輕量化
    const progressData = {
        stage: Math.min(stage, 5), // 限制階段範圍
        progress: Math.min(Math.max(progress, 0), 100), // 限制進度範圍
        stats: {
            totalCitations: Math.min(stats.totalCitations || 0, 9999),
            processed: Math.min(stats.processed || 0, 9999),
            qualified: Math.min(stats.qualified || 0, 9999),
            verified: Math.min(stats.verified || 0, 9999)
        },
        currentAction: (currentAction || '').substring(0, 100), // 限制文字長度
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    };

    if (estimatedRemaining !== null) {
        progressData.estimatedRemaining = Math.max(estimatedRemaining, 0);
    }

    // 🔧 檢查數據大小（粗略估算）
    const dataSize = JSON.stringify(progressData).length;
    if (dataSize > 1000) { // 如果超過 1KB，簡化數據
        progressData.currentAction = progressData.currentAction.substring(0, 50);
        console.warn(`[updateTaskProgress] 進度數據過大 (${dataSize} bytes)，已簡化`);
    }

    await taskRef.update({
        status: 'processing',
        progressData
    });

    console.log(`[updateTaskProgress] 階段 ${stage}: ${progress}% - ${currentAction}`);
}

/**
 * 🆕 階段定義（律師友好術語）
 * 注意：這個常數主要用於文檔和前端同步，後端邏輯中直接使用數字
 */
// const ANALYSIS_STAGES = [
//     { id: 0, name: "收集援引判例", duration: 20 },
//     { id: 1, name: "上下文深度分析", duration: 30 },
//     { id: 2, name: "智能相關性評估", duration: 25 },
//     { id: 3, name: "專家級品質驗證", duration: 40 },
//     { id: 4, name: "個案化建議生成", duration: 35 },
//     { id: 5, name: "整合最終結果", duration: 10 }
// ];

/**
 * 背景執行援引分析
 */
async function executeCitationAnalysisInBackground(taskId, originalTaskData, userId = null) {
    const db = admin.firestore();
    const taskRef = db.collection('aiAnalysisTasks').doc(taskId);

    try {
        console.log(`[executeCitationAnalysisInBackground] 開始執行援引分析任務: ${taskId}`);

        // 🆕 階段 0：初始化
        await updateTaskProgress(taskRef, 0, 5, {
            totalCitations: 0,
            processed: 0,
            qualified: 0,
            verified: 0
        }, "正在初始化分析環境...", 160);

        // 🆕 階段 0：獲取案例池數據
        await updateTaskProgress(taskRef, 0, 10, {
            totalCitations: 0,
            processed: 0,
            qualified: 0,
            verified: 0
        }, "正在載入案例池數據...", 150);

        // 獲取案例池數據（檢查兩個可能的路徑）
        const casePool = originalTaskData.result?.casePool || originalTaskData.result?.casePrecedentData?.casePool;

        if (!casePool) {
            throw new Error('無法找到案例池數據');
        }

        // 🆕 獲取原始分析的 positionStats 數據
        const originalPositionStats = originalTaskData.result?.casePrecedentData?.positionBasedAnalysis?.positionStats;

        // 🔍 調試：檢查案例池數據
        console.log(`[executeCitationAnalysisInBackground] 案例池包含 ${casePool.allCases?.length || 0} 個案例`);
        if (casePool.allCases && casePool.allCases.length > 0) {
            const firstCase = casePool.allCases[0];
            console.log(`[executeCitationAnalysisInBackground] 第一個案例結構:`, {
                id: firstCase.id,
                title: firstCase.title,
                hasSource: !!firstCase.source,
                hasCitations: !!firstCase.source?.citations,
                citationsLength: firstCase.source?.citations?.length || 0,
                citationsPreview: firstCase.source?.citations?.slice(0, 3) || []
            });
        }

        // 🆕 階段 0 完成：開始分析
        await updateTaskProgress(taskRef, 0, 15, {
            totalCitations: 0,
            processed: 0,
            qualified: 0,
            verified: 0
        }, "案例池載入完成，開始援引分析...", 145);

        // 執行援引分析（帶進度更新）
        const analysisResult = await analyzeCitationsFromCasePool(
            casePool,
            originalTaskData.analysisData.position || 'neutral',
            originalTaskData.analysisData.caseDescription,
            originalPositionStats,
            taskRef // 🆕 傳遞 taskRef 用於進度更新
        );

        // 🆕 保存結果並清理進度數據
        await taskRef.update({
            status: 'complete',
            result: analysisResult,
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            // 🔧 清理進度數據以節省存儲空間
            progressData: admin.firestore.FieldValue.delete()
        });

        console.log(`[executeCitationAnalysisInBackground] 援引分析任務 ${taskId} 完成`);

    } catch (error) {
        console.error(`[executeCitationAnalysisInBackground] 援引分析任務 ${taskId} 失敗:`, error);

        await taskRef.update({
            status: 'failed',
            error: error.message,
            failedAt: admin.firestore.FieldValue.serverTimestamp(),
            // 🔧 清理進度數據以節省存儲空間
            progressData: admin.firestore.FieldValue.delete()
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
