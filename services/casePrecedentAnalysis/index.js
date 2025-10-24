// services/casePrecedentAnalysis/index.js

/**
 * 案件判決分析服務 - 主入口
 * 
 * 這個文件作為模組化重構的入口點
 * 目前保持向後兼容，從原始服務導出主要函數
 * 
 * Phase 2 完成後，將逐步遷移功能到新模組
 */

// 暫時從原始服務導出（保持向後兼容）
export {
    startCasePrecedentAnalysis,
    startMainstreamAnalysis
} from '../casePrecedentAnalysisService.js';

// 導出新的模組化組件（供內部使用）
export * from './core/embeddingService.js';
export * from './core/searchStrategy.js';
export * from './core/multiAngleSearch.js';
export * from './core/resultMerger.js';
export * from './utils/constants.js';
export * from './utils/memoryMonitor.js';

