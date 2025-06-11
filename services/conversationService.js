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

/**
 * 新增：根據使用者ID，列出其所有對話 Session。
 * @param {string} userId - 使用者的唯一ID (來自 Firebase Auth)。
 * @returns {Promise<Array<Object>>} - Session 列表，包含關鍵摘要資訊。
 */
export async function listSessionsByUser(userId) {
    if (!userId) {
        throw new Error("User ID is required to list sessions.");
    }
    
    // 根據 lawyerId 或 userId 進行查詢
    // 假設我們在 Session 中儲存了 userId
    const snapshot = await sessionsCollection
        .where('userId', '==', userId)
        .orderBy('updatedAt', 'desc') // 按最近更新時間排序
        .limit(20) // 最多取最近 20 筆
        .get();

    if (snapshot.empty) {
        return [];
    }
    
    // 只返回前端列表需要的摘要資訊，避免傳輸過多數據
    const sessions = snapshot.docs.map(doc => {
        const data = doc.data();
        const lastUserMessage = data.conversationHistory
            .filter(msg => msg.role === 'user')
            .pop();

        return {
            sessionId: data.sessionId,
            caseType: data.caseInfo.caseType || '未分類案件',
            lastMessage: lastUserMessage ? lastUserMessage.content.substring(0, 30) + '...' : '尚未開始對話',
            status: data.status,
            updatedAt: data.updatedAt.toDate().toLocaleString('zh-TW'),
        };
    });
    
    return sessions;
}

/**
 * 新增：強制創建一個新的對話 Session。
 * @param {string} userId - 使用者的唯一ID。
 * @returns {Promise<Object>} - 新創建的 Session 的完整資料。
 */
export async function forceCreateNewSession(userId) {
    const newSessionId = uuidv4();
    console.log(`Force creating new session for user ${userId}: ${newSessionId}`);
    
    const newSessionData = {
        sessionId: newSessionId,
        userId: userId, // 關聯使用者
        caseInfo: {},
        conversationHistory: [
            { role: 'assistant', content: '您好！我是法握，您的AI法律諮詢助理。這是一個全新的案件諮詢，請問這次您遇到了什麼問題呢？' }
        ],
        status: 'in_progress',
        createdAt: new Date(),
        updatedAt: new Date(),
    };
    
    await sessionsCollection.doc(newSessionId).set(newSessionData);
    
    return { sessionId: newSessionId, sessionData: newSessionData };
}