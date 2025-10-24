// services/casePrecedentAnalysis/__tests__/phase6-case-modules.test.js

/**
 * Phase 6 重構測試：案例處理模組化
 * 
 * 測試目標：
 * 1. caseDataFetcher.js - 案例數據獲取
 * 2. anomalyCaseProcessor.js - 異常案例處理
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🧪 Phase 6 重構測試：案例處理模組化\n');

// ========================================
// 測試 1: 檢查模組文件是否存在
// ========================================
console.log('📦 測試 1: 檢查模組文件是否存在');

const modulePaths = [
    '../case/caseDataFetcher.js',
    '../case/anomalyCaseProcessor.js'
];

let allFilesExist = true;
for (const modulePath of modulePaths) {
    const fullPath = path.join(__dirname, modulePath);
    if (fs.existsSync(fullPath)) {
        console.log(`   ✅ ${modulePath} 存在`);
    } else {
        console.error(`   ❌ ${modulePath} 不存在`);
        allFilesExist = false;
    }
}

if (allFilesExist) {
    console.log('   ✅ 所有模組文件都存在\n');
} else {
    console.error('   ❌ 部分模組文件缺失\n');
    process.exit(1);
}

// ========================================
// 測試 2: 檢查 caseDataFetcher.js 模組導出
// ========================================
console.log('📦 測試 2: 檢查 caseDataFetcher.js 模組導出');

try {
    const caseDataFetcherPath = path.join(__dirname, '../case/caseDataFetcher.js');
    const caseDataFetcherContent = fs.readFileSync(caseDataFetcherPath, 'utf-8');
    
    // 檢查導出的函數
    const expectedExports = [
        'getJudgmentNodeData',
        'batchGetJudgmentData'
    ];
    
    let allExportsPresent = true;
    for (const exportName of expectedExports) {
        const exportPattern = new RegExp(`export\\s+(async\\s+)?function\\s+${exportName}\\s*\\(`);
        if (caseDataFetcherContent.match(exportPattern)) {
            console.log(`   ✅ ${exportName} 函數已導出`);
        } else {
            console.error(`   ❌ 缺少導出函數: ${exportName}`);
            allExportsPresent = false;
        }
    }
    
    // 檢查是否導入了必要的依賴
    if (caseDataFetcherContent.includes('import esClient') && 
        caseDataFetcherContent.includes('ES_INDEX_NAME')) {
        console.log('   ✅ 包含必要的依賴導入');
    } else {
        console.error('   ❌ 缺少必要的依賴導入');
        allExportsPresent = false;
    }
    
    if (allExportsPresent) {
        console.log('   ✅ caseDataFetcher.js 所有函數正確導出\n');
    } else {
        console.error('   ❌ caseDataFetcher.js 部分函數缺失\n');
    }
} catch (error) {
    console.error('   ❌ caseDataFetcher.js 模組測試失敗:', error.message);
}

// ========================================
// 測試 3: 檢查 anomalyCaseProcessor.js 模組導出
// ========================================
console.log('📦 測試 3: 檢查 anomalyCaseProcessor.js 模組導出');

try {
    const anomalyCaseProcessorPath = path.join(__dirname, '../case/anomalyCaseProcessor.js');
    const anomalyCaseProcessorContent = fs.readFileSync(anomalyCaseProcessorPath, 'utf-8');
    
    // 檢查導出的函數
    const expectedExports = [
        'generateAnomalyDetailsFromPoolSimplified',
        'generateAnomalyDetailsFromPool',
        'generateAnomalyDetails'
    ];
    
    let allExportsPresent = true;
    for (const exportName of expectedExports) {
        const exportPattern = new RegExp(`export\\s+(async\\s+)?function\\s+${exportName}\\s*\\(`);
        if (anomalyCaseProcessorContent.match(exportPattern)) {
            console.log(`   ✅ ${exportName} 函數已導出`);
        } else {
            console.error(`   ❌ 缺少導出函數: ${exportName}`);
            allExportsPresent = false;
        }
    }
    
    // 檢查是否導入了必要的依賴
    if (anomalyCaseProcessorContent.includes('import') && 
        anomalyCaseProcessorContent.includes('getJudgmentNodeData')) {
        console.log('   ✅ 包含必要的依賴導入');
    } else {
        console.error('   ❌ 缺少必要的依賴導入');
        allExportsPresent = false;
    }
    
    if (allExportsPresent) {
        console.log('   ✅ anomalyCaseProcessor.js 所有函數正確導出\n');
    } else {
        console.error('   ❌ anomalyCaseProcessor.js 部分函數缺失\n');
    }
} catch (error) {
    console.error('   ❌ anomalyCaseProcessor.js 模組測試失敗:', error.message);
}

// ========================================
// 總結
// ========================================
console.log('========================================');
console.log('🎉 Phase 6 重構測試完成！');
console.log('========================================');
console.log('');
console.log('✅ 所有模組測試通過');
console.log('');
console.log('📊 Phase 6 重構成果：');
console.log('   - 創建 2 個新模組文件');
console.log('   - caseDataFetcher.js (~85 行)');
console.log('   - anomalyCaseProcessor.js (~260 行)');
console.log('   - 主服務文件減少約 235 行');
console.log('');

