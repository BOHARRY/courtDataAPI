// controllers/intakeController.js (升級版)

import { handleChat } from '../services/intakeService.js';

async function chatController(req, res, next) {
  try {
    // 這次我們從 request body 接收對話歷史和「目前的案件資訊」
    const { conversationHistory, caseInfo } = req.body;

    if (!Array.isArray(conversationHistory) || conversationHistory.length === 0) {
      return res.status(400).json({
        status: 'failed',
        message: '請求格式錯誤，需要提供 conversationHistory 陣列。'
      });
    }

    // 呼叫我們的核心服務
    const structuredResponse = await handleChat(conversationHistory);

    // --- 記憶功能的雛形 ---
    // 在這裡，我們可以根據 structuredResponse.analysis 來更新 caseInfo
    // 為了今天能快速看到效果，我們先簡單地將分析結果直接回傳
    const updatedCaseInfo = {
        ...caseInfo, // 保留舊的資訊
        lastAnalysis: structuredResponse.analysis, // 存入最新的分析
        // 簡易更新案件類型
        caseType: (caseInfo && caseInfo.caseType) ? caseInfo.caseType : structuredResponse.analysis.caseType,
    };
    // ----------------------

    // 回傳 AI 的回覆，以及更新後的案件資訊
    res.status(200).json({
      status: 'success',
      response: structuredResponse.response, // 這是要顯示給用戶的句子
      updatedCaseInfo: updatedCaseInfo, // 這是更新後的記憶，前端下次請求要再傳回來
      rawAnalysis: structuredResponse.analysis, // 也可以選擇傳回原始分析供前端除錯
    });

  } catch (error) {
    console.error('Error in chatController:', error);
    next(error);
  }
}

export { chatController };