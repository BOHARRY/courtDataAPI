// controllers/judgment-controller.js
import * as judgmentService from '../services/judgment.js'; // 引入判決書服務

export async function getJudgmentByIdController(req, res, next) {
  const judgmentId = req.params.id;

  if (!judgmentId) {
    return res.status(400).json({ error: 'Bad Request', message: 'Judgment ID is required.' });
  }

  try {
    const judgmentData = await judgmentService.getJudgmentDetails(judgmentId);
    if (!judgmentData) {
      // 如果服務層在找不到時返回 null 或 undefined
      return res.status(404).json({ error: 'Not Found', message: `Judgment with ID ${judgmentId} not found.` });
    }
    res.status(200).json(judgmentData);
  } catch (error) {
    // console.error(`[Get Judgment Controller Error] ID: ${judgmentId}:`, error);
    // 如果服務層在 ES 查詢失敗時拋出錯誤，這裡會捕獲
    // 讓全局錯誤處理器處理
    next(error);
  }
}