// controllers/aiAnalysisController.js
import { analyzeSuccessFactors } from '../services/aiSuccessAnalysisService.js';
import { startCommonPointsAnalysis, getAnalysisResult } from '../services/summarizeCommonPointsService.js';
import { startCasePrecedentAnalysis } from '../services/casePrecedentAnalysisService.js';

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

// 修改後的 Controller，現在只負責啟動任務
export const summarizeCommonPointsController = async (req, res, next) => {
    try {
        const { judgementIds } = req.body;
        const userId = req.user.uid;

        if (!judgementIds || !Array.isArray(judgementIds) || judgementIds.length === 0) {
            return res.status(400).json({ message: 'judgementIds 必須是一個包含判決書 ID 的陣列。' });
        }

        const { taskId } = await startCommonPointsAnalysis(judgementIds, userId);
        res.status(202).json({ message: '分析任務已啟動', taskId }); // 202 Accepted
    } catch (error) {
        next(error);
    }
};

// 新增的 Controller，用於查詢結果
export const getAnalysisResultController = async (req, res, next) => {
    try {
        const { taskId } = req.params;
        const userId = req.user.uid;

        if (!taskId) {
            return res.status(400).json({ message: '缺少任務 ID。' });
        }

        const result = await getAnalysisResult(taskId, userId);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};

// 案例判決傾向分析 Controller
export const casePrecedentAnalysisController = async (req, res, next) => {
    try {
        const { caseDescription, courtLevel, caseType, threshold } = req.body;
        const userId = req.user.uid;

        if (!caseDescription || !caseDescription.trim()) {
            return res.status(400).json({ message: '案件描述為必填欄位。' });
        }

        const analysisData = {
            caseDescription: caseDescription.trim(),
            courtLevel: courtLevel || '地方法院',
            caseType: caseType || '民事',
            threshold: threshold || 'medium'
        };

        const { taskId } = await startCasePrecedentAnalysis(analysisData, userId);
        res.status(202).json({ message: '案例判決傾向分析任務已啟動', taskId }); // 202 Accepted
    } catch (error) {
        next(error);
    }
};