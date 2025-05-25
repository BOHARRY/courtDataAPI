// routes/user.js
import express from 'express';
import {
    getLawyerSearchHistoryController,
    getCreditTransactionHistoryController,
    updateUserSubscriptionController,
    getAiAnalysisHistoryController
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

// 未來可以添加其他用戶相關路由，例如獲取用戶資料、更新用戶資料等
// router.get('/profile', verifyToken, getUserProfileController);

export default router;