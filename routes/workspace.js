// routes/workspace.js
import express from 'express';
import {
  createWorkspaceController,
  updateWorkspaceController,
  getWorkspacesController,
  getWorkspaceByIdController,
  deleteWorkspaceController,
  setActiveWorkspaceController,
  // 🎯 新增：碎片化 Canvas API 控制器
  getCanvasManifestController,
  saveCanvasManifestController,
  updateCanvasViewportController,
  getNodeController,
  saveNodeController,
  batchGetNodesController,
  batchSaveNodesController
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

// 🎯 新增：Canvas 碎片化 API 端點

// Canvas Manifest 操作
router.get('/:workspaceId/canvas/:canvasId/manifest', verifyToken, getCanvasManifestController);
router.put('/:workspaceId/canvas/:canvasId/manifest', verifyToken, saveCanvasManifestController);
router.patch('/:workspaceId/canvas/:canvasId/viewport', verifyToken, updateCanvasViewportController);

// Node 操作
router.get('/:workspaceId/nodes/:nodeId', verifyToken, getNodeController);
router.put('/:workspaceId/nodes/:nodeId', verifyToken, saveNodeController);

// 批次 Node 操作
router.post('/:workspaceId/nodes/batch', verifyToken, batchGetNodesController);

// 🚨 緊急診斷：修復路由定義（移除重複的 verifyToken）
router.put('/:workspaceId/nodes/batch', verifyToken, (req, res, next) => {
  console.log('🚨🚨🚨 [ROUTE-EMERGENCY] PUT /nodes/batch 路由被觸發！！！');
  console.log('🚨🚨🚨 [ROUTE-EMERGENCY] 時間戳:', new Date().toISOString());
  console.log('🚨🚨🚨 [ROUTE-EMERGENCY] 工作區ID:', req.params.workspaceId);
  console.log('🚨🚨🚨 [ROUTE-EMERGENCY] 請求體大小:', JSON.stringify(req.body).length);
  console.log('🚨🚨🚨 [ROUTE-EMERGENCY] verifyToken 已通過，即將調用 batchSaveNodesController');
  next();
}, batchSaveNodesController);

export default router;