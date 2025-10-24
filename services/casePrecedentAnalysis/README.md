# 案件判決分析服務 - 模組化重構

## 📋 重構概述

這是 `casePrecedentAnalysisService.js` 的模組化重構項目，目標是將原本 3,510 行的超大文件拆分為多個職責清晰的小模組。

## 🎯 重構目標

1. **提高可維護性**：將大文件拆分為小模組，每個模組不超過 500 行
2. **提高可測試性**：每個模組可以獨立測試
3. **提高可擴展性**：新功能易於添加
4. **保持向後兼容**：不影響現有 API

## 📦 模組結構

```
casePrecedentAnalysis/
├── core/                          # Phase 2: 核心搜索邏輯
│   ├── embeddingService.js        # 向量生成服務 (~120 行)
│   ├── searchStrategy.js          # 搜索策略 (~200 行)
│   ├── multiAngleSearch.js        # 多角度搜索 (~250 行)
│   └── resultMerger.js            # 結果合併 (~250 行)
├── ai/                            # Phase 3 & 5: AI 分析邏輯
│   ├── promptBuilder.js           # 提示詞構建 (~280 行)
│   ├── insightSummarizer.js       # 洞察摘要生成 (~280 行)
│   └── criticalAnalysisPrompts.js # 重大判決分析提示詞 (~170 行)
├── analysis/                      # Phase 3 & 5: 分析邏輯
│   ├── strategicInsights.js       # 策略洞察分析 (~380 行)
│   ├── criticalCaseAnalyzer.js    # 重大案例分析器 (~260 行)
│   └── criticalPatternAnalyzer.js # 重大判決模式分析 (~60 行)
├── task/                          # Phase 4: 任務管理
│   └── taskManager.js             # 任務管理 (~170 行)
├── case/                          # Phase 6: 案例處理 ⭐ NEW
│   ├── caseDataFetcher.js         # 案例數據獲取 (~85 行) ⭐ NEW
│   └── anomalyCaseProcessor.js    # 異常案例處理 (~260 行) ⭐ NEW
├── utils/                         # 工具模組
│   ├── constants.js               # 常量定義 (~160 行)
│   └── memoryMonitor.js           # 記憶體監控 (~50 行)
├── __tests__/                     # 測試文件
│   ├── phase2-modules.test.js     # Phase 2 模組測試
│   ├── phase3-ai-modules.test.js  # Phase 3 模組測試
│   ├── phase4-task-modules.test.js # Phase 4 模組測試
│   ├── phase5-verdict-modules.test.js # Phase 5 模組測試
│   └── phase6-case-modules.test.js # Phase 6 模組測試 ⭐ NEW
├── index.js                       # 主入口文件
└── README.md                      # 本文件
```

## 📊 Phase 2 完成狀態

### ✅ 已完成的模組

#### 1. `utils/constants.js`
- **職責**：集中管理所有常量
- **導出**：
  - `ES_INDEX_NAME` - Elasticsearch 索引名稱
  - `SIMILARITY_THRESHOLDS` - 相似度門檻映射
  - `CASE_TYPE_MAP` - 案件類型映射
  - `COURT_LEVEL_MAP` - 法院層級映射
  - `VECTOR_FIELD_WEIGHTS` - 向量欄位權重配置
  - `KNN_CONFIG` - KNN 搜索配置
  - 等等...

#### 2. `core/embeddingService.js`
- **職責**：處理 OpenAI 向量生成
- **主要函數**：
  - `generateEmbedding(text)` - 生成單個文本的向量
  - `enrichCaseDescription(userInput)` - 使用 GPT-4o 補足案件描述
  - `generateEmbeddingsBatch(texts)` - 批量生成向量

#### 3. `core/searchStrategy.js`
- **職責**：搜索策略和過濾條件構建
- **主要函數**：
  - `getThresholdValue(threshold)` - 轉換相似度門檻
  - `getCaseTypeFilter(caseType)` - 轉換案件類型
  - `getCourtLevelFilter(courtLevel)` - 轉換法院層級
  - `generateSearchAngles(userInput, enrichment)` - 生成搜索角度
  - `getPositionBasedSearchStrategy(position, caseType)` - 獲取立場導向策略
  - `extractRelevantTags(caseDescription)` - 提取相關標籤
  - `buildBasicFilters(courtLevel, caseType, caseDescription)` - 構建基本過濾條件

#### 4. `core/multiAngleSearch.js`
- **職責**：執行多角度並行搜索
- **主要函數**：
  - `performMultiAngleSearch(...)` - 執行立場導向的多角度搜索

#### 5. `core/resultMerger.js`
- **職責**：合併和評分搜索結果
- **主要函數**：
  - `mergeMultiAngleResults(searchResults, userInput)` - 混合智能合併策略

#### 6. `utils/memoryMonitor.js`
- **職責**：記憶體使用監控
- **主要函數**：
  - `logMemoryUsage(step)` - 記錄記憶體使用
  - `getMemoryUsage()` - 獲取當前記憶體使用
  - `isMemoryHigh()` - 檢查記憶體是否過高

### 📉 重構成果

- **原始文件**：3,510 行
- **重構後**：2,730 行
- **減少行數**：780 行 (22%)
- **新增模組**：7 個文件
- **已刪除函數**：13 個

### 🔧 已從原始文件移除的函數

1. `getThresholdValue` → `searchStrategy.js`
2. `getCaseTypeFilter` → `searchStrategy.js`
3. `getCourtLevelFilter` → `searchStrategy.js`
4. `generateEmbedding` → `embeddingService.js`
5. `enrichCaseDescription` → `embeddingService.js`
6. `extractRelevantTags` → `searchStrategy.js`
7. `generateSearchAngles` → `searchStrategy.js`
8. `getPositionBasedSearchStrategy` → `searchStrategy.js`
9. `performMultiAngleSearch` → `multiAngleSearch.js`
10. `mergeMultiAngleResults` → `resultMerger.js`
11. `calculateLawyerValue` → `resultMerger.js`
12. `calculateFinalScore` → `resultMerger.js`
13. `generateRecommendationReason` → `resultMerger.js`

## 🚀 使用方式

### 導入新模組

```javascript
// 導入核心功能
import {
    generateEmbedding,
    enrichCaseDescription
} from './casePrecedentAnalysis/core/embeddingService.js';

import {
    getThresholdValue,
    generateSearchAngles,
    getPositionBasedSearchStrategy
} from './casePrecedentAnalysis/core/searchStrategy.js';

import {
    performMultiAngleSearch
} from './casePrecedentAnalysis/core/multiAngleSearch.js';

import {
    mergeMultiAngleResults
} from './casePrecedentAnalysis/core/resultMerger.js';

// 導入常量
import {
    ES_INDEX_NAME,
    SIMILARITY_THRESHOLDS,
    KNN_CONFIG
} from './casePrecedentAnalysis/utils/constants.js';
```

### 向後兼容

原有的 API 保持不變：

```javascript
import {
    startCasePrecedentAnalysis,
    startMainstreamAnalysis
} from './casePrecedentAnalysisService.js';
```

## 🧪 測試

運行 Phase 2 模組測試：

```bash
npm test -- casePrecedentAnalysis/__tests__/phase2-modules.test.js
```

## ✅ Phase 3 完成狀態 (2025-10-24)

### 已完成的模組

#### 7. `ai/promptBuilder.js` (~280 行)
- **職責**：構建各種 AI 分析所需的提示詞
- **主要函數**：
  - `buildInsightSummaryPrompt(insights, type, position)` - 構建策略洞察歸納提示詞
  - `buildReasonMergePrompt(reasons, type)` - 構建判決理由合併提示詞
  - `buildAnomalyAnalysisPrompt(...)` - 構建異常案例分析提示詞
  - `buildPositionPrompt(...)` - 構建立場導向主流判決分析提示詞
  - `buildCriticalAnalysisPrompt(...)` - 構建重大判決分析提示詞
  - `cleanMarkdownFromResponse(content)` - 清理 AI 響應中的 markdown 標記
  - `buildSystemPrompt(type)` - 構建系統提示詞

#### 8. `ai/insightSummarizer.js` (~280 行)
- **職責**：使用 AI 歸納和摘要策略洞察
- **主要函數**：
  - `summarizeStrategicInsights(rawInsights, type, position)` - AI 歸納策略洞察
  - `mergeSemanticReasons(reasons, type)` - AI 合併語義相似的判決理由
  - `batchSummarizeInsights(insightsData, position)` - 批量處理洞察摘要
  - `generateInsightText(insights, maxLength)` - 生成洞察文本摘要
  - `formatInsightDetails(details)` - 格式化洞察詳情

#### 9. `analysis/strategicInsights.js` (~280 行)
- **職責**：生成立場導向的策略洞察
- **主要函數**：
  - `generateStrategicInsights(similarCases, position, verdictAnalysis)` - 生成立場導向策略洞察
  - `generatePositionStats(similarCases, position)` - 生成立場統計數據
  - 內部輔助函數：
    - `extractSuccessStrategies(cases, position)` - 提取成功策略
    - `extractRiskFactors(cases, position)` - 提取風險因素
    - `calculateVictoryStats(cases, position)` - 計算勝訴統計

### 📉 Phase 3 重構成果

- **Phase 2 後文件**：2,730 行
- **Phase 3 後文件**：2,419 行
- **減少行數**：311 行 (11%)
- **新增模組**：3 個文件
- **已刪除函數**：2 個

### 🔧 Phase 3 已從原始文件移除的函數

1. `summarizeStrategicInsights` → `ai/insightSummarizer.js`
2. `generateStrategicInsights` → `analysis/strategicInsights.js`

### 📊 累計重構成果 (Phase 2 + Phase 3)

- **原始文件**：3,510 行
- **Phase 3 後文件**：2,419 行
- **累計減少**：1,091 行 (31%)
- **累計新增模組**：10 個文件

---

## 📦 Phase 4 完成狀態

### ✅ 已完成的模組

#### 1. `task/taskManager.js`
- **職責**：Firebase 任務管理
- **主要函數**：
  - `createAnalysisTask(analysisData, userId)` - 創建案件分析任務
  - `createMainstreamAnalysisTask(originalTaskId, userId)` - 創建主流判決分析任務
  - `updateTaskComplete(taskRef, result)` - 更新任務為完成狀態
  - `updateTaskFailed(taskRef, error)` - 更新任務為失敗狀態
  - `updateTaskError(taskRef, error)` - 更新任務為錯誤狀態
  - `getOriginalTaskData(originalTaskId)` - 獲取原始任務數據
  - `getTaskRef(taskId)` - 獲取任務引用
  - `validateAnalysisData(analysisData)` - 驗證分析數據

### 📉 Phase 4 重構成果

- **Phase 3 後文件**：2,419 行
- **Phase 4 後文件**：2,298 行
- **減少行數**：121 行 (5%)
- **新增模組**：1 個文件
- **已重構函數**：8 個

### 🔧 Phase 4 已從原始文件重構的函數

1. 任務創建邏輯 → `task/taskManager.js`
2. 任務更新邏輯 → `task/taskManager.js`
3. 任務驗證邏輯 → `task/taskManager.js`

### 📊 累計重構成果 (Phase 2 + Phase 3 + Phase 4)

- **原始文件**：3,510 行
- **當前文件**：2,298 行
- **累計減少**：1,212 行 (35%)
- **累計新增模組**：11 個文件

---

## ✅ Phase 5 完成狀態 (2025-10-24)

### 📦 新創建的模組

#### 1. `analysis/criticalCaseAnalyzer.js` (~260 行)
- **職責**：重大案例分析器
- **導出**：
  - `getCriticalCasesFromPool` - 從案例池獲取重大判決案例
  - `prepareEnrichedCaseSummaries` - 準備包含立場分析的案例摘要
  - `buildCitations` - 構建引用信息
  - `formatAnalysisResult` - 格式化分析結果

#### 2. `ai/criticalAnalysisPrompts.js` (~170 行)
- **職責**：重大判決分析提示詞生成
- **導出**：
  - `getCriticalAnalysisPrompt` - 生成重大判決分析的提示詞

#### 3. `analysis/criticalPatternAnalyzer.js` (~60 行)
- **職責**：重大判決模式分析
- **導出**：
  - `analyzeCriticalPattern` - 使用 AI 分析重大判決模式

### 📊 Phase 5 重構成果

- **減少行數**：280 行 (12%)
- **新增模組**：3 個文件
- **已重構函數**：4 個

### 🔧 Phase 5 已從原始文件重構的函數

1. 重大案例獲取邏輯 → `analysis/criticalCaseAnalyzer.js`
2. 案例摘要準備邏輯 → `analysis/criticalCaseAnalyzer.js`
3. 重大判決提示詞生成 → `ai/criticalAnalysisPrompts.js`
4. 重大判決模式分析 → `analysis/criticalPatternAnalyzer.js`

### 📊 累計重構成果 (Phase 2 + Phase 3 + Phase 4 + Phase 5)

- **原始文件**：3,510 行
- **當前文件**：2,018 行
- **累計減少**：1,492 行 (43%)
- **累計新增模組**：14 個文件

---

## ✅ Phase 6 完成狀態 (2025-10-24)

### 📦 新創建的模組

#### 1. `case/caseDataFetcher.js` (~85 行)
- **職責**：案例數據獲取
- **導出**：
  - `getJudgmentNodeData` - 獲取判決書 node 所需的完整數據
  - `batchGetJudgmentData` - 批量獲取判決書數據

#### 2. `case/anomalyCaseProcessor.js` (~260 行)
- **職責**：異常案例處理
- **導出**：
  - `generateAnomalyDetailsFromPoolSimplified` - 從案例池生成異常案例詳情（簡化版）
  - `generateAnomalyDetailsFromPool` - 從案例池生成異常案例詳情（完整版）
  - `generateAnomalyDetails` - 生成異常案例詳情（舊版）

### 📊 Phase 6 重構成果

- **減少行數**：235 行 (12%)
- **新增模組**：2 個文件
- **已重構函數**：5 個

### 🔧 Phase 6 已從原始文件重構的函數

1. 判決書數據獲取邏輯 → `case/caseDataFetcher.js`
2. 批量數據獲取邏輯 → `case/caseDataFetcher.js`
3. 異常案例處理邏輯（簡化版）→ `case/anomalyCaseProcessor.js`
4. 異常案例處理邏輯（完整版）→ `case/anomalyCaseProcessor.js`
5. 異常案例處理邏輯（舊版）→ `case/anomalyCaseProcessor.js`

### 📊 累計重構成果 (Phase 2 + Phase 3 + Phase 4 + Phase 5 + Phase 6)

- **原始文件**：3,510 行
- **當前文件**：1,783 行
- **累計減少**：1,727 行 (49%)
- **累計新增模組**：16 個文件

## 📝 下一步計劃

重構已接近完成！主服務文件已從 3,510 行減少到 1,783 行，減少了 49%。
剩餘的代碼主要是核心業務邏輯和流程控制，建議保持現狀。

## 🎓 最佳實踐

1. **單一職責原則**：每個模組只負責一個功能領域
2. **依賴注入**：通過參數傳遞依賴，而不是硬編碼
3. **錯誤處理**：每個模組都有完整的錯誤處理
4. **日誌記錄**：保持詳細的日誌以便調試
5. **向後兼容**：保持公共 API 不變

## 📚 參考資料

- [Phase 1 重構文檔](../verdictAnalysisService.js)
- [原始服務文件](../casePrecedentAnalysisService.js)
- [重構計劃](../../../docs/案件判決分析服務重構計劃.md)

## 👥 貢獻者

- 重構執行：Augment Agent
- 代碼審查：待定
- 測試驗證：待定

## 📅 更新日誌

### 2025-10-24 (Phase 6)
- ✅ 完成 Phase 6: 案例處理模組化
- ✅ 創建 2 個新模組文件
  - `case/caseDataFetcher.js` (~85 行)
  - `case/anomalyCaseProcessor.js` (~260 行)
- ✅ 從原始文件移除 235 行代碼
- ✅ 累計減少 1,727 行代碼 (49%)
- ✅ 所有測試通過
- ✅ 更新文檔

### 2025-10-24 (Phase 5)
- ✅ 完成 Phase 5: 判決分析模組化
- ✅ 創建 3 個新模組文件
  - `analysis/criticalCaseAnalyzer.js` (~260 行)
  - `ai/criticalAnalysisPrompts.js` (~170 行)
  - `analysis/criticalPatternAnalyzer.js` (~60 行)
- ✅ 從原始文件移除 280 行代碼
- ✅ 累計減少 1,492 行代碼 (43%)
- ✅ 所有測試通過
- ✅ 更新文檔

### 2025-10-24 (Phase 4)
- ✅ 完成 Phase 4: 任務管理模組化
- ✅ 創建 1 個新模組文件 (task/taskManager.js)
- ✅ 從原始文件移除 121 行代碼
- ✅ 累計減少 1,212 行代碼 (35%)
- ✅ 所有測試通過
- ✅ 更新文檔

### 2025-10-24 (Phase 3)
- ✅ 完成 Phase 3: AI 分析邏輯模組化
- ✅ 創建 3 個新模組文件 (ai/promptBuilder.js, ai/insightSummarizer.js, analysis/strategicInsights.js)
- ✅ 從原始文件移除 311 行代碼
- ✅ 累計減少 1,091 行代碼 (31%)
- ✅ 更新文檔

### 2025-10-24 (Phase 2)
- ✅ 完成 Phase 2: 核心搜索邏輯模組化
- ✅ 創建 7 個新模組文件
- ✅ 從原始文件移除 780 行代碼
- ✅ 編寫模組測試文件
- ✅ 更新文檔

