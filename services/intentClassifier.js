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
 * 🆕 案由類別映射
 * 根據 caseType.txt 中的實際數據建立映射
 * 將用戶的口語化描述映射到具體的案由關鍵詞
 */
const CASE_TYPE_CATEGORIES = {
    // ========== 婚姻家事類 ==========
    "婚姻家事": [
        "婚姻家事",  // 已經是一個獨立類別 (506筆)
        "夫妻剩餘財產分配",  // 33筆
        "剩餘財產分配",  // 5筆
        "遺產分割",  // 19筆
        "扶養費爭議",
        "扶養費給付",
        "給付扶養費",
        "未成年子女扶養費變更",
        "夫妻財產及扶養費爭議",
        "家事事件（扶養費分擔約定）",
        "家事扶養費與喪葬費分擔爭議",
        "家事調解履行爭議",
        "收養關係確認",
        "確認親子關係存在",
        "確認親子關係不存在"
    ],
    "家事": ["婚姻家事", "夫妻剩餘財產分配", "剩餘財產分配", "遺產分割"],  // 別名
    "家庭案件": ["婚姻家事", "夫妻剩餘財產分配", "剩餘財產分配", "遺產分割"],  // 別名

    // ========== 繼承類 ==========
    "繼承": [
        "繼承糾紛",  // 446筆
        "遺產分割",  // 19筆
        "分割遺產",  // 2筆
        "撤銷遺產分割協議",  // 5筆
        "撤銷遺產分割登記",  // 4筆
        "撤銷遺產分割",
        "確認遺囑無效",  // 3筆
        "特留分扣減",  // 2筆
        "特留分給付",
        "請求分割遺產"  // 2筆
    ],
    "遺產": ["繼承糾紛", "遺產分割", "分割遺產"],  // 別名

    // ========== 勞動類 ==========
    "勞動案件": [
        "勞資爭議",  // 452筆
        "職業災害補償",  // 9筆
        "職業災害",
        "職業災害勞動能力減損",
        "職業災害補償及侵權損害賠償",
        "職業災害補償及損害賠償",
        "職業災害補償返還",
        "給付退休金",  // 10筆
        "給付退休金差額",  // 5筆
        "給付工資",  // 19筆
        "給付薪資",  // 3筆
        "給付薪資債權",
        "給付資遣費",  // 2筆
        "給付加班費",  // 2筆
        "給付職業災害補償",
        "給付職業災害補償金",
        "給付職災補償",
        "確認僱傭關係存在",
        "競業禁止約定爭議"
    ],
    "勞資": ["勞資爭議", "職業災害補償", "給付退休金", "給付工資"],  // 別名
    "勞工": ["勞資爭議", "職業災害補償", "給付退休金", "給付工資"],  // 別名

    // ========== 智慧財產權類 ==========
    "智慧財產權": [
        "專利權侵害",  // 7筆
        "侵害專利權",  // 3筆
        "專利侵權",  // 2筆
        "侵害專利權損害賠償",
        "排除侵害專利權",  // 4筆
        "請求排除侵害專利權",  // 3筆
        "專利權侵害再審",
        "專利權存續爭議",
        "專利權排除侵害及損害賠償",
        "專利權權利歸屬",
        "專利權糾紛",
        "專利權讓與契約爭議",
        "侵害商標權",  // 2筆
        "商標權侵害",  // 2筆
        "商標權排除侵害",
        "排除侵害商標權",  // 2筆
        "商標權及著作權授權糾紛",
        "侵害著作權",  // 3筆
        "排除侵害著作權",
        "著作權其他契約爭議",  // 2筆
        "營業秘密",  // 2筆
        "營業秘密侵權損害賠償"
    ],
    "智財": ["專利權侵害", "侵害專利權", "侵害商標權", "侵害著作權", "營業秘密"],  // 別名
    "專利": ["專利權侵害", "侵害專利權", "專利侵權"],  // 別名
    "商標": ["侵害商標權", "商標權侵害"],  // 別名
    "著作權": ["侵害著作權"],  // 別名

    // ========== 交通事故類 ==========
    "交通事故": [
        "交通事故",  // 178筆
        "交通事件",
        "交通事故侵權",
        "交通事故損害賠償",
        "交通事故致人死亡",
        "交通事故致死"
    ],
    "車禍": ["交通事故"],  // 別名

    // ========== 不動產類 ==========
    "不動產": [
        "土地爭議",  // 749筆
        "共有物分割",  // 535筆
        "拆屋還地",  // 507筆
        "租賃糾紛",  // 338筆
        "公寓大廈管理",  // 159筆
        "遷讓房屋",  // 4筆
        "請求遷讓房屋",  // 6筆
        "房屋遷讓",
        "所有權移轉登記",  // 21筆
        "請求所有權移轉登記",  // 24筆
        "不動產所有權移轉登記",  // 3筆
        "請求不動產所有權移轉登記",  // 14筆
        "塗銷所有權移轉登記",  // 3筆
        "請求塗銷所有權移轉登記",  // 6筆
        "塗銷抵押權登記",  // 34筆
        "請求塗銷抵押權登記",  // 20筆
        "塗銷抵押權",  // 13筆
        "請求塗銷抵押權",  // 2筆
        "借名登記糾紛",  // 17筆
        "借名登記爭議",  // 10筆
        "借名登記",  // 7筆
        "借名登記契約糾紛",  // 2筆
        "借名登記物返還",  // 2筆
        "借名登記返還請求",  // 2筆
        "返還借名登記物",  // 2筆
        "確認通行權存在",  // 6筆
        "確認通行權及管線設置權",
        "排除侵害",  // 28筆
        "請求排除侵害",  // 8筆
        "分割共有物",
        "共有物分割爭議",
        "共有物返還",  // 2筆
        "租佃糾紛",  // 4筆
        "租佃爭議",
        "租賃契約糾紛",
        "建物漏水修繕糾紛",  // 2筆
        "建物漏水爭議",  // 2筆
        "建物漏水",
        "建築物漏水",
        "建築物漏水糾紛",
        "房屋漏水修繕",
        "房屋漏水爭議",
        "房屋漏水糾紛",
        "樓上住戶漏水致損害",
        "修繕漏水糾紛",
        "修繕瑕疵爭議",
        "建築工程鄰損",
        "建築施工損害",
        "建築鄰損",
        "房屋裝修導致鄰損",
        "給付管理費"  // 4筆
    ],
    "房地產": ["土地爭議", "共有物分割", "拆屋還地", "租賃糾紛"],  // 別名
    "土地": ["土地爭議", "共有物分割", "拆屋還地"],  // 別名
    "租賃": ["租賃糾紛", "租佃糾紛", "租賃契約糾紛"],  // 別名

    // ========== 契約類 ==========
    "買賣契約": [
        "買賣契約糾紛",  // 571筆
        "不動產買賣契約糾紛",  // 3筆
        "不動產買賣糾紛",
        "不動產買賣瑕疵責任",
        "瑕疵擔保",
        "不動產瑕疵擔保",
        "減少價金",  // 4筆
        "請求減少價金"  // 3筆
    ],
    "工程契約": [
        "給付工程款",  // 608筆
        "工程款給付爭議",
        "承攬契約糾紛",  // 21筆
        "承攬契約爭議",  // 3筆
        "承攬契約解除",
        "承攬報酬與抵銷爭議"
    ],
    "借貸": [
        "借貸糾紛",  // 666筆
        "返還借款",
        "請求清償債務",  // 7筆
        "清償債務"
    ]
};

/**
 * 🆕 展開案由類別
 * 如果 case_type 匹配某個類別，返回該類別的所有具體案由
 * @param {string} caseType - 用戶輸入的案由
 * @returns {Array<string>|null} - 展開後的案由清單，如果不是類別則返回 null
 */
function expandCaseTypeCategory(caseType) {
    if (!caseType) return null;

    // 檢查是否匹配某個類別
    const normalizedCaseType = caseType.trim();

    if (CASE_TYPE_CATEGORIES[normalizedCaseType]) {
        console.log(`[Intent Classifier] 🆕 展開案由類別「${normalizedCaseType}」`);
        const expanded = CASE_TYPE_CATEGORIES[normalizedCaseType];
        console.log(`[Intent Classifier] 展開為 ${expanded.length} 個具體案由:`, expanded.join('、'));
        return expanded;
    }

    return null;
}

/**
 * 意圖識別 System Prompt (強化版 - 支援案件詳情查詢)
 */
const INTENT_CLASSIFIER_PROMPT = `你是一個意圖分類器。判斷用戶問題是否與「法律案件/判決相關任務」有關（不限於法官分析），並抽取關鍵欄位。

**返回 JSON 格式**:
{
  "intent": "legal_analysis" | "greeting" | "out_of_scope" | "unclear",
  "question_type": "建議" | "摘要" | "勝訴率" | "金額" | "法條" | "判決傾向" | "列表" | "其他" | null,
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
6. **[重要] 若問題包含「怎麼處理」「你建議我」「該怎麼做」「勝算大嗎」「如何應對」等尋求建議的關鍵字**，則標記為 intent=legal_analysis, question_type="建議"，並交給下游模組決定如何回覆
7. **不要因為問題帶有策略性或諮詢性質，就直接判為 out_of_scope**；只要與法官判決分析相關，都應標為 legal_analysis

**意圖分類**:
- legal_analysis: 與法律案件、判決、法官分析、案件詳情、摘要等相關
- greeting: 打招呼、問候
- out_of_scope: 明確與法律/判決無關（生活嗜好、天氣、八卦）
- unclear: 無法理解

**範例**:
問題: "我剛好有一個案件是關於返還不當得利的，明天開庭，法官就是王婉如法官，當事人是被告，你會建議我怎麼處理?" → {"intent":"legal_analysis","question_type":"建議","case_type":"返還不當得利","verdict_type":null,"case_id":null}
問題: "我是原告，要對王婉如法官提起侵權訴訟，勝算大嗎?" → {"intent":"legal_analysis","question_type":"建議","case_type":"侵權","verdict_type":null,"case_id":null}
問題: "面對這個法官，我該怎麼準備?" → {"intent":"legal_analysis","question_type":"建議","case_type":null,"verdict_type":null,"case_id":null}
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

        // 🆕 展開案由類別
        const expandedCaseTypes = expandCaseTypeCategory(parsedResult.case_type);

        return {
            intent: intent,
            isLegalRelated: intent === INTENT_TYPES.LEGAL_ANALYSIS,
            confidence: 'high',
            duration: duration,
            // 🆕 提取的資訊
            extractedInfo: {
                question_type: parsedResult.question_type || null,
                case_type: parsedResult.case_type || null,
                case_type_expanded: expandedCaseTypes,  // 🆕 展開後的案由清單
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

💡 **數據範圍**: 2025年5-7月的判決書數據

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

