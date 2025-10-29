/**
 * IP 地理位置服務
 * 使用 ipapi.co API 獲取 IP 地址的地理位置資訊
 * 
 * 免費方案限制:
 * - 1000 次查詢/天
 * - 30,000 次查詢/月
 * - 無需註冊
 */

import fetch from 'node-fetch';

// IP 快取 (避免重複查詢同一 IP)
// 結構: { ip: { data: {...}, timestamp: number } }
const ipCache = new Map();

// 快取有效期: 24 小時
const CACHE_DURATION = 24 * 60 * 60 * 1000;

// API 端點
const IPAPI_ENDPOINT = 'https://ipapi.co';

/**
 * 從快取中獲取 IP 資訊
 * @param {string} ip - IP 地址
 * @returns {object|null} 快取的資料或 null
 */
function getFromCache(ip) {
  const cached = ipCache.get(ip);
  
  if (!cached) return null;
  
  // 檢查快取是否過期
  const now = Date.now();
  if (now - cached.timestamp > CACHE_DURATION) {
    ipCache.delete(ip);
    return null;
  }
  
  return cached.data;
}

/**
 * 將 IP 資訊存入快取
 * @param {string} ip - IP 地址
 * @param {object} data - 地理位置資料
 */
function saveToCache(ip, data) {
  ipCache.set(ip, {
    data,
    timestamp: Date.now()
  });
}

/**
 * 從 ipapi.co 獲取 IP 地理位置資訊
 * @param {string} ip - IP 地址 (可選,不提供則使用請求者的 IP)
 * @returns {Promise<object>} 地理位置資訊
 */
export async function getLocationFromIP(ip = null) {
  try {
    // 如果提供了 IP,先檢查快取
    if (ip) {
      const cached = getFromCache(ip);
      if (cached) {
        console.log(`[IP Geolocation] Cache hit for IP: ${ip}`);
        return cached;
      }
    }
    
    // 構建 API URL
    const url = ip 
      ? `${IPAPI_ENDPOINT}/${ip}/json/`
      : `${IPAPI_ENDPOINT}/json/`;
    
    console.log(`[IP Geolocation] Fetching location for IP: ${ip || 'auto-detect'}`);
    
    // 調用 API
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'LawsOwl-Backend/1.0'
      },
      timeout: 5000 // 5 秒超時
    });
    
    if (!response.ok) {
      // 處理 API 錯誤
      if (response.status === 429) {
        console.error('[IP Geolocation] Rate limit exceeded (429)');
        return getDefaultLocation(ip);
      }
      
      console.error(`[IP Geolocation] API error: ${response.status} ${response.statusText}`);
      return getDefaultLocation(ip);
    }
    
    const data = await response.json();
    
    // 檢查是否有錯誤訊息
    if (data.error) {
      console.error(`[IP Geolocation] API returned error: ${data.reason}`);
      return getDefaultLocation(ip);
    }
    
    // 提取需要的欄位
    const locationData = {
      ip: data.ip || ip || 'Unknown',
      city: data.city || 'Unknown',
      region: data.region || 'Unknown',
      regionCode: data.region_code || '',
      country: data.country_name || 'Unknown',
      countryCode: data.country_code || '',
      postal: data.postal || '',
      latitude: data.latitude || 0,
      longitude: data.longitude || 0,
      timezone: data.timezone || 'UTC',
      currency: data.currency || '',
      org: data.org || ''
    };
    
    // 存入快取
    if (ip) {
      saveToCache(ip, locationData);
    }
    
    console.log(`[IP Geolocation] Successfully fetched location for IP: ${locationData.ip}`);
    
    return locationData;
    
  } catch (error) {
    console.error('[IP Geolocation] Error fetching location:', error.message);
    return getDefaultLocation(ip);
  }
}

/**
 * 獲取預設位置資訊 (當 API 失敗時使用)
 * @param {string} ip - IP 地址
 * @returns {object} 預設位置資訊
 */
function getDefaultLocation(ip) {
  return {
    ip: ip || 'Unknown',
    city: 'Unknown',
    region: 'Unknown',
    regionCode: '',
    country: 'Unknown',
    countryCode: '',
    postal: '',
    latitude: 0,
    longitude: 0,
    timezone: 'UTC',
    currency: '',
    org: ''
  };
}

/**
 * 從請求中提取客戶端 IP 地址
 * @param {object} req - Express 請求對象
 * @returns {string} IP 地址
 */
export function getClientIP(req) {
  // 嘗試從各種標頭中獲取真實 IP
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // x-forwarded-for 可能包含多個 IP,取第一個
    return forwarded.split(',')[0].trim();
  }
  
  const realIP = req.headers['x-real-ip'];
  if (realIP) {
    return realIP;
  }
  
  // 使用連接的遠端地址
  return req.connection.remoteAddress || 
         req.socket.remoteAddress || 
         req.connection.socket?.remoteAddress ||
         'Unknown';
}

/**
 * 格式化位置字串 (用於顯示)
 * @param {object} locationData - 地理位置資料
 * @returns {string} 格式化的位置字串 (例如: "台北市, 台灣")
 */
export function formatLocation(locationData) {
  const { city, region, country } = locationData;
  
  if (city === 'Unknown' && country === 'Unknown') {
    return 'Unknown Location';
  }
  
  if (city === 'Unknown') {
    return country;
  }
  
  if (region && region !== city && region !== 'Unknown') {
    return `${city}, ${region}, ${country}`;
  }
  
  return `${city}, ${country}`;
}

/**
 * 清除過期的快取項目 (定期清理)
 */
export function cleanExpiredCache() {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [ip, cached] of ipCache.entries()) {
    if (now - cached.timestamp > CACHE_DURATION) {
      ipCache.delete(ip);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`[IP Geolocation] Cleaned ${cleanedCount} expired cache entries`);
  }
}

// 每小時清理一次過期快取
setInterval(cleanExpiredCache, 60 * 60 * 1000);

