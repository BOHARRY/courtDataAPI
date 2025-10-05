// routes/maintenanceRoutes.js
import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { verifyAdmin } from '../middleware/adminAuth.js';
import { 
  getMaintenanceStatusController, 
  updateMaintenanceStatusController 
} from '../controllers/maintenanceController.js';

const router = express.Router();

// 獲取維護模式狀態（公開，任何人都可以查詢）
router.get(
  '/maintenance',
  getMaintenanceStatusController
);

// 更新維護模式狀態（僅管理員）
router.put(
  '/maintenance',
  verifyToken,
  verifyAdmin,
  updateMaintenanceStatusController
);

export default router;

