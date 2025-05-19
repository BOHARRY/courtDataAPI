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