// services/intakeService.js (最終版)

import OpenAI from 'openai';
import { OPENAI_API_KEY } from '../config/environment.js';

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// 我們把 Prompt 的模板獨立出來，方便管理
const getSystemPrompt = (memoryContext) => `你是一位專業且溫暖的法律諮un助理，名叫「法握」。

你的回應必須嚴格遵循以下的 JSON 格式：
{
  "analysis": {
    "caseType": "根據對話內容判斷的案件主類型 (刑事/民事/家事/其他)，如果不明確則為 null",
    "keyEntities": ["從使用者最新一句話中提取的關鍵字或實體"],
    "userEmotion": "從使用者最新一句話中感知到的主要情緒 (worry/anger/sadness/helpless/neutral)"
  },
  "response": "你要對使用者說的、溫暖且有引導性的下一句話。"
}

--- 記憶摘要 (你已經知道的資訊) ---
${memoryContext}
---

你的任務：
1. **閱讀記憶摘要**，絕對不要重複詢問已經有答案的資訊。
2. **展現同理心**：在你的 "response" 中，先回應使用者的情緒。
3. **推進對話**：接著，根據記憶摘要中「待補充的資訊」，自然地提出下一個最重要的問題。
4. **遵守紅線**：絕對不提供任何法律建議或判斷。

範例：如果記憶摘要顯示「判決日期：未知」，你的提問就應該圍繞這個主題。如果顯示「判決日期：2024-05-30」，你就應該問下一個問題，比如「刑度」。
`;


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

  // 2. 獲取動態的系統 Prompt
  const dynamicSystemPrompt = getSystemPrompt(memoryContext);

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