// Boooook/middleware/adminAuth.js
import admin from 'firebase-admin';

export async function verifyAdmin(req, res, next) {
  if (!req.user || !req.user.uid) {
    // 這個檢查理論上 verifyToken 已經做過，但多一層保護
    return res.status(401).json({ error: 'Unauthorized', message: '需要身份驗證才能執行此操作。' });
  }

  const adminUid = req.user.uid;
  try {
    const userDocRef = admin.firestore().collection('users').doc(adminUid);
    const userDoc = await userDocRef.get();

    if (userDoc.exists && userDoc.data().isAdmin === true) {
      // console.log(`[AdminAuth] Access granted for admin UID: ${adminUid}`);
      next(); // 是管理員，繼續
    } else {
      console.warn(`[AdminAuth] Access denied for UID: ${adminUid}. isAdmin: ${userDoc.exists ? userDoc.data().isAdmin : 'N/A'}`);
      return res.status(403).json({ error: 'Forbidden', message: '您沒有足夠的權限執行此操作。需要管理員身份。' });
    }
  } catch (error) {
    console.error(`[AdminAuth] Error verifying admin status for UID ${adminUid}:`, error);
    return res.status(500).json({ error: 'Internal Server Error', message: '驗證管理員身份時發生錯誤。' });
  }
}