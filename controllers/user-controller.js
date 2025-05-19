// controllers/user-controller.js
import * as userService from '../services/user.js';
import { grantSignupBonus as grantSignupBonusService } from '../services/credit.js';

export async function getLawyerSearchHistoryController(req, res, next) {
  const userId = req.user.uid; // 從 verifyToken 獲取

  try {
    const history = await userService.getLawyerSearchHistory(userId);
    res.status(200).json(history);
  } catch (error) {
    // console.error(`[User Controller - History Error] User: ${userId}:`, error);
    next(error); // 交給全局錯誤處理器
  }
}
export async function recordSignupBonusController(req, res, next) {
    const userId = req.user.uid;
    try {
        // 這裡可以加入額外檢查，例如是否真的需要發放（例如，用戶的 createdAt 時間是否很近）
        // 但 services/credit.js 裡的 grantSignupBonus 已經有檢查 hasReceivedSignupBonus
        const result = await grantSignupBonusService(userId);
        res.status(200).json({ message: "Signup bonus processing initiated.", details: result.message });
    } catch (error) {
        console.error(`[User Controller - Signup Bonus Error] User: ${userId}:`, error);
        // 根據錯誤類型返回不同狀態碼
        if (error.message && error.message.includes("already granted")) {
            return res.status(200).json({ message: error.message }); // 已經發放過，也算成功
        }
        next(error);
    }
}

export async function getCreditTransactionHistoryController(req, res, next) {
  const userId = req.user.uid; // 從 verifyToken 獲取
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20; // 從查詢參數獲取 limit，預設 20

  if (isNaN(limit) || limit <= 0 || limit > 100) { // 限制 limit 範圍
    return res.status(400).json({ error: 'Invalid limit parameter. Must be between 1 and 100.' });
  }

  try {
    const history = await userService.getCreditTransactionHistory(userId, limit);
    res.status(200).json(history);
  } catch (error) {
    // console.error(`[User Controller - Credit History Error] User: ${userId}:`, error);
    next(error); // 交給全局錯誤處理器
  }
}