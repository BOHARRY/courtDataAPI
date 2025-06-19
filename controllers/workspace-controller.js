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