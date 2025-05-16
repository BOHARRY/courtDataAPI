// services/credit.js
import admin from 'firebase-admin';

/**
 * 在 Firestore 交易中檢查並扣除使用者積分。
 * @param {FirebaseFirestore.Transaction} transaction - Firestore 交易實例。
 * @param {FirebaseFirestore.DocumentReference} userDocRef - 使用者文件的引用。
 * @param {string} userId - 使用者 ID。
 * @param {number} cost - 需要扣除的積分數量。
 * @param {object} [logDetails={}] - 用於記錄此次積分變動的額外信息。
 * @returns {Promise<{sufficient: boolean, currentCredits: number, newCredits?: number}>}
 */
export async function checkAndDeductUserCreditsInTransaction(transaction, userDocRef, userId, cost, logDetails = {}) {
  const userDoc = await transaction.get(userDocRef);

  if (!userDoc.exists) {
    console.error(`[Credit Service] User document not found for UID: ${userId}`);
    const error = new Error('User data not found.');
    error.statusCode = 404;
    throw error;
  }

  const userData = userDoc.data();
  const currentCredits = userData.credits || 0;
  // console.log(`[Credit Service - Transaction] User ${userId} current credits: ${currentCredits}, cost: ${cost}`);

  if (currentCredits < cost) {
    // console.warn(`[Credit Service - Transaction] User ${userId} insufficient credits.`);
    return { sufficient: false, currentCredits };
  }

  const newCredits = currentCredits - cost;
  transaction.update(userDocRef, {
    credits: admin.firestore.FieldValue.increment(-cost), // 使用 increment 更安全
    lastActivityAt: admin.firestore.FieldValue.serverTimestamp(), // 更新最後活動時間
    // 可以考慮記錄更詳細的消費歷史，例如在 userDoc 的一個 subcollection 中
    // lastDeduction: {
    //   cost,
    //   timestamp: admin.firestore.FieldValue.serverTimestamp(),
    //   action: logDetails.action || 'unknown_action',
    //   ...logDetails.details
    // }
  });
  // console.log(`[Credit Service - Transaction] Deducting ${cost} credit(s) from user ${userId}. New balance (expected): ${newCredits}`);
  return { sufficient: true, currentCredits, newCredits };
}

// 未來可以添加其他積分相關服務，例如：
// export async function addUserCredits(userId, amount, reason) { ... }
// export async function getUserCreditBalance(userId) { ... }