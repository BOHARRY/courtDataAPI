// services/workspace.js
import admin from 'firebase-admin';

const db = admin.firestore();

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

    return {
      ...newDoc.data(),
      id: workspaceRef.id
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
    if (updateData.searchState !== undefined) updates.searchState = updateData.searchState;
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
    return {
      id: workspaceId,
      ...updatedDoc.data()
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
      workspaces.push({
        id: doc.id,
        ...doc.data()
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
    
    return {
      id: doc.id,
      ...doc.data()
    };
  } catch (error) {
    console.error('[WorkspaceService] Error getting workspace:', error);
    throw new Error('獲取工作區失敗');
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
      console.error(`[WorkspaceService] 節點不存在: ${nodeId} 在路徑 users/${userId}/workspaces/${workspaceId}/canvas_nodes/${nodeId}`);
      throw new Error(`節點 ${nodeId} 不存在，無法更新位置`);
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
      console.error(`[WorkspaceService] 節點不存在: ${nodeId} 在路徑 users/${userId}/workspaces/${workspaceId}/canvas_nodes/${nodeId}`);
      throw new Error(`節點 ${nodeId} 不存在，無法更新內容`);
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