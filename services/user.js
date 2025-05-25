// services/user.js
import admin from 'firebase-admin';
import { plans as backendPlansData } from '../config/plansData.js'; // 引入方案配置

/**
 * 獲取用戶的 AI 勝訴案由分析歷史記錄
 * @param {string} userId 用戶 UID
 * @param {number} recordLimit 要獲取的記錄數量
 * @returns {Promise<Array<object>>} 歷史記錄陣列
 */
export async function getAiAnalysisHistory(userId, recordLimit = 10) {
    if (!userId) {
        console.error("[UserService] getAiAnalysisHistory: userId is required.");
        return [];
    }
    try {
        const historyColRef = admin.firestore()
                                    .collection('users')
                                    .doc(userId)
                                    .collection('aiAnalysisHistory');
        
        const querySnapshot = await historyColRef
                                        .orderBy('analysisDate', 'desc')
                                        .limit(recordLimit)
                                        .get();

        const historyRecords = [];
        querySnapshot.forEach(doc => {
            const data = doc.data();
            // 確保 analysisDate 存在且是 Firestore Timestamp 才轉換
            const analysisDateISO = data.analysisDate && typeof data.analysisDate.toDate === 'function' 
                                    ? data.analysisDate.toDate().toISOString() 
                                    : null;
            historyRecords.push({
                id: doc.id,
                caseTypeSelected: data.caseTypeSelected || "未知類型",
                caseSummaryText: data.caseSummaryText || "摘要內容缺失",
                analysisDate: analysisDateISO,
                analysisResult: { // 確保所有期望的 analysisResult 欄位都存在，給予預設值
                    status: data.status || 'unknown',
                    analyzedCaseCount: data.analyzedCaseCount || 0,
                    estimatedWinRate: data.estimatedWinRate === undefined ? null : data.estimatedWinRate,
                    monetaryStats: data.monetaryStats || null,
                    verdictDistribution: data.verdictDistribution || {},
                    strategyInsights: data.strategyInsights || null,
                    keyJudgementPoints: data.keyJudgementPoints || [],
                    commonCitedCases: data.commonCitedCases || [],
                    displayedSimilarCases: data.displayedSimilarCases || [],
                    message: data.message || "分析訊息缺失"
                }
            });
        });
        console.log(`[UserService] Fetched ${historyRecords.length} AI analysis history records for user ${userId}.`);
        return historyRecords;
    } catch (error) {
        console.error(`[UserService] Error fetching AI analysis history for user ${userId}:`, error);
        throw new Error(`無法獲取AI分析歷史紀錄: ${error.message}`); // 拋出更具體的錯誤
    }
}



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
 * 更新使用者的訂閱等級，並處理升級/降級邏輯。
 * @param {string} userId - 使用者 ID。
 * @param {string} newPlanId - 新的訂閱方案 ID (例如 'premium_plus')。
 * @param {object} newPlanDetails - 從 backendPlansData 獲取的新方案詳細資訊 (包含 creditsPerMonth)。
 * @returns {Promise<{success: boolean, message: string, newLevel?: string, downgradedTo?: string, effectiveAt?: string, grantedCredits?: number}>}
 */
export async function updateUserSubscriptionLevel(userId, newPlanId, newPlanDetails) {
  console.log(`[Subscription Service] User ${userId} requests change to plan ${newPlanId}`);
  if (!userId || !newPlanId || !newPlanDetails) {
    throw new Error('User ID, new plan ID, and plan details are required.');
  }

  const db = admin.firestore();
  const userRef = db.collection('users').doc(userId);

  try {
    const result = await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) {
        throw new Error('User document not found.');
      }

      const userData = userDoc.data();
      const currentLevel = userData.level;
      const currentCredits = userData.credits || 0;

      // 獲取方案的“權重”或順序，以便判斷升降級 (數字越大等級越高)
      const getPlanOrder = (planId) => {
        const order = { 'free': 0, 'basic': 1, 'advanced': 2, 'premium_plus': 3 };
        return order[planId?.toLowerCase()] ?? -1;
      };

      const currentOrder = getPlanOrder(currentLevel);
      const newOrder = getPlanOrder(newPlanId);

      if (currentOrder === newOrder) {
        return { success: true, message: `您目前已經是 ${newPlanDetails.name} 方案了。`, newLevel: currentLevel };
      }

      // --- 處理升級 ---
      if (newOrder > currentOrder) {
        console.log(`[Subscription Service] Processing UPGRADE for user ${userId} from ${currentLevel} to ${newPlanId}`);
        transaction.update(userRef, {
          level: newPlanId,
          subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          // 清除可能存在的待降級標記 (如果用戶在降級待生效期間又升級了)
          pendingDowngradeToLevel: admin.firestore.FieldValue.delete(),
          pendingDowngradeEffectiveDate: admin.firestore.FieldValue.delete(),
        });

        let grantedCredits = 0;
        let upgradeBonusCredits = 0;

        // 1. 新方案的當期贈點
        if (newPlanDetails.creditsPerMonth && newPlanDetails.creditsPerMonth > 0) {
          grantedCredits = newPlanDetails.creditsPerMonth;
          transaction.update(userRef, { credits: admin.firestore.FieldValue.increment(grantedCredits) });

          const grantDesc = `訂閱 ${newPlanDetails.name} 方案 - 首次/當期贈點`;
          const grantTransactionRef = userRef.collection('creditTransactions').doc();
          transaction.set(grantTransactionRef, {
            amount: grantedCredits, type: 'CREDIT', purpose: `subscription_grant_${newPlanId}`,
            description: grantDesc, balanceBefore: currentCredits,
            balanceAfter: currentCredits + grantedCredits, // 這裡的 balanceAfter 可能不完全準確，因為還有 bonus
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        // 2. 升級獎勵積分 (簡化版：固定獎勵或基於等級差異的獎勵)
        // 示例：從任何非免費版升級到 premium_plus，額外獎勵 1000
        if (newPlanId === 'premium_plus' && currentLevel !== 'free') {
            upgradeBonusCredits = 1000; // 可配置
        } else if (newPlanId === 'advanced' && (currentLevel === 'basic' || currentLevel === 'free')) {
            upgradeBonusCredits = 500; // 可配置
        }
        // ...可以根據需要添加更多升級路徑的獎勵規則

        if (upgradeBonusCredits > 0) {
          transaction.update(userRef, { credits: admin.firestore.FieldValue.increment(upgradeBonusCredits) });
          const bonusDesc = `從 ${backendPlansData[currentLevel]?.name || currentLevel} 升級至 ${newPlanDetails.name} - 獎勵積分`;
          const bonusTransactionRef = userRef.collection('creditTransactions').doc();
          transaction.set(bonusTransactionRef, {
            amount: upgradeBonusCredits, type: 'CREDIT', purpose: `upgrade_bonus_to_${newPlanId}`,
            description: bonusDesc, balanceBefore: currentCredits + grantedCredits, // 基於已贈送 grantedCredits 後的餘額
            balanceAfter: currentCredits + grantedCredits + upgradeBonusCredits,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        const totalGranted = grantedCredits + upgradeBonusCredits;
        return {
          success: true,
          message: `恭喜！您已成功升級至 ${newPlanDetails.name} 方案！`,
          newLevel: newPlanId,
          grantedCredits: totalGranted > 0 ? totalGranted : undefined,
        };
      }
      // --- 處理降級 ---
      else if (newOrder < currentOrder) {
        console.log(`[Subscription Service] Processing DOWNGRADE request for user ${userId} from ${currentLevel} to ${newPlanId}`);

        // 模擬：假設當前週期在一個月後結束 (真實情況需要根據用戶的實際訂閱日期計算)
        // 為了“直接執行”但保留模擬空間，我們可以立即記錄，但前端可以提示“將在下週期生效”
        // 或者，我們可以添加一個配置來決定是立即降級還是週期末降級。
        // 目前，我們直接記錄 pendingDowngrade，並讓後續的定時任務（如果有的話）或手動操作來實際執行降級。
        // 如果沒有定時任務，那這個 pendingDowngrade 的信息主要是給用戶看的。

        // **為了能“直接執行”降級效果（用於測試），我們可以加入一個開關或特定條件**
        const SIMULATE_IMMEDIATE_DOWNGRADE = process.env.SIMULATE_IMMEDIATE_DOWNGRADE === 'true'; // 可通過環境變數控制
        //通過後端的 SIMULATE_IMMEDIATE_DOWNGRADE 環境變數。如果您在開發時將其設為 'true'，那麼所有降級請求都會立即改變 level。

        if (SIMULATE_IMMEDIATE_DOWNGRADE) {
            console.log(`[Subscription Service] SIMULATING IMMEDIATE DOWNGRADE for user ${userId} to ${newPlanId}`);
            transaction.update(userRef, {
                level: newPlanId,
                subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
                pendingDowngradeToLevel: admin.firestore.FieldValue.delete(),
                pendingDowngradeEffectiveDate: admin.firestore.FieldValue.delete(),
            });
            // 立即降級通常不退點數，也不扣點數。新的贈點將在下個（模擬的）週期開始。
            return {
                success: true,
                message: `您的方案已（模擬立即）降級為 ${newPlanDetails.name}。新權益已生效。`,
                newLevel: newPlanId, // 因為是立即降級，所以 newLevel 就是 newPlanId
            };
        } else {
            // 標準處理：記錄待降級信息
            // 為了演示，我們假設“月底”生效
            const now = new Date();
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59); // 本月底
            const effectiveDate = admin.firestore.Timestamp.fromDate(endOfMonth);

            transaction.update(userRef, {
                pendingDowngradeToLevel: newPlanId,
                pendingDowngradeEffectiveDate: effectiveDate,
                // level 和 credits 保持不變
            });
            return {
                success: true,
                message: `您的方案降級請求已收到。新方案 ${newPlanDetails.name} 將於 ${endOfMonth.toLocaleDateString('zh-TW')} 生效。`,
                downgradedTo: newPlanId, // 告知前端將要降級到的方案
                effectiveAt: endOfMonth.toISOString(), // 告知前端預計生效時間
                // newLevel 保持 currentLevel，因為尚未生效
            };
        }
      }
      // 理論上不會執行到這裡，因為 currentOrder === newOrder 已處理
      return { success: false, message: "無效的方案變更請求。" };
    });
    return result;
  } catch (error) {
    console.error(`[Subscription Service] Error updating subscription for user ${userId} to ${newPlanId}:`, error);
    throw new Error(error.message || '處理您的訂閱變更時發生內部錯誤。');
  }
}