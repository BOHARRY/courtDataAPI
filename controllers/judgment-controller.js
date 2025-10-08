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

/**
 * 根據 ID 陣列批次獲取判決書的控制器。
 */
export async function getJudgmentsByIdsController(req, res, next) {
  // 備註：這是處理 POST /batch 請求的控制器。
  const { ids } = req.body;

  // 驗證輸入
  if (!ids || !Array.isArray(ids)) {
    return res.status(400).json({ error: 'Bad Request', message: 'Request body must contain an "ids" array.' });
  }

  if (ids.length === 0) {
    return res.status(200).json({}); // 如果請求空陣列，直接返回空物件。
  }
  
  // 增加一個合理的請求數量上限，防止濫用。
  if (ids.length > 100) { 
    return res.status(400).json({ error: 'Bad Request', message: 'The number of IDs per batch request cannot exceed 100.' });
  }

  try {
    const judgmentsData = await judgmentService.getJudgmentsByIds(ids);
    // 備註：服務層返回的直接就是我們需要的 {id: doc} 格式。
    res.status(200).json(judgmentsData);
  } catch (error) {
    // 將錯誤傳遞給全局錯誤處理器。
    next(error);
  }
}

/**
 * 獲取案件詳情（用於律師表現浮動視窗）
 */
export async function getCaseDetailController(req, res, next) {
  const caseId = req.params.id;

  if (!caseId) {
    return res.status(400).json({ error: 'Bad Request', message: 'Case ID is required.' });
  }

  try {
    const caseData = await judgmentService.getCaseDetail(caseId);
    if (!caseData) {
      return res.status(404).json({ error: 'Not Found', message: `Case with ID ${caseId} not found.` });
    }
    res.status(200).json(caseData);
  } catch (error) {
    next(error);
  }
}