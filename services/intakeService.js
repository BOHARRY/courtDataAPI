// services/intakeService.js (最終版)

import OpenAI from 'openai';
import { OPENAI_API_KEY } from '../config/environment.js';

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

// services/intakeService.js

/**
 * 生成包含所有策略和規則的動態系統 Prompt。
 *
 * @param {string} memoryContext - 由 generateMemoryContext 生成的、關於已知案件資訊的文字摘要。
 * @param {string} dialogueStage - 當前對話所處的階段 ('greeting', 'fee_mention_pending', 'collecting')。
 * @param {string|null} caseType - 已知的案件類型 ('刑事', '民事', '家事', null)。
 * @returns {string} - 一個完整、包含所有指令的系統 Prompt 字串。
 */
const getSystemPrompt = (memoryContext, dialogueStage, caseType) => {

    // 回顧點 1：實現「價格篩選」策略。
    // 我們的討論結論是，需要在對話早期，根據案件類型給出一個大致的費用範圍，
    // 以此來管理使用者期望並過濾掉完全不匹配的客戶。
    const feeRanges = {
        "刑事": "初步諮詢費用約為每小時 3000元 至 6000元",
        "民事": "初步諮詢費用約為每小時 3000元 至 6000元",
        "家事": "初步諮詢費用約為每小時 4000元 至 8000元",
        "default": "初步諮詢將會是付費服務" // 如果案件類型未知，提供一個通用說明。
    };
    const feeInfo = feeRanges[caseType] || feeRanges.default;

    // 回顧點 2：提升對話的人性化和體驗，解決「連珠炮式提問」和「情緒承接不力」的問題。
    // 我們討論出需要制定強制性的回應規則，確保 AI 的回應溫暖且有節奏。
    const empathyRule = `
重要的人性化回應規則：
- **強力承接情緒**：當使用者表達強烈情緒時（例如憤怒、絕望、焦慮），你的 "response" 的第一句話必須完全用來回應這個情緒，使其感受到被理解。例如：「聽到錢已經被花光了，這真的太令人震驚和氣憤了！」
- **一次只問一件事**：在你的 "response" 中，一次最多只能提出一個核心問題。絕對不要在一句話裡問兩件以上的事情。
`;

    // 最終的 Prompt 結構。它整合了我們所有的設計思路。
    return `你是一位專業的律師 AI 接案助理，名叫「法握」。${empathyRule}

你的回應必須嚴格遵循以下的 JSON 格式，不准有任何例外：
{
  "analysis": {
    "caseType": "根據對話內容判斷的案件主類型 (刑事/民事/家事/其他)，如果不明確則為 null",
    "keyEntities": ["從使用者最新一句話中提取的關鍵字或實體"],
    "userEmotion": "從使用者最新一句話中感知到的主要情緒 (worry/anger/sadness/helpless/neutral)",
    
    // 回顧點 3：實現「案件價值評估」與「出口匝道」策略。
    // 我們要讓 AI 在背景評估案件重要性，並為低價值案件提供友善的替代方案。
    "caseSignificance": "根據案情（金額、影響、是否涉及人身自由）評估案件重要性 (low/medium/high/unknown)。例如，偷飲料是 low，判刑一年是 high。還不確定則填寫 unknown。",
    
    "action": "你這次回應執行的主要動作，例如 'ask_question', 'mention_fee', 'end_conversation'。"
  },

  // 回顧點 4：實現「智慧結束對話」機制。
  // AI 需要判斷資訊是否收集完畢，並發出結束信號。
  "conversationState": "判斷當前對話狀態。如果根據記憶摘要，關鍵資訊已基本齊全，或使用者已明確表示沒有更多資訊，則設為 'completed'；否則設為 'collecting'。",
  
  "response": "你要對使用者說的、溫暖且有引導性的下一句話。"
}

--- 記憶摘要 (你已經知道的資訊) ---
${memoryContext}
---
目前對話階段: ${dialogueStage}
---

你的任務，請嚴格按順序執行，這是一個流程圖，不是建議清單：

**第一步：判斷當前階段並執行指定動作 (這是最高優先級)**

- **如果階段是 'greeting'**：
  - **唯一動作**：生成歡迎語，並完成「身份錨定」和「付費期望設定」。
  - **response 範本**：「您好，我是法握，王大明律師的AI接案助理。我的任務是先協助您整理案件資訊，以便律師能更有效率地為接下來的『付費諮詢』做好準備。請問發生了什麼事呢？」
  - **然後停止，不要執行後續步驟。**

- **如果階段是 'fee_mention_pending'**：
  - **唯一動作**：提及費用，並詢問是否繼續。這是在執行「價格篩選」策略。
  - **analysis.action** 必須設為 'mention_fee'。
  - **response 範本**：「了解，是${caseType}案件。在我們深入細節前，想先跟您說明，${feeInfo}，實際費用會由律師在了解完整案情後提供正式報價。這樣您是否了解，並希望繼續呢？」
  - **然後停止，不要執行後續步驟。**

**第二步：如果不是以上特殊階段，則進入常規資訊收集與評估流程**

1.  **評估案件重要性 (caseSignificance)**：這是執行「價值判斷」策略。

2.  **決定對話狀態 (conversationState)**：
    - 如果 'caseSignificance' 為 'low'，或使用者想結束（例如說「沒有了」），立即將'conversationState'設為 'completed'。
    - 否則，根據記憶摘要的資訊完整度判斷是 'collecting' 還是 'completed'。

3.  **生成最終回應 (response)**：
    - **如果 state 是 'collecting'**：遵循最上方的人性化回應規則，先同理心回應，然後根據記憶摘要中的「未知」項，提出**一個**最重要的問題。這是我們的核心資訊收集循環。
    - **如果 state 是 'completed' 且 significance 是 'medium'/'high'**：執行標準的「結束對話」流程，引導使用者留下聯絡方式以完成商業閉環。
    - **如果 state 是 'completed' 且 significance 是 'low'**：執行「出口匝道」劇本，提供有價值的替代方案，優雅地結束對話，同時維持專業形象。
`;
};

/**
 * 處理聊天請求，並從 OpenAI 獲取結構化的回應
 * @param {Array<Object>} conversationHistory - 對話歷史
 * @param {Object} caseInfo - 目前已知的案件資訊，用於生成記憶
 * @returns {Promise<Object>} - AI 生成的結構化回應
 */
async function handleChat(conversationHistory, caseInfo = {}) {
    if (!conversationHistory || conversationHistory.length === 0) {
        throw new Error('對話歷史不得為空');
    }

    // 1. 生成記憶摘要
    const memoryContext = generateMemoryContext(caseInfo);

    // 從 caseInfo 獲取當前階段和類型
    const dialogueStage = caseInfo.dialogueStage || 'greeting';
    const caseType = caseInfo.caseType || null;

    // 2. 獲取動態的系統 Prompt
    const dynamicSystemPrompt = getSystemPrompt(memoryContext, dialogueStage, caseType);

    try {
        const messages = [
            { role: 'system', content: dynamicSystemPrompt },
            ...conversationHistory,
        ];

        const response = await openai.chat.completions.create({
            model: 'gpt-4.1',
            messages: messages,
            response_format: { type: "json_object" },
            temperature: 0.7,
            max_tokens: 500,
        });

        const assistantResponseJson = response.choices[0].message.content;
        const structuredResponse = JSON.parse(assistantResponseJson);
        return structuredResponse;

    } catch (error) {
        console.error('Error in intakeService:', error);
        return {
            analysis: { error: "API or parsing failed" },
            response: '抱歉，我這裡好像有點小問題，請稍後再試一次好嗎？'
        };
    }
}

/**
 * 根據已知的案件資訊，生成給 AI 看的記憶摘要
 * @param {Object} caseInfo - 案件資訊物件
 * @returns {string} - 格式化的記憶摘要文字
 */
function generateMemoryContext(caseInfo) {
    const contextLines = [];
    contextLines.push(`- 案件類型: ${caseInfo.caseType || '未知'}`);

    // 根據案件類型，定義需要收集的關鍵資訊
    const requiredInfo = {
        "刑事": ["判決日期", "刑度", "案發經過", "前科紀錄"],
        "民事": ["糾紛金額", "契約內容", "事發時間"],
        "家事": ["子女狀況", "財產狀況", "分居時間"],
    };

    const fieldsToCheck = requiredInfo[caseInfo.caseType] || [];

    fieldsToCheck.forEach(field => {
        const key = toCamelCase(field); // 將 "判決日期" 轉為 "verdictDate"
        contextLines.push(`- ${field}: ${caseInfo[key] || '未知'}`);
    });

    if (fieldsToCheck.length === 0 && caseInfo.caseType) {
        contextLines.push("\n請先深入了解案件具體發生了什麼事。");
    } else if (fieldsToCheck.length > 0) {
        contextLines.push("\n你的目標是引導使用者說出「未知」的項目。");
    }

    return contextLines.join('\n');
}

// 輔助函式：將中文欄位名轉為駝峰命名 (e.g., "判決日期" -> "verdictDate")
// 這只是個簡化版，實際應用可能需要更穩健的映射
const fieldMapping = {
    "判決日期": "verdictDate",
    "刑度": "sentence",
    "案發經過": "incidentDetails",
    "前科紀錄": "priorRecord",
    "糾紛金額": "disputeAmount",
    "契約內容": "contractDetails",
    "事發時間": "incidentDate",
    "子女狀況": "childrenStatus",
    "財產狀況": "assetStatus",
    "分居時間": "separationDate"
};

function toCamelCase(str) {
    return fieldMapping[str] || str;
}


export { handleChat, generateMemoryContext }; // 匯出 generateMemoryContext 供測試