// controllers/satisfactionSurvey-controller.js
// 🎯 滿意度調查控制器

import { submitSurveyService } from '../services/satisfactionSurveyService.js';

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

