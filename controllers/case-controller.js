// controllers/case-controller.js
import * as caseDetailsService from '../services/caseDetailsService.js';

/**
 * 獲取案例列表詳情的控制器
 * POST /api/cases/list-details
 */
export async function getCaseListDetailsController(req, res, next) {
  try {
    console.log(`[CaseController] 收到案例列表詳情請求，用戶: ${req.user?.uid}`);
    
    const { caseIds } = req.body;
    
    // 🎯 輸入驗證
    const validation = caseDetailsService.validateCaseIds(caseIds);
    if (!validation.isValid) {
      console.warn(`[CaseController] 請求驗證失敗: ${validation.error}`);
      return res.status(400).json({
        error: 'Bad Request',
        message: validation.error,
        details: {
          received: caseIds,
          expectedFormat: 'Array of strings with 1-50 valid case IDs'
        }
      });
    }

    console.log(`[CaseController] 驗證通過，準備獲取 ${caseIds.length} 個案例詳情`);

    // 🎯 調用服務層獲取數據
    const results = await caseDetailsService.getCaseListDetails(caseIds);
    
    // 🎯 構建響應
    const response = {
      success: true,
      data: results,
      metadata: {
        totalRequested: caseIds.length,
        totalFound: Object.keys(results).length,
        notFound: caseIds.length - Object.keys(results).length,
        requestedAt: new Date().toISOString()
      }
    };

    console.log(`[CaseController] ✅ 請求處理成功: ${response.metadata.totalFound}/${response.metadata.totalRequested} 個案例找到`);
    
    res.status(200).json(response);

  } catch (error) {
    console.error('[CaseController] 處理案例列表詳情請求時發生錯誤:', error);
    
    // 🎯 根據錯誤類型返回適當的 HTTP 狀態碼
    const statusCode = error.statusCode || 500;
    const errorResponse = {
      error: getErrorType(statusCode),
      message: error.message || '獲取案例詳情時發生未知錯誤',
      timestamp: new Date().toISOString()
    };

    // 在開發環境中包含更多錯誤詳情
    if (process.env.NODE_ENV === 'development' && error.originalError) {
      errorResponse.details = {
        originalError: error.originalError.message,
        stack: error.originalError.stack
      };
    }

    res.status(statusCode).json(errorResponse);
    
    // 不調用 next(error)，因為我們已經處理了響應
  }
}

/**
 * 根據狀態碼獲取錯誤類型
 * @param {number} statusCode - HTTP 狀態碼
 * @returns {string} 錯誤類型
 */
function getErrorType(statusCode) {
  switch (statusCode) {
    case 400:
      return 'Bad Request';
    case 401:
      return 'Unauthorized';
    case 403:
      return 'Forbidden';
    case 404:
      return 'Not Found';
    case 503:
      return 'Service Unavailable';
    default:
      return 'Internal Server Error';
  }
}
