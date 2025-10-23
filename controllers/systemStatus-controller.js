// controllers/systemStatus-controller.js
/**
 * 系統狀況控制器
 */

import { getSystemStatus } from '../services/systemStatusService.js';

/**
 * 獲取系統狀況
 * GET /api/admin/system-status
 */
export async function getSystemStatusController(req, res) {
  try {
    const status = await getSystemStatus();
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('[SystemStatusController] 獲取系統狀況失敗:', error);
    res.status(500).json({
      success: false,
      error: '獲取系統狀況失敗',
      message: error.message
    });
  }
}

