// routes/complaint.js
import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { checkAndDeductCredits } from '../middleware/credit.js';
import * as complaintController from '../controllers/complaint-controller.js';

const router = express.Router();

// 驗證文本是否為訴狀 (消耗1點積分)
router.post('/validate-text', 
  verifyToken, 
  checkAndDeductCredits(1),//消耗積分
  complaintController.validateComplaintText
);
// 檢驗法官是否存在 (不消耗積分)
router.post('/check-judge', 
  verifyToken,   //仍需身份驗證
  complaintController.checkJudgeExists
);

// 分析訴狀與法官匹配度 (消耗2點積分)
router.post('/analyze-judge-match',
  verifyToken,
  checkAndDeductCredits(2),
  complaintController.analyzeJudgeMatch
);

export default router;