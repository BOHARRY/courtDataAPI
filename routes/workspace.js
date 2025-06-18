// routes/workspace.js
import express from 'express';
import {
  createWorkspaceController,
  updateWorkspaceController,
  getWorkspacesController,
  getWorkspaceByIdController,
  deleteWorkspaceController,
  setActiveWorkspaceController
} from '../controllers/workspace-controller.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// 創建新工作區
router.post('/', verifyToken, createWorkspaceController);

// 獲取用戶所有工作區列表
router.get('/', verifyToken, getWorkspacesController);

// 獲取特定工作區詳情
router.get('/:workspaceId', verifyToken, getWorkspaceByIdController);

// 更新工作區（自動儲存）
router.put('/:workspaceId', verifyToken, updateWorkspaceController);

// 刪除工作區
router.delete('/:workspaceId', verifyToken, deleteWorkspaceController);

// 設定當前活動工作區
router.post('/active/:workspaceId', verifyToken, setActiveWorkspaceController);

export default router;