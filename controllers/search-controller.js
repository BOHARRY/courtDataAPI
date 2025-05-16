// controllers/search-controller.js
import * as searchService from '../services/search.js'; // 引入搜尋服務
import * as creditService from '../services/credit.js'; // 引入積分服務
import admin from 'firebase-admin'; // 用於 Firestore Transaction

const SEARCH_COST = 1; // 定義搜尋成本

export async function searchJudgmentsController(req, res, next) {
  const userId = req.user.uid; // 從 verifyToken 中間件獲取
  const searchFilters = req.query;
  const { page = 1, pageSize = 10 } = searchFilters;

  // console.log(`[Search Controller] User: ${userId}, Filters:`, searchFilters);

  try {
    let searchResponseData = null;
    const userDocRef = admin.firestore().collection('users').doc(userId);

    // --- 使用 Firestore Transaction 處理積分與搜尋 ---
    await admin.firestore().runTransaction(async (transaction) => {
      // 1. 檢查並扣除積分 (調用 creditService)
      const { sufficient, currentCredits } = await creditService.checkAndDeductUserCreditsInTransaction(
        transaction,
        userDocRef,
        userId,
        SEARCH_COST,
        { action: 'judgment_search', details: searchFilters } // 操作描述
      );

      if (!sufficient) {
        // 拋出特定錯誤，由外層 catch 處理
        const error = new Error('Insufficient credits');
        error.statusCode = 402; // Payment Required
        error.details = { required: SEARCH_COST, current: currentCredits };
        throw error;
      }

      // 2. 執行 Elasticsearch 搜尋 (調用 searchService)
      // searchService 將處理查詢構建和 ES 交互
      searchResponseData = await searchService.performSearch(searchFilters, parseInt(page, 10), parseInt(pageSize, 10));
      // console.log(`[Search Controller - Transaction] ES search successful for user ${userId}.`);
    });
    // --- Transaction 結束 ---

    if (searchResponseData) {
      // console.log(`[Search Controller Success] Sending results to user ${userId}.`);
      res.status(200).json(searchResponseData);
    } else {
      // 理論上，如果 transaction 成功，searchResponseData 不應為空
      console.error(`[Search Controller Error] Transaction succeeded but no search response for user ${userId}.`);
      // 使用 next(error) 將錯誤傳遞給 Express 的錯誤處理中間件
      const err = new Error('Internal server error after search (empty response).');
      err.statusCode = 500;
      next(err);
    }

  } catch (error) {
    // console.error(`[Search Controller Error] User: ${userId}, Error:`, error.message, error.details);
    if (error.message === 'Insufficient credits' && error.statusCode === 402) {
      return res.status(402).json({
        error: '您的積分不足，請購買積分或升級方案。',
        required: error.details?.required || SEARCH_COST,
        current: error.details?.current || 0
      });
    }
    if (error.message === 'User data not found.' && error.statusCode === 404) { // 假設 creditService 可能拋出
        return res.status(404).json({
            error: '找不到您的用戶資料，請嘗試重新登入。'
        });
    }
    // 其他錯誤傳遞給 Express 的錯誤處理中間件
    // next(error) 會觸發 config/express.js 中定義的全局錯誤處理器
    next(error);
  }
}

export async function getFiltersController(req, res, next) {
  try {
    const filtersData = await searchService.getAvailableFilters();
    res.status(200).json(filtersData);
  } catch (error) {
    // console.error('[Get Filters Controller Error]:', error);
    // 將錯誤傳遞給 Express 的錯誤處理中間件
    next(error);
  }
}