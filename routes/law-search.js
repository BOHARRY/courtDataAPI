// routes/law-search.js
import express from 'express';
import { 
    searchLawArticlesController,
    getLawSuggestionsController,
    getLawArticleDetailController,
    searchLawBySemanticController
} from '../controllers/law-search-controller.js';
import { verifyToken } from '../middleware/auth.js';
import { checkAndDeductCredits } from '../middleware/credit.js';
import { CREDIT_COSTS, CREDIT_PURPOSES } from '../config/creditCosts.js';

const router = express.Router();

// 法條精準搜索 (GET /api/law-search/articles)
// 支援條號、法典名稱、關鍵字搜索
router.get(
    '/articles',
    verifyToken,
    checkAndDeductCredits(
        1, // 基礎搜索消耗 1 積分
        'LAW_SEARCH_BASIC',
        { description: '法條基礎搜索' }
    ),
    searchLawArticlesController
);

// 法條語意搜索 (POST /api/law-search/semantic)
// 使用 AI 進行自然語言查詢
router.post(
    '/semantic',
    verifyToken,
    checkAndDeductCredits(
        3, // 語意搜索消耗 3 積分
        'LAW_SEARCH_SEMANTIC',
        { description: '法條語意搜索' }
    ),
    searchLawBySemanticController
);

// 法條詳細內容 (GET /api/law-search/articles/:id)
// 獲取特定法條的完整資訊
router.get(
    '/articles/:id',
    verifyToken,
    getLawArticleDetailController
);

// 法條搜索建議 (GET /api/law-search/suggestions)
// 提供搜索自動完成建議
router.get(
    '/suggestions',
    getLawSuggestionsController // 不需要積分，提供快速建議
);

export default router;
