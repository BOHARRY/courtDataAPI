// services/conversationService.js (改進版本)

import admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';

const db = admin.firestore();
const sessionsCollection = db.collection('intake_sessions');

/**
 * 獲取現有的對話 Session（不自動創建新的）
 * @param {string|null} anonymousUserId - 從前端傳來的匿名用戶ID。
 * @param {string|null} sessionId - 從前端傳來的對話ID。
 * @returns {Promise<Object>}
 */
export async function getExistingSession(anonymousUserId, sessionId) {
    // 如果沒有提供 sessionId，返回空的臨時 session
    if (!sessionId) {
        const tempUserId = anonymousUserId || uuidv4();
        return {
            anonymousUserId: tempUserId,
            sessionId: null, // 明確表示這是臨時的
            sessionData: null,
            isTemporary: true
        };
    }

    try {
        const docRef = sessionsCollection.doc(sessionId);
        const docSnap = await docRef.get();
        
        if (docSnap.exists) {
            const data = docSnap.data();
            // 驗證 session 屬於該用戶
            if (data.anonymousUserId === anonymousUserId) {
                console.log(`Session found for user: ${sessionId}`);
                return {
                    anonymousUserId: anonymousUserId,
                    sessionId: sessionId,
                    sessionData: data,
                    isTemporary: false
                };
            }
        }
        
        // Session 不存在或不屬於該用戶，返回臨時 session
        console.log(`Session ${sessionId} not found or mismatched. Returning temporary session.`);
        return {
            anonymousUserId: anonymousUserId || uuidv4(),
            sessionId: null,
            sessionData: null,
            isTemporary: true
        };
        
    } catch (error) {
        console.error('Error getting session:', error);
        return {
            anonymousUserId: anonymousUserId || uuidv4(),
            sessionId: null,
            sessionData: null,
            isTemporary: true
        };
    }
}

/**
 * 只有在用戶真正發送訊息時才創建 Session
 * @param {string} anonymousUserId
 * @param {Object} firstMessage - 用戶的第一則訊息
 * @returns {Promise<Object>}
 */
export async function createSessionOnFirstMessage(anonymousUserId, firstMessage) {
    const newSessionId = uuidv4();
    console.log(`Creating new session on first message for user ${anonymousUserId}: ${newSessionId}`);
    
    const newSessionData = {
        sessionId: newSessionId,
        anonymousUserId: anonymousUserId,
        caseInfo: {},
        conversationHistory: [
            { role: 'user', content: firstMessage } // 只儲存用戶的訊息
        ],
        status: 'in_progress',
        createdAt: new Date(),
        updatedAt: new Date(),
    };
    
    await sessionsCollection.doc(newSessionId).set(newSessionData);
    
    return { 
        anonymousUserId, 
        sessionId: newSessionId, 
        sessionData: newSessionData,
        isTemporary: false 
    };
}

/**
 * 更新現有的對話 Session
 * @param {string} sessionId
 * @param {Object} updatedData
 */
export async function updateSession(sessionId, updatedData) {
    if (!sessionId) {
        console.error("updateSession called with no sessionId.");
        throw new Error("Session ID is required for update");
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

/**
 * 根據匿名使用者ID，列出其所有對話 Session。
 * 只返回有實際對話內容的 sessions
 * @param {string} anonymousUserId
 * @returns {Promise<Array<Object>>}
 */
export async function listSessionsByUser(anonymousUserId) {
    if (!anonymousUserId) return [];

    try {
        // 只查詢有實際對話的 sessions（conversationHistory 長度 > 0）
        const snapshot = await sessionsCollection
            .where('anonymousUserId', '==', anonymousUserId)
            .limit(50)
            .get();

        if (snapshot.empty) return [];
        
        // 過濾並排序 sessions
        const sessions = snapshot.docs
            .map(doc => {
                const data = doc.data();
                const history = data.conversationHistory || [];
                
                // 只返回有用戶訊息的 sessions
                const userMessages = history.filter(msg => msg.role === 'user');
                if (userMessages.length === 0) return null;
                
                const lastUserMessage = userMessages[userMessages.length - 1];

                return {
                    sessionId: data.sessionId,
                    caseType: data.caseInfo.caseType || '未分類案件',
                    lastMessage: lastUserMessage.content.substring(0, 30) + 
                                (lastUserMessage.content.length > 30 ? '...' : ''),
                    status: data.status,
                    updatedAt: data.updatedAt,
                    updatedAtString: data.updatedAt.toDate().toLocaleString('zh-TW'),
                };
            })
            .filter(session => session !== null); // 移除空的 sessions

        // 根據更新時間排序
        sessions.sort((a, b) => b.updatedAt.toMillis() - a.updatedAt.toMillis());

        // 返回前 20 筆
        return sessions.slice(0, 20).map(session => ({
            sessionId: session.sessionId,
            caseType: session.caseType,
            lastMessage: session.lastMessage,
            status: session.status,
            updatedAt: session.updatedAtString
        }));

    } catch (error) {
        console.error('Error in listSessionsByUser:', error);
        throw error;
    }
}

/**
 * 強制創建新的對話（用於「開啟新案件」按鈕）
 * 但不會立即儲存到資料庫
 * @param {string} anonymousUserId
 * @returns {Promise<Object>}
 */
export async function prepareNewSession(anonymousUserId) {
    const tempSessionId = uuidv4();
    console.log(`Preparing temporary session for user ${anonymousUserId}`);
    
    return {
        anonymousUserId: anonymousUserId,
        sessionId: tempSessionId,
        sessionData: null,
        isTemporary: true,
        isPrepared: true // 標記這是準備好的新 session
    };
}