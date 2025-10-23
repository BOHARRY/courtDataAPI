// controllers/satisfactionSurvey-controller.js
// 🎯 滿意度調查控制器

import { submitSurveyService, getUserSurveyService, getAllSurveysForAdminService } from '../services/satisfactionSurveyService.js';

/**
 * 提交滿意度調查
 * POST /api/satisfaction-survey/submit
 */
export async function submitSurveyController(req, res, next) {
  const userId = req.user.uid; // 來自 verifyToken 中間件
  const userEmail = req.user.email;
  const { ratings, feedback } = req.body;

  // 驗證請求數據
  if (!ratings || typeof ratings !== 'object') {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'ratings 欄位是必填的，且必須是物件格式'
    });
  }

  // 驗證至少有一個評分
  const hasAnyRating = Object.values(ratings).some(rating => rating > 0);
  if (!hasAnyRating) {
    return res.status(400).json({
      error: 'Bad Request',
      message: '請至少為一個功能評分'
    });
  }

  // 驗證評分範圍 (1-5)
  const invalidRatings = Object.entries(ratings).filter(
    ([key, value]) => value !== 0 && (value < 1 || value > 5)
  );
  if (invalidRatings.length > 0) {
    return res.status(400).json({
      error: 'Bad Request',
      message: '評分必須在 1-5 之間'
    });
  }

  try {
    const result = await submitSurveyService({
      userId,
      userEmail,
      ratings,
      feedback: feedback || ''
    });

    res.status(200).json({
      message: '感謝您的寶貴意見！',
      rewardAmount: result.rewardAmount,
      surveyId: result.surveyId
    });
  } catch (error) {
    console.error(`[Satisfaction Survey Controller] 提交失敗 User: ${userId}:`, error);

    // 處理特定錯誤
    if (error.message && error.message.includes('冷卻期')) {
      return res.status(429).json({
        error: 'Too Many Requests',
        message: error.message
      });
    }

    if (error.message && error.message.includes('已提交')) {
      return res.status(200).json({
        message: error.message,
        rewardAmount: 0
      });
    }

    next(error); // 交給全局錯誤處理中間件
  }
}

/**
 * 獲取用戶的調查記錄
 * GET /api/satisfaction-survey/my-survey
 */
export async function getMySurveyController(req, res, next) {
  const userId = req.user.uid; // 來自 verifyToken 中間件

  try {
    const survey = await getUserSurveyService(userId);

    if (!survey) {
      return res.status(200).json({
        survey: null,
        message: '尚未提交過調查'
      });
    }

    res.status(200).json({
      survey
    });
  } catch (error) {
    console.error(`[Satisfaction Survey Controller] 獲取調查失敗 User: ${userId}:`, error);
    next(error);
  }
}

/**
 * 🔧 管理員專用：獲取所有滿意度調查
 * GET /api/satisfaction-survey/admin/all
 */
export async function getAllSurveysForAdminController(req, res, next) {
  try {
    // 解析查詢參數
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder || 'desc';

    // 驗證參數
    if (page < 1) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'page 必須大於 0'
      });
    }

    if (limit < 1 || limit > 100) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'limit 必須在 1-100 之間'
      });
    }

    if (!['createdAt', 'averageRating', 'updatedAt'].includes(sortBy)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'sortBy 必須是 createdAt, averageRating 或 updatedAt'
      });
    }

    if (!['asc', 'desc'].includes(sortOrder)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'sortOrder 必須是 asc 或 desc'
      });
    }

    // 調用 Service
    const result = await getAllSurveysForAdminService({
      page,
      limit,
      sortBy,
      sortOrder
    });

    res.status(200).json(result);

  } catch (error) {
    console.error('[Satisfaction Survey Controller] 管理員查詢失敗:', error);
    next(error);
  }
}

