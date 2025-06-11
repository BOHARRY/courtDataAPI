// services/conversationService.js (正確的最終版)

import admin from 'firebase-admin'; // 直接從套件引入 admin
import { v4 as uuidv4 } from 'uuid'; // 用來生成新的 Session ID

// 因為我們在 index.js 中已經確保了 Firebase 被初始化，
// 所以在這裡，我們可以安全地、直接地呼叫 admin.firestore() 來獲取 db 實例。
const db = admin.firestore();
const sessionsCollection = db.collection('intake_sessions');

/**
 * 獲取或創建一個對話 Session。
 * @param {string|null} sessionId - 從前端傳來的 Session ID。
 * @returns {Promise<Object>} - 包含 sessionId 和 sessionData 的物件。
 */
export async function getOrCreateSession(sessionId) {
    if (sessionId) {
        const docRef = sessionsCollection.doc(sessionId);
        const docSnap = await docRef.get();
        
        if (docSnap.exists) {
            console.log(`Session found: ${sessionId}`);
            return { sessionId, sessionData: docSnap.data() };
        }
    }
    
    // 如果 sessionId 不存在或在資料庫中找不到，則創建一個新的
    const newSessionId = uuidv4();
    console.log(`Creating new session: ${newSessionId}`);
    
    const newSessionData = {
        sessionId: newSessionId,
        caseInfo: {},
        conversationHistory: [
            { role: 'assistant', content: '您好！我是法握，您的AI法律諮詢助理。請問您遇到什麼法律問題呢？我會一步步協助您釐清狀況。' }
        ],
        status: 'in_progress',
        createdAt: new Date(),
        updatedAt: new Date(),
    };
    
    await sessionsCollection.doc(newSessionId).set(newSessionData);
    
    return { sessionId: newSessionId, sessionData: newSessionData };
}

/**
 * 更新一個對話 Session。
 * @param {string} sessionId - 要更新的 Session ID。
 * @param {Object} updatedData - 包含 updatedCaseInfo 和 conversationHistory 的物件。
 */
export async function updateSession(sessionId, updatedData) {
    if (!sessionId) return;
    
    const docRef = sessionsCollection.doc(sessionId);
    await docRef.update({
        caseInfo: updatedData.updatedCaseInfo,
        conversationHistory: updatedData.conversationHistory,
        status: updatedData.conversationState === 'completed' ? 'completed' : 'in_progress',
        updatedAt: new Date(),
    });
    console.log(`Session updated: ${sessionId}`);
}