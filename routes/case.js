// routes/case.js
import express from 'express';
import { getCaseListDetailsController } from '../controllers/case-controller.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

/**
 * 獲取案例列表詳情
 * POST /api/cases/list-details
 * 
 * 請求體格式:
 * {
 *   "caseIds": ["case1", "case2", ...]
 * }
 * 
 * 響應格式:
 * {
 *   "success": true,
 *   "data": {
 *     "case1": { JID, JTITLE, court, ... },
 *     "case2": { JID, JTITLE, court, ... }
 *   },
 *   "metadata": {
 *     "totalRequested": 2,
 *     "totalFound": 2,
 *     "notFound": 0,
 *     "requestedAt": "2024-01-01T00:00:00.000Z"
 *   }
 * }
 */
router.post('/list-details', verifyToken, getCaseListDetailsController);

export default router;
