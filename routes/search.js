// routes/search.js
import express from 'express';
import * as searchController from '../controllers/search-controller.js'; // 保持星號導入
import { verifyToken } from '../middleware/auth.js';
import { checkAndDeductCredits } from '../middleware/credit.js';
import { CREDIT_COSTS, CREDIT_PURPOSES } from '../config/creditCosts.js';

const router = express.Router();

// 搜尋判決書 (GET /api/search)
router.get(
    '/',
    verifyToken,
    checkAndDeductCredits(
        CREDIT_COSTS.SEARCH_JUDGEMENT,
        CREDIT_PURPOSES.SEARCH_JUDGEMENT,
        { description: '判例搜尋' }
    ),
    searchController.searchJudgmentsController // 使用 searchController. 來訪問
);

// 獲取篩選選項資料 (GET /api/search/filters)
router.get(
    '/filters',
    searchController.getFiltersController // <--- 修正：使用 searchController.getFiltersController
);

export default router;