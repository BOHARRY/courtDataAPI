// controllers/lawyer-controller.js
import * as lawyerService from '../services/lawyer.js';
import * as userService from '../services/user.js'; // 用於記錄歷史

// 成本定義已移至 config/creditCosts.js，此處不再需要局部成本變數

export async function searchLawyerByNameController(req, res, next) {
  const userId = req.user.uid; // 來自 verifyToken
  const lawyerName = req.params.name;

  if (!lawyerName) {
    return res.status(400).json({ error: 'Bad Request', message: 'Lawyer name is required.' });
  }

  // console.log(`[Lawyer Controller - Search] User: ${userId} searching for lawyer: ${lawyerName}`);

  try {
    // 直接執行律師搜尋 (調用 lawyerService)
    // 積分已由路由層的 checkAndDeductCredits 中介軟體處理
    const lawyerApiData = await lawyerService.searchLawyerData(lawyerName, userId);

    if (lawyerApiData) {
      // 異步記錄搜尋歷史
      try {
        await userService.addLawyerSearchHistory(userId, lawyerName, lawyerApiData.cases.length > 0);
      } catch (historyError) {
        console.error(`[Lawyer Controller - Search] Failed to record search history for user ${userId}, lawyer ${lawyerName}:`, historyError);
      }
      res.status(200).json(lawyerApiData);
    } else {
      // 服務層應確保返回有效結構或拋出錯誤
      // 如果 lawyerApiData 為 null 或 undefined，可能表示服務層邏輯問題或律師不存在
      // 根據您的 lawyerService.searchLawyerData 的行為決定如何響應
      // 假設如果找不到律師，service 會返回一個表示 "not found" 的特定結構或 null
      // 如果返回 null，可以視為 404 Not Found
      console.warn(`[Lawyer Controller - Search] No data found for lawyer: ${lawyerName}.`);
      return res.status(404).json({ message: `Lawyer "${lawyerName}" not found.` });
    }
  } catch (error) {
    // console.error(`[Lawyer Controller - Search Error] User: ${userId}, Lawyer: ${lawyerName}, Error:`, error.message);
    // 這裡的錯誤主要是 lawyerService 可能拋出的錯誤
    next(error); // 交給全局錯誤處理器
  }
}

export async function getLawyerCasesDistributionController(req, res, next) {
  // const userId = req.user.uid; // 來自 verifyToken
  const lawyerName = req.params.name;

  // console.log(`[Lawyer Controller - Cases Distribution] Requesting for lawyer: ${lawyerName}`);

  try {
    // 積分已由路由層的 checkAndDeductCredits 中介軟體處理
    const distributionData = lawyerService.getStaticLawyerCasesDistribution(lawyerName);
    res.status(200).json(distributionData);
  } catch (error) {
    // console.error(`[Lawyer Controller - Cases Distribution Error] Lawyer: ${lawyerName}, Error:`, error.message);
    next(error);
  }
}

export async function getLawyerAnalysisController(req, res, next) {
  // const userId = req.user.uid; // 來自 verifyToken
  const lawyerName = req.params.name;
  // console.log(`[Lawyer Controller - Analysis] Requesting analysis for lawyer: ${lawyerName}`);

  try {
    // 積分已由路由層的 checkAndDeductCredits 中介軟體處理
    const analysisData = lawyerService.getGeneratedLawyerAnalysis(lawyerName);

    if (analysisData) {
      res.status(200).json(analysisData);
    } else {
      // 如果 getGeneratedLawyerAnalysis 可能返回 null
      const err = new Error(`Could not generate analysis for lawyer "${lawyerName}".`);
      err.statusCode = 404;
      next(err);
    }
  } catch (error) {
    // console.error(`[Lawyer Controller - Analysis Error] Lawyer: ${lawyerName}, Error:`, error.message);
    next(error);
  }
}