// Boooook/routes/platformStatusRoutes.js
import express from 'express';
import { verifyToken } from '../middleware/auth.js';
// 我們需要一個 verifyAdmin 中間件
import { verifyAdmin } from '../middleware/adminAuth.js'; // 假設您會創建這個
import { updateDatabaseStatsController, getDatabaseStatsController } from '../controllers/platformStatusController.js';

const router = express.Router();

// 更新資料庫統計資訊 (管理員)
router.put(
  '/database-stats', // <--- 這裡定義的是相對於 '/platform-status' 的路徑
  verifyToken,
  verifyAdmin,
  updateDatabaseStatsController
);

// 獲取資料庫統計資訊 (公開或登入用戶)
router.get(
  '/database-stats',
  verifyToken, // 如果希望登入用戶才能看，就加上 verifyToken
  getDatabaseStatsController
);

export default router;