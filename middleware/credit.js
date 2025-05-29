// middleware/credit.js
import admin from 'firebase-admin';
import { checkAndDeductUserCreditsInTransaction } from '../services/credit.js';
import { CREDIT_PURPOSES } from '../config/creditCosts.js';

/**
 * 創建一個檢查並扣除積分的中間件。
 * 
 * @param {number} baseCost - 執行此操作的基礎積分數量。
 *                            對於 SEARCH_JUDGEMENT，這是基礎搜索成本，實際成本會根據篩選條件動態計算。
 *                            對於其他操作，這是固定的積分成本。
 * @param {string} purpose - 此次扣款的用途識別碼（例如：CREDIT_PURPOSES.SEARCH_JUDGEMENT）。
 * @param {object} [logDetailsOptions={}] - (可選) 傳遞給日誌的額外信息。
 * @param {string} [logDetailsOptions.description] - 自訂的交易描述文字。
 * @param {string} [logDetailsOptions.relatedIdKey] - 從 req 對象中獲取相關 ID 的路徑（例如：'params.id'）。
 * 
 * @returns {function} Express 中間件函數。
 */
export const checkAndDeductCredits = (baseCost, purpose, logDetailsOptions = {}) => {
  return async (req, res, next) => {
    const userId = req.user?.uid;
    
    if (!userId) {
      console.error('[Credit Middleware] User not authenticated.');
      return res.status(401).json({ error: '使用者未認證。' });
    }

    // 將 dynamicCost 定義在 try-catch 外部，這樣在 catch 區塊中也能訪問
    let dynamicCost = baseCost;
    
    try {
      // 如果是搜索請求，根據篩選條件計算積分
      if (purpose === CREDIT_PURPOSES.SEARCH_JUDGEMENT) {
        dynamicCost = calculateSearchCost(req.query);
        console.log(`[Credit Middleware] Dynamic cost calculated for search: ${dynamicCost}`);
      }

      // 構建日誌詳情
      const logDetails = {
        description: logDetailsOptions.description || `Deducted ${dynamicCost} credits for ${purpose}`,
        ...(logDetailsOptions.relatedIdKey && { 
          relatedId: getNestedProperty(req, logDetailsOptions.relatedIdKey) 
        })
      };

      // 使用 Firestore 交易來確保原子性
      const db = admin.firestore();
      const result = await db.runTransaction(async (transaction) => {
        const userDocRef = db.collection('users').doc(userId);
        
        const deductResult = await checkAndDeductUserCreditsInTransaction(
          transaction,
          userDocRef,
          userId,
          dynamicCost,
          purpose,
          logDetails
        );

        if (!deductResult.sufficient) {
          const error = new Error(`積分不足。當前積分: ${deductResult.currentCredits}，需要: ${dynamicCost}`);
          error.statusCode = 402; // Payment Required
          error.currentCredits = deductResult.currentCredits;
          error.requiredCredits = dynamicCost;
          throw error;
        }

        return deductResult;
      });

      // 將扣除的積分數和剩餘積分附加到 req 對象
      req.creditDeducted = dynamicCost;
      req.userCreditsAfter = result.newCredits;
      
      console.log(`[Credit Middleware] Successfully deducted ${dynamicCost} credits from user ${userId}. Remaining: ${result.newCredits}`);
      next();
      
    } catch (error) {
      // 現在 dynamicCost 在這裡是可訪問的
      console.error(`[Credit Middleware] Error for user ${userId} (cost: ${dynamicCost}, purpose: ${purpose}):`, error.message);
      
      if (error.statusCode === 402) {
        return res.status(402).json({
          error: error.message,
          currentCredits: error.currentCredits,
          requiredCredits: error.requiredCredits
        });
      }
      
      if (error.statusCode === 404) {
        return res.status(404).json({ error: '使用者資料不存在。' });
      }
      
      // 其他未預期的錯誤
      console.error('[Credit Middleware] Unexpected error:', error);
      return res.status(500).json({ error: '扣除積分時發生錯誤。' });
    }
  };
};

/**
 * 計算搜索積分消耗
 * @param {object} searchFilters - 搜索篩選條件
 * @returns {number} 總積分消耗
 */
function calculateSearchCost(searchFilters) {
  let cost = 1; // 基礎搜索消耗 1 積分
  
  // 檢查各種篩選條件
  if (searchFilters.caseTypes && searchFilters.caseTypes.split(',').filter(Boolean).length > 0) {
    cost += 1;
  }
  if (searchFilters.verdict && searchFilters.verdict !== '不指定') {
    cost += 1;
  }
  if (searchFilters.laws && searchFilters.laws.split(',').filter(Boolean).length > 0) {
    cost += 1;
  }
  if (searchFilters.courtLevels && searchFilters.courtLevels.split(',').filter(Boolean).length > 0) {
    cost += 1;
  }
  if (searchFilters.minAmount || searchFilters.maxAmount) {
    cost += 1;
  }
  if (searchFilters.reasoningStrength) {
    cost += 1;
  }
  if (searchFilters.complexity) {
    cost += 1;
  }
  if (searchFilters.winReasons && searchFilters.winReasons.split(',').filter(Boolean).length > 0) {
    cost += 1;
  }
  
  // 進階篩選
  if (searchFilters.onlyWithFullText === 'true') {
    cost += 1;
  }
  if (searchFilters.includeCitedCases === 'true') {
    cost += 1;
  }
  if (searchFilters.onlyRecent3Years === 'true') {
    cost += 1;
  }
  
  console.log(`[Credit Middleware] Search filters:`, searchFilters);
  console.log(`[Credit Middleware] Calculated search cost: ${cost}`);
  
  return cost;
}

/**
 * 輔助函數：從對象中獲取嵌套屬性
 * @param {object} obj - 源對象
 * @param {string} path - 屬性路徑（例如：'params.id'）
 * @returns {any} 屬性值
 */
function getNestedProperty(obj, path) {
  return path.split('.').reduce((current, prop) => current?.[prop], obj);
}