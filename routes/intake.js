// routes/intake.js

import express from 'express';
import { chatController, listSessionsController,sessionController,newSessionController } from '../controllers/intakeController.js';
import { verifyToken } from '../middleware/auth.js'; // 假設這是您的身份驗證中介軟體
// 根據 README，我們有一個 auth middleware，可以先準備好
// import { requireAuth } from '../middleware/auth.js'; 

const router = express.Router();

/**
 * @route   POST /api/intake/chat
 * @desc    與 AI 接待助理進行對話
 * @access  Private (未來應加上 verifyToken)
 */
router.post('/session', sessionController);
router.post('/chat', chatController);
router.get('/sessions', listSessionsController); // 拿掉 requireAuth
router.post('/new', newSessionController);     // 拿掉 requireAuth

export default router;