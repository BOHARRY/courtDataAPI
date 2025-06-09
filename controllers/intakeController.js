// controllers/intakeController.js

import { handleChat } from '../services/intakeService.js';

/**
 * AI 接待聊天室的控制器
 */
async function chatController(req, res, next) {
  try {
    // 從請求的 body 中獲取對話歷史
    const { conversationHistory } = req.body;

    // 基本的輸入驗證
    if (!Array.isArray(conversationHistory) || conversationHistory.length === 0) {
      return res.status(400).json({
        status: 'failed',
        message: '請求格式錯誤，需要提供 conversationHistory 陣列。'
      });
    }

    // 呼叫核心服務來處理對話
    const assistantResponse = await handleChat(conversationHistory);

    // 回傳成功的結果
    res.status(200).json({
      status: 'success',
      response: assistantResponse,
    });

  } catch (error) {
    console.error('Error in chatController:', error);
    // 將錯誤傳遞給 Express 的錯誤處理中介軟體
    next(error);
  }
}

export { chatController };