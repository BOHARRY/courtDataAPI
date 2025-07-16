// middleware/auth.js
import admin from 'firebase-admin'; // Firebase Admin SDK 已經在 config/firebase.js 中初始化

export async function verifyToken(req, res, next) {
  // 🚨 緊急診斷：verifyToken 中間件被調用
  console.log('🚨🚨🚨 [AUTH-EMERGENCY] verifyToken 中間件被調用！！！');
  console.log('🚨🚨🚨 [AUTH-EMERGENCY] 請求路徑:', req.originalUrl);
  console.log('🚨🚨🚨 [AUTH-EMERGENCY] 請求方法:', req.method);

  const authHeader = req.headers.authorization || '';
  // console.log("Raw Authorization header (first 20 chars):", authHeader.substring(0, 20)); // 開發時調試用

  const idToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (!idToken) {
    // console.warn("verifyToken: No token provided or invalid format. Header format incorrect.");
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'No token provided or invalid format. Please include a Bearer token in the Authorization header.'
    });
  }

  // console.log("Extracted token length:", idToken.length); // 開發時調試用
  // console.log("Token starts with:", idToken.substring(0, 10)); // 開發時調試用

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken; // 將解碼後的 token (包含 uid 等信息) 附加到 req.user

    // 🚨 緊急診斷：token 驗證成功
    console.log('🚨🚨🚨 [AUTH-EMERGENCY] Token 驗證成功！！！');
    console.log('🚨🚨🚨 [AUTH-EMERGENCY] 用戶 UID:', req.user.uid);
    console.log('🚨🚨🚨 [AUTH-EMERGENCY] 即將調用 next() 繼續處理');

    // console.log("verifyToken: Token verified for UID:", req.user.uid); // 開發時調試用
    next(); // Token 驗證通過，繼續處理請求

    // 🚨 緊急診斷：檢查 next() 是否被調用
    console.log('🚨🚨🚨 [AUTH-EMERGENCY] next() 已被調用，控制權已轉移');
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error.code, error.message);

    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Token expired. Please re-authenticate.'
      });
    } else if (error.code === 'auth/argument-error') {
      // 這通常表示 token 格式本身有問題，例如不是一個有效的 JWT 字串
      return res.status(403).json({ // 使用 403 Forbidden 更合適
        error: 'Forbidden',
        message: 'Token format error. The provided token is malformed.'
      });
    }
    // 其他 Firebase auth 錯誤
    return res.status(403).json({ // 使用 403 Forbidden
      error: 'Forbidden',
      message: `Token validation failed. ${error.message || error.code || 'Unknown authentication error'}`
    });
  }
}