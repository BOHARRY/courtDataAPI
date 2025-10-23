// routes/satisfactionSurvey.js
// 🎯 滿意度調查路由

import express from 'express';
import { submitSurveyController } from '../controllers/satisfactionSurvey-controller.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// 提交滿意度調查 (POST /api/satisfaction-survey/submit)
router.post('/submit', verifyToken, submitSurveyController);

export default router;

