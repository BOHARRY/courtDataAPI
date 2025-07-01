// controllers/law-search-controller.js
import * as lawSearchService from '../services/lawSearchService.js';

/**
 * 法條精準搜索控制器
 * 支援條號、法典名稱、關鍵字等多種搜索方式
 */
export async function searchLawArticlesController(req, res, next) {
    try {
        const { 
            query,           // 搜索關鍵字
            code_name,       // 法典名稱篩選
            article_number,  // 條號篩選
            search_type = 'mixed', // 搜索類型：exact, fuzzy, mixed
            page = 1, 
            pageSize = 20 
        } = req.query;

        // 基本驗證
        if (!query && !code_name && !article_number) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: '請提供搜索關鍵字、法典名稱或條號'
            });
        }

        // 執行搜索
        const results = await lawSearchService.searchLawArticles({
            query,
            code_name,
            article_number,
            search_type,
            page: parseInt(page, 10),
            pageSize: parseInt(pageSize, 10)
        });

        // 添加積分扣除資訊
        results.creditsDeducted = req.creditDeducted || 1;
        results.userCreditsRemaining = req.userCreditsAfter;

        res.status(200).json({
            success: true,
            ...results
        });

    } catch (error) {
        console.error('[LawSearchController] 法條搜索失敗:', error);
        next(error);
    }
}

/**
 * 法條語意搜索控制器
 * 使用 AI 進行自然語言查詢理解和向量搜索
 */
export async function searchLawBySemanticController(req, res, next) {
    try {
        const { 
            query,
            context = '',    // 額外上下文資訊
            page = 1, 
            pageSize = 10 
        } = req.body;

        // 基本驗證
        if (!query || query.trim().length < 5) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: '查詢內容至少需要 5 個字'
            });
        }

        // 執行語意搜索
        const results = await lawSearchService.performSemanticLawSearch(
            query,
            context,
            parseInt(page, 10),
            parseInt(pageSize, 10)
        );

        // 添加積分扣除資訊
        results.creditsDeducted = req.creditDeducted || 3;
        results.userCreditsRemaining = req.userCreditsAfter;

        res.status(200).json({
            success: true,
            ...results
        });

    } catch (error) {
        console.error('[LawSearchController] 法條語意搜索失敗:', error);
        
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

        next(error);
    }
}

/**
 * 獲取法條詳細內容控制器
 */
export async function getLawArticleDetailController(req, res, next) {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: '請提供法條 ID'
            });
        }

        const article = await lawSearchService.getLawArticleById(id);

        if (!article) {
            return res.status(404).json({
                success: false,
                error: 'Not Found',
                message: '找不到指定的法條'
            });
        }

        res.status(200).json({
            success: true,
            article
        });

    } catch (error) {
        console.error('[LawSearchController] 獲取法條詳情失敗:', error);
        next(error);
    }
}

/**
 * 法條搜索建議控制器
 * 提供搜索自動完成功能
 */
export async function getLawSuggestionsController(req, res, next) {
    try {
        const { query, type = 'all' } = req.query;

        if (!query || query.trim().length < 2) {
            return res.status(200).json({
                success: true,
                suggestions: []
            });
        }

        const suggestions = await lawSearchService.getLawSearchSuggestions(
            query.trim(),
            type
        );

        res.status(200).json({
            success: true,
            suggestions
        });

    } catch (error) {
        console.error('[LawSearchController] 獲取法條建議失敗:', error);
        // 建議功能失敗不應阻礙用戶，返回空結果
        res.status(200).json({
            success: true,
            suggestions: []
        });
    }
}
