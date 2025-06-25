// routes/semantic-search.js
import express from 'express';
import { 
    performSemanticSearchController,
    getIssueSuggestionsController 
} from '../controllers/semantic-search-controller.js';
import { verifyToken } from '../middleware/auth.js';
import { checkCredits } from '../middleware/credits.js';

const router = express.Router();

// 執行語意搜尋（POST /api/semantic-search/legal-issues）
// 消耗 3 積分
router.post(
    '/legal-issues', 
    verifyToken, 
    checkCredits(3),  // 語意搜尋消耗 3 積分
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