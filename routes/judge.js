// routes/judge.js
import express from 'express';
import * as judgeController from '../controllers/judgeController.js';
import { verifyToken } from '../middleware/auth.js';
import { checkAndDeductCredits } from '../middleware/credit.js'; // <--- 引入積分中介
import { CREDIT_COSTS, CREDIT_PURPOSES } from '../config/creditCosts.js'; // <--- 引入成本和用途常數

const router = express.Router();

// GET /api/judges/:judgeName - 獲取法官分析數據 (基礎 + 觸發AI)
router.get(
  '/:judgeName',
  verifyToken, // 1. 驗證身份
  checkAndDeductCredits( // 2. 檢查並扣除積分
      CREDIT_COSTS.JUDGE_AI_ANALYTICS,
      CREDIT_PURPOSES.JUDGE_AI_ANALYTICS,
      {
          description: '查詢法官分析數據與觸發AI分析',
          relatedIdKey: 'params.judgeName' // 從 req.params.judgeName 獲取法官名
      }
  ),
  judgeController.getJudgeAnalyticsController // 3. 控制器處理 (不再處理積分)
);

// GET /api/judges/:judgeName/analysis-status - 查詢 AI 分析狀態
// 通常不消耗點數
router.get(
  '/:judgeName/analysis-status',
  verifyToken,
  judgeController.getAIAnalysisStatusController
);

// POST /api/judges/:judgeName/reanalyze - 觸發重新分析
// 根據您的業務邏輯，此操作可能免費或有不同成本。目前假設免費。
// 如果需要計費，也應掛載 checkAndDeductCredits。
router.post(
  '/:judgeName/reanalyze',
  verifyToken,
  judgeController.triggerReanalysisController
);

export default router;