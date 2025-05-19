// routes/lawyer.js
import express from 'express';
import {
  searchLawyerByNameController,
  getLawyerCasesDistributionController,
  getLawyerAnalysisController
} from '../controllers/lawyer-controller.js';
import { verifyToken } from '../middleware/auth.js';
import { checkAndDeductCredits } from '../middleware/credit.js';
import { CREDIT_COSTS, CREDIT_PURPOSES } from '../config/creditCosts.js';

const router = express.Router();
// 積分檢查將在控制器內部與服務層結合的 Transaction 中處理

// 搜尋律師並獲取其案件資料 (GET /api/lawyers/:name)
router.get('/:name', verifyToken, searchLawyerByNameController);

// 獲取律師案件類型分佈 (GET /api/lawyers/:name/cases-distribution)
// 注意：原程式碼中此路由的實現是返回固定數據，我們將遵循該邏輯
// 如果未來需要真實數據，則需要修改服務層
router.get(
  '/:name/cases-distribution',
  verifyToken,
  checkAndDeductCredits(
    CREDIT_COSTS.LAWYER_CASES_DISTRIBUTION, // 使用了新的成本定義
    CREDIT_PURPOSES.LAWYER_CASES_DISTRIBUTION,
    {
      description: '查詢律師案件分布',
      relatedIdKey: 'params.name'
    }
  ),
  getLawyerCasesDistributionController
);



// 獲取律師優劣勢分析 (GET /api/lawyers/:name/analysis)
router.get('/:name/analysis', verifyToken, getLawyerAnalysisController);

export default router;