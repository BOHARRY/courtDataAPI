// controllers/workspace-controller.js
import * as workspaceService from '../services/workspace.js';

/**
 * 創建新工作區
 */
export async function createWorkspaceController(req, res, next) {
  try {
    const userId = req.user.uid;
    // ===== 核心修改點：從 req.body 中解構出 template =====
    const { name, description, template } = req.body;

    // 名稱現在是可選的，如果提供了範本，我們可以自動生成名稱
    const newName = name || (template?.name ? `${template.name} 的副本` : null);

    if (!newName) {
      return res.status(400).json({
        error: 'Bad Request',
        message: '工作區名稱不能為空'
      });
    }

    const workspace = await workspaceService.createWorkspace(userId, {
      name: newName.trim(),
      description: description?.trim() || '',
      template: template // 將 template 物件傳遞給服務層
    });

    console.log(`[WorkspaceController] Created workspace ${workspace.id} for user ${userId}`);

    res.status(201).json({
      success: true,
      workspace
    });
  } catch (error) {
    console.error('[WorkspaceController] Error in createWorkspaceController:', error);
    next(error);
  }
}

/**
 * 更新工作區（自動儲存）
 */
export async function updateWorkspaceController(req, res, next) {
  try {
    const userId = req.user.uid;
    const { workspaceId } = req.params;
    const updateData = req.body;

    // 驗證工作區擁有權
    const workspace = await workspaceService.getWorkspaceById(userId, workspaceId);
    if (!workspace) {
      return res.status(404).json({
        error: 'Not Found',
        message: '找不到指定的工作區'
      });
    }

    const updated = await workspaceService.updateWorkspace(userId, workspaceId, updateData);

    res.status(200).json({
      success: true,
      message: '工作區已更新',
      workspace: updated
    });
  } catch (error) {
    console.error('[WorkspaceController] Error in updateWorkspaceController:', error);
    next(error);
  }
}

/**
 * 獲取用戶所有工作區列表
 */
export async function getWorkspacesController(req, res, next) {
  try {
    const userId = req.user.uid;
    const { limit = 20, orderBy = 'lastAccessedAt' } = req.query;

    const workspaces = await workspaceService.getUserWorkspaces(userId, {
      limit: parseInt(limit),
      orderBy
    });

    res.status(200).json({
      success: true,
      workspaces,
      total: workspaces.length
    });
  } catch (error) {
    console.error('[WorkspaceController] Error in getWorkspacesController:', error);
    next(error);
  }
}

/**
 * 獲取特定工作區詳情
 */
export async function getWorkspaceByIdController(req, res, next) {
  try {
    const userId = req.user.uid;
    const { workspaceId } = req.params;

    const workspace = await workspaceService.getWorkspaceById(userId, workspaceId);

    if (!workspace) {
      return res.status(404).json({
        error: 'Not Found',
        message: '找不到指定的工作區'
      });
    }

    res.status(200).json({
      success: true,
      workspace
    });
  } catch (error) {
    console.error('[WorkspaceController] Error in getWorkspaceByIdController:', error);
    next(error);
  }
}

/**
 * 刪除工作區
 */
export async function deleteWorkspaceController(req, res, next) {
  try {
    const userId = req.user.uid;
    const { workspaceId } = req.params;

    // 檢查是否存在
    const workspace = await workspaceService.getWorkspaceById(userId, workspaceId);
    if (!workspace) {
      return res.status(404).json({
        error: 'Not Found',
        message: '找不到指定的工作區'
      });
    }

    await workspaceService.deleteWorkspace(userId, workspaceId);

    res.status(200).json({
      success: true,
      message: '工作區已刪除'
    });
  } catch (error) {
    console.error('[WorkspaceController] Error in deleteWorkspaceController:', error);
    next(error);
  }
}

/**
 * 設定當前活動工作區
 */
export async function setActiveWorkspaceController(req, res, next) {
  try {
    const userId = req.user.uid;
    const { workspaceId } = req.params;

    // 驗證工作區存在
    const workspace = await workspaceService.getWorkspaceById(userId, workspaceId);
    if (!workspace) {
      return res.status(404).json({
        error: 'Not Found',
        message: '找不到指定的工作區'
      });
    }

    await workspaceService.setActiveWorkspace(userId, workspaceId);

    res.status(200).json({
      success: true,
      message: '已設定為當前工作區',
      workspaceId
    });
  } catch (error) {
    console.error('[WorkspaceController] Error in setActiveWorkspaceController:', error);
    next(error);
  }
}

// ===== 🎯 新增：Canvas 碎片化 API 控制器 =====

/**
 * 獲取 Canvas Manifest
 */
export async function getCanvasManifestController(req, res, next) {
  try {
    const userId = req.user.uid;
    const { workspaceId, canvasId } = req.params;

    // 驗證工作區擁有權
    const workspace = await workspaceService.getWorkspaceById(userId, workspaceId);
    if (!workspace) {
      return res.status(404).json({
        error: 'Not Found',
        message: '找不到指定的工作區'
      });
    }

    const manifest = await workspaceService.getCanvasManifest(userId, workspaceId, canvasId);

    if (!manifest) {
      return res.status(404).json({
        error: 'Not Found',
        message: '找不到指定的 Canvas Manifest'
      });
    }

    res.status(200).json({
      success: true,
      data: manifest
    });
  } catch (error) {
    console.error('[WorkspaceController] Error in getCanvasManifestController:', error);
    next(error);
  }
}

/**
 * 保存 Canvas Manifest
 */
export async function saveCanvasManifestController(req, res, next) {
  try {
    const userId = req.user.uid;
    const { workspaceId, canvasId } = req.params;
    const manifestData = req.body;

    // 驗證工作區擁有權
    const workspace = await workspaceService.getWorkspaceById(userId, workspaceId);
    if (!workspace) {
      return res.status(404).json({
        error: 'Not Found',
        message: '找不到指定的工作區'
      });
    }

    // 驗證 Manifest 數據
    if (!manifestData || typeof manifestData !== 'object') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Manifest 數據格式不正確'
      });
    }

    const savedManifest = await workspaceService.saveCanvasManifest(userId, workspaceId, canvasId, manifestData);

    res.status(200).json({
      success: true,
      data: savedManifest
    });
  } catch (error) {
    console.error('[WorkspaceController] Error in saveCanvasManifestController:', error);
    next(error);
  }
}

/**
 * 更新 Canvas 視角
 */
export async function updateCanvasViewportController(req, res, next) {
  try {
    const userId = req.user.uid;
    const { workspaceId, canvasId } = req.params;
    const { viewport } = req.body;

    // 驗證工作區擁有權
    const workspace = await workspaceService.getWorkspaceById(userId, workspaceId);
    if (!workspace) {
      return res.status(404).json({
        error: 'Not Found',
        message: '找不到指定的工作區'
      });
    }

    // 驗證視角數據
    if (!viewport || typeof viewport !== 'object') {
      return res.status(400).json({
        error: 'Bad Request',
        message: '視角數據格式不正確'
      });
    }

    const updatedManifest = await workspaceService.updateCanvasViewport(userId, workspaceId, canvasId, viewport);

    res.status(200).json({
      success: true,
      data: updatedManifest
    });
  } catch (error) {
    console.error('[WorkspaceController] Error in updateCanvasViewportController:', error);
    next(error);
  }
}

/**
 * 獲取單個 Node
 */
export async function getNodeController(req, res, next) {
  try {
    const userId = req.user.uid;
    const { workspaceId, nodeId } = req.params;

    // 驗證工作區擁有權
    const workspace = await workspaceService.getWorkspaceById(userId, workspaceId);
    if (!workspace) {
      return res.status(404).json({
        error: 'Not Found',
        message: '找不到指定的工作區'
      });
    }

    const node = await workspaceService.getNode(userId, workspaceId, nodeId);

    if (!node) {
      return res.status(404).json({
        error: 'Not Found',
        message: '找不到指定的節點'
      });
    }

    res.status(200).json({
      success: true,
      data: node
    });
  } catch (error) {
    console.error('[WorkspaceController] Error in getNodeController:', error);
    next(error);
  }
}

/**
 * 保存單個 Node
 */
export async function saveNodeController(req, res, next) {
  try {
    const userId = req.user.uid;
    const { workspaceId, nodeId } = req.params;
    const nodeData = req.body;

    // 驗證工作區擁有權
    const workspace = await workspaceService.getWorkspaceById(userId, workspaceId);
    if (!workspace) {
      return res.status(404).json({
        error: 'Not Found',
        message: '找不到指定的工作區'
      });
    }

    // 驗證 Node 數據
    if (!nodeData || typeof nodeData !== 'object' || !nodeData.id) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Node 數據格式不正確或缺少 ID'
      });
    }

    // 確保 nodeId 一致
    if (nodeData.id !== nodeId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Node ID 不匹配'
      });
    }

    const savedNode = await workspaceService.saveNode(userId, workspaceId, nodeId, nodeData);

    res.status(200).json({
      success: true,
      data: savedNode
    });
  } catch (error) {
    console.error('[WorkspaceController] Error in saveNodeController:', error);
    next(error);
  }
}

/**
 * 批次獲取 Nodes
 */
export async function batchGetNodesController(req, res, next) {
  try {
    const userId = req.user.uid;
    const { workspaceId } = req.params;
    const { nodeIds } = req.body;

    // 驗證工作區擁有權
    const workspace = await workspaceService.getWorkspaceById(userId, workspaceId);
    if (!workspace) {
      return res.status(404).json({
        error: 'Not Found',
        message: '找不到指定的工作區'
      });
    }

    // 驗證 nodeIds
    if (!Array.isArray(nodeIds) || nodeIds.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'nodeIds 必須是非空陣列'
      });
    }

    const nodes = await workspaceService.batchGetNodes(userId, workspaceId, nodeIds);

    res.status(200).json({
      success: true,
      data: nodes
    });
  } catch (error) {
    console.error('[WorkspaceController] Error in batchGetNodesController:', error);
    next(error);
  }
}

/**
 * 批次保存 Nodes
 */
export async function batchSaveNodesController(req, res, next) {
  try {
    const userId = req.user.uid;
    const { workspaceId } = req.params;
    const { nodes } = req.body;

    // 驗證工作區擁有權
    const workspace = await workspaceService.getWorkspaceById(userId, workspaceId);
    if (!workspace) {
      return res.status(404).json({
        error: 'Not Found',
        message: '找不到指定的工作區'
      });
    }

    // 驗證 nodes 數據
    if (!Array.isArray(nodes) || nodes.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'nodes 必須是非空陣列'
      });
    }

    // 🎯 修復：驗證 ReactFlow 節點格式（增強調試和便條紙節點支持）
    const validationErrors = [];

    console.log(`[WorkspaceController] 開始驗證 ${nodes.length} 個節點`);

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];

      console.log(`[WorkspaceController] 驗證節點 ${i}:`, JSON.stringify(node, null, 2));

      // 基本結構驗證
      if (!node || typeof node !== 'object') {
        validationErrors.push(`節點 ${i}: 必須是有效的對象`);
        console.log(`[WorkspaceController] ❌ 節點 ${i}: 不是對象`);
        continue;
      }

      // ID 驗證
      if (!node.id || typeof node.id !== 'string') {
        validationErrors.push(`節點 ${i}: 缺少有效的 ID (當前: ${node.id}, 類型: ${typeof node.id})`);
        console.log(`[WorkspaceController] ❌ 節點 ${i}: ID 無效`, { id: node.id, type: typeof node.id });
        continue;
      }

      // ReactFlow 必需字段驗證
      if (!node.type || typeof node.type !== 'string') {
        validationErrors.push(`節點 ${node.id}: 缺少有效的 type (當前: ${node.type}, 類型: ${typeof node.type})`);
        console.log(`[WorkspaceController] ❌ 節點 ${node.id}: type 無效`, { type: node.type, typeOf: typeof node.type });
      }

      if (!node.position || typeof node.position !== 'object') {
        validationErrors.push(`節點 ${node.id}: position 必須是對象 (當前: ${node.position}, 類型: ${typeof node.position})`);
        console.log(`[WorkspaceController] ❌ 節點 ${node.id}: position 不是對象`, { position: node.position, typeOf: typeof node.position });
      } else if (typeof node.position.x !== 'number' || typeof node.position.y !== 'number') {
        validationErrors.push(`節點 ${node.id}: position.x 和 position.y 必須是數字 (x: ${node.position.x}[${typeof node.position.x}], y: ${node.position.y}[${typeof node.position.y}])`);
        console.log(`[WorkspaceController] ❌ 節點 ${node.id}: position 座標無效`, {
          x: node.position.x,
          y: node.position.y,
          xType: typeof node.position.x,
          yType: typeof node.position.y
        });
      }

      // data 字段可以為空，但如果存在必須是對象
      if (node.data !== undefined && (typeof node.data !== 'object' || node.data === null)) {
        validationErrors.push(`節點 ${node.id}: data 必須是對象或 undefined (當前: ${node.data}, 類型: ${typeof node.data})`);
        console.log(`[WorkspaceController] ❌ 節點 ${node.id}: data 無效`, { data: node.data, typeOf: typeof node.data });
      }

      // 🎯 特別檢查便條紙節點
      if (node.type === 'noteNode') {
        console.log(`[WorkspaceController] 🗒️ 便條紙節點詳細檢查:`, {
          id: node.id,
          type: node.type,
          position: node.position,
          data: node.data,
          dragHandle: node.dragHandle,
          allKeys: Object.keys(node)
        });
      }
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Node 數據格式驗證失敗',
        details: validationErrors
      });
    }

    const savedNodes = await workspaceService.batchSaveNodes(userId, workspaceId, nodes);

    res.status(200).json({
      success: true,
      data: savedNodes
    });
  } catch (error) {
    console.error('[WorkspaceController] Error in batchSaveNodesController:', error);
    next(error);
  }
}