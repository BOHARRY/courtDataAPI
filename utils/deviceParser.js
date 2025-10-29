/**
 * 裝置資訊解析工具
 * 用於解析 User Agent 字串,識別作業系統、瀏覽器和裝置類型
 */

/**
 * 檢測作業系統
 * @param {string} userAgent - User Agent 字串
 * @returns {string} 作業系統名稱
 */
export function detectOS(userAgent) {
  const ua = userAgent.toLowerCase();
  
  // iOS 檢測 (必須在 macOS 之前,因為 iPad 可能包含 Mac 字樣)
  if (/iphone/.test(ua)) return 'iOS';
  if (/ipad/.test(ua)) return 'iPadOS';
  
  // Android 檢測
  if (/android/.test(ua)) return 'Android';
  
  // Windows 檢測
  if (/windows nt 10/.test(ua)) return 'Windows 10/11';
  if (/windows nt 6.3/.test(ua)) return 'Windows 8.1';
  if (/windows nt 6.2/.test(ua)) return 'Windows 8';
  if (/windows nt 6.1/.test(ua)) return 'Windows 7';
  if (/windows/.test(ua)) return 'Windows';
  
  // macOS 檢測
  if (/mac os x/.test(ua)) {
    const match = ua.match(/mac os x (\d+)[._](\d+)/);
    if (match) {
      const major = parseInt(match[1]);
      const minor = parseInt(match[2]);
      return `macOS ${major}.${minor}`;
    }
    return 'macOS';
  }
  
  // Linux 檢測
  if (/linux/.test(ua)) return 'Linux';
  
  // Chrome OS
  if (/cros/.test(ua)) return 'Chrome OS';
  
  return 'Unknown OS';
}

/**
 * 檢測瀏覽器
 * @param {string} userAgent - User Agent 字串
 * @returns {object} { browser: string, version: string }
 */
export function detectBrowser(userAgent) {
  const ua = userAgent.toLowerCase();
  
  // Edge (Chromium-based) - 必須在 Chrome 之前檢測
  if (/edg\//.test(ua)) {
    const match = ua.match(/edg\/(\d+\.\d+)/);
    return {
      browser: 'Edge',
      version: match ? match[1] : 'Unknown'
    };
  }
  
  // Opera - 必須在 Chrome 之前檢測
  if (/opr\//.test(ua) || /opera/.test(ua)) {
    const match = ua.match(/(?:opr|opera)\/(\d+\.\d+)/);
    return {
      browser: 'Opera',
      version: match ? match[1] : 'Unknown'
    };
  }
  
  // Chrome - 必須在 Safari 之前檢測
  if (/chrome\//.test(ua) && !/edg\//.test(ua)) {
    const match = ua.match(/chrome\/(\d+\.\d+)/);
    return {
      browser: 'Chrome',
      version: match ? match[1] : 'Unknown'
    };
  }
  
  // Safari - 必須在最後檢測 (因為很多瀏覽器都包含 Safari 字樣)
  if (/safari\//.test(ua) && !/chrome/.test(ua)) {
    const match = ua.match(/version\/(\d+\.\d+)/);
    return {
      browser: 'Safari',
      version: match ? match[1] : 'Unknown'
    };
  }
  
  // Firefox
  if (/firefox\//.test(ua)) {
    const match = ua.match(/firefox\/(\d+\.\d+)/);
    return {
      browser: 'Firefox',
      version: match ? match[1] : 'Unknown'
    };
  }
  
  // Internet Explorer
  if (/msie|trident/.test(ua)) {
    const match = ua.match(/(?:msie |rv:)(\d+\.\d+)/);
    return {
      browser: 'Internet Explorer',
      version: match ? match[1] : 'Unknown'
    };
  }
  
  return {
    browser: 'Unknown Browser',
    version: 'Unknown'
  };
}

/**
 * 檢測裝置類型
 * @param {string} userAgent - User Agent 字串
 * @returns {string} 裝置類型: 'Mobile', 'Tablet', 'Desktop'
 */
export function detectDeviceType(userAgent) {
  const ua = userAgent.toLowerCase();
  
  // 平板檢測
  if (/ipad/.test(ua)) return 'Tablet';
  if (/android/.test(ua) && !/mobile/.test(ua)) return 'Tablet';
  if (/tablet/.test(ua)) return 'Tablet';
  
  // 手機檢測
  if (/mobile|iphone|ipod|android.*mobile|blackberry|opera mini|windows phone/.test(ua)) {
    return 'Mobile';
  }
  
  // 預設為桌面
  return 'Desktop';
}

/**
 * 解析完整的 User Agent 資訊
 * @param {string} userAgent - User Agent 字串
 * @returns {object} 完整的裝置資訊
 */
export function parseUserAgent(userAgent) {
  if (!userAgent || typeof userAgent !== 'string') {
    return {
      os: 'Unknown OS',
      browser: 'Unknown Browser',
      browserVersion: 'Unknown',
      deviceType: 'Desktop',
      userAgent: ''
    };
  }
  
  const browserInfo = detectBrowser(userAgent);
  
  return {
    os: detectOS(userAgent),
    browser: browserInfo.browser,
    browserVersion: browserInfo.version,
    deviceType: detectDeviceType(userAgent),
    userAgent: userAgent
  };
}

/**
 * 生成裝置顯示名稱
 * @param {object} deviceInfo - 裝置資訊
 * @returns {string} 裝置顯示名稱 (例如: "Chrome on Windows 10")
 */
export function generateDeviceName(deviceInfo) {
  const { browser, os, deviceType } = deviceInfo;
  
  if (deviceType === 'Mobile' || deviceType === 'Tablet') {
    return `${browser} on ${os} (${deviceType})`;
  }
  
  return `${browser} on ${os}`;
}

/**
 * 生成裝置圖示名稱 (用於前端顯示)
 * @param {object} deviceInfo - 裝置資訊
 * @returns {string} Iconify 圖示名稱
 */
export function getDeviceIcon(deviceInfo) {
  const { os, deviceType } = deviceInfo;
  
  // 根據作業系統返回圖示
  if (os.includes('Windows')) return 'streamline:desktop-monitor-smiley';
  if (os.includes('macOS')) return 'streamline:desktop-monitor-smiley';
  if (os.includes('Linux')) return 'streamline:desktop-monitor-smiley';
  if (os.includes('iOS') || os.includes('iPadOS')) {
    return deviceType === 'Tablet' ? 'streamline:ipad' : 'streamline:iphone';
  }
  if (os.includes('Android')) {
    return deviceType === 'Tablet' ? 'streamline:tablet-android' : 'streamline:phone-android';
  }
  
  // 預設圖示
  return deviceType === 'Mobile' ? 'streamline:phone-android' : 'streamline:desktop-monitor-smiley';
}

