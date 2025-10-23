// services/satisfactionSurveyService.js
// 🎯 滿意度調查服務層

import admin from 'firebase-admin';
import { addUserCreditsAndLog } from './credit.js';
import { CREDIT_REWARDS, CREDIT_PURPOSES } from '../config/creditCosts.js';

const SURVEY_REWARD_AMOUNT = 50; // 滿意度調查獎勵積分
const SURVEY_COOLDOWN_DAYS = 30; // 冷卻期 30 天

/**
 * 提交滿意度調查
 * @param {Object} params - 調查參數
 * @param {string} params.userId - 用戶 ID
 * @param {string} params.userEmail - 用戶 Email
 * @param {Object} params.ratings - 功能評分 { judgmentSearch: 4, judgeAnalysis: 5, ... }
 * @param {string} params.feedback - 開放式反饋
 * @returns {Promise<{surveyId: string, rewardAmount: number}>}
 */
export async function submitSurveyService({ userId, userEmail, ratings, feedback }) {
  const db = admin.firestore();
  const userDocRef = db.collection('users').doc(userId);

  try {
    // 1. 檢查冷卻期
    const lastSurvey = await getLastSurveySubmission(userId);
    if (lastSurvey) {
      const daysSinceLastSurvey = Math.floor(
        (Date.now() - lastSurvey.submittedAt.toMillis()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceLastSurvey < SURVEY_COOLDOWN_DAYS) {
        const remainingDays = SURVEY_COOLDOWN_DAYS - daysSinceLastSurvey;
        throw new Error(`您已在 ${daysSinceLastSurvey} 天前提交過調查，請在 ${remainingDays} 天後再次提交`);
      }
    }

    // 2. 創建調查記錄
    const surveyData = {
      userId,
      userEmail,
      ratings: {
        judgmentSearch: ratings.judgmentSearch || 0,      // 判決書搜尋的過程
        judgmentDetail: ratings.judgmentDetail || 0,      // 判決書的展示頁面
        judgeAnalysis: ratings.judgeAnalysis || 0,        // 查詢法官傾向
        lawyerProfile: ratings.lawyerProfile || 0,        // 查詢對造律師
        canvasWorkspace: ratings.canvasWorkspace || 0     // 工作區圖版功能
      },
      feedback: feedback.trim(),
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
      submittedFrom: 'web',
      // 計算平均分數
      averageRating: calculateAverageRating(ratings)
    };

    // 3. 寫入 Firestore
    const surveyRef = await db.collection('satisfaction_surveys').add(surveyData);
    const surveyId = surveyRef.id;

    console.log(`[Satisfaction Survey Service] Survey ${surveyId} submitted by user ${userId}`);

    // 4. 發放積分獎勵
    let rewardAmount = 0;
    try {
      await addUserCreditsAndLog(
        userId,
        SURVEY_REWARD_AMOUNT,
        CREDIT_PURPOSES.SATISFACTION_SURVEY,
        {
          description: `完成滿意度調查獲得 ${SURVEY_REWARD_AMOUNT} 點積分`,
          relatedId: surveyId
        }
      );
      rewardAmount = SURVEY_REWARD_AMOUNT;
      console.log(`[Satisfaction Survey Service] Rewarded ${SURVEY_REWARD_AMOUNT} credits to user ${userId}`);
    } catch (creditError) {
      console.error(`[Satisfaction Survey Service] Failed to reward credits to user ${userId}:`, creditError);
      // 即使積分發放失敗，調查仍然成功提交
      // 可以考慮記錄到錯誤日誌或通知管理員
    }

    return {
      surveyId,
      rewardAmount
    };

  } catch (error) {
    console.error(`[Satisfaction Survey Service] Error submitting survey for user ${userId}:`, error);
    throw error;
  }
}

/**
 * 獲取用戶最後一次提交的調查
 * @param {string} userId - 用戶 ID
 * @returns {Promise<Object|null>}
 */
async function getLastSurveySubmission(userId) {
  const db = admin.firestore();

  try {
    const snapshot = await db.collection('satisfaction_surveys')
      .where('userId', '==', userId)
      .orderBy('submittedAt', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    return snapshot.docs[0].data();
  } catch (error) {
    console.error(`[Satisfaction Survey Service] Error fetching last survey for user ${userId}:`, error);
    // 如果查詢失敗（例如索引未建立），允許提交
    return null;
  }
}

/**
 * 計算平均評分
 * @param {Object} ratings - 評分物件
 * @returns {number} - 平均分數 (保留兩位小數)
 */
function calculateAverageRating(ratings) {
  const values = Object.values(ratings).filter(v => v > 0);
  if (values.length === 0) return 0;

  const sum = values.reduce((acc, val) => acc + val, 0);
  return Math.round((sum / values.length) * 100) / 100; // 保留兩位小數
}

/**
 * 獲取所有調查統計 (管理員用)
 * @returns {Promise<Object>}
 */
export async function getSurveyStatistics() {
  const db = admin.firestore();

  try {
    const snapshot = await db.collection('satisfaction_surveys').get();

    if (snapshot.empty) {
      return {
        totalSurveys: 0,
        averageRatings: {},
        feedbackCount: 0
      };
    }

    const surveys = snapshot.docs.map(doc => doc.data());

    // 計算各功能平均分
    const ratingsSums = {
      judgmentSearch: 0,
      judgmentDetail: 0,
      judgeAnalysis: 0,
      lawyerProfile: 0,
      canvasWorkspace: 0
    };

    const ratingsCounts = {
      judgmentSearch: 0,
      judgmentDetail: 0,
      judgeAnalysis: 0,
      lawyerProfile: 0,
      canvasWorkspace: 0
    };

    let feedbackCount = 0;

    surveys.forEach(survey => {
      Object.keys(ratingsSums).forEach(key => {
        if (survey.ratings[key] > 0) {
          ratingsSums[key] += survey.ratings[key];
          ratingsCounts[key]++;
        }
      });

      if (survey.feedback && survey.feedback.trim().length > 0) {
        feedbackCount++;
      }
    });

    const averageRatings = {};
    Object.keys(ratingsSums).forEach(key => {
      averageRatings[key] = ratingsCounts[key] > 0
        ? Math.round((ratingsSums[key] / ratingsCounts[key]) * 100) / 100
        : 0;
    });

    return {
      totalSurveys: surveys.length,
      averageRatings,
      feedbackCount,
      overallAverage: Math.round(
        (Object.values(averageRatings).reduce((a, b) => a + b, 0) / Object.keys(averageRatings).length) * 100
      ) / 100
    };

  } catch (error) {
    console.error('[Satisfaction Survey Service] Error fetching survey statistics:', error);
    throw error;
  }
}

