// middleware/credit.js
// import { checkUserCredits, deductCredits } from '../services/credit.js'; // 稍後會引入

/**
 * 創建一個檢查並扣除積分的中間件。
 * @param {number} cost - 執行此操作所需的積分數量。
 * @returns {function} Express 中間件函數。
 */
export function checkAndDeductCredits(cost) {
  return async (req, res, next) => {
    if (!req.user || !req.user.uid) {
      console.error("Credit Middleware: User not authenticated or UID missing from req.user.");
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required to perform this action.'
      });
    }

    const userId = req.user.uid;

    try {
      // --- 這裡將調用 services/credit.js 中的函數 ---
      // 假設有一個服務函數處理檢查和扣除邏輯
      // const { sufficient, currentCredits } = await checkUserCredits(userId, cost);
      // if (!sufficient) {
      //   return res.status(402).json({ // 402 Payment Required
      //     error: 'Insufficient credits',
      //     message: '您的積分不足，請購買積分或升級方案。',
      //     required: cost,
      //     current: currentCredits
      //   });
      // }
      //
      // // 如果需要在中間件層面直接扣除（或者在 service 層的 transaction 中處理更好）
      // await deductCredits(userId, cost, 'action_description_here'); // 描述操作類型
      // console.log(`Credits Middleware: ${cost} credit(s) deducted from user ${userId}.`);

      // --- 暫時的佔位邏輯，直到 service 層完成 ---
      console.log(`Credit Middleware: Simulating credit check for user ${userId}, cost: ${cost}. Assuming sufficient.`);
      // --- 結束佔位 ---

      next(); // 積分足夠（或已扣除），繼續處理請求
    } catch (error) {
      console.error(`Credit Middleware Error for user ${userId}:`, error);
      if (error.message === 'User data not found.') { // 假設 service 可能拋出此錯誤
         return res.status(404).json({
             error: 'User data not found',
             message: '找不到您的用戶資料，請嘗試重新登入。'
         });
      }
      // 其他可能的錯誤，例如 Firestore 連接問題
      return res.status(500).json({
        error: 'Credit check failed',
        message: '處理您的積分時發生內部錯誤。'
      });
    }
  };
}