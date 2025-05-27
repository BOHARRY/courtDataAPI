// Boooook/routes/platformStatusRoutes.js
import express from 'express';
import { verifyToken } from '../middleware/auth.js';
// 我們需要一個 verifyAdmin 中間件
import { verifyAdmin } from '../middleware/adminAuth.js'; // 假設您會創建這個
import { updateDatabaseStatsController, getDatabaseStatsController } from '../controllers/platformStatusController.js';

const router = express.Router();

// 更新資料庫統計資訊 (管理員)
router.put(
  '/database-stats',
  verifyToken,
  verifyAdmin, // <--- 使用佔位符，之後替換為真實的 verifyAdmin
  updateDatabaseStatsController
);

// 獲取資料庫統計資訊 (公開或登入用戶)
router.get(
  '/database-stats',
  verifyToken, // 如果希望登入用戶才能看，就加上 verifyToken
  getDatabaseStatsController
);

export default router;