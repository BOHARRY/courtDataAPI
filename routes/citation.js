// routes/citation.js
import express from 'express';
import { handleCitationQuery } from '../controllers/citation-controller.js';

const router = express.Router();

/**
 * POST /api/citation/query
 * 查詢引用判決
 * 
 * 需要身份驗證（verifyToken middleware 在 index.js 中統一添加）
 */
router.post('/query', handleCitationQuery);

export default router;

