// routes/ai-agent.js
/**
 * AI Agent 路由
 * 提供 AI Agent 對話 API
 */

import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { handleAIAgentChat, checkAIAgentHealth } from '../controllers/ai-agent-controller.js';

const router = express.Router();

/**
 * POST /api/ai-agent/chat
 * AI Agent 對話接口
 * 
 * Request Body:
 * {
 *   "question": "用戶問題",
 *   "conversation_history": [] // 可選,對話歷史
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "answer": "AI 回答",
 *   "iterations": 3,
 *   "conversation_history": [...]
 * }
 */
router.post('/chat', verifyToken, handleAIAgentChat);

/**
 * GET /api/ai-agent/health
 * 檢查 AI Agent 健康狀態
 */
router.get('/health', checkAIAgentHealth);

export default router;

