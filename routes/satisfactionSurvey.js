// routes/satisfactionSurvey.js
// 🎯 滿意度調查路由

import express from 'express';
import { submitSurveyController, getMySurveyController } from '../controllers/satisfactionSurvey-controller.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// 獲取用戶的調查記錄
router.get('/my-survey', verifyToken, getMySurveyController);

// 提交滿意度調查 (POST /api/satisfaction-survey/submit)
router.post('/submit', verifyToken, submitSurveyController);

export default router;

