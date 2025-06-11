// routes/intake.js

import express from 'express';
import { chatController } from '../controllers/intakeController.js';
import { chatController, sessionController } from '../controllers/intakeController.js';
// 根據 README，我們有一個 auth middleware，可以先準備好
// import { requireAuth } from '../middleware/auth.js'; 

const router = express.Router();

/**
 * @route   POST /api/intake/chat
 * @desc    與 AI 接待助理進行對話
 * @access  Private (未來應加上 requireAuth)
 */
router.post('/session', sessionController);
router.post(
  '/chat',
  // requireAuth, // 為了快速測試，我們先註解掉身份驗證
  chatController
);

export default router;