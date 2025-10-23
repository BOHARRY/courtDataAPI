// services/satisfactionSurveyService.js
// 🎯 滿意度調查服務層

import admin from 'firebase-admin';
import { addUserCreditsAndLog } from './credit.js';
import { CREDIT_REWARDS, CREDIT_PURPOSES } from '../config/creditCosts.js';

const SURVEY_REWARD_AMOUNT = 50; // 滿意度調查獎勵積分

/**
 * 提交滿意度調查（支持新增和更新）
 * @param {Object} params - 調查參數
 * @param {string} params.userId - 用戶 ID
 * @param {string} params.userEmail - 用戶 Email
 * @param {Object} params.ratings - 功能評分 { judgmentSearch: 4, judgeAnalysis: 5, ... }
 * @param {string} params.feedback - 開放式反饋
 * @returns {Promise<{surveyId: string, rewardAmount: number, isUpdate: boolean}>}
 */
export async function submitSurveyService({ userId, userEmail, ratings, feedback }) {
  const db = admin.firestore();

  try {
    console.log(`[Satisfaction Survey Service] 🎯 開始處理調查提交 User: ${userId}`);

    // 1. 檢查是否已有調查記錄
    const existingSurvey = await getUserSurveyService(userId);

    if (existingSurvey) {
      // 🎯 更新模式：更新現有調查，不發放積分
      console.log(`[Satisfaction Survey Service] ✏️ 更新模式 - 調查 ID: ${existingSurvey.id}`);
      return await updateExistingSurvey(existingSurvey.id, { ratings, feedback });
    } else {
      // 🎯 首次提交模式：創建新調查，發放積分
      console.log(`[Satisfaction Survey Service] ✨ 首次提交模式 - 創建新調查`);
      return await createNewSurvey({ userId, userEmail, ratings, feedback });
    }
  } catch (error) {
    console.error(`[Satisfaction Survey Service] ❌ 提交調查失敗 User ${userId}:`, error);
    throw error;
  }
}

/**
 * 創建新調查（首次提交）
 * @param {Object} params - 調查參數
 * @returns {Promise<{surveyId: string, rewardAmount: number, isUpdate: boolean}>}
 */
async function createNewSurvey({ userId, userEmail, ratings, feedback }) {
  const db = admin.firestore();

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
    averageRating: calculateAverageRating(ratings),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    submissionCount: 1,
    hasReceivedReward: false,
    submittedFrom: 'web'
  };

  // 寫入 Firestore
  const surveyRef = await db.collection('satisfaction_surveys').add(surveyData);
  const surveyId = surveyRef.id;

  console.log(`[Satisfaction Survey Service] ✅ 新調查已創建 ID: ${surveyId}, User: ${userId}`);

  // 發放積分獎勵
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

    // 標記已領取獎勵
    await surveyRef.update({ hasReceivedReward: true });

    console.log(`[Satisfaction Survey Service] 💰 已發放 ${SURVEY_REWARD_AMOUNT} 積分並標記為已領取 User: ${userId}`);
  } catch (creditError) {
    console.error(`[Satisfaction Survey Service] ❌ 積分發放失敗 User ${userId}:`, creditError);
    // 即使積分發放失敗，調查仍然成功提交
  }

  return {
    surveyId,
    rewardAmount,
    isUpdate: false
  };
}

/**
 * 更新現有調查
 * @param {string} surveyId - 調查 ID
 * @param {Object} params - 更新參數
 * @returns {Promise<{surveyId: string, rewardAmount: number, isUpdate: boolean}>}
 */
async function updateExistingSurvey(surveyId, { ratings, feedback }) {
  const db = admin.firestore();
  const surveyRef = db.collection('satisfaction_surveys').doc(surveyId);

  console.log(`[Satisfaction Survey Service] 📝 開始更新調查 ID: ${surveyId}`);

  const updateData = {
    ratings: {
      judgmentSearch: ratings.judgmentSearch || 0,
      judgmentDetail: ratings.judgmentDetail || 0,
      judgeAnalysis: ratings.judgeAnalysis || 0,
      lawyerProfile: ratings.lawyerProfile || 0,
      canvasWorkspace: ratings.canvasWorkspace || 0
    },
    feedback: feedback.trim(),
    averageRating: calculateAverageRating(ratings),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    submissionCount: admin.firestore.FieldValue.increment(1)
  };

  await surveyRef.update(updateData);

  console.log(`[Satisfaction Survey Service] ✅ 調查已更新 ID: ${surveyId} (不發放積分)`);

  return {
    surveyId,
    rewardAmount: 0,  // 更新時不發放積分
    isUpdate: true
  };
}

/**
 * 獲取用戶的調查記錄
 * @param {string} userId - 用戶 ID
 * @returns {Promise<Object|null>} - 調查記錄（包含 id）或 null
 */
export async function getUserSurveyService(userId) {
  const db = admin.firestore();

  try {
    console.log(`[Satisfaction Survey Service] 查詢用戶 ${userId} 的調查記錄...`);

    const snapshot = await db.collection('satisfaction_surveys')
      .where('userId', '==', userId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      console.log(`[Satisfaction Survey Service] 用戶 ${userId} 沒有調查記錄`);
      return null;
    }

    const doc = snapshot.docs[0];
    const surveyData = {
      id: doc.id,
      ...doc.data()
    };

    console.log(`[Satisfaction Survey Service] 找到用戶 ${userId} 的調查記錄:`, {
      id: surveyData.id,
      hasReceivedReward: surveyData.hasReceivedReward,
      submissionCount: surveyData.submissionCount,
      createdAt: surveyData.createdAt
    });
    return surveyData;
  } catch (error) {
    console.error(`[Satisfaction Survey Service] 查詢調查記錄失敗 User ${userId}:`, error);
    // ⚠️ 查詢失敗時拋出錯誤，而不是返回 null
    throw new Error(`無法查詢調查記錄: ${error.message}`);
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

/**
 * 🔧 管理員專用：獲取所有滿意度調查（支持分頁和排序）
 * @param {Object} params - 查詢參數
 * @param {number} params.page - 頁碼（從 1 開始）
 * @param {number} params.limit - 每頁數量
 * @param {string} params.sortBy - 排序欄位（createdAt, averageRating）
 * @param {string} params.sortOrder - 排序方向（asc, desc）
 * @returns {Promise<{surveys: Array, total: number, page: number, totalPages: number}>}
 */
export async function getAllSurveysForAdminService({ page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' }) {
  const db = admin.firestore();

  try {
    console.log(`[Satisfaction Survey Service] 🔍 管理員查詢所有調查 - Page: ${page}, Limit: ${limit}, Sort: ${sortBy} ${sortOrder}`);

    // 建立基礎查詢
    let query = db.collection('satisfaction_surveys');

    // 排序
    const orderDirection = sortOrder === 'asc' ? 'asc' : 'desc';
    query = query.orderBy(sortBy, orderDirection);

    // 獲取總數（用於分頁）
    const totalSnapshot = await db.collection('satisfaction_surveys').count().get();
    const total = totalSnapshot.data().count;

    // 分頁
    const offset = (page - 1) * limit;
    query = query.offset(offset).limit(limit);

    // 執行查詢
    const snapshot = await query.get();

    // 格式化結果
    const surveys = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      surveys.push({
        id: doc.id,
        userId: data.userId,
        userEmail: data.userEmail,
        ratings: data.ratings,
        feedback: data.feedback,
        averageRating: data.averageRating,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        submissionCount: data.submissionCount || 1,
        hasReceivedReward: data.hasReceivedReward || false
      });
    });

    const totalPages = Math.ceil(total / limit);

    console.log(`[Satisfaction Survey Service] ✅ 查詢成功 - 返回 ${surveys.length} 筆，共 ${total} 筆`);

    return {
      surveys,
      total,
      page,
      limit,
      totalPages
    };

  } catch (error) {
    console.error('[Satisfaction Survey Service] ❌ 管理員查詢失敗:', error);
    throw error;
  }
}

