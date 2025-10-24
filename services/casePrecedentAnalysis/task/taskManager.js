// services/casePrecedentAnalysis/task/taskManager.js

import admin from 'firebase-admin';

/**
 * 創建案件有利判決分析任務
 * @param {Object} analysisData - 分析數據
 * @param {string} userId - 用戶ID
 * @returns {Promise<{taskId: string, taskRef: Object}>} 任務ID和任務引用
 */
export async function createAnalysisTask(analysisData, userId) {
    const db = admin.firestore();
    const taskRef = db.collection('aiAnalysisTasks').doc();
    const taskId = taskRef.id;

    const taskData = {
        userId,
        taskId,
        analysisType: 'favorable_judgment_analysis',
        analysisData,
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await taskRef.set(taskData);
    console.log(`[TaskManager] 任務 ${taskId} 已為用戶 ${userId} 創建`);

    return { taskId, taskRef };
}

/**
 * 創建主流判決分析任務
 * @param {string} originalTaskId - 原始任務ID
 * @param {string} userId - 用戶ID
 * @returns {Promise<{taskId: string, taskRef: Object}>} 任務ID和任務引用
 */
export async function createMainstreamAnalysisTask(originalTaskId, userId) {
    const db = admin.firestore();
    const taskRef = db.collection('aiAnalysisTasks').doc();
    const taskId = taskRef.id;

    const taskData = {
        userId,
        taskId,
        originalTaskId,
        type: 'mainstream_analysis',
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await taskRef.set(taskData);
    console.log(`[TaskManager] 主流判決分析任務 ${taskId} 已創建`);

    return { taskId, taskRef };
}

/**
 * 更新任務狀態為完成
 * @param {Object} taskRef - 任務引用
 * @param {Object} result - 分析結果
 * @returns {Promise<void>}
 */
export async function updateTaskComplete(taskRef, result) {
    const taskId = taskRef.id;
    
    console.log(`🔵 [FIRESTORE-UPDATE-START] 開始更新 Firestore，任務ID: ${taskId}`);
    console.log(`🔵 [FIRESTORE-UPDATE-SIZE] 結果大小: ${JSON.stringify(result).length} 字元`);

    try {
        await taskRef.update({
            status: 'complete',
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            result
        });
        console.log(`🟢 [FIRESTORE-UPDATE-SUCCESS] ✅ Firestore 更新成功，任務ID: ${taskId}`);
    } catch (firestoreError) {
        console.error(`🔴 [FIRESTORE-UPDATE-ERROR] ❌ Firestore 更新失敗:`, firestoreError);
        throw firestoreError;
    }
}

/**
 * 更新任務狀態為失敗
 * @param {Object} taskRef - 任務引用
 * @param {Error} error - 錯誤對象
 * @returns {Promise<void>}
 */
export async function updateTaskFailed(taskRef, error) {
    const taskId = taskRef.id;
    
    console.error(`[TaskManager] 任務失敗，任務ID: ${taskId}`, error);

    await taskRef.update({
        status: 'failed',
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        error: error.message || '案件有利判決分析時發生未知錯誤'
    });
}

/**
 * 更新任務狀態為錯誤
 * @param {Object} taskRef - 任務引用
 * @param {Error} error - 錯誤對象
 * @returns {Promise<void>}
 */
export async function updateTaskError(taskRef, error) {
    const taskId = taskRef.id;
    
    console.error(`[TaskManager] 任務錯誤，任務ID: ${taskId}`, error);

    await taskRef.update({
        status: 'error',
        error: error.message,
        completedAt: admin.firestore.FieldValue.serverTimestamp()
    });
}

/**
 * 獲取原始分析任務數據
 * @param {string} originalTaskId - 原始任務ID
 * @returns {Promise<Object>} 原始任務數據
 */
export async function getOriginalTaskData(originalTaskId) {
    const db = admin.firestore();
    const originalTaskRef = db.collection('aiAnalysisTasks').doc(originalTaskId);
    const originalTaskDoc = await originalTaskRef.get();

    if (!originalTaskDoc.exists) {
        throw new Error('找不到原始分析任務');
    }

    const originalResult = originalTaskDoc.data().result;
    if (!originalResult?.casePrecedentData) {
        throw new Error('原始分析結果格式不正確');
    }

    return originalResult;
}

/**
 * 獲取任務引用
 * @param {string} taskId - 任務ID
 * @returns {Object} 任務引用
 */
export function getTaskRef(taskId) {
    const db = admin.firestore();
    return db.collection('aiAnalysisTasks').doc(taskId);
}

/**
 * 驗證分析數據
 * @param {Object} analysisData - 分析數據
 * @throws {Error} 如果數據無效
 */
export function validateAnalysisData(analysisData) {
    if (!analysisData.caseDescription || !analysisData.caseDescription.trim()) {
        const error = new Error('案件描述為必填欄位');
        error.statusCode = 400;
        throw error;
    }
}

