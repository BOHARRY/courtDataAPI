// routes/user.js
import express from 'express';
import {
    getLawyerSearchHistoryController,
    getCreditTransactionHistoryController // <--- 引入新的控制器
} from '../controllers/user-controller.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// 獲取律師搜尋歷史 (GET /api/users/lawyer-search-history)
router.get('/lawyer-search-history', verifyToken, getLawyerSearchHistoryController);

// 新增：獲取積分變動歷史 (GET /api/users/credit-history)
router.get('/credit-history', verifyToken, getCreditTransactionHistoryController);


// 未來可以添加其他用戶相關路由，例如獲取用戶資料、更新用戶資料等
// router.get('/profile', verifyToken, getUserProfileController);

export default router;