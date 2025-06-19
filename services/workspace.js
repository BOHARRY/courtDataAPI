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

    const newWorkspaceName = workspaceData.name || `工作區 ${new Date().toLocaleDateString()}`;

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
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastAccessedAt: admin.firestore.FieldValue.serverTimestamp()
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