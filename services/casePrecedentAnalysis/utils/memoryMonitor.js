// services/casePrecedentAnalysis/utils/memoryMonitor.js

import { MEMORY_WARNING_THRESHOLD } from './constants.js';

/**
 * 記憶體監控工具
 * 用於追蹤和記錄記憶體使用情況
 * 
 * @param {string} step - 當前步驟名稱
 */
export function logMemoryUsage(step) {
    const used = process.memoryUsage();
    const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
    const rssMB = Math.round(used.rss / 1024 / 1024);
    const externalMB = Math.round(used.external / 1024 / 1024);
    
    console.log(`[Memory-${step}] Heap: ${heapUsedMB}MB, RSS: ${rssMB}MB, External: ${externalMB}MB`);

    // 警告記憶體使用過高
    if (heapUsedMB > MEMORY_WARNING_THRESHOLD) {
        console.warn(`⚠️ [Memory Warning] Heap usage high: ${heapUsedMB}MB`);
    }
}

/**
 * 獲取當前記憶體使用情況
 * 
 * @returns {Object} 記憶體使用數據
 */
export function getMemoryUsage() {
    const used = process.memoryUsage();
    return {
        heapUsedMB: Math.round(used.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(used.heapTotal / 1024 / 1024),
        rssMB: Math.round(used.rss / 1024 / 1024),
        externalMB: Math.round(used.external / 1024 / 1024),
        arrayBuffersMB: Math.round(used.arrayBuffers / 1024 / 1024)
    };
}

/**
 * 檢查記憶體是否超過警告閾值
 * 
 * @returns {boolean} 是否超過閾值
 */
export function isMemoryHigh() {
    const used = process.memoryUsage();
    const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
    return heapUsedMB > MEMORY_WARNING_THRESHOLD;
}

