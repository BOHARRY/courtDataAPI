// controllers/judgeController.js
import * as judgeService from '../services/judgeService.js';

export async function getJudgeAnalyticsController(req, res, next) {
  // userId 已經由 verifyToken (和即將加入的 checkAndDeductCredits) 處理
  const userId = req.user?.uid;
  const judgeName = req.params.judgeName;

  if (!judgeName) {
    return res.status(400).json({ error: 'Bad Request', message: 'Judge name is required.' });
  }

  // console.log(`[Judge Controller - Analytics] User: ${req.user.uid} requesting analytics for judge: ${judgeName}`);

  try {
    // 積分已由路由層的 checkAndDeductCredits 中介軟體處理
    const result = await judgeService.getJudgeAnalytics(judgeName, userId);

    // judgeService 返回的結果結構是 { status: "complete" | "partial", data: object }
    // status 用於前端判斷是否需要輪詢 AI 狀態
    if (result && result.data) {
      res.status(200).json(result); // 直接將服務層返回的完整結果傳給前端
    } else {
      // 這種情況理論上不應發生，因為 judgeService 會處理錯誤或無數據的情況
      console.error(`[Judge Controller - Analytics] Unexpected empty result from judgeService for judge: ${judgeName}`);
      const err = new Error('Internal server error while fetching judge analytics.');
      err.statusCode = 500;
      next(err);
    }
  } catch (error) {
    // console.error(`[Judge Controller - Analytics Error] Judge: ${judgeName}, Error:`, error.message);
    // 這裡的錯誤主要是 judgeService 可能拋出的錯誤
    next(error); // 交給全局錯誤處理器
  }
}

export async function getAIAnalysisStatusController(req, res, next) {
  const judgeName = req.params.judgeName;
  // console.log(`[Judge Controller - AI Status] Requesting AI status for judge: ${judgeName}`);
  try {
    const statusData = await judgeService.getAIAnalysisStatus(judgeName);
    res.status(200).json(statusData);
  } catch (error) {
    // console.error(`[Judge Controller - AI Status Error] Judge: ${judgeName}, Error:`, error.message);
    next(error);
  }
}

export async function triggerReanalysisController(req, res, next) {
  const judgeName = req.params.judgeName;
  // console.log(`[Judge Controller - Reanalyze] Triggering reanalysis for judge: ${judgeName}`);
  try {
    // 注意：如果重新分析本身也需要一個較低的成本（例如1點），
    // 則此路由也需要掛載 checkAndDeductCredits 中介軟體
    // 目前假設重新分析觸發本身不直接扣點（AI分析過程消耗的資源可能已包含在訂閱或更高層級服務中）
    const result = await judgeService.triggerReanalysis(judgeName);
    res.status(200).json(result); // 例如 { status: "initiated", message: "重新分析已啟動" }
  } catch (error) {
    // console.error(`[Judge Controller - Reanalyze Error] Judge: ${judgeName}, Error:`, error.message);
    next(error);
  }
}