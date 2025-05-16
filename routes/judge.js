// routes/judge.js
import express from 'express';
import * as judgeController from '../controllers/judgeController.js'; // 稍後會創建此文件
import { verifyToken } from '../middleware/auth.js'; // 引入身份驗證中介軟體

// 假設的點數成本 (可以移到 constants.js 或控制器中定義)
// 注意：AI 分析狀態查詢 (analysis-status) 通常不應該消耗點數

const router = express.Router();

// GET /api/judges/:judgeName - 獲取法官分析數據 (基礎 + 觸發AI)
router.get(
  '/:judgeName',
  verifyToken, // 1. 驗證身份
  judgeController.getJudgeAnalyticsController // 3. 控制器處理
);

// GET /api/judges/:judgeName/analysis-status - 查詢 AI 分析狀態
router.get(
  '/:judgeName/analysis-status',
  verifyToken, // 驗證身份 (通常狀態查詢也需要登入)
  judgeController.getAIAnalysisStatusController
);

// POST /api/judges/:judgeName/reanalyze - 觸發重新分析
router.post(
  '/:judgeName/reanalyze',
  verifyToken,
  judgeController.triggerReanalysisController
);

export default router;