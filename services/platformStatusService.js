// Boooook/services/platformStatusService.js
import admin from 'firebase-admin';

const DB_STATUS_COLLECTION = 'platform_status';
const DB_STATS_DOC_ID = 'database_stats';

/**
 * 更新資料庫統計資訊。
 * @param {object} newData - 包含要更新的數據的物件。
 *   例如: { judgmentCount, judgmentDateRange, lastUpdated, displayMessage }
 * @param {string} adminUid - 執行更新的管理員 UID。
 * @returns {Promise<void>}
 */
export async function updateDatabaseStats(newData, adminUid) {
  const statsRef = admin.firestore().collection(DB_STATUS_COLLECTION).doc(DB_STATS_DOC_ID);
  try {
    await statsRef.set({ // 使用 set 覆蓋，或 merge:true 更新
      ...newData,
      updatedBy: adminUid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true }); // merge: true 確保只更新傳入的欄位，如果文檔已存在
    console.log(`[PlatformStatusService] Database stats updated by ${adminUid}:`, newData);
  } catch (error) {
    console.error('[PlatformStatusService] Error updating database stats:', error);
    throw new Error('更新資料庫狀態失敗。');
  }
}

/**
 * 獲取資料庫統計資訊。
 * @returns {Promise<object|null>} 統計資訊物件，如果不存在則為 null。
 */
export async function getDatabaseStats() {
  const statsRef = admin.firestore().collection(DB_STATUS_COLLECTION).doc(DB_STATS_DOC_ID);
  try {
    const docSnap = await statsRef.get();
    if (docSnap.exists) {
      // console.log('[PlatformStatusService] Database stats fetched:', docSnap.data());
      return docSnap.data();
    } else {
      console.log('[PlatformStatusService] Database stats document does not exist.');
      return null; // 或者返回一個預設的空物件
    }
  } catch (error) {
    console.error('[PlatformStatusService] Error fetching database stats:', error);
    throw new Error('獲取資料庫狀態失敗。');
  }
}