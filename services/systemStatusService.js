// services/systemStatusService.js
/**
 * 系統狀況服務
 * 提供系統監控數據，包括用戶統計、系統健康、操作統計
 */

import admin from 'firebase-admin';

const db = admin.firestore();

/**
 * 獲取用戶統計數據
 */
export async function getUserStats() {
  try {
    // 1. 總用戶數
    const usersSnapshot = await db.collection('users').count().get();
    const totalUsers = usersSnapshot.data().count;

    // 2. 本週新增用戶（過去 7 天）
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    const newUsersSnapshot = await db.collection('users')
      .where('createdAt', '>', admin.firestore.Timestamp.fromDate(oneWeekAgo))
      .count()
      .get();
    const newUsersThisWeek = newUsersSnapshot.data().count;

    // 3. 今日活躍用戶（過去 24 小時有操作記錄）
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);
    
    const activeTodaySnapshot = await db.collection('auditLogs')
      .where('timestamp', '>', admin.firestore.Timestamp.fromDate(oneDayAgo))
      .select('userId')
      .get();
    
    const activeUserIds = new Set();
    activeTodaySnapshot.docs.forEach(doc => {
      const userId = doc.data().userId;
      if (userId) activeUserIds.add(userId);
    });
    const activeTodayCount = activeUserIds.size;

    // 4. 當前在線用戶（過去 5 分鐘有操作記錄）
    const fiveMinutesAgo = new Date();
    fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - 5);
    
    const onlineNowSnapshot = await db.collection('auditLogs')
      .where('timestamp', '>', admin.firestore.Timestamp.fromDate(fiveMinutesAgo))
      .select('userId')
      .get();
    
    const onlineUserIds = new Set();
    onlineNowSnapshot.docs.forEach(doc => {
      const userId = doc.data().userId;
      if (userId) onlineUserIds.add(userId);
    });
    const onlineNowCount = onlineUserIds.size;

    return {
      totalUsers,
      activeTodayCount,
      onlineNowCount,
      newUsersThisWeek
    };
  } catch (error) {
    console.error('[SystemStatusService] 獲取用戶統計失敗:', error);
    throw new Error('獲取用戶統計失敗');
  }
}

/**
 * 獲取系統健康狀態
 */
export async function getSystemHealth() {
  const health = {
    backendStatus: 'healthy',
    firestoreStatus: 'healthy',
    avgResponseTime: 0,
    uptime: process.uptime() // 秒
  };

  try {
    // 測試 Firestore 連接
    const startTime = Date.now();
    await db.collection('users').limit(1).get();
    const responseTime = Date.now() - startTime;
    
    health.avgResponseTime = responseTime;
    health.firestoreStatus = 'healthy';
  } catch (error) {
    console.error('[SystemStatusService] Firestore 健康檢查失敗:', error);
    health.firestoreStatus = 'unhealthy';
    health.backendStatus = 'degraded';
  }

  return health;
}

/**
 * 獲取操作統計數據
 */
export async function getOperationStats() {
  try {
    // 獲取今日的操作記錄
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const logsSnapshot = await db.collection('auditLogs')
      .where('timestamp', '>', admin.firestore.Timestamp.fromDate(todayStart))
      .get();

    const stats = {
      todayRequests: logsSnapshot.size,
      errorCount: 0,
      errorRate: 0,
      topFeatures: []
    };

    // 統計資源使用和錯誤
    const resourceCounts = {};
    
    logsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      
      // 統計錯誤
      if (data.statusCode >= 400) {
        stats.errorCount++;
      }
      
      // 統計資源使用
      const resourceLabel = data.resourceLabel || data.resource || '未知操作';
      resourceCounts[resourceLabel] = (resourceCounts[resourceLabel] || 0) + 1;
    });

    // 計算錯誤率
    if (stats.todayRequests > 0) {
      stats.errorRate = (stats.errorCount / stats.todayRequests * 100).toFixed(2);
    }

    // 排序熱門功能（取前 5 名）
    stats.topFeatures = Object.entries(resourceCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    return stats;
  } catch (error) {
    console.error('[SystemStatusService] 獲取操作統計失敗:', error);
    throw new Error('獲取操作統計失敗');
  }
}

/**
 * 獲取完整系統狀況
 */
export async function getSystemStatus() {
  try {
    const [userStats, systemHealth, operationStats] = await Promise.all([
      getUserStats(),
      getSystemHealth(),
      getOperationStats()
    ]);

    return {
      users: userStats,
      system: systemHealth,
      operations: operationStats,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('[SystemStatusService] 獲取系統狀況失敗:', error);
    throw error;
  }
}

