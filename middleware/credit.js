// middleware/credit.js
import admin from 'firebase-admin'; // 需要 admin 來訪問 firestore
import { checkAndDeductUserCreditsInTransaction } from '../services/credit.js'; // 引入修改後的服務函數


/**
 * 創建一個檢查並扣除積分的中間件。
 * @param {number} cost - 執行此操作所需的積分數量。
 * @param {string} purpose - 此次扣款的用途識別碼。
 * @param {object} [logDetailsOptions={}] - (可選) 傳遞給日誌的額外信息，例如 { description: '自訂描述', relatedIdKey: 'req.params.id' }
 * @returns {function} Express 中間件函數。
 */
export function checkAndDeductCredits(cost, purpose, logDetailsOptions = {}) {
  return async (req, res, next) => {
    if (!req.user || !req.user.uid) {
      console.error("Credit Middleware: User not authenticated or UID missing from req.user.");
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required to perform this action.'
      });
    }

    const userId = req.user.uid;
    const db = admin.firestore(); // 獲取 Firestore 實例

    try {
      await db.runTransaction(async (transaction) => {
        const userDocRef = db.collection('users').doc(userId);

        // 從 logDetailsOptions 構造 logDetails
        const logDetails = {
          description: logDetailsOptions.description || `API 操作 ${purpose} 扣除 ${cost} 點`, // 預設描述
        };
        if (logDetailsOptions.relatedIdKey) {
          // 從 req 對象中動態獲取 relatedId, 例如 req.params.id 或 req.body.itemId
          // 這需要小心處理路徑解析
          let relatedIdValue = req;
          const keys = logDetailsOptions.relatedIdKey.split('.'); // e.g., "params.id"
          for (const key of keys) {
            if (relatedIdValue && typeof relatedIdValue === 'object' && key in relatedIdValue) {
              relatedIdValue = relatedIdValue[key];
            } else {
              relatedIdValue = undefined;
              break;
            }
          }
          if (relatedIdValue !== undefined) {
            logDetails.relatedId = String(relatedIdValue);
          }
        }


        const { sufficient, currentCredits } = await checkAndDeductUserCreditsInTransaction(
          transaction,
          userDocRef,
          userId,
          cost,
          purpose, // 傳遞 purpose
          logDetails // 傳遞構造好的 logDetails
        );

        if (!sufficient) {
          // 拋出一個特定錯誤，讓 runTransaction 捕捉並回傳給客戶端
          const error = new Error('Insufficient credits');
          error.statusCode = 402; // Payment Required
          error.details = { // 附加額外信息
            message: '您的積分不足，請購買積分或升級方案。',
            required: cost,
            current: currentCredits,
            purpose: purpose,
          };
          throw error;
        }
      });

      // console.log(`Credits Middleware: ${cost} credit(s) for ${purpose} successfully processed for user ${userId}.`);
      next(); // 積分足夠且已扣除（包含記錄），繼續處理請求

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