// controllers/aiAnalysisController.js
import * as aiSuccessAnalysisService from '../services/aiSuccessAnalysisService.js'; // 等下會創建

export async function analyzeSuccessFactorsController(req, res, next) {
    try {
        const { case_type_selected, case_summary_text } = req.body;

        if (!case_type_selected || !case_summary_text) {
            return res.status(400).json({
                status: 'failed',
                message: '缺少必要參數：case_type_selected 和 case_summary_text 為必填。'
            });
        }

        if (!["民事", "刑事", "行政"].includes(case_type_selected)) {
            return res.status(400).json({
                status: 'failed',
                message: '無效的案件類型，必須是 "民事", "刑事", 或 "行政" 之一。'
            });
        }

        if (case_summary_text.length < 30) { // 簡單的長度檢查
             return res.status(400).json({
                status: 'failed',
                message: '案由與事實摘要過短，建議至少30字以獲得較佳分析結果。'
            });
        }

        // 調用服務層進行分析
        const analysisResult = await aiSuccessAnalysisService.analyzeSuccessFactors(
            case_type_selected,
            case_summary_text
        );

        res.status(200).json(analysisResult);

    } catch (error) {
        console.error('[AIAnalysisController] Error in analyzeSuccessFactorsController:', error);
        // 特殊錯誤處理，例如點數不足由中間件處理了，這裡處理服務層拋出的其他錯誤
        if (error.statusCode) { // 如果服務層拋出的錯誤帶有 statusCode
            return res.status(error.statusCode).json({
                status: 'failed',
                message: error.message,
                details: error.details
            });
        }
        // 其他未預期錯誤交給全局錯誤處理器
        next(error);
    }
}