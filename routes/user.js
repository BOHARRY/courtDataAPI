// routes/user.js
import express from 'express';
import { getLawyerSearchHistoryController } from '../controllers/user-controller.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// 獲取律師搜尋歷史 (GET /api/users/lawyer-search-history)
router.get('/lawyer-search-history', verifyToken, getLawyerSearchHistoryController);

// 未來可以添加其他用戶相關路由，例如獲取用戶資料、更新用戶資料等
// router.get('/profile', verifyToken, getUserProfileController);

export default router;