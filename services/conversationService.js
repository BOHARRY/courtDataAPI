// services/conversationService.js (正確的最終版)

import admin from 'firebase-admin'; // 直接從套件引入 admin
import { v4 as uuidv4 } from 'uuid'; // 用來生成新的 Session ID

// 因為我們在 index.js 中已經確保了 Firebase 被初始化，
// 所以在這裡，我們可以安全地、直接地呼叫 admin.firestore() 來獲取 db 實例。
const db = admin.firestore();
const sessionsCollection = db.collection('intake_sessions');

/**
 * 獲取或創建一個對話 Session，並確保匿名使用者ID存在。
 * @param {string|null} anonymousUserId - 從前端傳來的匿名用戶ID。
 * @param {string|null} sessionId - 從前端傳來的對話ID。
 * @returns {Promise<Object>}
 */
export async function getOrCreateSession(anonymousUserId, sessionId) {
    const finalUserId = anonymousUserId || uuidv4(); // 如果沒有匿名ID，就創建一個

    if (sessionId) {
        const docRef = sessionsCollection.doc(sessionId);
        const docSnap = await docRef.get();
        if (docSnap.exists() && docSnap.data().anonymousUserId === finalUserId) {
            console.log(`Session found for anonymous user: ${sessionId}`);
            return { anonymousUserId: finalUserId, sessionId, sessionData: docSnap.data() };
        }
    }

    // 如果 sessionId 不存在或不屬於該匿名用戶，則為他創建一個新的 Session
    return await forceCreateNewSession(finalUserId);
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
 * 根據匿名使用者ID，列出其所有對話 Session。
 * @param {string} anonymousUserId
 * @returns {Promise<Array<Object>>}
 */
export async function listSessionsByUser(anonymousUserId) {
    if (!anonymousUserId) return []; // 如果沒有ID，就返回空列表

    const snapshot = await sessionsCollection
        .where('anonymousUserId', '==', anonymousUserId)
        .orderBy('updatedAt', 'desc')
        .limit(20)
        .get();

    if (snapshot.empty) return [];

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
 * 強制創建一個新的對話 Session，並關聯到匿名使用者ID。
 * @param {string} anonymousUserId
 * @returns {Promise<Object>}
 */
export async function forceCreateNewSession(anonymousUserId) {
    const newSessionId = uuidv4();
    console.log(`Force creating new session for anonymous user ${anonymousUserId}: ${newSessionId}`);
    
    const newSessionData = {
        sessionId: newSessionId,
        anonymousUserId: anonymousUserId, // <--- 關鍵：關聯匿名ID
        caseInfo: {},
        conversationHistory: [
            { role: 'assistant', content: '您好！我是法握。這是一個全新的案件諮詢，請問這次您遇到了什麼問題呢？' }
        ],
        status: 'in_progress',
        createdAt: new Date(),
        updatedAt: new Date(),
    };
    
    await sessionsCollection.doc(newSessionId).set(newSessionData);
    
    return { anonymousUserId, sessionId: newSessionId, sessionData: newSessionData };
}