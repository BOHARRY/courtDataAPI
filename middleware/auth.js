// middleware/auth.js
import admin from 'firebase-admin'; // Firebase Admin SDK 已經在 config/firebase.js 中初始化
import logger from '../utils/logger.js';

export async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  // console.log("Raw Authorization header (first 20 chars):", authHeader.substring(0, 20)); // 開發時調試用

  const idToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (!idToken) {
    logger.security('Authentication failed: No token provided', {
      ip: req.ip,
      url: req.originalUrl,
      method: req.method
    });
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

    logger.debug('Token verified successfully', {
      userId: req.user.uid,
      email: req.user.email
    });

    next(); // Token 驗證通過，繼續處理請求
  } catch (error) {
    logger.security('Token verification failed', {
      errorCode: error.code,
      errorMessage: error.message,
      ip: req.ip,
      url: req.originalUrl
    });

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

/**
 * 驗證管理員權限中間件
 * 必須在 verifyToken 之後使用
 */
export async function verifyAdmin(req, res, next) {
  const db = admin.firestore();

  try {
    // 從 Firestore 獲取用戶資料以檢查 isAdmin 欄位
    const userDoc = await db.collection('users').doc(req.user.uid).get();

    if (!userDoc.exists) {
      return res.status(403).json({
        error: 'Forbidden',
        message: '用戶資料不存在'
      });
    }

    const userData = userDoc.data();

    if (!userData.isAdmin) {
      logger.security('Non-admin access attempt', {
        userId: req.user.uid,
        email: req.user.email,
        url: req.originalUrl,
        method: req.method
      });
      return res.status(403).json({
        error: 'Forbidden',
        message: '需要管理員權限'
      });
    }

    // 將完整用戶資料附加到 req.user
    req.user.isAdmin = true;
    req.user.userData = userData;

    next();
  } catch (error) {
    logger.error('Admin verification failed', {
      userId: req.user?.uid,
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: '驗證權限時發生錯誤'
    });
  }
}