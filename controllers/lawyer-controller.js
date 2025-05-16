// controllers/lawyer-controller.js
import * as lawyerService from '../services/lawyer.js';
import * as creditService from '../services/credit.js'; // 引入積分服務
import * as userService from '../services/user.js'; // 引入用戶服務 (用於記錄歷史)
import admin from 'firebase-admin';

const LAWYER_SEARCH_COST = 1;
const LAWYER_ANALYSIS_COST = 2;
const LAWYER_CASES_DISTRIBUTION_COST = 1; // 根據原程式碼的註解

export async function searchLawyerByNameController(req, res, next) {
  const userId = req.user.uid;
  const lawyerName = req.params.name;

  if (!lawyerName) {
    return res.status(400).json({ error: 'Bad Request', message: 'Lawyer name is required.' });
  }

  // console.log(`[Lawyer Controller - Search] User: ${userId} searching for lawyer: ${lawyerName}`);
  const userDocRef = admin.firestore().collection('users').doc(userId);

  try {
    let lawyerApiData = null;

    await admin.firestore().runTransaction(async (transaction) => {
      // 1. 檢查並扣除積分
      const { sufficient, currentCredits } = await creditService.checkAndDeductUserCreditsInTransaction(
        transaction,
        userDocRef,
        userId,
        LAWYER_SEARCH_COST,
        { action: 'lawyer_search', details: { lawyerName } }
      );

      if (!sufficient) {
        const error = new Error('Insufficient credits');
        error.statusCode = 402;
        error.details = { required: LAWYER_SEARCH_COST, current: currentCredits };
        throw error;
      }

      // 2. 執行律師搜尋 (調用 lawyerService)
      lawyerApiData = await lawyerService.searchLawyerData(lawyerName);
    });

    if (lawyerApiData) {
      // 3. 異步記錄搜尋歷史 (Transaction 成功後執行)
      try {
        await userService.addLawyerSearchHistory(userId, lawyerName, lawyerApiData.cases.length > 0);
      } catch (historyError) {
        console.error(`[Lawyer Controller - Search] Failed to record search history for user ${userId}, lawyer ${lawyerName}:`, historyError);
        // 記錄歷史失敗不應影響主操作成功的回應
      }
      res.status(200).json(lawyerApiData);
    } else {
      // 即使 service 返回了空的有效結構 (例如無案件)，也應該是 200
      // 這裡的 else 更多是針對 transaction 成功但 lawyerApiData 意外為 null 的情況
      console.error(`[Lawyer Controller - Search] Transaction succeeded but lawyerApiData is unexpectedly null for ${lawyerName}.`);
      const err = new Error('Internal server error after lawyer search (empty response).');
      err.statusCode = 500;
      next(err);
    }
  } catch (error) {
    // console.error(`[Lawyer Controller - Search Error] User: ${userId}, Lawyer: ${lawyerName}, Error:`, error.message);
    if (error.message === 'Insufficient credits' && error.statusCode === 402) {
      return res.status(402).json({
        error: '您的積分不足，請購買積分或升級方案。',
        required: error.details?.required || LAWYER_SEARCH_COST,
        current: error.details?.current || 0
      });
    }
    if (error.message === 'User data not found.' && error.statusCode === 404) {
        return res.status(404).json({
            error: '找不到您的用戶資料，請嘗試重新登入。'
        });
    }
    next(error);
  }
}

export async function getLawyerCasesDistributionController(req, res, next) {
  const userId = req.user.uid;
  const lawyerName = req.params.name; // 雖然目前服務層不使用，但保持一致性

  // console.log(`[Lawyer Controller - Cases Distribution] User: ${userId} requesting for lawyer: ${lawyerName}`);
  const userDocRef = admin.firestore().collection('users').doc(userId);

  try {
     let distributionData = null;
     await admin.firestore().runTransaction(async (transaction) => {
         // 1. 檢查並扣除積分
         const { sufficient, currentCredits } = await creditService.checkAndDeductUserCreditsInTransaction(
             transaction,
             userDocRef,
             userId,
             LAWYER_CASES_DISTRIBUTION_COST,
             { action: 'lawyer_cases_distribution', details: { lawyerName } }
         );
         if (!sufficient) {
             const error = new Error('Insufficient credits');
             error.statusCode = 402;
             error.details = { required: LAWYER_CASES_DISTRIBUTION_COST, current: currentCredits };
             throw error;
         }
         // 2. 獲取案件分佈數據 (目前是固定數據)
         distributionData = lawyerService.getStaticLawyerCasesDistribution(lawyerName); // 假設服務中有此方法
     });

    res.status(200).json(distributionData);
  } catch (error) {
    // console.error(`[Lawyer Controller - Cases Distribution Error] User: ${userId}, Lawyer: ${lawyerName}, Error:`, error.message);
     if (error.message === 'Insufficient credits' && error.statusCode === 402) {
         return res.status(402).json({
         error: '您的積分不足，請購買積分或升級方案。',
         required: error.details?.required || LAWYER_CASES_DISTRIBUTION_COST,
         current: error.details?.current || 0
         });
     }
     if (error.message === 'User data not found.' && error.statusCode === 404) {
         return res.status(404).json({
             error: '找不到您的用戶資料，請嘗試重新登入。'
         });
     }
    next(error);
  }
}

export async function getLawyerAnalysisController(req, res, next) {
  const userId = req.user.uid;
  const lawyerName = req.params.name;
  // console.log(`[Lawyer Controller - Analysis] User: ${userId} requesting analysis for lawyer: ${lawyerName}`);
  const userDocRef = admin.firestore().collection('users').doc(userId);

  try {
     let analysisData = null;
     await admin.firestore().runTransaction(async (transaction) => {
         // 1. 檢查並扣除積分
         const { sufficient, currentCredits } = await creditService.checkAndDeductUserCreditsInTransaction(
             transaction,
             userDocRef,
             userId,
             LAWYER_ANALYSIS_COST,
             { action: 'lawyer_analysis', details: { lawyerName } }
         );
         if (!sufficient) {
             const error = new Error('Insufficient credits');
             error.statusCode = 402; // 注意這裡原碼是 402，但 message 不同
             error.details = { required: LAWYER_ANALYSIS_COST, current: currentCredits };
             throw error;
         }
         // 2. 生成/獲取律師分析 (目前是基於模板)
         // 假設 lawyerService 有一個方法可以獲取 analyzeLawyerData 的結果，然後傳給 generateLawyerAnalysis
         // const analyzedCaseData = await lawyerService.getAnalyzedLawyerCaseData(lawyerName); // 這步可能也需要ES查詢
         // analysisData = lawyerService.generateDynamicLawyerAnalysis(lawyerName, analyzedCaseData);
         // 簡化：直接使用 utils 中的 generateLawyerAnalysis
         analysisData = lawyerService.getGeneratedLawyerAnalysis(lawyerName); // 服務層封裝 utils 的調用
     });

    if (analysisData) {
      res.status(200).json(analysisData);
    } else {
      // 正常情況下，基於模板的分析總會有數據
      // 但如果未來是動態生成且可能失敗
      const err = new Error(`Could not generate analysis for lawyer "${lawyerName}".`);
      err.statusCode = 404; // 或者 500，取決於原因
      next(err);
    }
  } catch (error) {
    // console.error(`[Lawyer Controller - Analysis Error] User: ${userId}, Lawyer: ${lawyerName}, Error:`, error.message);
    if (error.message === 'Insufficient credits' && error.statusCode === 402) {
      return res.status(402).json({
        error: '生成分析需要額外積分，請購買積分或升級方案。', // 與原碼 message 保持一致
        required: error.details?.required || LAWYER_ANALYSIS_COST,
        current: error.details?.current || 0
      });
    }
    if (error.message === 'User data not found.' && error.statusCode === 404) {
        return res.status(404).json({
            error: '找不到您的用戶資料，請嘗試重新登入。'
        });
    }
    next(error);
  }
}