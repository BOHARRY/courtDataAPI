// services/workspace.js
import admin from 'firebase-admin';

const db = admin.firestore();

/**
 * 從節點ID推斷節點類型
 * @param {string} nodeId - 節點ID
 * @returns {string} 節點類型
 */
function inferNodeTypeFromId(nodeId) {
  // 根據節點ID的前綴推斷類型
  if (nodeId.startsWith('citation-analysis-')) return 'citationAnalysisNode';
  if (nodeId.startsWith('writing-assistant-')) return 'writingAssistantNode';
  if (nodeId.startsWith('analysis_')) return 'analysisNode';
  if (nodeId.startsWith('law_')) return 'lawNode';
  if (nodeId.startsWith('note_')) return 'noteNode';
  if (nodeId.startsWith('dispute_')) return 'disputeNode';
  if (nodeId.startsWith('evidence_')) return 'evidenceNode';
  if (nodeId.startsWith('claim_')) return 'claimNode';
  if (nodeId.startsWith('case_')) return 'caseNode';
  if (nodeId.startsWith('judgement_')) return 'judgementNode';
  if (nodeId.startsWith('result_')) return 'resultNode';
  if (nodeId.startsWith('reference_')) return 'referenceNode';
  if (nodeId.startsWith('text_')) return 'textNode';
  if (nodeId.startsWith('insight_')) return 'insightNode';

  // 如果無法從ID推斷，檢查ID中的關鍵字
  const lowerCaseId = nodeId.toLowerCase();
  if (lowerCaseId.includes('citation')) return 'citationAnalysisNode';
  if (lowerCaseId.includes('writing')) return 'writingAssistantNode';
  if (lowerCaseId.includes('analysis')) return 'analysisNode';
  if (lowerCaseId.includes('law')) return 'lawNode';
  if (lowerCaseId.includes('note')) return 'noteNode';
  if (lowerCaseId.includes('dispute')) return 'disputeNode';
  if (lowerCaseId.includes('evidence')) return 'evidenceNode';
  if (lowerCaseId.includes('claim')) return 'claimNode';
  if (lowerCaseId.includes('case')) return 'caseNode';
  if (lowerCaseId.includes('judgement')) return 'judgementNode';
  if (lowerCaseId.includes('result')) return 'resultNode';
  if (lowerCaseId.includes('reference')) return 'referenceNode';
  if (lowerCaseId.includes('text')) return 'textNode';
  if (lowerCaseId.includes('insight')) return 'insightNode';

  // 默認返回通用節點類型
  console.warn(`[WorkspaceService] 無法推斷節點類型，使用默認類型: ${nodeId}`);
  return 'noteNode'; // 使用最簡單的節點類型作為默認
}

/**
 * 創建新工作區
 */
export async function createWorkspace(userId, workspaceData) {
  try {
    const workspaceRef = db.collection('users').doc(userId).collection('workspaces').doc();
    
    const now = admin.firestore.FieldValue.serverTimestamp();

    // ===== 核心修改點：檢查是否有範本資料 =====
    const hasTemplate = workspaceData.template && typeof workspaceData.template === 'object';

    // 產生精簡版日期字串：2025.0619.2029
    function getCompactDateString() {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const hh = String(now.getHours()).padStart(2, '0');
      const min = String(now.getMinutes()).padStart(2, '0');
      return `${yyyy}.${mm}${dd}.${hh}${min}`;
    }
    const newWorkspaceName = workspaceData.name || `工作區 ${getCompactDateString()}`;

    const workspace = {
      id: workspaceRef.id,
      name: newWorkspaceName,
      description: hasTemplate ? workspaceData.template.description || '' : workspaceData.description || '',
      color: hasTemplate ? workspaceData.template.color || '#5a8f5a' : workspaceData.color || '#5a8f5a', // 🆕 預設綠色
      createdAt: now,
      updatedAt: now,
      lastAccessedAt: now, // 創建即訪問

      // 使用範本資料或預設值
      searchState: hasTemplate ? workspaceData.template.searchState || null : null,
      tabs: hasTemplate ? workspaceData.template.tabs || [INITIAL_TABS[0]] : [{
        id: 'SEARCH_LIST',
        type: 'list',
        title: '搜尋列表',
        order: 0
      }],
      activeTabId: hasTemplate ? workspaceData.template.activeTabId || 'SEARCH_LIST' : 'SEARCH_LIST',

      // 統計資訊總是從零開始
      stats: {
        totalSearches: 0,
        totalJudgements: 0,
        totalNotes: 0
      }
    };

    await workspaceRef.set(workspace);
    
    // 設定為當前活動工作區
    await setActiveWorkspace(userId, workspaceRef.id);
    
    console.log(`[WorkspaceService] Created workspace ${workspaceRef.id} for user ${userId}`);

    // ===== 增加一步驗證讀取（加上重試機制） =====
    let newDoc = null;
    let attempts = 0;
    const maxAttempts = 3;
    const delay = ms => new Promise(res => setTimeout(res, ms));
    while (attempts < maxAttempts) {
        newDoc = await workspaceRef.get();
        if (newDoc.exists) break;
        attempts++;
        await delay(200);
    }
    if (!newDoc || !newDoc.exists) {
        throw new Error('Failed to verify workspace creation after multiple attempts.');
    }

    const data = newDoc.data();
    return {
      ...data,
      id: workspaceRef.id,
      // 🔧 修復：將 Firestore Timestamp 轉換為毫秒數
      createdAt: Date.now(), // 剛剛創建，使用當前時間
      updatedAt: Date.now(),
      lastAccessedAt: Date.now()
    };
  } catch (error) {
    console.error('[WorkspaceService] Error creating workspace:', error);
    throw new Error('創建工作區失敗');
  }
}

/**
 * 更新工作區
 */
export async function updateWorkspace(userId, workspaceId, updateData) {
  try {
    const workspaceRef = db.collection('users').doc(userId).collection('workspaces').doc(workspaceId);

    // 準備更新資料
    const updates = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
      // lastAccessedAt 僅在 getWorkspaceById 時更新
    };

    // 選擇性更新欄位
    if (updateData.name !== undefined) updates.name = updateData.name;
    if (updateData.description !== undefined) updates.description = updateData.description;
    if (updateData.color !== undefined) updates.color = updateData.color; // 🆕 支援顏色更新
    if (updateData.searchState !== undefined) updates.searchState = updateData.searchState; // 🔧 保持向後相容（舊版單一模式）
    if (updateData.searchStates !== undefined) updates.searchStates = updateData.searchStates; // 🆕 新增三模式結構支援
    if (updateData.tabs !== undefined) updates.tabs = updateData.tabs;
    if (updateData.activeTabId !== undefined) updates.activeTabId = updateData.activeTabId;

    // 更新統計資訊
    if (updateData.tabs) {
      const judgementCount = updateData.tabs.filter(tab => tab.type === 'judgement').length;
      updates['stats.totalJudgements'] = judgementCount;
    }

    await workspaceRef.update(updates);

    console.log(`[WorkspaceService] Updated workspace ${workspaceId} for user ${userId}`);

    // 返回更新後的資料
    const updatedDoc = await workspaceRef.get();
    const data = updatedDoc.data();

    // 🔧 安全地轉換 Firestore Timestamp 為毫秒數
    const toMillis = (timestamp) => {
      try {
        if (!timestamp) return null;
        if (typeof timestamp === 'number') return timestamp;
        if (typeof timestamp.toMillis === 'function') return timestamp.toMillis();
        if (timestamp._seconds) return timestamp._seconds * 1000;
        if (timestamp.seconds) return timestamp.seconds * 1000;
        return null;
      } catch (error) {
        console.error('[WorkspaceService] toMillis 轉換錯誤:', error, timestamp);
        return null;
      }
    };

    return {
      id: workspaceId,
      ...data,
      createdAt: toMillis(data.createdAt),
      updatedAt: Date.now(), // 剛剛更新，使用當前時間
      lastAccessedAt: toMillis(data.lastAccessedAt)
    };
  } catch (error) {
    console.error('[WorkspaceService] Error updating workspace:', error);
    throw new Error('更新工作區失敗');
  }
}

/**
 * 獲取用戶的所有工作區
 */
export async function getUserWorkspaces(userId, options = {}) {
  try {
    const { limit = 20, orderBy = 'lastAccessedAt' } = options;
    
    let query = db.collection('users').doc(userId).collection('workspaces');

    // 排序
    if (orderBy === 'lastAccessedAt') {
      query = query.orderBy('lastAccessedAt', 'desc');
    } else if (orderBy === 'createdAt') {
      query = query.orderBy('createdAt', 'desc');
    } else if (orderBy === 'name') {
      query = query.orderBy('name', 'asc');
    }

    // 限制數量
    query = query.limit(limit);
    
    const snapshot = await query.get();
    const workspaces = [];

    snapshot.forEach(doc => {
      const data = doc.data();

      // 🔧 安全地轉換 Firestore Timestamp 為毫秒數
      const toMillis = (timestamp) => {
        try {
          if (!timestamp) return null;
          if (typeof timestamp === 'number') return timestamp; // 已經是毫秒數
          if (typeof timestamp.toMillis === 'function') return timestamp.toMillis();
          if (timestamp._seconds) return timestamp._seconds * 1000; // Firestore Timestamp 對象
          if (timestamp.seconds) return timestamp.seconds * 1000; // 序列化後的格式
          return null;
        } catch (error) {
          console.error('[WorkspaceService] toMillis 轉換錯誤:', error, timestamp);
          return null;
        }
      };

      workspaces.push({
        id: doc.id,
        ...data,
        createdAt: toMillis(data.createdAt),
        updatedAt: toMillis(data.updatedAt),
        lastAccessedAt: toMillis(data.lastAccessedAt)
      });
    });

    console.log(`[WorkspaceService] Retrieved ${workspaces.length} workspaces for user ${userId}`);

    return workspaces;
  } catch (error) {
    console.error('[WorkspaceService] Error getting user workspaces:', error);
    throw new Error('獲取工作區列表失敗');
  }
}

/**
 * 獲取特定工作區
 */
export async function getWorkspaceById(userId, workspaceId) {
  try {
    const workspaceRef = db.collection('users').doc(userId).collection('workspaces').doc(workspaceId);
    const doc = await workspaceRef.get();
    
    if (!doc.exists) {
      return null;
    }
    
    // 更新最後存取時間
    await workspaceRef.update({
      lastAccessedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const data = doc.data();

    // 🔧 安全地轉換 Firestore Timestamp 為毫秒數
    const toMillis = (timestamp) => {
      try {
        if (!timestamp) return null;
        if (typeof timestamp === 'number') return timestamp;
        if (typeof timestamp.toMillis === 'function') return timestamp.toMillis();
        if (timestamp._seconds) return timestamp._seconds * 1000;
        if (timestamp.seconds) return timestamp.seconds * 1000;
        return null;
      } catch (error) {
        console.error('[WorkspaceService] toMillis 轉換錯誤:', error, timestamp);
        return null;
      }
    };

    return {
      id: doc.id,
      ...data,
      createdAt: toMillis(data.createdAt),
      updatedAt: toMillis(data.updatedAt),
      lastAccessedAt: Date.now() // 剛剛更新，使用當前時間
    };
  } catch (error) {
    console.error('[WorkspaceService] Error getting workspace:', error);
    throw new Error('獲取工作區失敗');
  }
}

/**
 * 檢查並修復節點狀態不一致問題
 * @param {string} userId - 用戶ID
 * @param {string} workspaceId - 工作區ID
 * @param {Array} frontendNodeIds - 前端節點ID列表
 * @returns {Object} 修復結果
 */
export async function checkAndRepairNodeConsistency(userId, workspaceId, frontendNodeIds) {
  try {
    console.log(`[WorkspaceService] 開始檢查節點一致性: ${frontendNodeIds.length} 個前端節點`);

    const result = {
      totalFrontendNodes: frontendNodeIds.length,
      existingNodes: [],
      missingNodes: [],
      createdNodes: [],
      errors: []
    };

    // 批次檢查節點是否存在
    const nodeRefs = frontendNodeIds.map(nodeId =>
      db.collection('users')
        .doc(userId)
        .collection('workspaces')
        .doc(workspaceId)
        .collection('canvas_nodes')
        .doc(nodeId)
    );

    const docs = await Promise.all(nodeRefs.map(ref => ref.get()));

    for (let i = 0; i < frontendNodeIds.length; i++) {
      const nodeId = frontendNodeIds[i];
      const doc = docs[i];

      if (doc.exists) {
        result.existingNodes.push(nodeId);
      } else {
        result.missingNodes.push(nodeId);

        try {
          // 自動創建缺失的節點
          const nodeType = inferNodeTypeFromId(nodeId);
          const now = admin.firestore.FieldValue.serverTimestamp();

          const newNodeData = {
            id: nodeId,
            type: nodeType,
            position: { x: 0, y: 0 }, // 默認位置
            data: {}, // 空數據
            createdAt: now,
            updatedAt: now,
            autoCreated: true,
            autoCreatedReason: 'consistency_repair'
          };

          await nodeRefs[i].set(newNodeData);
          result.createdNodes.push(nodeId);

          console.log(`[WorkspaceService] 自動創建缺失節點: ${nodeId}, 類型: ${nodeType}`);
        } catch (error) {
          console.error(`[WorkspaceService] 創建節點失敗: ${nodeId}`, error);
          result.errors.push({
            nodeId,
            error: error.message
          });
        }
      }
    }

    // 更新工作區的 lastAccessedAt
    if (result.createdNodes.length > 0) {
      await updateWorkspaceAccess(userId, workspaceId);
    }

    console.log(`[WorkspaceService] 節點一致性檢查完成:`, {
      existing: result.existingNodes.length,
      missing: result.missingNodes.length,
      created: result.createdNodes.length,
      errors: result.errors.length
    });

    return result;
  } catch (error) {
    console.error('[WorkspaceService] 節點一致性檢查失敗:', error);
    throw new Error('節點一致性檢查失敗');
  }
}

/**
 * 刪除工作區
 */
export async function deleteWorkspace(userId, workspaceId) {
  try {
    const workspaceRef = db.collection('users').doc(userId).collection('workspaces').doc(workspaceId);
    
    // 檢查是否為當前活動工作區
    const settingsRef = db.collection('users').doc(userId).collection('settings').doc('workspace');
    const settingsDoc = await settingsRef.get();
    
    if (settingsDoc.exists && settingsDoc.data().currentWorkspaceId === workspaceId) {
      // 如果是當前工作區，清除設定
      await settingsRef.update({
        currentWorkspaceId: null
      });
    }
    
    // 刪除工作區
    await workspaceRef.delete();
    
    console.log(`[WorkspaceService] Deleted workspace ${workspaceId} for user ${userId}`);
  } catch (error) {
    console.error('[WorkspaceService] Error deleting workspace:', error);
    throw new Error('刪除工作區失敗');
  }
}

/**
 * 設定當前活動工作區
 */
export async function setActiveWorkspace(userId, workspaceId) {
  try {
    const settingsRef = db.collection('users').doc(userId).collection('settings').doc('workspace');
    
    await settingsRef.set({
      currentWorkspaceId: workspaceId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    console.log(`[WorkspaceService] Set active workspace ${workspaceId} for user ${userId}`);
  } catch (error) {
    console.error('[WorkspaceService] Error setting active workspace:', error);
    throw new Error('設定活動工作區失敗');
  }
}

/**
 * 獲取當前活動工作區
 */
export async function getActiveWorkspace(userId) {
  try {
    const settingsRef = db.collection('users').doc(userId).collection('settings').doc('workspace');
    const doc = await settingsRef.get();
    
    if (!doc.exists) {
      return null;
    }
    
    const { currentWorkspaceId } = doc.data();
    if (!currentWorkspaceId) {
      return null;
    }
    
    // 獲取工作區詳細資料
    return await getWorkspaceById(userId, currentWorkspaceId);
  } catch (error) {
    console.error('[WorkspaceService] Error getting active workspace:', error);
    throw new Error('獲取當前工作區失敗');
  }
}

// ===== 🎯 新增：Canvas 碎片化存儲服務 =====

/**
 * 獲取 Canvas Manifest
 */
export async function getCanvasManifest(userId, workspaceId, canvasId) {
  try {
    const manifestRef = db
      .collection('users')
      .doc(userId)
      .collection('workspaces')
      .doc(workspaceId)
      .collection('canvas_manifests')
      .doc(canvasId);

    const doc = await manifestRef.get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data();
    return {
      ...data,
      canvasId,
      // 轉換 Firestore 時間戳為 JavaScript Date
      updatedAt: data.updatedAt?.toDate?.() || data.updatedAt
    };
  } catch (error) {
    console.error('[WorkspaceService] Error getting canvas manifest:', error);
    throw new Error('獲取 Canvas Manifest 失敗');
  }
}

/**
 * 保存 Canvas Manifest
 */
export async function saveCanvasManifest(userId, workspaceId, canvasId, manifestData) {
  try {
    const manifestRef = db
      .collection('users')
      .doc(userId)
      .collection('workspaces')
      .doc(workspaceId)
      .collection('canvas_manifests')
      .doc(canvasId);

    const now = admin.firestore.FieldValue.serverTimestamp();

    const dataToSave = {
      ...manifestData,
      canvasId,
      updatedAt: now,
      version: 2 // 確保是碎片化版本
    };

    await manifestRef.set(dataToSave, { merge: true });

    // 更新工作區的 lastAccessedAt
    await updateWorkspaceAccess(userId, workspaceId);

    console.log(`[WorkspaceService] Canvas manifest saved: ${canvasId}`);

    return {
      ...dataToSave,
      updatedAt: new Date() // 返回 JavaScript Date 對象
    };
  } catch (error) {
    console.error('[WorkspaceService] Error saving canvas manifest:', error);
    throw new Error('保存 Canvas Manifest 失敗');
  }
}

/**
 * 更新 Canvas 視角
 */
export async function updateCanvasViewport(userId, workspaceId, canvasId, viewport) {
  try {
    const manifestRef = db
      .collection('users')
      .doc(userId)
      .collection('workspaces')
      .doc(workspaceId)
      .collection('canvas_manifests')
      .doc(canvasId);

    const now = admin.firestore.FieldValue.serverTimestamp();

    await manifestRef.update({
      viewport,
      updatedAt: now
    });

    console.log(`[WorkspaceService] Canvas viewport updated: ${canvasId}`);

    // 返回更新後的 manifest
    return await getCanvasManifest(userId, workspaceId, canvasId);
  } catch (error) {
    console.error('[WorkspaceService] Error updating canvas viewport:', error);
    throw new Error('更新 Canvas 視角失敗');
  }
}

/**
 * 獲取單個 Node
 */
export async function getNode(userId, workspaceId, nodeId) {
  try {
    const nodeRef = db
      .collection('users')
      .doc(userId)
      .collection('workspaces')
      .doc(workspaceId)
      .collection('canvas_nodes')
      .doc(nodeId);

    const doc = await nodeRef.get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data();
    return {
      ...data,
      // 轉換 Firestore 時間戳為 JavaScript Date
      updatedAt: data.updatedAt?.toDate?.() || data.updatedAt
    };
  } catch (error) {
    console.error('[WorkspaceService] Error getting node:', error);
    throw new Error('獲取節點失敗');
  }
}

/**
 * 保存單個 Node
 */
export async function saveNode(userId, workspaceId, nodeId, nodeData) {
  try {
    const nodeRef = db
      .collection('users')
      .doc(userId)
      .collection('workspaces')
      .doc(workspaceId)
      .collection('canvas_nodes')
      .doc(nodeId);

    const now = admin.firestore.FieldValue.serverTimestamp();

    const dataToSave = {
      ...nodeData,
      updatedAt: now
    };

    await nodeRef.set(dataToSave, { merge: true });

    // 更新工作區的 lastAccessedAt
    await updateWorkspaceAccess(userId, workspaceId);

    console.log(`[WorkspaceService] Node saved: ${nodeId}`);

    return {
      ...dataToSave,
      updatedAt: new Date() // 返回 JavaScript Date 對象
    };
  } catch (error) {
    console.error('[WorkspaceService] Error saving node:', error);
    throw new Error('保存節點失敗');
  }
}

/**
 * 批次獲取 Nodes
 */
export async function batchGetNodes(userId, workspaceId, nodeIds) {
  try {
    if (!Array.isArray(nodeIds) || nodeIds.length === 0) {
      return [];
    }

    // Firestore 批次讀取限制為 10 個文檔，需要分批處理
    const batchSize = 10;
    const batches = [];

    for (let i = 0; i < nodeIds.length; i += batchSize) {
      const batchNodeIds = nodeIds.slice(i, i + batchSize);
      batches.push(batchNodeIds);
    }

    const allNodes = [];

    for (const batchNodeIds of batches) {
      const batch = db.batch();
      const nodeRefs = batchNodeIds.map(nodeId =>
        db.collection('users')
          .doc(userId)
          .collection('workspaces')
          .doc(workspaceId)
          .collection('canvas_nodes')
          .doc(nodeId)
      );

      // 並行獲取這一批的所有節點
      const docs = await Promise.all(nodeRefs.map(ref => ref.get()));

      docs.forEach((doc, index) => {
        if (doc.exists) {
          const data = doc.data();
          allNodes.push({
            ...data,
            // 轉換 Firestore 時間戳為 JavaScript Date
            updatedAt: data.updatedAt?.toDate?.() || data.updatedAt
          });
        } else {
          // 記錄未找到的節點，但不拋出錯誤
          console.warn(`[WorkspaceService] Node not found: ${batchNodeIds[index]}`);
        }
      });
    }

    console.log(`[WorkspaceService] Batch get nodes: ${allNodes.length}/${nodeIds.length} found`);
    return allNodes;
  } catch (error) {
    console.error('[WorkspaceService] Error batch getting nodes:', error);
    throw new Error('批次獲取節點失敗');
  }
}

/**
 * 批次保存 Nodes
 */
export async function batchSaveNodes(userId, workspaceId, nodes) {
  try {
    if (!Array.isArray(nodes) || nodes.length === 0) {
      return [];
    }

    // Firestore 批次寫入限制為 500 個操作，但為了安全起見使用較小的批次
    const batchSize = 100;
    const batches = [];

    for (let i = 0; i < nodes.length; i += batchSize) {
      const batchNodes = nodes.slice(i, i + batchSize);
      batches.push(batchNodes);
    }

    const savedNodes = [];
    const now = admin.firestore.FieldValue.serverTimestamp();

    for (const batchNodes of batches) {
      const batch = db.batch();

      batchNodes.forEach(node => {
        const nodeRef = db
          .collection('users')
          .doc(userId)
          .collection('workspaces')
          .doc(workspaceId)
          .collection('canvas_nodes')
          .doc(node.id);

        const dataToSave = {
          ...node,
          updatedAt: now
        };

        batch.set(nodeRef, dataToSave, { merge: true });

        savedNodes.push({
          ...dataToSave,
          updatedAt: new Date() // 返回 JavaScript Date 對象
        });
      });

      await batch.commit();
    }

    // 更新工作區的 lastAccessedAt
    await updateWorkspaceAccess(userId, workspaceId);

    console.log(`[WorkspaceService] Batch save nodes: ${savedNodes.length} saved`);
    return savedNodes;
  } catch (error) {
    console.error('[WorkspaceService] Error batch saving nodes:', error);
    throw new Error('批次保存節點失敗');
  }
}

/**
 * 輔助函數：更新工作區訪問時間
 */
async function updateWorkspaceAccess(userId, workspaceId) {
  try {
    const workspaceRef = db
      .collection('users')
      .doc(userId)
      .collection('workspaces')
      .doc(workspaceId);

    await workspaceRef.update({
      lastAccessedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    // 不拋出錯誤，只記錄日誌
    console.warn('[WorkspaceService] Failed to update workspace access time:', error);
  }
}

// ===== 🎯 Stage 3 新增：單節點精確更新服務 =====

/**
 * 更新單個節點位置
 */
export async function updateNodePosition(userId, workspaceId, nodeId, position) {
  try {
    // 🎯 修復：使用正確的集合路徑 canvas_nodes（與批次保存一致）
    const nodeRef = db
      .collection('users')
      .doc(userId)
      .collection('workspaces')
      .doc(workspaceId)
      .collection('canvas_nodes')
      .doc(nodeId);

    // 🎯 新增：檢查文檔是否存在
    const docSnapshot = await nodeRef.get();
    if (!docSnapshot.exists) {
      console.warn(`[WorkspaceService] 節點不存在，嘗試自動創建: ${nodeId}`);

      // 🚀 自動創建節點：從節點ID推斷節點類型和基本信息
      const nodeType = inferNodeTypeFromId(nodeId);
      const now = admin.firestore.FieldValue.serverTimestamp();

      const newNodeData = {
        id: nodeId,
        type: nodeType,
        position: position,
        data: {}, // 空數據，後續會更新
        createdAt: now,
        updatedAt: now,
        autoCreated: true, // 標記為自動創建
        autoCreatedReason: 'position_update_missing_node'
      };

      console.log(`[WorkspaceService] 自動創建節點: ${nodeId}, 類型: ${nodeType}`);
      await nodeRef.set(newNodeData);

      // 更新工作區的 lastAccessedAt
      await updateWorkspaceAccess(userId, workspaceId);

      return {
        ...newNodeData,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }

    const now = admin.firestore.FieldValue.serverTimestamp();

    await nodeRef.update({
      position: position,
      updatedAt: now
    });

    // 獲取更新後的節點
    const updatedDoc = await nodeRef.get();
    if (!updatedDoc.exists) {
      throw new Error('節點更新後無法找到');
    }

    const updatedNode = { id: updatedDoc.id, ...updatedDoc.data() };
    console.log(`[WorkspaceService] ✅ 節點位置已更新: ${nodeId}`);

    return updatedNode;
  } catch (error) {
    console.error('[WorkspaceService] Error updating node position:', error);
    throw error;
  }
}

/**
 * 更新單個節點內容
 */
export async function updateNodeContent(userId, workspaceId, nodeId, data) {
  try {
    // 🎯 修復：使用正確的集合路徑 canvas_nodes（與批次保存一致）
    const nodeRef = db
      .collection('users')
      .doc(userId)
      .collection('workspaces')
      .doc(workspaceId)
      .collection('canvas_nodes')
      .doc(nodeId);

    // 🎯 新增：檢查文檔是否存在
    const docSnapshot = await nodeRef.get();
    if (!docSnapshot.exists) {
      console.warn(`[WorkspaceService] 節點不存在，嘗試自動創建: ${nodeId}`);

      // 🚀 自動創建節點：從節點ID推斷節點類型和基本信息
      const nodeType = inferNodeTypeFromId(nodeId);
      const now = admin.firestore.FieldValue.serverTimestamp();

      const newNodeData = {
        id: nodeId,
        type: nodeType,
        position: { x: 0, y: 0 }, // 默認位置，前端會更新
        data: data,
        createdAt: now,
        updatedAt: now,
        autoCreated: true, // 標記為自動創建
        autoCreatedReason: 'content_update_missing_node'
      };

      console.log(`[WorkspaceService] 自動創建節點: ${nodeId}, 類型: ${nodeType}`);
      await nodeRef.set(newNodeData);

      // 更新工作區的 lastAccessedAt
      await updateWorkspaceAccess(userId, workspaceId);

      return {
        ...newNodeData,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }

    const now = admin.firestore.FieldValue.serverTimestamp();

    await nodeRef.update({
      data: data,
      updatedAt: now
    });

    // 獲取更新後的節點
    const updatedDoc = await nodeRef.get();
    if (!updatedDoc.exists) {
      throw new Error('節點更新後無法找到');
    }

    const updatedNode = { id: updatedDoc.id, ...updatedDoc.data() };
    console.log(`[WorkspaceService] ✅ 節點內容已更新: ${nodeId}`);

    return updatedNode;
  } catch (error) {
    console.error('[WorkspaceService] Error updating node content:', error);
    throw error;
  }
}

// ===== 🎯 新增：Edges 批次操作 =====

/**
 * 批次獲取 Edges
 */
export async function batchGetEdges(userId, workspaceId, edgeIds) {
  try {
    if (!Array.isArray(edgeIds) || edgeIds.length === 0) {
      return [];
    }

    // Firestore 批次讀取限制為 10 個操作，但為了安全起見使用較小的批次
    const batchSize = 10;
    const batches = [];

    for (let i = 0; i < edgeIds.length; i += batchSize) {
      const batchEdgeIds = edgeIds.slice(i, i + batchSize);
      batches.push(batchEdgeIds);
    }

    const allEdges = [];

    for (const batchEdgeIds of batches) {
      const edgePromises = batchEdgeIds.map(async (edgeId) => {
        try {
          const edgeRef = db
            .collection('users')
            .doc(userId)
            .collection('workspaces')
            .doc(workspaceId)
            .collection('canvas_edges')
            .doc(edgeId);

          const doc = await edgeRef.get();
          if (doc.exists) {
            return { id: doc.id, ...doc.data() };
          }
          return null;
        } catch (error) {
          console.error(`[WorkspaceService] Error getting edge ${edgeId}:`, error);
          return null;
        }
      });

      const batchResults = await Promise.all(edgePromises);
      allEdges.push(...batchResults.filter(Boolean));
    }

    console.log(`[WorkspaceService] Batch get edges: ${allEdges.length}/${edgeIds.length} found`);
    return allEdges;
  } catch (error) {
    console.error('[WorkspaceService] Error batch getting edges:', error);
    throw new Error('批次獲取連接線失敗');
  }
}

/**
 * 批次保存 Edges
 */
export async function batchSaveEdges(userId, workspaceId, edges) {
  try {
    if (!Array.isArray(edges) || edges.length === 0) {
      return [];
    }

    // Firestore 批次寫入限制為 500 個操作，但為了安全起見使用較小的批次
    const batchSize = 100;
    const batches = [];

    for (let i = 0; i < edges.length; i += batchSize) {
      const batchEdges = edges.slice(i, i + batchSize);
      batches.push(batchEdges);
    }

    const allSavedEdges = [];

    for (const batchEdges of batches) {
      const batch = db.batch();
      const now = admin.firestore.FieldValue.serverTimestamp();

      for (const edge of batchEdges) {
        const edgeRef = db
          .collection('users')
          .doc(userId)
          .collection('workspaces')
          .doc(workspaceId)
          .collection('canvas_edges')
          .doc(edge.id);

        const edgeData = {
          ...edge,
          updatedAt: now
        };

        batch.set(edgeRef, edgeData, { merge: true });
      }

      await batch.commit();

      // 添加到結果數組
      const savedBatchEdges = batchEdges.map(edge => ({
        ...edge,
        updatedAt: new Date() // 返回 JavaScript Date 對象
      }));

      allSavedEdges.push(...savedBatchEdges);
    }

    // 更新工作區的 lastAccessedAt
    await updateWorkspaceAccess(userId, workspaceId);

    console.log(`[WorkspaceService] Batch save edges: ${allSavedEdges.length} saved`);
    return allSavedEdges;
  } catch (error) {
    console.error('[WorkspaceService] Error batch saving edges:', error);
    throw new Error('批次保存連接線失敗');
  }
}