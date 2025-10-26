// controllers/case-description-search-controller.js
import * as caseDescriptionSearchService from '../services/caseDescriptionSearchService.js';

/**
 * 執行案由搜尋
 */
export async function performCaseDescriptionSearchController(req, res, next) {
    try {
        const { 
            description, 
            caseType, 
            perspective,
            page = 1, 
            pageSize = 10 
        } = req.body;

        // 基本驗證
        if (!description || description.trim().length < 20) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: '案情描述至少需要 20 個字'
            });
        }

        if (description.trim().length > 500) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: '案情描述不得超過 500 個字'
            });
        }

        if (!caseType || !['民事', '刑事', '行政'].includes(caseType)) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: '請選擇有效的案件類型（民事、刑事或行政）'
            });
        }

        if (!perspective || !['plaintiff', 'defendant'].includes(perspective)) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: '請選擇有效的立場（plaintiff 或 defendant）'
            });
        }

        // 執行案由搜尋
        const results = await caseDescriptionSearchService.performCaseDescriptionSearch(
            description,
            caseType,
            perspective,
            parseInt(page, 10),
            parseInt(pageSize, 10)
        );

        // 加入積分扣除資訊
        results.creditsDeducted = req.creditDeducted || 5;
        results.userCreditsRemaining = req.userCreditsAfter;

        res.status(200).json(results);

    } catch (error) {
        console.error('[CaseDescriptionSearchController] 搜尋失敗:', error);
        next(error);
    }
}

