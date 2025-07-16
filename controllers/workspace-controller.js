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

    console.log(`[WorkspaceController] 🔍 ===== 批次保存節點請求開始 =====`);
    console.log(`[WorkspaceController] 🔍 請求基本信息:`, {
      userId: userId,
      workspaceId: workspaceId,
      timestamp: new Date().toISOString(),
      requestMethod: req.method,
      requestUrl: req.originalUrl
    });

    console.log(`[WorkspaceController] 🔍 原始請求體詳情:`, {
      fullRequestBody: JSON.stringify(req.body, null, 2),
      requestBodyKeys: Object.keys(req.body),
      bodySize: JSON.stringify(req.body).length,
      contentType: req.headers['content-type']
    });

    console.log(`[WorkspaceController] 🔍 nodes 字段分析:`, {
      hasNodes: !!nodes,
      nodesExists: req.body.hasOwnProperty('nodes'),
      nodesType: typeof nodes,
      isArray: Array.isArray(nodes),
      nodeCount: nodes?.length || 0,
      nodesValue: nodes
    });

    // 🎯 詳細記錄接收到的原始數據
    if (nodes && Array.isArray(nodes)) {
      console.log(`[WorkspaceController] 🔍 ===== 節點詳細分析開始 =====`);
      nodes.forEach((node, index) => {
        console.log(`[WorkspaceController] 🔍 節點 ${index} 完整原始數據:`);
        console.log(JSON.stringify(node, null, 2));

        console.log(`[WorkspaceController] 🔍 節點 ${index} 字段逐一檢查:`, {
          // ID 字段詳細檢查
          id: {
            value: node?.id,
            exists: node?.hasOwnProperty('id'),
            type: typeof node?.id,
            isString: typeof node?.id === 'string',
            length: typeof node?.id === 'string' ? node.id.length : 'N/A',
            isEmpty: typeof node?.id === 'string' ? node.id.length === 0 : 'N/A',
            isNull: node?.id === null,
            isUndefined: node?.id === undefined
          },
          // Type 字段詳細檢查
          type: {
            value: node?.type,
            exists: node?.hasOwnProperty('type'),
            type: typeof node?.type,
            isString: typeof node?.type === 'string',
            length: typeof node?.type === 'string' ? node.type.length : 'N/A',
            isEmpty: typeof node?.type === 'string' ? node.type.length === 0 : 'N/A',
            isNull: node?.type === null,
            isUndefined: node?.type === undefined
          },
          // Position 字段詳細檢查
          position: {
            value: node?.position,
            exists: node?.hasOwnProperty('position'),
            type: typeof node?.position,
            isObject: typeof node?.position === 'object',
            isNull: node?.position === null,
            isUndefined: node?.position === undefined,
            hasX: node?.position?.hasOwnProperty('x'),
            hasY: node?.position?.hasOwnProperty('y'),
            x: {
              value: node?.position?.x,
              type: typeof node?.position?.x,
              isNumber: typeof node?.position?.x === 'number',
              isFinite: typeof node?.position?.x === 'number' ? Number.isFinite(node.position.x) : false
            },
            y: {
              value: node?.position?.y,
              type: typeof node?.position?.y,
              isNumber: typeof node?.position?.y === 'number',
              isFinite: typeof node?.position?.y === 'number' ? Number.isFinite(node.position.y) : false
            }
          },
          // Data 字段詳細檢查
          data: {
            value: node?.data,
            exists: node?.hasOwnProperty('data'),
            type: typeof node?.data,
            isObject: typeof node?.data === 'object',
            isNull: node?.data === null,
            isUndefined: node?.data === undefined,
            keys: typeof node?.data === 'object' && node?.data !== null ? Object.keys(node.data) : 'N/A'
          },
          // 所有字段列表
          allKeys: node ? Object.keys(node) : 'undefined',
          // 節點大小
          nodeSize: JSON.stringify(node).length
        });
      });
      console.log(`[WorkspaceController] 🔍 ===== 節點詳細分析結束 =====`);
    }

    // 驗證工作區擁有權
    const workspace = await workspaceService.getWorkspaceById(userId, workspaceId);
    if (!workspace) {
      console.log(`[WorkspaceController] ❌ 工作區不存在: ${workspaceId}`);
      return res.status(404).json({
        error: 'Not Found',
        message: '找不到指定的工作區'
      });
    }

    // 驗證 nodes 數據
    if (!Array.isArray(nodes) || nodes.length === 0) {
      console.log(`[WorkspaceController] ❌ nodes 數據無效:`, {
        isArray: Array.isArray(nodes),
        length: nodes?.length,
        type: typeof nodes
      });
      return res.status(400).json({
        error: 'Bad Request',
        message: 'nodes 必須是非空陣列'
      });
    }

    // 🎯 詳細的節點格式驗證
    const validationErrors = [];

    console.log(`[WorkspaceController] 🔍 ===== 開始驗證 ${nodes.length} 個節點 =====`);

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];

      console.log(`[WorkspaceController] 🔍 ===== 驗證節點 ${i} 開始 =====`);
      console.log(`[WorkspaceController] 🔍 節點 ${i} 完整數據:`);
      console.log(JSON.stringify(node, null, 2));

      // 🔍 步驟 1: 基本結構驗證
      console.log(`[WorkspaceController] 🔍 步驟 1 - 基本結構驗證:`);
      console.log(`[WorkspaceController] 🔍 node 存在: ${!!node}`);
      console.log(`[WorkspaceController] 🔍 node 類型: ${typeof node}`);
      console.log(`[WorkspaceController] 🔍 node 是對象: ${typeof node === 'object'}`);
      console.log(`[WorkspaceController] 🔍 node 不是 null: ${node !== null}`);

      if (!node || typeof node !== 'object') {
        const errorMsg = `節點 ${i}: 必須是有效的對象 (當前: ${node}, 類型: ${typeof node})`;
        validationErrors.push(errorMsg);
        console.log(`[WorkspaceController] ❌ 步驟 1 失敗: ${errorMsg}`);
        console.log(`[WorkspaceController] 🔍 ===== 節點 ${i} 驗證結束 (基本結構失敗) =====`);
        continue;
      }
      console.log(`[WorkspaceController] ✅ 步驟 1 通過: 基本結構驗證`);

      // 🔍 步驟 2: ID 驗證
      let nodeHasErrors = false;

      console.log(`[WorkspaceController] 🔍 步驟 2 - ID 驗證:`);
      console.log(`[WorkspaceController] 🔍 node.id 存在: ${!!node.id}`);
      console.log(`[WorkspaceController] 🔍 node.id 值: ${node.id}`);
      console.log(`[WorkspaceController] 🔍 node.id 類型: ${typeof node.id}`);
      console.log(`[WorkspaceController] 🔍 node.id 是字符串: ${typeof node.id === 'string'}`);
      console.log(`[WorkspaceController] 🔍 node.id 長度: ${typeof node.id === 'string' ? node.id.length : 'N/A'}`);
      console.log(`[WorkspaceController] 🔍 node.id 是空字符串: ${typeof node.id === 'string' ? node.id.length === 0 : 'N/A'}`);

      if (!node.id || typeof node.id !== 'string') {
        const errorMsg = `節點 ${i}: 缺少有效的 ID (當前: ${node.id}, 類型: ${typeof node.id})`;
        validationErrors.push(errorMsg);
        console.log(`[WorkspaceController] ❌ 步驟 2 失敗: ${errorMsg}`);
        nodeHasErrors = true;
      } else {
        console.log(`[WorkspaceController] ✅ 步驟 2 通過: ID 驗證`);
      }

      // 🔍 步驟 3: Type 驗證
      console.log(`[WorkspaceController] 🔍 步驟 3 - Type 驗證:`);
      console.log(`[WorkspaceController] 🔍 node.type 存在: ${!!node.type}`);
      console.log(`[WorkspaceController] 🔍 node.type 值: ${node.type}`);
      console.log(`[WorkspaceController] 🔍 node.type 類型: ${typeof node.type}`);
      console.log(`[WorkspaceController] 🔍 node.type 是字符串: ${typeof node.type === 'string'}`);

      if (!node.type || typeof node.type !== 'string') {
        const errorMsg = `節點 ${node.id || i}: 缺少有效的 type (當前: ${node.type}, 類型: ${typeof node.type})`;
        validationErrors.push(errorMsg);
        console.log(`[WorkspaceController] ❌ 步驟 3 失敗: ${errorMsg}`);
        nodeHasErrors = true;
      } else {
        console.log(`[WorkspaceController] ✅ 步驟 3 通過: Type 驗證`);
      }

      // 🔍 步驟 4: Position 驗證
      console.log(`[WorkspaceController] 🔍 步驟 4 - Position 驗證:`);
      console.log(`[WorkspaceController] 🔍 node.position 存在: ${!!node.position}`);
      console.log(`[WorkspaceController] 🔍 node.position 值: ${JSON.stringify(node.position)}`);
      console.log(`[WorkspaceController] 🔍 node.position 類型: ${typeof node.position}`);
      console.log(`[WorkspaceController] 🔍 node.position 是對象: ${typeof node.position === 'object'}`);
      console.log(`[WorkspaceController] 🔍 node.position 不是 null: ${node.position !== null}`);

      if (!node.position || typeof node.position !== 'object') {
        const errorMsg = `節點 ${node.id || i}: position 必須是對象 (當前: ${node.position}, 類型: ${typeof node.position})`;
        validationErrors.push(errorMsg);
        console.log(`[WorkspaceController] ❌ 步驟 4a 失敗: ${errorMsg}`);
        nodeHasErrors = true;
      } else {
        console.log(`[WorkspaceController] ✅ 步驟 4a 通過: Position 是對象`);

        // 🔍 步驟 4b: Position 座標驗證
        console.log(`[WorkspaceController] 🔍 步驟 4b - Position 座標驗證:`);
        console.log(`[WorkspaceController] 🔍 node.position.x 存在: ${node.position.hasOwnProperty('x')}`);
        console.log(`[WorkspaceController] 🔍 node.position.x 值: ${node.position.x}`);
        console.log(`[WorkspaceController] 🔍 node.position.x 類型: ${typeof node.position.x}`);
        console.log(`[WorkspaceController] 🔍 node.position.x 是數字: ${typeof node.position.x === 'number'}`);
        console.log(`[WorkspaceController] 🔍 node.position.y 存在: ${node.position.hasOwnProperty('y')}`);
        console.log(`[WorkspaceController] 🔍 node.position.y 值: ${node.position.y}`);
        console.log(`[WorkspaceController] 🔍 node.position.y 類型: ${typeof node.position.y}`);
        console.log(`[WorkspaceController] 🔍 node.position.y 是數字: ${typeof node.position.y === 'number'}`);

        if (typeof node.position.x !== 'number' || typeof node.position.y !== 'number') {
          const errorMsg = `節點 ${node.id || i}: position.x 和 position.y 必須是數字 (x: ${node.position.x}[${typeof node.position.x}], y: ${node.position.y}[${typeof node.position.y}])`;
          validationErrors.push(errorMsg);
          console.log(`[WorkspaceController] ❌ 步驟 4b 失敗: ${errorMsg}`);
          nodeHasErrors = true;
        } else {
          console.log(`[WorkspaceController] ✅ 步驟 4b 通過: Position 座標驗證`);
        }
      }

      // 🔍 步驟 5: Data 驗證
      console.log(`[WorkspaceController] 🔍 步驟 5 - Data 驗證:`);
      console.log(`[WorkspaceController] 🔍 node.data 存在: ${node.hasOwnProperty('data')}`);
      console.log(`[WorkspaceController] 🔍 node.data 值: ${JSON.stringify(node.data)}`);
      console.log(`[WorkspaceController] 🔍 node.data 類型: ${typeof node.data}`);
      console.log(`[WorkspaceController] 🔍 node.data 是 undefined: ${node.data === undefined}`);
      console.log(`[WorkspaceController] 🔍 node.data 是 null: ${node.data === null}`);
      console.log(`[WorkspaceController] 🔍 node.data 是對象: ${typeof node.data === 'object'}`);

      if (node.data !== undefined && (typeof node.data !== 'object' || node.data === null)) {
        const errorMsg = `節點 ${node.id || i}: data 必須是對象或 undefined (當前: ${node.data}, 類型: ${typeof node.data})`;
        validationErrors.push(errorMsg);
        console.log(`[WorkspaceController] ❌ 步驟 5 失敗: ${errorMsg}`);
        nodeHasErrors = true;
      } else {
        console.log(`[WorkspaceController] ✅ 步驟 5 通過: Data 驗證`);
      }

      // 🔍 節點驗證結果總結
      if (!nodeHasErrors) {
        console.log(`[WorkspaceController] ✅ 節點 ${i} 所有驗證步驟通過:`, {
          id: node.id,
          type: node.type,
          position: `{x: ${node.position.x}, y: ${node.position.y}}`,
          dataType: typeof node.data,
          allFieldsValid: true,
          validationSteps: {
            basicStructure: '✅ 通過',
            idValidation: '✅ 通過',
            typeValidation: '✅ 通過',
            positionValidation: '✅ 通過',
            dataValidation: '✅ 通過'
          }
        });
      } else {
        console.log(`[WorkspaceController] ❌ 節點 ${i} 驗證失敗，有錯誤`);
      }

      // 🔍 特別檢查便條紙節點
      if (node.type === 'noteNode') {
        console.log(`[WorkspaceController] 🗒️ 便條紙節點特別檢查:`, {
          id: node.id,
          type: node.type,
          position: node.position,
          data: node.data,
          dragHandle: node.dragHandle,
          allKeys: Object.keys(node)
        });
      }

      console.log(`[WorkspaceController] 🔍 ===== 節點 ${i} 驗證結束 =====`);
    }

    console.log(`[WorkspaceController] 🔍 ===== 所有節點驗證完成 =====`);

    // 🔍 最終驗證結果總結
    console.log(`[WorkspaceController] 🔍 驗證結果總結:`, {
      totalNodes: nodes.length,
      validationErrors: validationErrors.length,
      hasErrors: validationErrors.length > 0,
      errorDetails: validationErrors
    });

    if (validationErrors.length > 0) {
      console.log(`[WorkspaceController] ❌ 驗證失敗，返回 400 錯誤`);
      console.log(`[WorkspaceController] ❌ 錯誤詳情:`, validationErrors);

      const errorResponse = {
        error: 'Bad Request',
        message: 'Node 數據格式驗證失敗',
        details: validationErrors,
        debugInfo: {
          totalNodes: nodes.length,
          failedValidations: validationErrors.length,
          timestamp: new Date().toISOString()
        }
      };

      console.log(`[WorkspaceController] ❌ 返回錯誤響應:`, JSON.stringify(errorResponse, null, 2));

      return res.status(400).json(errorResponse);
    }

    console.log(`[WorkspaceController] ✅ 所有節點驗證通過，繼續處理`);
    console.log(`[WorkspaceController] 🔍 ===== 驗證階段結束，開始保存處理 =====`);

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