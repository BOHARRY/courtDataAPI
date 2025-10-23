import { updateUserSubscriptionLevel } from '../services/user.js';
import { plans as frontendPlansData } from '../config/plansData.js';
// controllers/user-controller.js
import * as userService from '../services/user.js';
import {
  grantSignupBonus as grantSignupBonusService,
  grantOnboardingTasksCompletionReward as grantOnboardingRewardService // 🎁 新手任務獎勵
} from '../services/credit.js';


// 這裡的 plans 是從 config/plansData.js 引入的，
// 這樣可以確保前端和後端使用相同的方案數據結構
export async function updateUserSubscriptionController(req, res, next) {
  const userId = req.user.uid; // 來自 verifyToken 中間件
  const { newPlanId } = req.body; // 前端傳來選擇的方案 ID，例如 'premium_plus'

  if (!newPlanId) {
    return res.status(400).json({ error: 'Bad Request', message: 'newPlanId is required in the request body.' });
  }

  // 從後端配置中獲取新方案的詳細信息
  const planDetails = frontendPlansData[newPlanId.toLowerCase()]; // 使用 toLowerCase() 確保匹配
  if (!planDetails) {
    return res.status(400).json({ error: 'Bad Request', message: `Invalid plan ID: ${newPlanId}.` });
  }

  try {
    // 傳遞 planDetails 給服務層，以便知道每月贈點等信息
    const result = await updateUserSubscriptionLevel(userId, newPlanId, planDetails);
    res.status(200).json({
      message: result.message,
      newLevel: result.newLevel,
      grantedCredits: result.grantedCredits > 0 ? result.grantedCredits : undefined
    });
  } catch (error) {
    console.error(`[User Controller] Failed to update subscription for user ${userId}: ${error.message}`);
    // 根據錯誤類型返回不同的狀態碼
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: 'Not Found', message: error.message });
    }
    next(error); // 交給全局錯誤處理中間件
  }
}

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

// 🎁 新手任務完成獎勵 Controller
export async function claimOnboardingTasksRewardController(req, res, next) {
    const userId = req.user.uid;
    try {
        const result = await grantOnboardingRewardService(userId);
        res.status(200).json({
            message: "Onboarding tasks reward claimed successfully.",
            rewardAmount: result.rewardAmount
        });
    } catch (error) {
        console.error(`[User Controller - Onboarding Reward Error] User: ${userId}:`, error);

        // 根據錯誤類型返回不同狀態碼
        if (error.message && error.message.includes("already granted")) {
            return res.status(200).json({ message: error.message });
        }
        if (error.message && error.message.includes("not completed")) {
            return res.status(400).json({ error: 'Bad Request', message: error.message });
        }
        if (error.message && error.message.includes("not found")) {
            return res.status(404).json({ error: 'Not Found', message: error.message });
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

export async function getAiAnalysisHistoryController(req, res, next) {
    try {
        const userId = req.user.uid;
        const limitParam = req.query.limit ? parseInt(req.query.limit, 10) : 10;

        if (isNaN(limitParam) || limitParam <= 0 || limitParam > 50) { // 增加上限限制
            return res.status(400).json({ status: 'failed', message: '無效的 limit 參數 (必須介於 1-50)。' });
        }

        const history = await userService.getAiAnalysisHistory(userId, limitParam);
        res.status(200).json(history);
    } catch (error) {
        console.error('[UserController] Error in getAiAnalysisHistoryController:', error);
        next(error); // 可以考慮返回一個標準的錯誤 JSON
        res.status(500).json({ status: 'failed', message: error.message || '獲取歷史記錄時發生內部錯誤。'});
    }
}

/**
 * 取消待降級請求的控制器
 */
export async function cancelPendingDowngradeController(req, res, next) {
  try {
    const userId = req.user.uid;
    console.log(`[UserController] User ${userId} requesting to cancel pending downgrade`);
    
    const result = await userService.cancelPendingDowngrade(userId);
    
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('[UserController] Error in cancelPendingDowngradeController:', error);
    next(error); // 交給錯誤處理中間件
  }
}

/**
 * 獲取使用者訂閱狀態詳細資訊的控制器
 */
export async function getUserSubscriptionStatusController(req, res, next) {
  try {
    const userId = req.user.uid;
    console.log(`[UserController] Getting subscription status for user ${userId}`);
    
    const status = await userService.getUserSubscriptionStatus(userId);
    res.status(200).json(status);
  } catch (error) {
    console.error('[UserController] Error in getUserSubscriptionStatusController:', error);
    next(error); // 交給錯誤處理中間件
  }
}