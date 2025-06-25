// routes/semantic-search.js
import express from 'express';
import { 
    performSemanticSearchController,
    getIssueSuggestionsController 
} from '../controllers/semantic-search-controller.js';
import { verifyToken } from '../middleware/auth.js';
import { checkAndDeductCredits } from '../middleware/credit.js';
import { CREDIT_PURPOSES } from '../config/creditCosts.js';

const router = express.Router();

// 定義語意搜尋的用途（如果 CREDIT_PURPOSES 中沒有定義，使用預設值）
const SEMANTIC_SEARCH_PURPOSE = CREDIT_PURPOSES.SEMANTIC_SEARCH || 'SEMANTIC_SEARCH';

// 執行語意搜尋（POST /api/semantic-search/legal-issues）
// 消耗 3 積分
router.post(
    '/legal-issues', 
    verifyToken, 
    checkAndDeductCredits(
        3, 
        SEMANTIC_SEARCH_PURPOSE,
        { description: '語意搜尋判決爭點' }
    ),
    performSemanticSearchController
);

// 獲取爭點建議（GET /api/semantic-search/suggestions）
// 不消耗積分
router.get(
    '/suggestions',
    verifyToken,
    getIssueSuggestionsController
);

export default router;

// === 請在 routes/index.js 新增以下內容 ===
// import semanticSearchRoutes from './semantic-search.js';
// router.use('/semantic-search', semanticSearchRoutes);