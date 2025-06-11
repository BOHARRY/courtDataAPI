// services/conversationService.js (真正最終、最穩健的版本)

import admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';

const db = admin.firestore();
const sessionsCollection = db.collection('intake_sessions');

/**
 * 獲取或創建一個對話 Session，並確保匿名使用者ID存在。
 * @param {string|null} anonymousUserId - 從前端傳來的匿名用戶ID。
 * @param {string|null} sessionId - 從前端傳來的對話ID。
 * @returns {Promise<Object>}
 */
export async function getOrCreateSession(anonymousUserId, sessionId) {
    const finalUserId = anonymousUserId || uuidv4();

    if (sessionId) {
        const docRef = sessionsCollection.doc(sessionId);
        const docSnap = await docRef.get();
        
        // 關鍵修正點：使用屬性 .exists，而不是函式 .exists()
        // 並且先判斷 exists，再安全地訪問 .data()
        if (docSnap.exists && docSnap.data().anonymousUserId === finalUserId) {
            console.log(`Session found and validated for anonymous user: ${sessionId}`);
            return { anonymousUserId: finalUserId, sessionId, sessionData: docSnap.data() };
        } else {
            // sessionId 存在，但文件不存在或不屬於該用戶，視為無效
            console.log(`Invalid or mismatched sessionId: ${sessionId}. A new session will be created.`);
        }
    }
    
    // 如果 sessionId 無效或從未提供，則創建一個新的 Session
    return await forceCreateNewSession(finalUserId);
}

/**
 * 根據匿名使用者ID，列出其所有對話 Session。
 * @param {string} anonymousUserId
 * @returns {Promise<Array<Object>>}
 */
export async function listSessionsByUser(anonymousUserId) {
    if (!anonymousUserId) return [];

    const snapshot = await sessionsCollection
        .where('anonymousUserId', '==', anonymousUserId)
        .orderBy('updatedAt', 'desc')
        .limit(20)
        .get();

    if (snapshot.empty) return [];
    
    return snapshot.docs.map(doc => {
        const data = doc.data();
        const lastUserMessage = (data.conversationHistory || [])
            .filter(msg => msg.role === 'user')
            .pop();

        return {
            sessionId: data.sessionId,
            caseType: data.caseInfo.caseType || '未分類案件',
            lastMessage: lastUserMessage ? (lastUserMessage.content.substring(0, 30) + (lastUserMessage.content.length > 30 ? '...' : '')) : '尚未開始對話',
            status: data.status,
            updatedAt: data.updatedAt.toDate().toLocaleString('zh-TW'),
        };
    });
}

/**
 * 強制創建一個新的對話 Session。
 * @param {string} anonymousUserId
 * @returns {Promise<Object>}
 */
export async function forceCreateNewSession(anonymousUserId) {
    const newSessionId = uuidv4();
    console.log(`Force creating new session for anonymous user ${anonymousUserId}: ${newSessionId}`);
    
    const newSessionData = {
        sessionId: newSessionId,
        anonymousUserId: anonymousUserId,
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

/**
 * 更新一個對話 Session。
 * @param {string} sessionId
 * @param {Object} updatedData
 */
export async function updateSession(sessionId, updatedData) {
    if (!sessionId) {
        console.error("updateSession called with no sessionId.");
        return;
    }
    
    const docRef = sessionsCollection.doc(sessionId);
    await docRef.update({
        caseInfo: updatedData.updatedCaseInfo,
        conversationHistory: updatedData.conversationHistory,
        status: updatedData.conversationState === 'completed' ? 'completed' : 'in_progress',
        updatedAt: new Date(),
    });
    console.log(`Session updated: ${sessionId}`);
}