// routes/judgment.js
import express from 'express';
// 備註：引入我們新增的控制器函式。
import { getJudgmentByIdController, getJudgmentsByIdsController } from '../controllers/judgment-controller.js';
import { verifyToken } from '../middleware/auth.js'; // 批次獲取需要驗證使用者身份

const router = express.Router();

// 獲取單一判決詳情 (GET /api/judgments/:id)
// 這個保持不變，因為前端在某些情況下（例如從搜尋結果點擊）仍然會用到。
// 為了安全起見，我們也為它加上 Token 驗證。
router.get('/:id', verifyToken, getJudgmentByIdController);

// ===== 新增：批次獲取多個判決詳情的路由 =====
// (POST /api/judgments/batch)
// 備註：我們使用 POST 方法，因為需要透過請求體(body)傳遞 ID 列表。
router.post('/batch', verifyToken, getJudgmentsByIdsController);

export default router;