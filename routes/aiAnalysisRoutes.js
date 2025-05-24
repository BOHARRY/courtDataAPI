// routes/aiAnalysisRoutes.js
import express from 'express';
import { analyzeSuccessFactorsController } from '../controllers/aiAnalysisController.js'; // 等下會創建
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
            // relatedIdKey: 'body.case_summary_text' // 考慮是否需要記錄關聯ID，例如摘要的前幾個字
        }
    ),
    analyzeSuccessFactorsController
);

export default router;