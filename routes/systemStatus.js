// routes/systemStatus.js
/**
 * 系統狀況路由
 */

import express from 'express';
import { getSystemStatusController } from '../controllers/systemStatus-controller.js';
import { verifyToken } from '../middleware/auth.js';
import { verifyAdmin } from '../middleware/adminAuth.js';

const router = express.Router();

/**
 * GET /api/admin/system-status
 * 獲取系統狀況（僅管理員）
 */
router.get('/system-status', verifyToken, verifyAdmin, getSystemStatusController);

export default router;

