// services/intakeService.js (最終版)

import OpenAI from 'openai';
import { OPENAI_API_KEY } from '../config/environment.js';

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

// 我們把 Prompt 的模板獨立出來，方便管理
const getSystemPrompt = (memoryContext, dialogueStage, caseType) => {
    // 根據案件類型定義費用範圍
    const feeRanges = {
        "刑事": "初步諮詢費用約為每小時 3000元 至 6000元",
        "民事": "初步諮詢費用約為每小時 3000元 至 6000元",
        "家事": "初步諮詢費用約為每小時 4000元 至 8000元",
        "default": "初步諮詢將會是付費服務"
    };
    const feeInfo = feeRanges[caseType] || feeRanges.default;

    return `你是一位專業的律師 AI 接案助理，名叫「法握」。

你的回應必須嚴格遵循以下的 JSON 格式：
{
  "analysis": {
    "caseType": "根據對話內容判斷的案件主類型 (刑事/民事/家事/其他)，如果不明確則為 null",
    "keyEntities": ["從使用者最新一句話中提取的關鍵字或實體"],
    "userEmotion": "從使用者最新一句話中感知到的主要情緒 (worry/anger/sadness/helpless/neutral)",
    "caseSignificance": "根據案情（金額、影響、是否涉及人身自由）評估案件重要性 (low/medium/high/unknown)。例如，偷飲料是 low，判刑一年是 high。還不確定則填寫 unknown。",
    "action": "你這次回應執行的主要動作，例如 'ask_question', 'mention_fee', 'end_conversation'。"
  },
  "conversationState": "判斷當前對話狀態。如果根據記憶摘要，針對案情的關鍵資訊已基本齊全，或使用者已明確表示沒有更多資訊，則設為 'completed'；否則設為 'collecting'。",
  "response": "你要對使用者說的、溫暖且有引導性的下一句話。"
}

--- 記憶摘要 (你已經知道的資訊) ---
${memoryContext}
---
目前對話階段: ${dialogueStage}
---

你的任務：
1. **根據對話階段行動**：(同上，包含 greeting 和 fee_mention_pending 邏輯)
2. **評估完整度與設定狀態**:
   - 如果 'analysis.caseSignificance'被你評為 **'low'**，並且使用者沒有表現出強烈的委任意願，直接將'conversationState'設為 **'completed'**。
   - 否則，根據資訊完整度判斷。
3. **生成回應**：
   - 如果狀態是 **"collecting"**：正常提問。
   - 如果狀態是 **"completed"** 且 'analysis.caseSignificance'是 **'medium' 或 'high'**：執行標準的結束流程，引導使用者留下聯絡方式。
   - 如果狀態是 **"completed"** 且 'analysis.caseSignificance'是 **'low'**：**執行「出口匝道」劇本**。你的回應應該是：「謝謝您的說明。我理解這件事對您造成了困擾。考量到法律程序的成本，這類情況通常建議您可先向本地的法律扶助基金會或區公所的免費法律諮詢尋求初步意見。如果您在諮詢後仍需委任律師，我們隨時歡迎您回來。」
4. **遵守紅線**：絕對不提供法律建議。
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