// services/user.js
import admin from 'firebase-admin';

/**
 * 添加一條律師搜尋歷史記錄到使用者的 Firestore 文件中。
 * @param {string} userId - 使用者 ID。
 * @param {string} lawyerName - 搜尋的律師名稱。
 * @param {boolean} foundResults - 是否找到了該律師的案件結果。
 * @returns {Promise<void>}
 * @throws {Error} 如果寫入 Firestore 失敗。
 */
export async function addLawyerSearchHistory(userId, lawyerName, foundResults) {
  // console.log(`[User Service] Adding lawyer search history for user ${userId}, lawyer: ${lawyerName}`);
  try {
    const historyRef = admin.firestore()
      .collection('users')
      .doc(userId)
      .collection('lawyerSearchHistory'); // 子集合名稱

    await historyRef.add({
      lawyerName: lawyerName,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      foundResults: foundResults,
      // 可以考慮添加其他信息，如搜尋時的篩選條件 (如果適用)
    });
    // console.log(`[User Service] Lawyer search history added for user ${userId}.`);
  } catch (error) {
    console.error(`[User Service] Error adding lawyer search history for user ${userId}:`, error);
    // 不建議在這裡拋出致命錯誤，因為記錄歷史是次要操作
    // 但可以記錄錯誤，以便追蹤
    // 如果需要，可以定義一個特定的 ServiceError 並拋出
  }
}

/**
 * 獲取使用者的律師搜尋歷史。
 * @param {string} userId - 使用者 ID。
 * @param {number} [limit=10] - 返回的歷史記錄數量上限。
 * @returns {Promise<Array<object>>} 搜尋歷史列表。
 */
export async function getLawyerSearchHistory(userId, limit = 10) {
  // console.log(`[User Service] Getting lawyer search history for user ${userId}, limit: ${limit}`);
  try {
    const historySnapshot = await admin.firestore()
      .collection('users')
      .doc(userId)
      .collection('lawyerSearchHistory')
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();

    if (historySnapshot.empty) {
      return [];
    }

    const history = historySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        lawyerName: data.lawyerName,
        timestamp: data.timestamp.toDate().toISOString(), // 轉換為 ISO 字串
        foundResults: data.foundResults
      };
    });
    return history;
  } catch (error) {
    console.error(`[User Service] Error getting lawyer search history for user ${userId}:`, error);
    throw new Error('Failed to retrieve lawyer search history.'); // 服務層可以拋出通用錯誤
  }
}

/**
 * 獲取使用者的積分變動歷史。
 * @param {string} userId - 使用者 ID。
 * @param {number} [limit=20] - 返回的歷史記錄數量上限。
 * @returns {Promise<Array<object>>} 積分變動歷史列表。
 */
export async function getCreditTransactionHistory(userId, limit = 20) {
  // console.log(`[User Service] Getting credit transaction history for user ${userId}, limit: ${limit}`);
  try {
    const historySnapshot = await admin.firestore()
      .collection('users')
      .doc(userId)
      .collection('creditTransactions') // 子集合名稱
      .orderBy('timestamp', 'desc')     // 按時間倒序
      .limit(limit)
      .get();

    if (historySnapshot.empty) {
      return [];
    }

    const history = historySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        amount: data.amount,
        type: data.type, // 'DEBIT' 或 'CREDIT'
        purpose: data.purpose,
        description: data.description || '',
        balanceBefore: data.balanceBefore, // (可選)
        balanceAfter: data.balanceAfter,   // (可選)
        timestamp: data.timestamp.toDate().toISOString(), // 轉換為 ISO 字串
        relatedId: data.relatedId || null
      };
    });
    return history;
  } catch (error) {
    console.error(`[User Service] Error getting credit transaction history for user ${userId}:`, error);
    throw new Error('Failed to retrieve credit transaction history.');
  }
}
/**
 * 更新使用者的訂閱等級。
 * @param {string} userId - 使用者 ID。
 * @param {string} newLevel - 新的訂閱等級標識符 (例如 'premium_plus', 'Basic', 'Advanced')。
 * @param {object} [newSubscriptionDetails={}] - (可選) 新訂閱方案的詳細資訊，例如每月贈點。
 * @returns {Promise<{success: boolean, message: string, newLevel?: string, grantedCredits?: number}>}
 */
export async function updateUserSubscriptionLevel(userId, newLevel, newSubscriptionDetails = {}) {
  console.log(`[User Service] Attempting to update subscription level for user ${userId} to ${newLevel}`);
  if (!userId || !newLevel) {
    throw new Error('User ID and new level are required.');
  }

  const db = admin.firestore();
  const userRef = db.collection('users').doc(userId);

  try {
    // 在一個事務中執行更新和可能的點數贈送
    const result = await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) {
        throw new Error('User document not found.');
      }

      const userData = userDoc.data();
      const oldLevel = userData.level;

      if (oldLevel === newLevel) {
        return { success: true, message: `User is already on ${newLevel} plan.`, newLevel: oldLevel };
      }

      // 更新 level
      transaction.update(userRef, {
        level: newLevel,
        subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        // 您可以在這裡添加其他與訂閱相關的欄位，例如訂閱開始/結束日期 (未來)
      });

      let grantedCredits = 0;
      // 模擬：如果升級到特定方案，給予一次性或確認首次月贈點
      // 在真實情況下，每月贈點會由定時任務處理，但首次訂閱/升級時可以立即給予
      if (newLevel === 'premium_plus' && newSubscriptionDetails.creditsPerMonth) {
        // 假設 newSubscriptionDetails.creditsPerMonth 是超高階方案的每月贈點數
        grantedCredits = newSubscriptionDetails.creditsPerMonth;
        transaction.update(userRef, {
          credits: admin.firestore.FieldValue.increment(grantedCredits)
        });

        // 記錄積分增加
        const creditTransactionRef = userRef.collection('creditTransactions').doc();
        transaction.set(creditTransactionRef, {
          amount: grantedCredits,
          type: 'CREDIT',
          purpose: `subscription_grant_${newLevel}`, // 例如 'subscription_grant_premium_plus'
          description: `訂閱 ${newLevel === 'premium_plus' ? '尊榮客製版' : newLevel} 方案 - 首次贈點`,
          balanceBefore: userData.credits || 0,
          balanceAfter: (userData.credits || 0) + grantedCredits,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`[User Service] Granted ${grantedCredits} credits to user ${userId} for subscribing to ${newLevel}.`);
      }
      // 您可以為其他方案（如 'Advanced'）也添加類似的首次贈點邏輯

      return { success: true, message: `User subscription level updated to ${newLevel}.`, newLevel, grantedCredits };
    });

    return result;

  } catch (error) {
    console.error(`[User Service] Error updating subscription level for user ${userId}:`, error);
    // 拋出錯誤，讓控制器處理
    throw new Error(error.message || 'Failed to update subscription level.');
  }
}