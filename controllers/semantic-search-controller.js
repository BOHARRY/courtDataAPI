// controllers/semantic-search-controller.js
import * as semanticSearchService from '../services/semanticSearchService.js';

/**
 * 執行語意搜尋
 */
export async function performSemanticSearchController(req, res, next) {
    try {
        const { 
            query, 
            caseType, 
            filters = {}, 
            page = 1, 
            pageSize = 10 
        } = req.body;

        // 基本驗證
        if (!query || query.trim().length < 10) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: '查詢內容至少需要 10 個字'
            });
        }

        if (!caseType || !['民事', '刑事', '行政'].includes(caseType)) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: '請選擇有效的案件類型（民事、刑事或行政）'
            });
        }

        // 執行語意搜尋
        const results = await semanticSearchService.performSemanticSearch(
            query,
            caseType,
            filters,
            parseInt(page, 10),
            parseInt(pageSize, 10)
        );

        // 扣除積分（語意搜尋消耗 3 積分）
        results.creditsDeducted = req.creditDeducted || 3;
        results.userCreditsRemaining = req.userCreditsAfter;

        console.log(`[SemanticSearchController] 語意搜尋成功，返回 ${results.results.length} 筆結果`);
        
        res.status(200).json(results);

    } catch (error) {
        console.error('[SemanticSearchController] 語意搜尋失敗:', error);
        
        // 根據錯誤類型返回適當的狀態碼
        if (error.message.includes('向量化失敗')) {
            return res.status(502).json({
                success: false,
                error: 'Service Error',
                message: '文字向量化服務暫時無法使用，請稍後再試'
            });
        }
        
        if (error.message.includes('查詢優化失敗')) {
            return res.status(502).json({
                success: false,
                error: 'Service Error',
                message: 'AI 查詢優化服務暫時無法使用，請稍後再試'
            });
        }

        // 其他錯誤交給全域錯誤處理
        next(error);
    }
}

/**
 * 獲取爭點建議（自動完成）
 */
export async function getIssueSuggestionsController(req, res, next) {
    try {
        const { query, caseType } = req.query;

        if (!query || query.trim().length < 2) {
            return res.status(200).json({
                success: true,
                suggestions: []
            });
        }

        const suggestions = await semanticSearchService.getSuggestedIssues(
            query,
            caseType
        );

        res.status(200).json({
            success: true,
            suggestions
        });

    } catch (error) {
        console.error('[SemanticSearchController] 獲取建議失敗:', error);
        // 建議功能失敗不應阻礙用戶，返回空結果
        res.status(200).json({
            success: true,
            suggestions: []
        });
    }
}