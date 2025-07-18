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
  batchSaveNodesController,
  // 🎯 Stage 3 新增：單節點精確更新控制器
  updateNodePositionController,
  updateNodeContentController,
  // 🎯 新增：Edges 批次操作控制器
  batchGetEdgesController,
  batchSaveEdgesController
} from '../controllers/workspace-controller.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// 批次保存 Nodes - 修復後的版本
router.put('/:workspaceId/nodes/batch', verifyToken, batchSaveNodesController);

// 🎯 新增：Edges 批次操作
router.post('/:workspaceId/edges/batch', verifyToken, batchGetEdgesController);
router.put('/:workspaceId/edges/batch', verifyToken, batchSaveEdgesController);

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

// 🎯 Stage 3 新增：單節點精確更新路由
router.patch('/:workspaceId/nodes/:nodeId/position', verifyToken, updateNodePositionController);
router.patch('/:workspaceId/nodes/:nodeId/content', verifyToken, updateNodeContentController);

// 批次 Node 操作
router.post('/:workspaceId/nodes/batch', verifyToken, batchGetNodesController);

export default router;