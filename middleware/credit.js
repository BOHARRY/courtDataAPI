// middleware/credit.js
import admin from 'firebase-admin'; // 需要 admin 來訪問 firestore
import { checkAndDeductUserCreditsInTransaction } from '../services/credit.js'; // 引入修改後的服務函數


/**
 * 創建一個檢查並扣除積分的中間件。
* @param {number} baseCost - 執行此操作的基礎積分數量。
 *                            對於 SEARCH_JUDGEMENT，這是基礎搜索成本，實際成本會根據篩選條件動態計算。
 *                            對於其他操作，這是固定的積分成本。
 * @param {string} purpose - 此次扣款的用途識別碼（例如：CREDIT_PURPOSES.SEARCH_JUDGEMENT）。
 * @param {object} [logDetailsOptions={}] - (可選) 傳遞給日誌的額外信息。
 * @param {string} [logDetailsOptions.description] - 自訂的交易描述文字。
 * @param {string} [logDetailsOptions.relatedIdKey] - 從 req 對象中獲取相關 ID 的路徑（例如：'params.id'）。
 * @param {boolean} [logDetailsOptions.enableDynamicCost=false] - 是否啟用動態積分計算（預設為 false）。
 */
export const checkAndDeductCredits = (baseCost, purpose, options = {}) => {
  return async (req, res, next) => {
    const userId = req.user?.uid;
    
    if (!userId) {
      return res.status(401).json({ error: '使用者未認證' });
    }

    try {
      // 計算動態積分消耗
      let dynamicCost = baseCost;
      
      // 如果是搜索請求，根據篩選條件計算積分
      if (purpose === CREDIT_PURPOSES.SEARCH_JUDGEMENT) {
        dynamicCost = calculateSearchCost(req.query);
      }

      const db = admin.firestore();
      const result = await db.runTransaction(async (transaction) => {
        const userDocRef = db.collection('users').doc(userId);
        const deductResult = await checkAndDeductUserCreditsInTransaction(
          transaction,
          userDocRef,
          userId,
          dynamicCost, // 使用動態計算的積分
          purpose,
          {
            description: options.description || `Deducted ${dynamicCost} credits for ${purpose}`,
            relatedId: options.relatedId
          }
        );

        if (!deductResult.sufficient) {
          const error = new Error(`積分不足。當前積分: ${deductResult.currentCredits}，需要: ${dynamicCost}`);
          error.statusCode = 402;
          error.currentCredits = deductResult.currentCredits;
          error.requiredCredits = dynamicCost;
          throw error;
        }

        return deductResult;
      });

      req.creditDeducted = dynamicCost;
      req.userCreditsAfter = result.newCredits;
      next();
    } catch (error) {
      console.error(`Credit Middleware Error for user ${userId} (cost: ${cost}, purpose: ${purpose}):`, error.message, error.details || error.stack);
      if (error.statusCode === 402) { // 處理由 runTransaction 拋出的積分不足錯誤
        return res.status(402).json({
          error: 'Insufficient credits',
          message: error.details?.message || '您的積分不足。',
          required: error.details?.required,
          current: error.details?.current,
          action: error.details?.purpose
        });
      }
      if (error.message === 'User data not found.' || error.statusCode === 404) {
        return res.status(404).json({
          error: 'User data not found',
          message: '找不到您的用戶資料，請嘗試重新登入。'
        });
      }
      // 其他可能的錯誤，例如 Firestore 連接問題
      return res.status(500).json({
        error: 'Credit processing failed',
        message: error.message || '處理您的積分時發生內部錯誤。'
      });
    }
  };
}

// 新增：計算搜索積分消耗的函數
function calculateSearchCost(searchFilters) {
  let cost = 1; // 基礎搜索消耗 1 積分
  
  // 檢查各種篩選條件
  if (searchFilters.caseTypes && searchFilters.caseTypes.split(',').filter(Boolean).length > 0) cost += 1;
  if (searchFilters.verdict && searchFilters.verdict !== '不指定') cost += 1;
  if (searchFilters.laws && searchFilters.laws.split(',').filter(Boolean).length > 0) cost += 1;
  if (searchFilters.courtLevels && searchFilters.courtLevels.split(',').filter(Boolean).length > 0) cost += 1;
  if (searchFilters.minAmount || searchFilters.maxAmount) cost += 1;
  if (searchFilters.reasoningStrength) cost += 1;
  if (searchFilters.complexity) cost += 1;
  if (searchFilters.winReasons && searchFilters.winReasons.split(',').filter(Boolean).length > 0) cost += 1;
  
  // 進階篩選
  if (searchFilters.onlyWithFullText === 'true') cost += 1;
  if (searchFilters.includeCitedCases === 'true') cost += 1;
  if (searchFilters.onlyRecent3Years === 'true') cost += 1;
  
  return cost;
}