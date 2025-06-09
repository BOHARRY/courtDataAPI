// services/intakeService.js (升級版)

import OpenAI from 'openai';
import { OPENAI_API_KEY } from '../config/environment.js';

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// 升級版系統核心人設與指令
const SYSTEM_PROMPT = `你是一位專業且溫暖的法律諮詢助理，名叫「法握」。你的任務是透過對話，溫和地引導使用者，收集案件資訊。

你的回應必須嚴格遵循以下的 JSON 格式：
{
  "analysis": {
    "caseType": "根據對話內容判斷的案件主類型 (刑事/民事/家事/其他)，如果不明確則為 null",
    "keyEntities": ["從使用者最新一句話中提取的關鍵字或實體，例如人名、時間、地點、金額等"],
    "userEmotion": "從使用者最新一句話中感知到的主要情緒 (worry/anger/sadness/helpless/neutral)，如果不明確則為 neutral",
    "nextQuestionSuggestion": "根據現有資訊，你建議下一步問什麼問題來推進資訊收集"
  },
  "response": "你要對使用者說的、溫暖且有引導性的下一句話。"
}

核心原則：
1. **response** 欄位必須展現真誠的同理心，但保持專業。
2. **絕對不提供任何法律建議或判斷。**
3. 溫和地引導對話，聚焦在收集案件的關鍵資訊上。
4. 如果使用者直接詢問法律意見（如「我該怎麼辦？」），你的 response 必須是：「這個問題需要律師根據完整的案情來為您評估。我的任務是先幫您把相關資訊整理清楚，這樣律師才能給您最準確的幫助。」
`;

/**
 * 處理聊天請求，並從 OpenAI 獲取結構化的回應
 * @param {Array<Object>} conversationHistory - 對話歷史
 * @returns {Promise<Object>} - AI 生成的結構化回應 { analysis: {...}, response: "..." }
 */
async function handleChat(conversationHistory) {
  if (!conversationHistory || conversationHistory.length === 0) {
    throw new Error('對話歷史不得為空');
  }

  try {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conversationHistory,
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-4.1',
      messages: messages,
      // 要求 OpenAI 回傳 JSON 格式
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 500, // 稍微增加 token 數量以容納 JSON 結構
    });

    const assistantResponseJson = response.choices[0].message.content;
    
    // 解析 AI 回傳的 JSON 字串
    const structuredResponse = JSON.parse(assistantResponseJson);
    return structuredResponse;

  } catch (error) {
    console.error('Error in intakeService:', error);
    // 如果出錯，也回傳一個符合結構的錯誤訊息
    return {
      analysis: { error: "API or parsing failed" },
      response: '抱歉，我這裡好像有點小問題，請稍後再試一次好嗎？'
    };
  }
}

export { handleChat };