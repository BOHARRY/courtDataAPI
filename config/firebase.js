// config/firebase.js (修正版)
import admin from 'firebase-admin';
import { FIREBASE_SERVICE_ACCOUNT_KEY_JSON } from './environment.js';

let initialized = false;

export const initializeFirebase = () => {
  if (initialized) {
    // console.warn("Firebase Admin SDK already initialized.");
    return;
  }
  try {
    if (!FIREBASE_SERVICE_ACCOUNT_KEY_JSON) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY_JSON environment variable is not set or is empty.');
    }
    const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT_KEY_JSON);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    initialized = true;
    console.log("Firebase Admin SDK initialized successfully.");
  } catch (error) {
    console.error("Error initializing Firebase Admin SDK:", error);
    // 根據您的錯誤處理策略，可能需要 process.exit(1)
    throw error;
  }
};

// 其他模組將直接 import admin from 'firebase-admin'
// 我們只需要確保 initializeFirebase() 在任何 admin.auth() 或 admin.firestore() 調用前被執行。
// 所以這個檔案主要導出初始化函數。