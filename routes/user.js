// routes/user.js
import express from 'express';
import {
    getLawyerSearchHistoryController,
    getCreditTransactionHistoryController,
    updateUserSubscriptionController,
    getAiAnalysisHistoryController,
    cancelPendingDowngradeController,
    getUserSubscriptionStatusController,
    recordSignupBonusController,
    claimOnboardingTasksRewardController // 🎁 新手任務獎勵
} from '../controllers/user-controller.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// 獲取律師搜尋歷史 (GET /api/users/lawyer-search-history)
router.get('/lawyer-search-history', verifyToken, getLawyerSearchHistoryController);

// 新增：獲取積分變動歷史 (GET /api/users/credit-history)
router.get('/credit-history', verifyToken, getCreditTransactionHistoryController);


// 更新訂閱方案 (POST /api/users/update-subscription)
router.post('/update-subscription', verifyToken, updateUserSubscriptionController);

// 新增：獲取 AI 勝訴案由分析歷史 (GET /api/users/ai-analysis-history)
router.get('/ai-analysis-history', verifyToken, getAiAnalysisHistoryController);

// 新增：獲取訂閱狀態詳細資訊 (GET /api/users/subscription-status)
router.get('/subscription-status', verifyToken, getUserSubscriptionStatusController);

// 新增：取消待降級請求 (POST /api/users/cancel-downgrade)
router.post('/cancel-downgrade', verifyToken, cancelPendingDowngradeController);

// 🆕 新增：領取註冊獎勵積分 (POST /api/users/signup-bonus)
router.post('/signup-bonus', verifyToken, recordSignupBonusController);

// 🎁 新增：領取新手任務完成獎勵 (POST /api/users/claim-onboarding-reward)
router.post('/claim-onboarding-reward', verifyToken, claimOnboardingTasksRewardController);

// 未來可以添加其他用戶相關路由，例如獲取用戶資料、更新用戶資料等
// router.get('/profile', verifyToken, getUserProfileController);

export default router;