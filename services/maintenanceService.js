// services/maintenanceService.js
import admin from 'firebase-admin';

const MAINTENANCE_DOC_PATH = 'systemSettings/maintenance';

/**
 * 獲取維護模式狀態
 */
export async function getMaintenanceStatus() {
  try {
    const docRef = admin.firestore().doc(MAINTENANCE_DOC_PATH);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      // 如果文檔不存在，返回默認值（非維護模式）
      return {
        isMaintenanceMode: false,
        maintenanceMessage: '',
        enabledAt: null,
        enabledBy: null
      };
    }

    const data = docSnap.data();
    return {
      isMaintenanceMode: data.isMaintenanceMode || false,
      maintenanceMessage: data.maintenanceMessage || '系統維護中，請稍後再試',
      enabledAt: data.enabledAt,
      enabledBy: data.enabledBy
    };
  } catch (error) {
    console.error('[MaintenanceService] 獲取維護模式狀態失敗:', error);
    throw error;
  }
}

/**
 * 更新維護模式狀態（僅管理員可調用）
 */
export async function updateMaintenanceStatus(adminUid, { isMaintenanceMode, maintenanceMessage }) {
  try {
    const docRef = admin.firestore().doc(MAINTENANCE_DOC_PATH);
    
    const updateData = {
      isMaintenanceMode: Boolean(isMaintenanceMode),
      maintenanceMessage: maintenanceMessage || '系統維護中，請稍後再試',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: adminUid
    };

    // 如果是啟用維護模式，記錄啟用時間
    if (isMaintenanceMode) {
      updateData.enabledAt = admin.firestore.FieldValue.serverTimestamp();
      updateData.enabledBy = adminUid;
    }

    await docRef.set(updateData, { merge: true });

    console.log(`[MaintenanceService] 維護模式已${isMaintenanceMode ? '啟用' : '停用'} by ${adminUid}`);

    return {
      success: true,
      message: `維護模式已${isMaintenanceMode ? '啟用' : '停用'}`,
      data: updateData
    };
  } catch (error) {
    console.error('[MaintenanceService] 更新維護模式狀態失敗:', error);
    throw error;
  }
}

