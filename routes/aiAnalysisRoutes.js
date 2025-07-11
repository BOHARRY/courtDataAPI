// routes/aiAnalysisRoutes.js
import express from 'express';
import { analyzeSuccessFactorsController, summarizeCommonPointsController, getAnalysisResultController, casePrecedentAnalysisController, mainstreamAnalysisController, citationAnalysisController, writingAssistantController, cancelCitationAnalysisController } from '../controllers/aiAnalysisController.js';
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

// POST /api/ai/case-precedent-analysis
router.post(
    '/case-precedent-analysis',
    verifyToken,
    checkAndDeductCredits(
        CREDIT_COSTS.CASE_PRECEDENT_ANALYSIS,
        CREDIT_PURPOSES.CASE_PRECEDENT_ANALYSIS,
        {
            description: '案例判決傾向分析',
        }
    ),
    casePrecedentAnalysisController
);

// POST /api/ai/mainstream-analysis
router.post(
    '/mainstream-analysis',
    verifyToken,
    checkAndDeductCredits(
        CREDIT_COSTS.SUMMARIZE_COMMON_POINTS, // 使用相同的點數成本
        CREDIT_PURPOSES.SUMMARIZE_COMMON_POINTS,
        {
            description: '歸納主流判決',
        }
    ),
    mainstreamAnalysisController
);

// POST /api/ai/citation-analysis
router.post(
    '/citation-analysis',
    verifyToken,
    checkAndDeductCredits(
        CREDIT_COSTS.CASE_PRECEDENT_ANALYSIS, // 使用相同的點數成本
        CREDIT_PURPOSES.CASE_PRECEDENT_ANALYSIS,
        {
            requiresActiveSubscription: true
        }
    ),
    citationAnalysisController
);

// GET /api/ai/analysis-result/:taskId
router.get(
    '/analysis-result/:taskId',
    verifyToken,
    getAnalysisResultController
);

// 🆕 POST /api/ai/writing-assistant
router.post(
    '/writing-assistant',
    verifyToken,
    checkAndDeductCredits(
        CREDIT_COSTS.CASE_PRECEDENT_ANALYSIS, // 使用相同的點數成本
        CREDIT_PURPOSES.CASE_PRECEDENT_ANALYSIS,
        {
            description: 'AI書狀寫作助手',
            requiresActiveSubscription: true
        }
    ),
    writingAssistantController
);

// 🆕 DELETE /api/ai/citation-analysis/:taskId - 中止援引分析任務
router.delete(
    '/citation-analysis/:taskId',
    verifyToken,
    cancelCitationAnalysisController
);

export default router;