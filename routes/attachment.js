// routes/attachment.js
/**
 * 附表解析路由
 * 提供判決書附表的 AI 解析功能
 */

import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { parseAttachmentStreamController } from '../controllers/attachment-controller.js';

const router = express.Router();

/**
 * POST /api/attachment/parse-stream
 * 解析判決書附表（SSE 實時推送）
 * 
 * Request Body:
 * {
 *   "judgment_id": "KSDV,114,訴,739,20250728,2",
 *   "attachment_text": "附表一：\n編號 借款時間...",
 *   "attachment_title": "附表一"
 * }
 * 
 * Response (SSE):
 * data: {"type":"connected"}
 * data: {"type":"progress","message":"檢查快取..."}
 * data: {"type":"complete","result":{...}}
 */
router.post('/parse-stream', verifyToken, parseAttachmentStreamController);

export default router;

