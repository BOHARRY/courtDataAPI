// routes/judgment.js
import express from 'express';
import { getJudgmentByIdController } from '../controllers/judgment-controller.js';
// import { verifyToken } from '../middleware/auth.js'; // 獲取單一判決詳情通常不需要驗證或積分

const router = express.Router();

// 獲取單一判決詳情 (GET /api/judgments/:id)
// 通常這個操作是公開的，或者有不同的權限控制，暫時不加 verifyToken 和積分檢查
router.get('/:id', getJudgmentByIdController);

export default router;