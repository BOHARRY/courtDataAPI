// routes/aiAnalysisRoutes.js
import express from 'express';
import { analyzeSuccessFactorsController, summarizeCommonPointsController } from '../controllers/aiAnalysisController.js';
import { verifyToken } from '../middleware/auth.js';
import { checkAndDeductCredits } from '../middleware/credit.js';
import { CREDIT_COSTS, CREDIT_PURPOSES } from '../config/creditCosts.js';

const router = express.Router();

// POST /api/ai/success-analysis
router.post(
    '/success-analysis',
    verifyToken,
    checkAndDeductCredits(
        CREDIT_COSTS.AI_SUCCESS_ANALYSIS,
        CREDIT_PURPOSES.AI_SUCCESS_ANALYSIS,
        {
            description: 'AI勝訴案由分析',
        }
    ),
    analyzeSuccessFactorsController
);

// POST /api/ai/summarize-common-points
router.post(
    '/summarize-common-points',
    verifyToken,
    checkAndDeductCredits(
        CREDIT_COSTS.SUMMARIZE_COMMON_POINTS,
        CREDIT_PURPOSES.SUMMARIZE_COMMON_POINTS,
        {
            description: '(圖板) AI歸納判例共同點',
        }
    ),
    summarizeCommonPointsController
);

export default router;