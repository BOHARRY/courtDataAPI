// services/intentClassifier.js
/**
 * 輕量級意圖識別服務
 * 使用 GPT-4.1 nano 快速判斷用戶問題是否與法官判決分析相關
 * 
 * 成本對比:
 * - GPT-4.1 nano: $0.10/1M input tokens (比 GPT-4o-mini 便宜 33%)
 * - 單次識別: ~300 tokens × $0.10/1M = $0.00003 (極低成本)
 */

import OpenAI from 'openai';
import { OPENAI_API_KEY } from '../config/environment.js';

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

/**
 * 意圖分類結果
 */
const INTENT_TYPES = {
    LEGAL_ANALYSIS: 'legal_analysis',      // 法律分析相關
    OUT_OF_SCOPE: 'out_of_scope',          // 超出範圍
    GREETING: 'greeting',                   // 打招呼
    UNCLEAR: 'unclear'                      // 不清楚
};

/**
 * 意圖識別 System Prompt (強化版 - 支援案件詳情查詢)
 */
const INTENT_CLASSIFIER_PROMPT = `你是一個意圖分類器。判斷用戶問題是否與「法律案件/判決相關任務」有關（不限於法官分析），並抽取關鍵欄位。

**返回 JSON 格式**:
{
  "intent": "legal_analysis" | "greeting" | "out_of_scope" | "unclear",
  "question_type": "勝訴率" | "列表" | "法條" | "判決傾向" | "金額" | "摘要" | "其他" | null,
  "case_type": "案由關鍵字" | null,
  "verdict_type": "原告勝訴" | "原告敗訴" | "部分勝訴部分敗訴" | null,
  "case_id": "string | null"
}

**核心規則**:
1. **只要涉及「判決書/案件/案號/判決ID/摘要/理由/主文/裁判要旨/法條引用」，一律 intent=legal_analysis**
2. **可偵測案號/判決ID**（例如含多個逗號分段的碼，如 \`TPHV,113,上,656,20250701,4\`）時，填入 case_id
3. **不要因為當前對話綁定了某位法官而把與案件相關的問題標為 out_of_scope**；法官是否匹配由後續階段判斷
4. **僅在明確與法律/判決無關**（如生活嗜好、天氣、八卦）時，才標 out_of_scope
5. **若不確定類別**，使用 question_type="其他" 並保持 intent=legal_analysis

**意圖分類**:
- legal_analysis: 與法律案件、判決、法官分析、案件詳情、摘要等相關
- greeting: 打招呼、問候
- out_of_scope: 明確與法律/判決無關（生活嗜好、天氣、八卦）
- unclear: 無法理解

**範例**:
問題: "TPHV,113,上,656,20250701,4 的判決摘要？" → {"intent":"legal_analysis","question_type":"摘要","case_type":null,"verdict_type":null,"case_id":"TPHV,113,上,656,20250701,4"}
問題: "可以給我 SLEV,114,士簡,720,20250731,1 這篇判決的摘要嗎?" → {"intent":"legal_analysis","question_type":"摘要","case_type":null,"verdict_type":null,"case_id":"SLEV,114,士簡,720,20250731,1"}
問題: "法官在交通案件中的勝訴率?" → {"intent":"legal_analysis","question_type":"勝訴率","case_type":"交通","verdict_type":"原告勝訴","case_id":null}
問題: "法官有沒有經手刑事案件?" → {"intent":"legal_analysis","question_type":"列表","case_type":"刑事","verdict_type":null,"case_id":null}
問題: "你好" → {"intent":"greeting","question_type":null,"case_type":null,"verdict_type":null,"case_id":null}
問題: "法官喜歡吃臭豆腐嗎？" → {"intent":"out_of_scope","question_type":null,"case_type":null,"verdict_type":null,"case_id":null}

只返回 JSON,不要其他文字。`;

/**
 * 分類用戶問題意圖
 * @param {string} question - 用戶問題
 * @param {Object} options - 選項
 * @param {string} options.context - 可選的上下文資訊 (如: 當前查詢的法官名稱)
 * @param {Array} options.conversationHistory - 可選的對話歷史 (用於理解延續性問題)
 * @returns {Promise<Object>} 意圖分類結果
 */
export async function classifyIntent(question, options = {}) {
    const { context = '', conversationHistory = [] } = options;
    const startTime = Date.now();

    try {
        console.log('[Intent Classifier] 開始分類意圖...');
        console.log('[Intent Classifier] 問題:', question);
        if (context) {
            console.log('[Intent Classifier] 上下文:', context.substring(0, 100) + '...');
        }
        if (conversationHistory.length > 0) {
            console.log('[Intent Classifier] 對話歷史:', conversationHistory.length, '條');
        }

        // 構建消息列表
        const messages = [
            { role: 'system', content: INTENT_CLASSIFIER_PROMPT }
        ];

        // 🆕 添加最近的對話歷史 (最多 3 輪,避免 Token 過多)
        // ⚠️ 重要：移除 tool 和 tool_calls 訊息，避免 OpenAI API 錯誤
        const recentHistory = conversationHistory
            .slice(-6) // 最近 3 輪 (每輪 2 條消息)
            .filter(msg => {
                // 只保留 user 和 assistant 訊息
                // 移除 tool 訊息（避免缺少對應的 tool_calls）
                // 移除包含 tool_calls 的 assistant 訊息（簡化對話）
                return (msg.role === 'user' || msg.role === 'assistant') && !msg.tool_calls;
            });

        if (recentHistory.length > 0) {
            console.log('[Intent Classifier] 使用最近', recentHistory.length, '條對話作為上下文');
            messages.push(...recentHistory);
        }

        // 添加當前問題
        const fullQuestion = context
            ? `上下文: ${context}\n\n用戶問題: ${question}`
            : `用戶問題: ${question}`;

        messages.push({ role: 'user', content: fullQuestion });

        // 調用 GPT-4o-mini 進行意圖分類
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: messages,
            temperature: 0.1,  // 低溫度,確保分類穩定
            max_tokens: 100    // 🆕 增加 token 限制以支持 JSON 返回
        });

        const rawResponse = completion.choices[0].message.content.trim();
        const duration = Date.now() - startTime;
        const usage = completion.usage;

        console.log('[Intent Classifier] 原始返回:', rawResponse);
        console.log('[Intent Classifier] Token 使用:', {
            input: usage.prompt_tokens,
            output: usage.completion_tokens,
            total: usage.total_tokens
        });
        console.log('[Intent Classifier] 耗時:', duration, 'ms');

        // 🆕 解析 JSON 返回
        let parsedResult;
        try {
            parsedResult = JSON.parse(rawResponse);
        } catch (e) {
            console.log('[Intent Classifier] ⚠️ JSON 解析失敗,使用舊格式:', rawResponse);
            // 向後兼容: 如果不是 JSON,當作舊格式處理
            const intent = rawResponse.toLowerCase();
            const validIntents = Object.values(INTENT_TYPES);
            const classifiedIntent = validIntents.includes(intent) ? intent : INTENT_TYPES.UNCLEAR;

            parsedResult = {
                intent: classifiedIntent,
                question_type: null,
                case_type: null,
                verdict_type: null,
                case_id: null  // 🆕 向後兼容
            };
        }

        // 驗證 intent
        const validIntents = Object.values(INTENT_TYPES);
        const intent = validIntents.includes(parsedResult.intent)
            ? parsedResult.intent
            : INTENT_TYPES.UNCLEAR;

        console.log('[Intent Classifier] 分類結果:', intent);
        if (parsedResult.question_type) {
            console.log('[Intent Classifier] 問題類型:', parsedResult.question_type);
        }
        if (parsedResult.case_type) {
            console.log('[Intent Classifier] 案由:', parsedResult.case_type);
        }
        if (parsedResult.verdict_type) {
            console.log('[Intent Classifier] 判決類型:', parsedResult.verdict_type);
        }
        if (parsedResult.case_id) {
            console.log('[Intent Classifier] 案號ID:', parsedResult.case_id);
        }

        return {
            intent: intent,
            isLegalRelated: intent === INTENT_TYPES.LEGAL_ANALYSIS,
            confidence: 'high',
            duration: duration,
            // 🆕 提取的資訊
            extractedInfo: {
                question_type: parsedResult.question_type || null,
                case_type: parsedResult.case_type || null,
                verdict_type: parsedResult.verdict_type || null,
                case_id: parsedResult.case_id || null  // 🆕 添加 case_id
            },
            tokenUsage: {
                input: usage.prompt_tokens,
                output: usage.completion_tokens,
                total: usage.total_tokens,
                estimatedCost: (usage.total_tokens / 1000000) * 0.15
            }
        };

    } catch (error) {
        console.error('[Intent Classifier] 分類失敗:', error);
        
        // 如果意圖識別失敗,默認為法律相關 (保守策略)
        return {
            intent: INTENT_TYPES.LEGAL_ANALYSIS,
            isLegalRelated: true,
            confidence: 'low',
            error: error.message,
            duration: Date.now() - startTime
        };
    }
}

/**
 * 生成友好的拒絕回應
 * @param {string} intent - 意圖類型
 * @param {string} question - 用戶問題
 * @param {string} judgeName - 當前查詢的法官名稱 (可選)
 * @returns {string} 回應訊息
 */
export function generateOutOfScopeResponse(intent, question, judgeName = null) {
    // 根據是否有法官名稱,調整回應內容
    const judgeContext = judgeName
        ? `${judgeName}法官判決內容`
        : '法官判決分析';

    switch (intent) {
        case INTENT_TYPES.GREETING:
            return `您好!我是法官分析助手。

我可以幫您:
• 分析特定法官的判決傾向或判決結果比例
• 查找特定案由的判決案例
• 分析法官常引用的法條
• 分析判決金額趨勢

💡 **數據範圍**: 2025年6-7月的判決書數據

請問您想了解什麼?`;

        case INTENT_TYPES.OUT_OF_SCOPE:
            return `抱歉,我只能回答與**${judgeContext}**相關的問題。

我可以幫您:
• 分析法官的判決傾向或判決結果比例
• 查找特定案由的判決案例
• 分析法官常引用的法條

您的問題似乎與判決分析無關,歡迎重新提問! 😊`;

        case INTENT_TYPES.UNCLEAR:
            return `抱歉,我不太理解您的問題。

我是法官分析助手,專門協助分析法官的判決傾向。

**範例問題**:
• "王婉如法官在交通案件中的判決結果比例?"
• "損害賠償案件中,法官常引用哪些法條?"
• "這位法官對原告的判決傾向如何?"

請您重新描述您的問題,我會盡力協助! 😊`;

        default:
            return `抱歉,我無法處理您的問題。請嘗試詢問法官判決相關的問題。`;
    }
}

/**
 * 記錄意圖分類統計 (用於監控和優化)
 */
export function logIntentStats(result) {
    // TODO: 可以將統計數據發送到監控系統
    console.log('[Intent Stats]', {
        intent: result.intent,
        confidence: result.confidence,
        duration: result.duration,
        tokenUsage: result.tokenUsage
    });
}

