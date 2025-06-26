// controllers/aiAnalysisController.js
import { analyzeSuccessFactors } from '../services/aiSuccessAnalysisService.js';
import { startCommonPointsAnalysis, getAnalysisResult } from '../services/summarizeCommonPointsService.js';

// 現有的 Controller
export const analyzeSuccessFactorsController = async (req, res, next) => {
    try {
        const { caseType, caseSummary } = req.body;
        const userId = req.user.uid;

        if (!caseType || !caseSummary) {
            return res.status(400).json({ message: '案件類型和案情摘要為必填欄位。' });
        }

        const result = await analyzeSuccessFactors(userId, caseType, caseSummary);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};

// 新增的 Controller
export const summarizeCommonPointsController = async (req, res, next) => {
    try {
        const { judgementIds } = req.body;

        if (!judgementIds || !Array.isArray(judgementIds) || judgementIds.length === 0) {
            return res.status(400).json({ message: 'judgementIds 必須是一個包含判決書 ID 的陣列。' });
        }

        const result = await summarizeCommonPoints(judgementIds);
        res.status(200).json(result);
    } catch (error) {
        // next(error) 會將錯誤傳遞給 express 的錯誤處理中介軟體
        next(error);
    }
};