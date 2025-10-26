// controllers/case-description-search-controller.js
import * as caseDescriptionSearchService from '../services/caseDescriptionSearchService.js';
import { batchGetJudgmentsByJids } from '../services/judgmentService.js';

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

        // 🆕 處理案由相關性檢查失敗
        if (error.message && error.message.startsWith('INVALID_CASE_DESCRIPTION:')) {
            const reason = error.message.replace('INVALID_CASE_DESCRIPTION:', '').trim();
            return res.status(400).json({
                success: false,
                error: 'Invalid Case Description',
                message: reason,
                code: 'INVALID_CASE_DESCRIPTION'
            });
        }

        next(error);
    }
}

/**
 * 🆕 批次獲取判決資料（用於換頁）
 */
export async function batchGetJudgmentsController(req, res, next) {
    try {
        const { jids } = req.body;

        // 基本驗證
        if (!jids || !Array.isArray(jids) || jids.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'jids 必須是非空陣列'
            });
        }

        if (jids.length > 50) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'jids 陣列長度不得超過 50'
            });
        }

        // 批次獲取判決資料
        const results = await batchGetJudgmentsByJids(jids);

        res.json({
            success: true,
            results
        });

    } catch (error) {
        console.error('[BatchGetJudgments] 批次獲取判決失敗:', error);
        next(error);
    }
}

