// controllers/user-controller.js
import * as userService from '../services/user.js';

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