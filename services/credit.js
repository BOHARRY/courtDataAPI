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
/**
 * 在 Firestore 交易中檢查並扣除使用者積分，並記錄交易。
 * @param {FirebaseFirestore.Transaction} transaction - Firestore 交易實例。
 * @param {FirebaseFirestore.DocumentReference} userDocRef - 使用者文件的引用。
 * @param {string} userId - 使用者 ID。
 * @param {number} cost - 需要扣除的積分數量 (必須為正數)。
 * @param {string} purpose - 此次扣除的用途識別碼。
 * @param {object} [logDetails={ description: '' }] - 用於記錄此次積分變動的額外信息。
 * @returns {Promise<{sufficient: boolean, currentCredits: number, newCredits?: number}>}
 */
export async function checkAndDeductUserCreditsInTransaction(transaction, userDocRef, userId, cost, purpose, logDetails = { description: '' }) {
  if (cost <= 0) {
    console.error(`[Credit Service] Cost must be a positive number. Received: ${cost}`);
    const error = new Error('Cost must be a positive number.');
    error.statusCode = 400; // Bad Request
    throw error;
  }

  const userDoc = await transaction.get(userDocRef);

  if (!userDoc.exists) {
    console.error(`[Credit Service] User document not found for UID: ${userId}`);
    const error = new Error('User data not found.');
    error.statusCode = 404;
    throw error;
  }

  const userData = userDoc.data();
  const currentCredits = userData.credits || 0;

  if (currentCredits < cost) {
    return { sufficient: false, currentCredits };
  }

  const newCredits = currentCredits - cost;

  // 更新用戶積分
  transaction.update(userDocRef, {
    credits: admin.firestore.FieldValue.increment(-cost), // 使用 increment
    lastActivityAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // 新增積分交易紀錄
  const creditTransactionRef = userDocRef.collection('creditTransactions').doc(); // 自動生成 ID
  transaction.set(creditTransactionRef, {
    amount: cost,
    type: 'DEBIT', // 標記為扣除
    purpose: purpose,
    description: logDetails.description,
    balanceBefore: currentCredits,
    balanceAfter: newCredits,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    ...(logDetails.relatedId && { relatedId: logDetails.relatedId }) // 如果有相關 ID
  });

  console.log(`[Credit Service - Transaction] User ${userId}: ${cost} credits deducted for ${purpose}. Balance: ${currentCredits} -> ${newCredits}. Transaction logged.`);
  return { sufficient: true, currentCredits, newCredits };
}

/**
 * 在 Firestore 交易中為使用者增加積分，並記錄交易。
 * @param {FirebaseFirestore.Transaction} transaction - Firestore 交易實例。
 * @param {FirebaseFirestore.DocumentReference} userDocRef - 使用者文件的引用。
 * @param {string} userId - 使用者 ID。
 * @param {number} amount - 需要增加的積分數量 (必須為正數)。
 * @param {string} purpose - 此次增加的用途識別碼。
 * @param {object} [logDetails={ description: '' }] - 用於記錄此次積分變動的額外信息。
 * @returns {Promise<{currentCredits: number, newCredits: number}>}
 */
export async function addUserCreditsInTransaction(transaction, userDocRef, userId, amount, purpose, logDetails = { description: '' }, userSnapshot) {
  if (amount <= 0) {
    console.error(`[Credit Service] Amount to add must be a positive number. Received: ${amount}`);
    const error = new Error('Amount to add must be a positive number.');
    error.statusCode = 400; // Bad Request
    throw error;
  }

  //const userDoc = await transaction.get(userDocRef);
  if (!userSnapshot || !userSnapshot.exists) { // 使用傳入的 snapshot
    console.error(`[Credit Service TX] User document snapshot not provided or does not exist for UID: ${userId}`);
    throw new Error('User data not found (from snapshot).');
  }

  const userData = userSnapshot.data(); // 從 snapshot 獲取數據

  const currentCredits = userData.credits || 0;
  const newCredits = currentCredits + amount;

  // 更新用戶積分
  transaction.update(userDocRef, {
    credits: admin.firestore.FieldValue.increment(amount), // 使用 increment
    lastActivityAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // 新增積分交易紀錄
  const creditTransactionRef = userDocRef.collection('creditTransactions').doc(); // 自動生成 ID
  transaction.set(creditTransactionRef, {
    amount: amount,
    type: 'CREDIT', // 標記為增加
    purpose: purpose,
    description: logDetails.description || `獲得 ${amount} 點積分來自 ${purpose}`, // 預設描述
    balanceBefore: currentCredits,
    balanceAfter: newCredits,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    ...(logDetails.relatedId && { relatedId: logDetails.relatedId })
  });

  console.log(`[Credit Service - Transaction] User ${userId}: ${amount} credits added for ${purpose}. Balance: ${currentCredits} -> ${newCredits}. Transaction logged.`);
  return { currentCredits, newCredits };
}

// 外部直接調用 (非交易中) - 如果需要在非交易情境下增加積分並記錄
// 注意：這不是原子操作，如果需要原子性，應始終在交易中調用上述 addUserCreditsInTransaction
export async function addUserCreditsAndLog(userId, amount, purpose, logDetails = { description: '' }) {
  const db = admin.firestore();
  const userDocRef = db.collection('users').doc(userId);

  try {
    return await db.runTransaction(async (transaction) => {
      // 🔧 修正：在交易中讀取用戶文檔
      const userSnapshot = await transaction.get(userDocRef);
      return addUserCreditsInTransaction(transaction, userDocRef, userId, amount, purpose, logDetails, userSnapshot);
    });
  } catch (error) {
    console.error(`[Credit Service] Failed to add credits and log for user ${userId}:`, error);
    throw error; // 重新拋出錯誤，讓調用者處理
  }
}

// 註冊獎勵的特定函數
export async function grantSignupBonus(userId) {
  // 🆕 從配置文件讀取獎勵金額
  const { CREDIT_REWARDS } = await import('../config/creditCosts.js');
  const bonusAmount = CREDIT_REWARDS.SIGNUP_BONUS;

  // 檢查用戶是否已經領取過註冊獎勵，避免重複發放
  const userDocRef = admin.firestore().collection('users').doc(userId);
  const userDoc = await userDocRef.get();
  if (userDoc.exists && userDoc.data().hasReceivedSignupBonus) {
    console.log(`[Credit Service] User ${userId} has already received signup bonus.`);
    return { message: "Signup bonus already granted." };
  }

  try {
    await addUserCreditsAndLog(
      userId,
      bonusAmount,
      'signup_bonus',
      { description: `新用戶註冊獎勵 ${bonusAmount} 點` }
    );
    // 標記已領取
    await userDocRef.update({ hasReceivedSignupBonus: true });
    console.log(`[Credit Service] Signup bonus of ${bonusAmount} granted to user ${userId}.`);
    return { message: "Signup bonus granted successfully.", bonusAmount };
  } catch (error) {
    console.error(`[Credit Service] Failed to grant signup bonus to user ${userId}:`, error);
    throw error;
  }
}

// 🎁 新手任務完成獎勵的特定函數
export async function grantOnboardingTasksCompletionReward(userId) {
  // 從配置文件讀取獎勵金額
  const { CREDIT_REWARDS } = await import('../config/creditCosts.js');
  const rewardAmount = CREDIT_REWARDS.ONBOARDING_TASKS_COMPLETION;

  // 檢查用戶是否已經領取過新手任務完成獎勵，避免重複發放
  const userDocRef = admin.firestore().collection('users').doc(userId);
  const userDoc = await userDocRef.get();

  if (!userDoc.exists) {
    console.error(`[Credit Service] User ${userId} does not exist.`);
    throw new Error('User not found');
  }

  const userData = userDoc.data();
  const metadata = userData.onboardingTasksMetadata || {};

  // 檢查是否已領取
  if (metadata.hasReceivedCompletionReward) {
    console.log(`[Credit Service] User ${userId} has already received onboarding tasks completion reward.`);
    return { message: "Onboarding tasks completion reward already granted." };
  }

  // 檢查是否真的完成了所有任務
  if (!metadata.allTasksCompletedAt) {
    console.error(`[Credit Service] User ${userId} has not completed all onboarding tasks.`);
    throw new Error('All onboarding tasks must be completed before claiming reward');
  }

  try {
    await addUserCreditsAndLog(
      userId,
      rewardAmount,
      'onboarding_tasks_completion',
      { description: `新手任務全部完成獎勵 ${rewardAmount} 點` }
    );

    // 標記已領取
    await userDocRef.update({
      'onboardingTasksMetadata.hasReceivedCompletionReward': true,
      'onboardingTasksMetadata.rewardClaimedAt': admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`[Credit Service] Onboarding tasks completion reward of ${rewardAmount} granted to user ${userId}.`);
    return { message: "Onboarding tasks completion reward granted successfully.", rewardAmount };
  } catch (error) {
    console.error(`[Credit Service] Failed to grant onboarding tasks completion reward to user ${userId}:`, error);
    throw error;
  }
}