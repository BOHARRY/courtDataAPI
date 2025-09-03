// services/pleading/task/taskManager.js

import admin from 'firebase-admin';
import { AIModelManager } from '../ai/aiModelManager.js';

/**
 * 🎯 任務管理器
 * 負責管理訴狀生成任務的生命週期
 */

export class TaskManager {
    constructor() {
        this.aiModelManager = new AIModelManager();
        this.stats = {
            totalTasks: 0,
            completedTasks: 0,
            failedTasks: 0,
            activeTasks: new Map()
        };
    }

    /**
     * 啟動訴狀生成任務
     */
    async startTask(pleadingData, userId) {
        const taskId = this.generateTaskId();
        
        try {
            this.stats.totalTasks++;
            this.stats.activeTasks.set(taskId, {
                startTime: Date.now(),
                userId,
                status: 'RUNNING'
            });

            console.log(`[TaskManager] 啟動訴狀生成任務: ${taskId}`);
            console.log(`[TaskManager] 用戶: ${userId}`);
            console.log(`[TaskManager] 訴訟階段: ${pleadingData.litigationStage}`);
            console.log(`[TaskManager] 當事人立場: ${pleadingData.caseInfo?.stance || '未指定'}`);

            // 更新任務狀態為進行中
            await this.updateTaskStatus(taskId, userId, 'processing', {
                message: '正在生成訴狀內容...',
                progress: 0
            });

            // 在背景執行生成任務
            this.executeTaskInBackground(taskId, pleadingData, userId);

            return {
                success: true,
                taskId: taskId,
                message: '訴狀生成任務已啟動',
                estimatedTime: '預計需要 30-60 秒'
            };

        } catch (error) {
            this.stats.failedTasks++;
            this.stats.activeTasks.delete(taskId);
            
            console.error(`[TaskManager] 任務啟動失敗: ${taskId}`, error);
            
            await this.updateTaskStatus(taskId, userId, 'failed', {
                error: error.message,
                timestamp: new Date().toISOString()
            });

            throw error;
        }
    }

    /**
     * 在背景執行訴狀生成任務
     */
    async executeTaskInBackground(taskId, pleadingData, userId) {
        try {
            console.log(`[TaskManager] 開始背景執行任務: ${taskId}`);

            // 更新進度：開始生成
            await this.updateTaskStatus(taskId, userId, 'processing', {
                message: '正在調用 AI 模型生成訴狀...',
                progress: 25
            });

            // 生成訴狀內容
            const result = await this.aiModelManager.generatePleadingContent(pleadingData);

            // 更新進度：生成完成
            await this.updateTaskStatus(taskId, userId, 'processing', {
                message: '訴狀生成完成，正在保存結果...',
                progress: 75
            });

            // 保存結果到 Firebase
            await this.saveTaskResult(taskId, userId, result);

            // 更新任務狀態為完成
            await this.updateTaskStatus(taskId, userId, 'completed', {
                message: '訴狀生成任務完成',
                progress: 100,
                completedAt: new Date().toISOString(),
                resultSummary: {
                    contentLength: result.pleadingContent.length,
                    model: result.metadata.model,
                    riskLevel: result.transparencyReport?.riskLevel || 'UNKNOWN',
                    hasAIAdditions: result.transparencyReport?.summary?.totalAdditions > 0
                }
            });

            // 更新統計
            this.stats.completedTasks++;
            this.stats.activeTasks.delete(taskId);

            console.log(`[TaskManager] 任務完成: ${taskId}`);

        } catch (error) {
            console.error(`[TaskManager] 背景任務執行失敗: ${taskId}`, error);

            // 更新任務狀態為失敗
            await this.updateTaskStatus(taskId, userId, 'failed', {
                error: error.message,
                failedAt: new Date().toISOString(),
                progress: 0
            });

            // 更新統計
            this.stats.failedTasks++;
            this.stats.activeTasks.delete(taskId);
        }
    }

    /**
     * 更新任務狀態
     */
    async updateTaskStatus(taskId, userId, status, data = {}) {
        try {
            const db = admin.firestore();
            const taskRef = db.collection('aiTasks').doc(taskId);

            const updateData = {
                status,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                ...data
            };

            // 如果是新任務，設置基本信息
            if (status === 'processing' && data.progress === 0) {
                updateData.userId = userId;
                updateData.taskType = 'pleading_generation';
                updateData.createdAt = admin.firestore.FieldValue.serverTimestamp();
            }

            await taskRef.set(updateData, { merge: true });

            console.log(`[TaskManager] 任務狀態更新: ${taskId} -> ${status}`);

        } catch (error) {
            console.error(`[TaskManager] 更新任務狀態失敗: ${taskId}`, error);
            throw error;
        }
    }

    /**
     * 保存任務結果
     */
    async saveTaskResult(taskId, userId, result) {
        try {
            const db = admin.firestore();
            const resultRef = db.collection('pleadingResults').doc(taskId);

            await resultRef.set({
                taskId,
                userId,
                result,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            console.log(`[TaskManager] 任務結果已保存: ${taskId}`);

        } catch (error) {
            console.error(`[TaskManager] 保存任務結果失敗: ${taskId}`, error);
            throw error;
        }
    }

    /**
     * 生成任務 ID
     */
    generateTaskId() {
        return `pleading_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 獲取任務狀態
     */
    getStatus() {
        return {
            totalTasks: this.stats.totalTasks,
            completedTasks: this.stats.completedTasks,
            failedTasks: this.stats.failedTasks,
            activeTasks: this.stats.activeTasks.size,
            successRate: this.stats.totalTasks > 0 ? 
                (this.stats.completedTasks / this.stats.totalTasks * 100).toFixed(2) + '%' : '0%'
        };
    }

    /**
     * 獲取統計信息
     */
    getStats() {
        return {
            ...this.stats,
            activeTasks: Array.from(this.stats.activeTasks.entries()).map(([taskId, info]) => ({
                taskId,
                ...info,
                duration: Date.now() - info.startTime
            }))
        };
    }

    /**
     * 清理過期的活躍任務
     */
    cleanupExpiredTasks() {
        const now = Date.now();
        const maxDuration = 5 * 60 * 1000; // 5 分鐘

        for (const [taskId, info] of this.stats.activeTasks.entries()) {
            if (now - info.startTime > maxDuration) {
                console.warn(`[TaskManager] 清理過期任務: ${taskId}`);
                this.stats.activeTasks.delete(taskId);
                this.stats.failedTasks++;
            }
        }
    }
}
