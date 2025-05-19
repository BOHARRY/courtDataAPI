// routes/search.js
import express from 'express';
import { searchJudgmentsController, getFiltersController } from '../controllers/search-controller.js';
import { verifyToken } from '../middleware/auth.js';
import { checkAndDeductCredits } from '../middleware/credit.js';
import { CREDIT_COSTS, CREDIT_PURPOSES } from '../config/creditCosts.js'; // <--- 引入成本和用途常數

const router = express.Router();

// 搜尋判決書 (GET /api/search)
// 應用 verifyToken 中間件進行身份驗證
// 應用 checkAndDeductCredits 中間件處理積分 (假設搜尋成本為 1)
// 注意：checkAndDeductCredits 返回的是一個配置好的中間件函數
// 我們將在服務層處理積分邏輯，以利用 Firestore transaction
router.get(
    '/',
    verifyToken,
    checkAndDeductCredits(
        CREDIT_COSTS.SEARCH_JUDGEMENT, // <--- 使用常數
        CREDIT_PURPOSES.SEARCH_JUDGEMENT, // <--- 使用常數
        {
            description: '判例搜尋'
        }
    ),
     searchController.searchCases
);

// 獲取篩選選項資料 (GET /api/search/filters) - 注意路由路徑調整
// 這個路由通常不需要身份驗證或積分檢查，因為它是靜態或聚合數據
router.get('/filters', getFiltersController);

export default router;