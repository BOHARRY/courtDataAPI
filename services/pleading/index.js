// services/pleading/index.js

/**
 * 🎯 訴狀生成服務主入口
 * 重構後的模組化架構入口點
 */

import { TaskManager } from './task/taskManager.js';
import { AIModelManager } from './ai/aiModelManager.js';
import { ContentAuditor } from './audit/contentAuditor.js';
import { ContentCleaner } from './utils/contentCleaner.js';

/**
 * 重構後的訴狀生成服務
 * 保持向後兼容性
 */
class PleadingGenerationService {
    constructor() {
        this.taskManager = new TaskManager();
        this.aiModelManager = new AIModelManager();
        this.contentAuditor = new ContentAuditor();
        this.contentCleaner = new ContentCleaner();
    }

    /**
     * 啟動訴狀生成任務
     * 保持原有 API 接口
     */
    async startPleadingGenerationTask(pleadingData, userId) {
        return await this.taskManager.startTask(pleadingData, userId);
    }

    /**
     * 直接生成訴狀內容
     * 保持原有 API 接口
     */
    async generatePleadingContent(pleadingData) {
        return await this.aiModelManager.generatePleadingContent(pleadingData);
    }

    /**
     * 使用 Claude 生成訴狀內容
     */
    async generatePleadingContentWithClaude(pleadingData) {
        return await this.aiModelManager.claudeClient.generateContent(pleadingData);
    }

    /**
     * 使用 GPT 生成訴狀內容
     */
    async generatePleadingContentWithGPT(pleadingData) {
        return await this.aiModelManager.gptClient.generateContent(pleadingData);
    }

    /**
     * 獲取服務健康狀態
     */
    async getHealthStatus() {
        const modelStatus = await this.aiModelManager.checkModelAvailability();
        const taskStatus = this.taskManager.getStatus();
        
        return {
            models: modelStatus,
            tasks: taskStatus,
            overall: modelStatus.claude || modelStatus.gpt ? 'healthy' : 'degraded'
        };
    }

    /**
     * 獲取服務統計信息
     */
    getStats() {
        return {
            models: this.aiModelManager.getModelStats(),
            tasks: this.taskManager.getStats(),
            service: {
                version: '2.0.0',
                architecture: 'modular',
                modules: [
                    'TaskManager',
                    'AIModelManager',
                    'ContentAuditor',
                    'ContentCleaner',
                    'ClaudeClient',
                    'GPTClient'
                ]
            }
        };
    }

    /**
     * 審查內容（新增功能）
     */
    auditContent(pleadingContent) {
        return this.contentAuditor.auditContent(pleadingContent);
    }

    /**
     * 清理內容（新增功能）
     */
    cleanContent(pleadingContent) {
        return this.contentCleaner.fullClean(pleadingContent);
    }
}

// 創建單例實例
const pleadingService = new PleadingGenerationService();

// 導出向後兼容的函數
export async function startPleadingGenerationTask(pleadingData, userId) {
    return await pleadingService.startPleadingGenerationTask(pleadingData, userId);
}

export async function generatePleadingContent(pleadingData) {
    return await pleadingService.generatePleadingContent(pleadingData);
}

export async function generatePleadingContentWithClaude(pleadingData) {
    return await pleadingService.generatePleadingContentWithClaude(pleadingData);
}

export async function generatePleadingContentWithGPT(pleadingData) {
    return await pleadingService.generatePleadingContentWithGPT(pleadingData);
}

// 導出服務實例（用於高級用法）
export { pleadingService };

// 導出類型和常數（用於其他模組）
export { PLEADING_TEMPLATES } from './config/templates.js';
export { VALID_STANCE_COMBINATIONS } from './config/templates.js';
