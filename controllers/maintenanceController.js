// controllers/maintenanceController.js
import { getMaintenanceStatus, updateMaintenanceStatus } from '../services/maintenanceService.js';

/**
 * 獲取維護模式狀態
 * GET /api/system/maintenance
 */
export async function getMaintenanceStatusController(req, res) {
  try {
    const status = await getMaintenanceStatus();
    
    res.status(200).json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('[MaintenanceController] 獲取維護模式狀態失敗:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '獲取維護模式狀態失敗'
    });
  }
}

/**
 * 更新維護模式狀態（僅管理員）
 * PUT /api/system/maintenance
 */
export async function updateMaintenanceStatusController(req, res) {
  try {
    const adminUid = req.user.uid; // 來自 verifyToken middleware
    const { isMaintenanceMode, maintenanceMessage } = req.body;

    // 驗證必要參數
    if (typeof isMaintenanceMode !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'isMaintenanceMode 必須是布林值'
      });
    }

    const result = await updateMaintenanceStatus(adminUid, {
      isMaintenanceMode,
      maintenanceMessage
    });

    res.status(200).json({
      success: true,
      message: result.message,
      data: result.data
    });
  } catch (error) {
    console.error('[MaintenanceController] 更新維護模式狀態失敗:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '更新維護模式狀態失敗'
    });
  }
}

