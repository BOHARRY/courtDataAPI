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

// 🚨 緊急診斷：捕獲所有 /nodes/batch 請求
router.use('/:workspaceId/nodes/batch', (req, _res, next) => {
  console.log('🚨🚨🚨 [GLOBAL-EMERGENCY] /nodes/batch 請求被捕獲！！！');
  console.log('🚨🚨🚨 [GLOBAL-EMERGENCY] 請求方法:', req.method);
  console.log('🚨🚨🚨 [GLOBAL-EMERGENCY] 完整路徑:', req.originalUrl);
  console.log('🚨🚨🚨 [GLOBAL-EMERGENCY] 工作區ID:', req.params.workspaceId);
  console.log('🚨🚨🚨 [GLOBAL-EMERGENCY] 即將繼續到具體的路由處理器');

  // 🚨 特別檢查 PUT 請求
  if (req.method === 'PUT') {
    console.log('🚨🚨🚨 [GLOBAL-EMERGENCY] 這是一個 PUT 請求，應該匹配到 PUT 路由');
    console.log('🚨🚨🚨 [GLOBAL-EMERGENCY] 請求體存在:', !!req.body);
    console.log('🚨🚨🚨 [GLOBAL-EMERGENCY] 請求體類型:', typeof req.body);
  }

  next();
});

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
router.post('/:workspaceId/nodes/batch', verifyToken, (req, _res, next) => {
  console.log('🚨🚨🚨 [POST-EMERGENCY] POST /nodes/batch 路由被觸發！！！');
  console.log('🚨🚨🚨 [POST-EMERGENCY] 這應該只處理 POST 請求，不是 PUT');
  console.log('🚨🚨🚨 [POST-EMERGENCY] 請求方法:', req.method);
  console.log('🚨🚨🚨 [POST-EMERGENCY] 如果看到這個日誌，說明路由匹配有問題');
  next();
}, batchGetNodesController);



// 🚨 緊急診斷：簡化的測試路由
router.put('/:workspaceId/nodes/batch', (req, res) => {
  console.log('🚨🚨🚨 [SIMPLE-TEST] 簡化的 PUT 路由被觸發！！！');
  console.log('🚨🚨🚨 [SIMPLE-TEST] 請求方法:', req.method);
  console.log('🚨🚨🚨 [SIMPLE-TEST] 工作區ID:', req.params.workspaceId);
  console.log('🚨🚨🚨 [SIMPLE-TEST] 用戶:', req.user?.uid || '未認證');
  console.log('🚨🚨🚨 [SIMPLE-TEST] 即將返回測試響應');

  res.status(200).json({
    success: true,
    message: '測試路由工作正常',
    debug: {
      method: req.method,
      workspaceId: req.params.workspaceId,
      userUid: req.user?.uid,
      timestamp: new Date().toISOString()
    }
  });
});

// 🚨 緊急診斷：最終捕獲器 - 如果請求到達這裡，說明沒有路由匹配
router.use('/:workspaceId/nodes/batch', (req, res, _next) => {
  console.log('🚨🚨🚨 [FINAL-EMERGENCY] 請求到達了最終捕獲器！！！');
  console.log('🚨🚨🚨 [FINAL-EMERGENCY] 這表明沒有任何路由匹配這個請求');
  console.log('🚨🚨🚨 [FINAL-EMERGENCY] 請求方法:', req.method);
  console.log('🚨🚨🚨 [FINAL-EMERGENCY] 完整路徑:', req.originalUrl);
  console.log('🚨🚨🚨 [FINAL-EMERGENCY] 即將返回 404 錯誤');

  res.status(404).json({
    error: 'Not Found',
    message: `沒有找到匹配的路由: ${req.method} ${req.originalUrl}`,
    debug: {
      method: req.method,
      path: req.originalUrl,
      workspaceId: req.params.workspaceId,
      timestamp: new Date().toISOString()
    }
  });
});

export default router;