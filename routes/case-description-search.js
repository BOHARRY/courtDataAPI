// routes/case-description-search.js
import express from 'express';
import { performCaseDescriptionSearchController } from '../controllers/case-description-search-controller.js';
import { verifyToken } from '../middleware/auth.js';
import { checkAndDeductCredits } from '../middleware/credit.js';
import { CREDIT_PURPOSES } from '../config/creditCosts.js';

const router = express.Router();

// 定義案由搜尋的用途
const CASE_DESCRIPTION_SEARCH_PURPOSE = CREDIT_PURPOSES.CASE_DESCRIPTION_SEARCH || 'CASE_DESCRIPTION_SEARCH';

// 執行案由搜尋（POST /api/case-description-search）
// 消耗 5 積分
router.post(
    '/', 
    verifyToken, 
    checkAndDeductCredits(
        5, 
        CASE_DESCRIPTION_SEARCH_PURPOSE,
        { description: '案由搜尋' }
    ),
    performCaseDescriptionSearchController
);

export default router;

