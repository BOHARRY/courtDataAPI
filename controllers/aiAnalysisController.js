// controllers/aiAnalysisController.js
import { analyzeSuccessFactors } from '../services/aiSuccessAnalysisService.js';
import { startCommonPointsAnalysis, getAnalysisResult } from '../services/summarizeCommonPointsService.js';
import { startCasePrecedentAnalysis, startMainstreamAnalysis } from '../services/casePrecedentAnalysisService.js';
import { startCitationAnalysis, cancelCitationAnalysisTask } from '../services/citationAnalysisService.js';
import { startWritingAssistantTask } from '../services/writingAssistantService.js';

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
        const { caseDescription, courtLevel, caseType, threshold, position } = req.body;
        const userId = req.user.uid;

        if (!caseDescription || !caseDescription.trim()) {
            return res.status(400).json({ message: '案件描述為必填欄位。' });
        }

        const analysisData = {
            caseDescription: caseDescription.trim(),
            courtLevel: courtLevel || '地方法院',
            caseType: caseType || '民事',
            threshold: threshold || 'medium',
            position: position || 'neutral' // 🆕 新增立場參數，預設為中性分析
        };

        const { taskId } = await startCasePrecedentAnalysis(analysisData, userId);
        res.status(202).json({ message: '案例判決傾向分析任務已啟動', taskId }); // 202 Accepted
    } catch (error) {
        next(error);
    }
};

// 🆕 援引判例分析控制器
export const citationAnalysisController = async (req, res, next) => {
    try {
        const { originalTaskId } = req.body;
        const userId = req.user.uid;

        if (!originalTaskId || !originalTaskId.trim()) {
            return res.status(400).json({ message: '原始分析任務ID為必填欄位。' });
        }

        const { taskId } = await startCitationAnalysis(originalTaskId, userId);
        res.status(202).json({ message: '援引判例分析任務已啟動', taskId });
    } catch (error) {
        next(error);
    }
};

// 歸納主流判決 Controller
export const mainstreamAnalysisController = async (req, res, next) => {
    try {
        const { originalTaskId } = req.body;
        const userId = req.user.uid;

        if (!originalTaskId || !originalTaskId.trim()) {
            return res.status(400).json({ message: '原始分析任務ID為必填欄位。' });
        }

        const { taskId } = await startMainstreamAnalysis(originalTaskId.trim(), userId);
        res.status(202).json({ message: '歸納主流判決任務已啟動', taskId }); // 202 Accepted
    } catch (error) {
        next(error);
    }
};

// 🆕 書狀寫作助手控制器
export const writingAssistantController = async (req, res, next) => {
    try {
        const { citationData, position, caseDescription } = req.body;
        const userId = req.user.uid;

        // 驗證必要參數
        if (!citationData || !citationData.citation) {
            return res.status(400).json({
                error: '缺少援引判例數據',
                details: 'citationData.citation 是必要參數'
            });
        }

        if (!position) {
            return res.status(400).json({
                error: '缺少立場參數',
                details: 'position 是必要參數'
            });
        }

        console.log(`[WritingAssistantController] 用戶 ${userId} 啟動書狀生成任務`);
        console.log(`[WritingAssistantController] 援引: ${citationData.citation}`);
        console.log(`[WritingAssistantController] 立場: ${position}`);

        const { taskId } = await startWritingAssistantTask(
            citationData,
            position,
            caseDescription || '',
            userId
        );

        res.status(202).json({
            message: '書狀範例生成任務已啟動',
            taskId
        });

    } catch (error) {
        console.error('[WritingAssistantController] 啟動任務失敗:', error);
        next(error);
    }
};

// 🆕 中止援引分析任務的控制器
export const cancelCitationAnalysisController = async (req, res, next) => {
    try {
        const { taskId } = req.params;
        const userId = req.user.uid;

        if (!taskId) {
            return res.status(400).json({ message: '缺少任務 ID。' });
        }

        console.log(`[CancelCitationAnalysisController] 用戶 ${userId} 請求中止任務: ${taskId}`);

        const result = await cancelCitationAnalysisTask(taskId);

        if (result.success) {
            res.status(200).json({
                success: true,
                message: result.message
            });
        } else {
            res.status(400).json({
                success: false,
                message: result.message,
                error: result.error
            });
        }

    } catch (error) {
        console.error('[CancelCitationAnalysisController] 中止任務失敗:', error);
        next(error);
    }
};