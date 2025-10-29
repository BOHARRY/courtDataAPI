/**
 * 裝置管理服務
 * 處理用戶裝置的記錄、查詢、登出等操作
 */

import admin from 'firebase-admin';
import { parseUserAgent, generateDeviceName, getDeviceIcon } from '../utils/deviceParser.js';
import { getLocationFromIP, formatLocation } from './ipGeolocation.js';

/**
 * 記錄裝置登入
 * @param {string} userId - 用戶 ID
 * @param {object} deviceInfo - 裝置資訊
 * @param {string} deviceInfo.clientInstanceId - 客戶端實例 ID
 * @param {string} deviceInfo.userAgent - User Agent 字串
 * @param {string} deviceInfo.ip - IP 地址
 * @returns {Promise<object>} 裝置記錄
 */
export async function recordDeviceLogin(userId, deviceInfo) {
  try {
    const { clientInstanceId, userAgent, ip } = deviceInfo;
    
    if (!clientInstanceId || !userAgent) {
      throw new Error('Missing required device information');
    }
    
    console.log(`[Device Management] Recording device login for user: ${userId}`);
    
    // 解析 User Agent
    const parsedUA = parseUserAgent(userAgent);
    
    // 獲取 IP 地理位置
    const location = await getLocationFromIP(ip);
    
    // 生成裝置名稱
    const deviceName = generateDeviceName(parsedUA);
    
    // 獲取裝置圖示
    const deviceIcon = getDeviceIcon(parsedUA);
    
    // 準備裝置資料
    const deviceData = {
      deviceId: clientInstanceId,
      deviceName: deviceName,
      deviceType: parsedUA.deviceType,
      os: parsedUA.os,
      browser: parsedUA.browser,
      browserVersion: parsedUA.browserVersion,
      userAgent: userAgent,
      ip: location.ip,
      city: location.city,
      region: location.region,
      country: location.country,
      countryCode: location.countryCode,
      latitude: location.latitude,
      longitude: location.longitude,
      timezone: location.timezone,
      locationString: formatLocation(location),
      deviceIcon: deviceIcon,
      lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
      lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    // 寫入 Firestore
    const deviceRef = admin.firestore()
      .collection('users')
      .doc(userId)
      .collection('devices')
      .doc(clientInstanceId);
    
    // 使用 set with merge 來更新或創建
    await deviceRef.set(deviceData, { merge: true });
    
    console.log(`[Device Management] Device login recorded: ${deviceName} (${clientInstanceId})`);
    
    return {
      success: true,
      deviceId: clientInstanceId,
      deviceName: deviceName
    };
    
  } catch (error) {
    console.error('[Device Management] Error recording device login:', error);
    throw error;
  }
}

/**
 * 更新裝置最後活動時間
 * @param {string} userId - 用戶 ID
 * @param {string} deviceId - 裝置 ID (clientInstanceId)
 * @returns {Promise<void>}
 */
export async function updateDeviceActivity(userId, deviceId) {
  try {
    const deviceRef = admin.firestore()
      .collection('users')
      .doc(userId)
      .collection('devices')
      .doc(deviceId);
    
    await deviceRef.update({
      lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
  } catch (error) {
    // 靜默失敗,不影響主要流程
    console.error('[Device Management] Error updating device activity:', error.message);
  }
}

/**
 * 獲取用戶的所有裝置
 * @param {string} userId - 用戶 ID
 * @param {string} currentDeviceId - 當前裝置 ID (用於標記)
 * @returns {Promise<Array>} 裝置列表
 */
export async function getUserDevices(userId, currentDeviceId = null) {
  try {
    console.log(`[Device Management] Fetching devices for user: ${userId}`);
    
    const devicesRef = admin.firestore()
      .collection('users')
      .doc(userId)
      .collection('devices')
      .orderBy('lastActiveAt', 'desc');
    
    const snapshot = await devicesRef.get();
    
    if (snapshot.empty) {
      console.log(`[Device Management] No devices found for user: ${userId}`);
      return [];
    }
    
    const devices = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      devices.push({
        deviceId: doc.id,
        deviceName: data.deviceName,
        deviceType: data.deviceType,
        os: data.os,
        browser: data.browser,
        browserVersion: data.browserVersion,
        ip: data.ip,
        city: data.city,
        region: data.region,
        country: data.country,
        locationString: data.locationString,
        deviceIcon: data.deviceIcon,
        lastLoginAt: data.lastLoginAt?.toDate?.() || null,
        lastLogoutAt: data.lastLogoutAt?.toDate?.() || null,
        lastActiveAt: data.lastActiveAt?.toDate?.() || null,
        createdAt: data.createdAt?.toDate?.() || null,
        isCurrentDevice: doc.id === currentDeviceId
      });
    });
    
    console.log(`[Device Management] Found ${devices.length} devices for user: ${userId}`);
    
    return devices;
    
  } catch (error) {
    console.error('[Device Management] Error fetching user devices:', error);
    throw error;
  }
}

/**
 * 記錄裝置登出
 * @param {string} userId - 用戶 ID
 * @param {string} deviceId - 裝置 ID
 * @returns {Promise<object>} 操作結果
 */
export async function recordDeviceLogout(userId, deviceId) {
  try {
    console.log(`[Device Management] Recording device logout for user: ${userId}, device: ${deviceId}`);
    
    const deviceRef = admin.firestore()
      .collection('users')
      .doc(userId)
      .collection('devices')
      .doc(deviceId);
    
    await deviceRef.update({
      lastLogoutAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`[Device Management] Device logout recorded: ${deviceId}`);
    
    return { success: true };
    
  } catch (error) {
    console.error('[Device Management] Error recording device logout:', error);
    throw error;
  }
}

/**
 * 遠端登出裝置 (撤銷 Firebase Auth Token)
 * @param {string} userId - 用戶 ID
 * @param {string} deviceId - 裝置 ID
 * @returns {Promise<object>} 操作結果
 */
export async function logoutDevice(userId, deviceId) {
  try {
    console.log(`[Device Management] Remote logout for user: ${userId}, device: ${deviceId}`);
    
    // 1. 撤銷用戶的所有 Refresh Tokens
    await admin.auth().revokeRefreshTokens(userId);
    
    console.log(`[Device Management] Revoked refresh tokens for user: ${userId}`);
    
    // 2. 記錄登出時間
    await recordDeviceLogout(userId, deviceId);
    
    return {
      success: true,
      message: 'Device logged out successfully. User will need to re-authenticate.'
    };
    
  } catch (error) {
    console.error('[Device Management] Error logging out device:', error);
    throw error;
  }
}

/**
 * 刪除裝置記錄
 * @param {string} userId - 用戶 ID
 * @param {string} deviceId - 裝置 ID
 * @returns {Promise<object>} 操作結果
 */
export async function deleteDevice(userId, deviceId) {
  try {
    console.log(`[Device Management] Deleting device for user: ${userId}, device: ${deviceId}`);
    
    const deviceRef = admin.firestore()
      .collection('users')
      .doc(userId)
      .collection('devices')
      .doc(deviceId);
    
    await deviceRef.delete();
    
    console.log(`[Device Management] Device deleted: ${deviceId}`);
    
    return { success: true };
    
  } catch (error) {
    console.error('[Device Management] Error deleting device:', error);
    throw error;
  }
}

/**
 * 清理過期的裝置記錄 (超過 90 天未活動)
 * @param {string} userId - 用戶 ID
 * @returns {Promise<number>} 刪除的裝置數量
 */
export async function cleanupInactiveDevices(userId) {
  try {
    console.log(`[Device Management] Cleaning up inactive devices for user: ${userId}`);
    
    // 計算 90 天前的時間戳
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    
    const devicesRef = admin.firestore()
      .collection('users')
      .doc(userId)
      .collection('devices')
      .where('lastActiveAt', '<', ninetyDaysAgo);
    
    const snapshot = await devicesRef.get();
    
    if (snapshot.empty) {
      console.log(`[Device Management] No inactive devices to clean up`);
      return 0;
    }
    
    // 批次刪除
    const batch = admin.firestore().batch();
    snapshot.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    
    console.log(`[Device Management] Cleaned up ${snapshot.size} inactive devices`);
    
    return snapshot.size;
    
  } catch (error) {
    console.error('[Device Management] Error cleaning up inactive devices:', error);
    throw error;
  }
}

