// services/user.js
import admin from 'firebase-admin';
import { plans as legacyPlansData } from '../config/plansData.js'; // 主要用於獲取 name (如果 subscriptionProducts 中沒有)
import { subscriptionProducts } from '../config/subscriptionProducts.js'; // 新的產品配置
import { CREDIT_PURPOSES } from '../config/creditCosts.js';
import * as creditService from './credit.js'; // 確保 creditService 已準備好接收 transaction

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
// 訂閱到期通知
export async function checkSubscriptionExpiry(userId) {
  const userDoc = await admin.firestore().collection('users').doc(userId).get();
  const userData = userDoc.data();
  const endDate = userData.subscriptionEndDate?.toDate();

  if (endDate) {
    const daysUntilExpiry = Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24));

    // 7天、3天、1天前發送提醒
    if ([7, 3, 1].includes(daysUntilExpiry)) {
      // 發送提醒郵件或推播通知
    }
  }
}

/**
 * 更新使用者的訂閱等級、效期並授予相應點數。
 * 此函數必須在一個 Firestore transaction 內部被調用。
 *
 * @param {FirebaseFirestore.Transaction} transaction - Firestore 交易實例。
 * @param {string} userId - 使用者 ID。
 * @param {string} newPlanId - 新的訂閱方案 ID (e.g., 'basic', 'advanced')，應為小寫。
 * @param {string} billingCycle - 付款週期 ('monthly' 或 'annually')，應為小寫。
 * @param {string} [relatedOrderId] - (可選) 觸發此次更新的相關訂單ID，用於記錄。
 * @param {boolean} [isInitialActivation=true] - 是否為首次激活此訂閱 (用於判斷是否給升級獎勵)。
 * @returns {Promise<{success: boolean, message: string, newLevel: string, grantedCredits: number, subscriptionEndDate: Date}>}
 * @throws {Error} 如果配置錯誤或用戶數據不存在。
 */
export async function updateUserSubscriptionInTransaction(
  transaction,
  userId,
  newPlanId,
  billingCycle,
  relatedOrderId = null,
  isInitialActivation = true
) {
  console.log(`[UserService TX] Updating subscription for user ${userId} to plan ${newPlanId} (${billingCycle}), initial: ${isInitialActivation}, order: ${relatedOrderId}`);

  const planIdLowerCase = newPlanId.toLowerCase();
  const billingCycleLowerCase = billingCycle.toLowerCase();

  const productConfig = subscriptionProducts[planIdLowerCase];
  if (!productConfig || !productConfig.pricing || !productConfig.pricing[billingCycleLowerCase]) {
    throw new Error(`無效的方案 ID (${newPlanId}) 或付款週期 (${billingCycle}) 於 subscriptionProducts.js 配置中。`);
  }

  const pricingDetails = productConfig.pricing[billingCycleLowerCase];
  const userRef = admin.firestore().collection('users').doc(userId);

  const userDoc = await transaction.get(userRef);
  if (!userDoc.exists) {
    throw new Error(`用戶文檔 (ID: ${userId}) 不存在。`);
  }
  const userData = userDoc.data();
  const currentLevel = userData.level ? userData.level.toLowerCase() : 'free';
  // currentCredits 將由 creditService.addUserCreditsInTransaction 內部讀取和更新

  // 計算訂閱起止日期
  const now = new Date();
  const subscriptionStartDate = now;
  let subscriptionEndDate;
  let baseGrantedCredits = 0; // 本次週期基礎贈點
  let purposeKey = '';
  let description = '';

  const userUpdates = {
    level: planIdLowerCase,
    subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    subscriptionStartDate: admin.firestore.Timestamp.fromDate(subscriptionStartDate),
    subscriptionEndDate: admin.firestore.Timestamp.fromDate(subscriptionEndDate),
    billingCycle: billingCycleLowerCase,
    subscriptionId: relatedOrderId || userData.subscriptionId || null, // 優先使用新訂單ID
    pendingDowngradeToLevel: admin.firestore.FieldValue.delete(),
    pendingDowngradeEffectiveDate: admin.firestore.FieldValue.delete(),
  };

  // 如果新的計費週期不是月付 (即年付，走MPG)，則清除 newebpayPeriodNo
  // 如果是月付，newebpayPeriodNo 將由 paymentController 中的 Period Notify 處理器設定
  if (billingCycleLowerCase !== 'monthly') {
    userUpdates.newebpayPeriodNo = admin.firestore.FieldValue.delete();
  }

  if (billingCycleLowerCase === 'annually') {
    subscriptionEndDate = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate() - 1, 23, 59, 59); // 一年後的前一天結束
    userUpdates.subscriptionEndDate = admin.firestore.Timestamp.fromDate(subscriptionEndDate);
    baseGrantedCredits = productConfig.creditsPerYear || (productConfig.creditsPerMonth || 0) * 12; // 優先用年贈點，其次月贈點*12
    purposeKey = `${CREDIT_PURPOSES.SUBSCRIPTION_GRANT_PREFIX}${planIdLowerCase}_annual`;
    description = `訂閱 ${productConfig.name} 方案 (年付) - 年度贈點`;
  } else if (billingCycleLowerCase === 'monthly') {
    subscriptionEndDate = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate() - 1, 23, 59, 59); // 一個月後的前一天結束
    userUpdates.subscriptionEndDate = admin.firestore.Timestamp.fromDate(subscriptionEndDate);
    baseGrantedCredits = productConfig.creditsPerMonth || 0;
    if (isInitialActivation) {
      purposeKey = `${CREDIT_PURPOSES.SUBSCRIPTION_GRANT_PREFIX}${planIdLowerCase}_monthly_initial`;
      description = `訂閱 ${productConfig.name} 方案 (月付) - 首月贈點`;
    } else {
      purposeKey = `${CREDIT_PURPOSES.SUBSCRIPTION_RENEWAL_GRANT}${planIdLowerCase}_monthly`;
      description = `訂閱 ${productConfig.name} 方案 (${productConfig.pricing?.monthly?.displayText || '月付'}) - 當期贈點`;
    }
  } else {
    throw new Error(`不支援的付款週期: ${billingCycle}`);
  }

  // 1. 更新用戶主文檔的訂閱信息
  transaction.update(userRef, userUpdates);
  console.log(`[UserService TX] User ${userId} document updated for plan ${planIdLowerCase} (${billingCycleLowerCase}). EndDate: ${subscriptionEndDate?.toISOString()}`);

  let totalGrantedThisTransaction = 0;

  // 2. 授予本週期基礎點數
  if (baseGrantedCredits > 0) {
    await creditService.addUserCreditsInTransaction(
      transaction, userRef, userId, baseGrantedCredits,
      purposeKey, { description, relatedId: relatedOrderId }
    );
    totalGrantedThisTransaction += baseGrantedCredits;
    console.log(`[UserService TX] Granted ${baseGrantedCredits} base credits to user ${userId} for ${description}.`);
  }

  // 3. 處理升級獎勵 (僅在首次激活且等級確實提升時)
  if (isInitialActivation) {
    const getPlanOrder = (planId) => {
      const order = { 'free': 0, 'basic': 1, 'advanced': 2, 'premium_plus': 3 }; // 假設的等級順序
      return order[planId] ?? -1;
    };
    const currentOrder = getPlanOrder(currentLevel);
    const newOrder = getPlanOrder(planIdLowerCase);
    let upgradeBonusCredits = 0;

    if (newOrder > currentOrder) { // 確認是等級提升
      // 從 subscriptionProducts 獲取升級獎勵配置
      if (planIdLowerCase === 'advanced' && productConfig.upgradeBonusToAdvanced) {
        upgradeBonusCredits = productConfig.upgradeBonusToAdvanced;
      } else if (planIdLowerCase === 'premium_plus' && productConfig.upgradeBonusToPremiumPlus) {
        upgradeBonusCredits = productConfig.upgradeBonusToPremiumPlus;
      }
      // 可以添加更多細緻的升級路徑獎勵規則，例如從 basic 到 premium_plus

      if (upgradeBonusCredits > 0) {
        const oldPlanName = legacyPlansData[currentLevel]?.name || subscriptionProducts[currentLevel]?.name || currentLevel || '先前方案';
        const bonusDesc = `從 ${oldPlanName} 升級至 ${productConfig.name} - 獎勵積分`;
        await creditService.addUserCreditsInTransaction(
          transaction, userRef, userId, upgradeBonusCredits,
          `upgrade_bonus_to_${planIdLowerCase}`,
          { description: bonusDesc, relatedId: relatedOrderId }
        );
        totalGrantedThisTransaction += upgradeBonusCredits;
        console.log(`[UserService TX] Granted ${upgradeBonusCredits} upgrade bonus credits to user ${userId}.`);
      }
    }
  }

  return {
    success: true,
    message: `用戶 ${userId} 訂閱方案已成功更新為 ${productConfig.name} (${billingCycleLowerCase})。`,
    newLevel: planIdLowerCase,
    grantedCredits: totalGrantedThisTransaction, // 返回本次操作總共授予的點數
    subscriptionEndDate: subscriptionEndDate
  };
}

/**
 * 更新使用者的訂閱等級 (外部調用接口，內部使用 transaction)。
 * @param {string} userId - 使用者 ID。
 * @param {string} newPlanId - 新的訂閱方案 ID。
 * @param {string} billingCycle - 付款週期 ('monthly' 或 'annually')。
 * @param {string} [relatedOrderId] - (可選) 相關訂單ID。
 * @param {boolean} [isInitialActivation=true] - 是否為首次激活。
 * @returns {Promise<object>} 操作結果。
 */
export async function updateUserSubscriptionLevel(
  userId,
  newPlanId,
  billingCycle,
  relatedOrderId = null,
  isInitialActivation = true
) {
  const db = admin.firestore();
  try {
    const result = await db.runTransaction(async (transaction) => {
      return await updateUserSubscriptionInTransaction(
        transaction,
        userId,
        newPlanId,
        billingCycle,
        relatedOrderId,
        isInitialActivation
      );
    });
    return result;
  } catch (error) {
    console.error(`[UserService] Error in updateUserSubscriptionLevel for user ${userId} to plan ${newPlanId} (${billingCycle}):`, error);
    // 拋出原始錯誤或包裝後的錯誤，讓 controller 處理 HTTP 回應
    throw error;
  }
}

/**
 * 取消待降級請求
 * @param {string} userId - 使用者 ID
 * @returns {Promise<{success: boolean, message: string, currentLevel?: string}>}
 */
export async function cancelPendingDowngrade(userId) {
  console.log(`[UserService] Cancelling pending downgrade for user ${userId}`);

  if (!userId) {
    throw new Error('User ID is required.');
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
      const pendingDowngradeToLevel = userData.pendingDowngradeToLevel;
      const pendingDowngradeEffectiveDate = userData.pendingDowngradeEffectiveDate;

      // 檢查是否有待降級請求
      if (!pendingDowngradeToLevel || !pendingDowngradeEffectiveDate) {
        return {
          success: false,
          message: '目前沒有待處理的降級請求。',
          currentLevel: currentLevel
        };
      }

      // 檢查降級是否已經生效
      const effectiveDate = pendingDowngradeEffectiveDate.toDate();
      const now = new Date();
      if (now >= effectiveDate) {
        return {
          success: false,
          message: '降級已經生效，無法取消。',
          currentLevel: currentLevel
        };
      }

      // 取消降級：清除待降級標記
      transaction.update(userRef, {
        pendingDowngradeToLevel: admin.firestore.FieldValue.delete(),
        pendingDowngradeEffectiveDate: admin.firestore.FieldValue.delete(),
        subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // 記錄取消降級的操作到交易歷史
      const transactionRef = userRef.collection('creditTransactions').doc();
      transaction.set(transactionRef, {
        amount: 0,
        type: 'NOTE',
        purpose: 'cancel_downgrade',
        description: `取消降級至 ${getPlanDisplayName(pendingDowngradeToLevel)} 方案`,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`[UserService] Successfully cancelled pending downgrade for user ${userId} from ${currentLevel} to ${pendingDowngradeToLevel}`);

      return {
        success: true,
        message: `已成功取消降級請求。您將繼續使用 ${getPlanDisplayName(currentLevel)} 方案。`,
        currentLevel: currentLevel
      };
    });

    return result;
  } catch (error) {
    console.error(`[UserService] Error cancelling pending downgrade for user ${userId}:`, error);
    throw new Error(error.message || '取消降級請求時發生錯誤。');
  }
}
/**
 * 獲取使用者的訂閱狀態詳細資訊（包含待降級資訊）
 * @param {string} userId - 使用者 ID
 * @returns {Promise<object>} 訂閱狀態詳細資訊
 */
export async function getUserSubscriptionStatus(userId) {
  console.log(`[UserService] Getting subscription status for user ${userId}`);

  if (!userId) {
    throw new Error('User ID is required.');
  }

  try {
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    if (!userDoc.exists) {
      throw new Error('User document not found.');
    }

    const userData = userDoc.data();
    const currentLevel = userData.level || 'free';
    const pendingDowngradeToLevel = userData.pendingDowngradeToLevel;
    const pendingDowngradeEffectiveDate = userData.pendingDowngradeEffectiveDate;
    const subscriptionEndDate = userData.subscriptionEndDate;
    const billingCycle = userData.billingCycle;

    // 基本訂閱資訊
    const subscriptionStatus = {
      currentLevel: currentLevel,
      currentLevelName: getPlanDisplayName(currentLevel),
      billingCycle: billingCycle || null,
      subscriptionEndDate: subscriptionEndDate ? subscriptionEndDate.toDate().toISOString() : null,
      isActive: true, // 可以根據實際邏輯判斷
      credits: userData.credits || 0
    };

    // 如果有待降級資訊
    if (pendingDowngradeToLevel && pendingDowngradeEffectiveDate) {
      const effectiveDate = pendingDowngradeEffectiveDate.toDate();
      const now = new Date();
      const daysUntilDowngrade = Math.ceil((effectiveDate - now) / (1000 * 60 * 60 * 24));

      subscriptionStatus.pendingDowngrade = {
        toLevel: pendingDowngradeToLevel,
        toLevelName: getPlanDisplayName(pendingDowngradeToLevel),
        effectiveDate: effectiveDate.toISOString(),
        effectiveDateFormatted: effectiveDate.toLocaleDateString('zh-TW', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        daysUntilDowngrade: daysUntilDowngrade,
        canCancel: daysUntilDowngrade > 0
      };
    }

    // 獲取當前方案的詳細資訊
    const currentPlanConfig = subscriptionProducts[currentLevel.toLowerCase()];
    if (currentPlanConfig) {
      subscriptionStatus.currentPlanDetails = {
        features: currentPlanConfig.features,
        creditsPerMonth: currentPlanConfig.creditsPerMonth,
        pricing: currentPlanConfig.pricing
      };
    }

    // 如果有待降級，也獲取目標方案的資訊
    if (pendingDowngradeToLevel) {
      const targetPlanConfig = subscriptionProducts[pendingDowngradeToLevel.toLowerCase()];
      if (targetPlanConfig) {
        subscriptionStatus.pendingDowngrade.targetPlanDetails = {
          features: targetPlanConfig.features,
          creditsPerMonth: targetPlanConfig.creditsPerMonth,
          pricing: targetPlanConfig.pricing
        };
      }
    }

    return subscriptionStatus;
  } catch (error) {
    console.error(`[UserService] Error getting subscription status for user ${userId}:`, error);
    throw new Error('無法獲取訂閱狀態資訊。');
  }
}

/**
 * 輔助函數：獲取方案的顯示名稱
 * @param {string} planId - 方案 ID
 * @returns {string} 方案顯示名稱
 */
function getPlanDisplayName(planId) {
  const planIdLower = planId?.toLowerCase() || 'free';

  // 優先從 subscriptionProducts 獲取
  if (subscriptionProducts[planIdLower]) {
    return subscriptionProducts[planIdLower].name;
  }

  // 備用從 legacyPlansData 獲取
  if (legacyPlansData[planIdLower]) {
    return legacyPlansData[planIdLower].name;
  }

  // 預設名稱
  const defaultNames = {
    'free': '免費版',
    'basic': '基本版',
    'advanced': '進階版',
    'premium_plus': '尊榮客製版'
  };

  return defaultNames[planIdLower] || planIdLower;
}