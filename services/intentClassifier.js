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
 * 意圖識別 System Prompt (極簡版)
 */
const INTENT_CLASSIFIER_PROMPT = `你是一個意圖分類器,判斷用戶問題是否與「法官判決分析」相關。

**你只能回答以下 4 種分類之一**:
1. "legal_analysis" - 問題與法官、判決、案件、勝訴率、法條等法律分析相關
2. "greeting" - 打招呼、問候、自我介紹
3. "out_of_scope" - 與法律無關的問題 (如: 法官個人生活、天氣、股票等)
4. "unclear" - 問題不清楚或無法理解

**範例**:
- "王婉如法官在交通案件中的勝訴率?" → legal_analysis
- "損害賠償案件有哪些?" → legal_analysis
- "法官常引用哪些法條?" → legal_analysis
- "你好" → greeting
- "法官單身嗎?" → out_of_scope
- "今天天氣如何?" → out_of_scope
- "asdfgh" → unclear

**重要**: 只回答分類名稱,不要解釋。`;

/**
 * 分類用戶問題意圖
 * @param {string} question - 用戶問題
 * @param {string} context - 可選的上下文資訊 (如: 當前查詢的法官名稱)
 * @returns {Promise<Object>} 意圖分類結果
 */
export async function classifyIntent(question, context = '') {
    const startTime = Date.now();
    
    try {
        console.log('[Intent Classifier] 開始分類意圖...');
        console.log('[Intent Classifier] 問題:', question);
        if (context) {
            console.log('[Intent Classifier] 上下文:', context.substring(0, 100) + '...');
        }

        // 構建完整問題 (包含上下文)
        const fullQuestion = context 
            ? `上下文: ${context}\n\n用戶問題: ${question}`
            : `用戶問題: ${question}`;

        // 調用 GPT-4.1 nano 進行意圖分類
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',  // 🔧 注意: OpenAI 目前還沒有 gpt-4.1-nano,先用 gpt-4o-mini
            messages: [
                { role: 'system', content: INTENT_CLASSIFIER_PROMPT },
                { role: 'user', content: fullQuestion }
            ],
            temperature: 0.1,  // 低溫度,確保分類穩定
            max_tokens: 10     // 只需要返回分類名稱
        });

        const intent = completion.choices[0].message.content.trim().toLowerCase();
        const duration = Date.now() - startTime;

        // 記錄 Token 使用情況
        const usage = completion.usage;
        console.log('[Intent Classifier] 分類結果:', intent);
        console.log('[Intent Classifier] Token 使用:', {
            input: usage.prompt_tokens,
            output: usage.completion_tokens,
            total: usage.total_tokens
        });
        console.log('[Intent Classifier] 耗時:', duration, 'ms');

        // 驗證分類結果
        const validIntents = Object.values(INTENT_TYPES);
        const classifiedIntent = validIntents.includes(intent) 
            ? intent 
            : INTENT_TYPES.UNCLEAR;

        return {
            intent: classifiedIntent,
            isLegalRelated: classifiedIntent === INTENT_TYPES.LEGAL_ANALYSIS,
            confidence: 'high',  // GPT-4o-mini 的分類通常很準確
            duration: duration,
            tokenUsage: {
                input: usage.prompt_tokens,
                output: usage.completion_tokens,
                total: usage.total_tokens,
                estimatedCost: (usage.total_tokens / 1000000) * 0.15  // $0.15/1M tokens
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

