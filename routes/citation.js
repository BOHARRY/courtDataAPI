// routes/citation.js
import express from 'express';
import { handleCitationQuery, handleCitationQueryStream } from '../controllers/citation-controller.js';

const router = express.Router();

/**
 * POST /api/citation/query
 * 查詢引用判決（傳統方式）
 *
 * 需要身份驗證（verifyToken middleware 在 index.js 中統一添加）
 */
router.post('/query', handleCitationQuery);

/**
 * POST /api/citation/query-stream
 * 查詢引用判決（SSE 實時推送）
 *
 * 需要身份驗證（verifyToken middleware 在 index.js 中統一添加）
 */
router.post('/query-stream', handleCitationQueryStream);

export default router;

