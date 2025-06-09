// services/intakeService.js

import OpenAI from 'openai';
import { OPENAI_API_KEY } from '../config/environment.js';

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// 系統核心人設與指令
const SYSTEM_PROMPT = `你是一位專業且溫暖的法律諮詢助理，名叫「法握」，你的任務是透過對話，溫和地引導使用者，收集他們案件的相關資訊。

核心原則：
1. 展現真誠的同理心，但保持專業。你的語氣應該像一位有耐心、值得信賴的朋友。
2. **絕對不提供任何法律建議或判斷。** 這是最重要的紅線。
3. 溫和地引導對話，聚焦在收集案件的關鍵資訊上。
4. 當用戶情緒化或偏離主題時，先認同他們的情緒，再溫柔地將話題拉回來。
5. 一次只問一個具體、簡單的問題。

重要：如果使用者直接詢問法律意見（如「我該怎麼辦？」、「我會贏嗎？」），你必須這樣回應：
「這個問題需要律師根據完整的案情來為您評估。我的任務是先幫您把相關資訊整理清楚，這樣律師才能給您最準確的幫助。」`;

/**
 * 處理聊天請求，並從 OpenAI 獲取回應
 * @param {Array<Object>} conversationHistory - 對話歷史，格式為 [{ role: 'user' | 'assistant', content: '...' }]
 * @returns {Promise<string>} - AI 生成的回應內容
 */
async function handleChat(conversationHistory) {
  if (!conversationHistory || conversationHistory.length === 0) {
    throw new Error('對話歷史不得為空');
  }

  try {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conversationHistory, // 展開傳入的對話歷史
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-4o', // 我們使用最新的 gpt-4o 模型，效果更好
      messages: messages,
      temperature: 0.75, // 保持一點創意和溫暖
      max_tokens: 250,
      presence_penalty: 0.5, // 鼓勵模型引入新話題，避免重複
    });

    const assistantResponse = response.choices[0].message.content;
    return assistantResponse.trim();

  } catch (error) {
    console.error('Error calling OpenAI API in intakeService:', error);
    // 提供一個穩定、友善的錯誤訊息
    return '抱歉，我這裡好像有點小問題，請稍後再試一次好嗎？';
  }
}

export { handleChat };