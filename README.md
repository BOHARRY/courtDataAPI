# 後端應用程式架構文檔

本文檔詳細描述了後端 Node.js 應用程式的模組化結構、各文件的職責以及關鍵實現細節。

## 目錄結構總覽


├── config/ # 配置文件目錄
│ ├── firebase.js # Firebase 初始化與配置
│ ├── elasticsearch.js # Elasticsearch 客戶端配置與連接檢查
│ ├── environment.js # 環境變數管理與導出
│ └── express.js # Express 應用程式實例配置 (CORS, 中間件基礎設定)
│
├── middleware/ # Express 中間件目錄
│ ├── auth.js # 身份驗證中間件 (verifyToken - Firebase ID Token)
│ └── credit.js # 積分檢查與扣除中間件 (骨架，核心邏輯在服務層)
│
├── services/ # 業務邏輯服務層目錄
│ ├── search.js # 判決書搜尋相關服務 (與 ES 交互、查詢構建、結果格式化)
│ ├── judgment.js # 單一判決書詳情服務
│ ├── lawyer.js # 律師相關服務 (搜尋、案件分析、優劣勢文本生成)
│ ├── credit.js # 積分管理服務 (檢查、扣除 - 支援 Firestore Transaction)
│ └── user.js # 使用者相關服務 (如搜尋歷史記錄)
│
├── utils/ # 通用工具函數目錄
│ ├── query-builder.js # Elasticsearch 查詢語句 (DSL) 構建工具
│ ├── response-formatter.js # Elasticsearch 回應格式化工具
│ ├── case-analyzer.js # 案件屬性分析工具 (主類型、結果判斷、律師優劣勢文本)
│ ├── win-rate-calculator.js # 勝訴率計算工具
│ └── constants.js # 應用程式中使用的常數 (關鍵字、結果代碼等)
│
├── routes/ # API 路由定義目錄
│ ├── index.js # 主路由文件，匯總所有子路由模組
│ ├── search.js # 搜尋相關 API 路由 (判決書搜尋、篩選選項)
│ ├── judgment.js # 判決書詳情 API 路由
│ ├── lawyer.js # 律師相關 API 路由
│ └── user.js # 使用者相關 API 路由
│
├── controllers/ # 控制器層目錄 (HTTP 請求處理)
│ ├── search-controller.js # 處理搜尋相關請求的控制器
│ ├── judgment-controller.js # 處理判決書詳情請求的控制器
│ ├── lawyer-controller.js # 處理律師相關請求的控制器
│ └── user-controller.js # 處理使用者相關請求的控制器
│
├── index.js # 應用程式主入口文件 (載入環境變數、初始化服務、啟動伺服器)
├── .env # 環境變數文件 (需自行創建並配置)
└── package.json # 專案依賴與腳本配置


## 各模組詳細說明

### 1. `config/` - 配置目錄

此目錄包含應用程式所有服務的初始化和基礎配置。

#### 1.1. `config/environment.js`
*   **功能**: 集中管理從 `.env` 文件讀取的環境變數，並提供類型轉換或預設值。
*   **細節**:
    *   導出如 `PORT`, `ES_URL`, `ES_API_KEY`, `FIREBASE_SERVICE_ACCOUNT_KEY_JSON` 等常數。
    *   在模組加載時檢查必要的環境變數是否存在，若缺少則輸出錯誤並可能終止程式。
    *   實際的 `dotenv.config()` 應在主入口 `index.js` 最頂部調用。

#### 1.2. `config/firebase.js`
*   **功能**: 初始化 Firebase Admin SDK。
*   **細節**:
    *   提供 `initializeFirebase()` 函數，使用 `environment.js` 中的 `FIREBASE_SERVICE_ACCOUNT_KEY_JSON` 初始化 `firebase-admin`。
    *   處理重複初始化的情況。
    *   初始化成功或失敗時輸出相應日誌。
    *   其他模組通過 `import admin from 'firebase-admin';` 來獲取已初始化的 `admin` 實例。

#### 1.3. `config/elasticsearch.js`
*   **功能**: 配置並導出 Elasticsearch JavaScript 客戶端實例。
*   **細節**:
    *   使用 `environment.js` 中的 `ES_URL` 和 `ES_API_KEY` 創建 `Client` 實例。
    *   提供 `checkElasticsearchConnection()` 異步函數，通過 `client.ping()` 檢查與 ES 服務的連通性。
    *   導出配置好的 `client` 實例供服務層使用。

#### 1.4. `config/express.js`
*   **功能**: 創建並配置 Express 應用程式實例。
*   **細節**:
    *   初始化 `express()`。
    *   配置 `cors` 中間件，允許跨域請求（生產環境建議限制 `origin`）。
    *   配置 `express.json()` 和 `express.urlencoded()` 中間件以解析請求體。
    *   可選：添加基礎的請求日誌中間件。
    *   **重要**: 掛載主 API 路由 (從 `routes/index.js` 引入，通常掛載到 `/api` 路徑下)。
    *   配置 404 Not Found 處理中間件。
    *   配置全局錯誤處理中間件，捕獲由 `next(error)` 傳遞的錯誤，並返回標準化的 JSON 錯誤回應。
    *   導出配置好的 `app` 實例。

### 2. `index.js` - 主入口文件

*   **功能**: 應用程式的啟動點。
*   **細節**:
    *   **必須在所有 `import` 之前**調用 `dotenv.config()` 以加載環境變數。
    *   引入 `config/express.js` 獲取 `app` 實例。
    *   引入並調用 `config/firebase.js` 中的 `initializeFirebase()`。
    *   引入並調用 `config/elasticsearch.js` 中的 `checkElasticsearchConnection()`。
    *   （如果路由未在 `config/express.js` 中掛載）引入 `routes/index.js` 並使用 `app.use()` 掛載主路由。
    *   從 `config/environment.js` 獲取 `PORT`。
    *   調用 `app.listen()` 啟動 HTTP 伺服器。
    *   包含一個 `startServer` 異步函數來組織初始化流程，並處理啟動過程中的潛在錯誤。

### 3. `middleware/` - 中間件目錄

此目錄存放 Express 中間件，用於處理請求生命週期中的通用邏輯。

#### 3.1. `middleware/auth.js`
*   **功能**: 提供 `verifyToken` 中間件，用於驗證 Firebase ID Token。
*   **細節**:
    *   從 `Authorization` 請求頭中提取 `Bearer token`。
    *   使用 `admin.auth().verifyIdToken()` 驗證 token。
    *   驗證成功，將解碼後的 `decodedToken` (包含 `uid`) 附加到 `req.user` 上，並調用 `next()`。
    *   驗證失敗，返回相應的 401 (Unauthorized) 或 403 (Forbidden) 錯誤回應。
    *   處理 token 過期、格式錯誤等特定 Firebase auth 錯誤。

#### 3.2. `middleware/credit.js`
*   **功能**: 提供 `checkAndDeductCredits(cost)` 工廠函數，返回一個 Express 中間件，用於在執行操作前檢查並（可能）扣除使用者積分。
*   **細節**:
    *   **注意**: 實際的積分檢查與扣除核心邏輯應在 `services/credit.js` 中通過 Firestore Transaction 完成，以保證原子性。此中間件更像是一個前置檢查點或協調者。
    *   中間件從 `req.user.uid` 獲取用戶 ID。
    *   **（當前實現的骨架）**: 暫時僅打印日誌。
    *   **（未來方向）**: 可能會調用 `services/credit.js` 中的函數。如果檢查不通過（例如積分不足），則返回 402 (Payment Required) 錯誤。如果需要在中間件層面直接扣除（不推薦），也應調用服務層方法。

### 4. `utils/` - 工具函數目錄

此目錄包含純粹的、可重用的輔助函數，不應有副作用或直接依賴外部服務實例（除非作為參數傳入）。

#### 4.1. `utils/constants.js`
*   **功能**: 定義並導出應用程式中廣泛使用的常數字串或數值。
*   **細節**:
    *   包含 `CRIMINAL_KEYWORDS_TITLE`, `CIVIL_KEYWORDS_TITLE` (用於案件類型判斷)。
    *   包含 `NEUTRAL_OUTCOME_CODES` (由 `getDetailedResult` 生成的標準化結果代碼)。
    *   包含 `FINAL_STAT_KEYS` (由 `calculateDetailedWinRates` 使用的勝敗統計鍵名)。
    *   使用常數可以避免硬編碼字串，減少拼寫錯誤，提高代碼可維護性。

#### 4.2. `utils/query-builder.js`
*   **功能**: 提供 `buildEsQuery(filters)` 函數，根據傳入的篩選條件物件構建 Elasticsearch 的查詢 DSL (Domain Specific Language) 的 `query` 部分。
*   **細節**:
    *   處理多種篩選條件：關鍵字查詢 (精確匹配與多欄位模糊匹配)、案件類型、判決結果、法條、法院層級、金額範圍、說理強度、複雜度、勝訴理由、全文有無、引用案例、近三年等。
    *   根據篩選條件動態構建 `must` (AND 邏輯，影響評分) 和 `filter` (AND 邏輯，不影響評分，用於精確匹配) 子句。
    *   如果沒有任何篩選條件，返回 `match_all: {}` 查詢。
    *   依賴 Elasticsearch 的 mapping 結構 (例如，是否使用 `.keyword` 後綴進行精確匹配)。

#### 4.3. `utils/response-formatter.js`
*   **功能**: 提供 `formatEsResponse(esResult, pageSize)` 函數，將 Elasticsearch `client.search` 返回的原始結果格式化為前端更易於使用的結構。
*   **細節**:
    *   提取總命中數 (`total`)、實際命中的文檔列表 (`hits`)。
    *   計算總頁數 (`totalPages`)。
    *   處理每個命中文檔，提取 `_id`, `_score`, `_source`。
    *   提取並附加高亮片段 (`JFULL_highlights`, `summary_ai_highlight`)。
    *   安全地提取聚合結果 (`aggregations`)。
    *   對無效或空結果進行健壯性處理。

#### 4.4. `utils/case-analyzer.js`
*   **功能**: 包含一系列用於分析單個案件屬性的函數。
*   **細節**:
    *   `getMainType(source)`: 根據案件的 `case_type`, `court`, `JTITLE`, `JCASE` 等欄位判斷案件主類型 (civil, criminal, administrative, unknown)。依賴 `constants.js` 中的關鍵字列表。
    *   `getSideFromPerformance(lawyerPerfObject)`: 從 `lawyerperformance` 物件中提取律師的立場 (如 plaintiff, defendant)。
    *   `getDetailedResult(perfVerdictText, mainType, sourceForContext, lawyerPerfObject)`: 核心函數，將律師在案件中的表現描述 (`perfVerdictText`) 和案件上下文，映射為一個標準化的中性結果代碼 (`neutralOutcomeCode`，來自 `constants.js`) 和一個用戶友好的描述 (`description`)。包含大量針對不同案件類型和結果文本的判斷邏輯。
    *   `populateDynamicFilterOptions(optionsTarget, esAggregations, allProcessedCases, lawyerName)`: 根據已處理的案件列表，為特定律師的案件詳情頁面填充動態的篩選器選項 (如案由、判決結果)。
    *   `generateLawyerAnalysis(lawyerName, analyzedData)`: 根據律師名稱（以及未來可能提供的已分析數據）生成律師的優劣勢分析文本。目前主要基於預設模板，特定律師（如“林大明”）有特殊模板。

#### 4.5. `utils/win-rate-calculator.js`
*   **功能**: 包含用於計算和統計勝訴率的函數。
*   **細節**:
    *   `createFinalOutcomeStats()`: 創建一個初始的、結構化的統計物件，用於存儲不同結果類型（如完全有利、部分有利、程序性等，鍵名來自 `constants.js`）的案件計數。
    *   `calculateDetailedWinRates(processedCases, initialDetailedWinRatesStats)`: 核心函數，遍歷已處理的案件列表（每個案件應包含 `mainType`, `sideFromPerf`, `neutralOutcomeCode`），根據這些信息和預定義的映射規則，將每個案件歸類到相應的勝敗統計桶中（使用 `FINAL_STAT_KEYS`）。同時計算各案件類型下，不同律師立場（原告、被告）的總體“有利結果率”(overall)。

### 5. `routes/` - API 路由定義目錄

此目錄下的文件定義了應用程式的所有 HTTP API 端點。

#### 5.1. `routes/index.js`
*   **功能**: 主路由文件，使用 `express.Router()` 匯總並導出所有定義在 `routes/` 目錄下的子路由模組。
*   **細節**:
    *   為每個子路由模組（如 `search.js`, `lawyer.js`）指定一個基礎路徑（如 `/search`, `/lawyers`）。
    *   提供一個根路徑 (`/`) 的健康檢查或歡迎訊息端點。
    *   此主路由通常在 `config/express.js` 或 `index.js` 中被掛載到一個統一的 API 前綴下（如 `/api`）。

#### 5.2. `routes/search.js`
*   **功能**: 定義與判決書搜尋相關的 API 端點。
*   **細節**:
    *   `GET /`: 處理判決書搜尋請求。應用 `verifyToken` 中間件進行身份驗證。積分處理在控制器層的 Transaction 中進行。綁定到 `searchJudgmentsController`。
    *   `GET /filters`: 獲取前端篩選器所需的選項數據。通常為公開端點。綁定到 `getFiltersController`。

#### 5.3. `routes/judgment.js`
*   **功能**: 定義與獲取單一判決書詳情相關的 API 端點。
*   **細節**:
    *   `GET /:id`: 根據判決書 ID 獲取其詳細內容。路徑參數 `:id` 表示判決書的唯一標識符。通常為公開端點。綁定到 `getJudgmentByIdController`。

#### 5.4. `routes/lawyer.js`
*   **功能**: 定義與律師資訊和分析相關的 API 端點。
*   **細節**:
    *   `GET /:name`: 根據律師名稱搜尋律師的案件數據和基本分析。應用 `verifyToken`。積分處理在控制器層。綁定到 `searchLawyerByNameController`。
    *   `GET /:name/cases-distribution`: 獲取特定律師的案件類型分佈數據。應用 `verifyToken`。積分處理在控制器層。綁定到 `getLawyerCasesDistributionController`。
    *   `GET /:name/analysis`: 獲取特定律師的詳細優劣勢分析文本。應用 `verifyToken`。積分處理在控制器層。綁定到 `getLawyerAnalysisController`。

#### 5.5. `routes/user.js`
*   **功能**: 定義與使用者特定資訊相關的 API 端點。
*   **細節**:
    *   `GET /lawyer-search-history`: 獲取當前登入使用者的律師搜尋歷史。應用 `verifyToken`。綁定到 `getLawyerSearchHistoryController`。
    *   未來可擴展其他用戶相關路由，如用戶個人資料。

### 6. `controllers/` - 控制器層目錄

控制器負責接收 HTTP 請求，驗證輸入，調用相應的服務層方法，並將服務層返回的結果構建成 HTTP 回應。控制器應保持“薄”，不包含複雜的業務邏輯。

#### 6.1. `controllers/search-controller.js`
*   **功能**: 處理搜尋相關的 HTTP 請求。
*   **細節**:
    *   `searchJudgmentsController(req, res, next)`:
        *   從 `req.user.uid` 獲取用戶 ID，從 `req.query` 獲取搜尋篩選條件和分頁參數。
        *   **在 Firestore Transaction 中**執行以下操作：
            *   調用 `creditService.checkAndDeductUserCreditsInTransaction()` 檢查並扣除積分。若積分不足，拋出特定錯誤。
            *   調用 `searchService.performSearch()` 執行搜尋。
        *   若成功，返回 200 OK 及搜尋結果。
        *   捕獲服務層或 Transaction 拋出的錯誤，若為特定錯誤（如積分不足）則返回相應 HTTP 狀態碼和錯誤訊息，否則調用 `next(error)` 將錯誤傳遞給全局錯誤處理器。
    *   `getFiltersController(req, res, next)`:
        *   調用 `searchService.getAvailableFilters()`。
        *   返回 200 OK 及篩選器數據。
        *   捕獲錯誤並調用 `next(error)`。

#### 6.2. `controllers/judgment-controller.js`
*   **功能**: 處理判決書詳情相關的 HTTP 請求。
*   **細節**:
    *   `getJudgmentByIdController(req, res, next)`:
        *   從 `req.params.id` 獲取判決書 ID。
        *   驗證 ID 是否存在。
        *   調用 `judgmentService.getJudgmentDetails()`。
        *   若服務層返回 `null` (表示未找到)，則返回 404 Not Found。
        *   若成功，返回 200 OK 及判決書數據。
        *   捕獲錯誤並調用 `next(error)`。

#### 6.3. `controllers/lawyer-controller.js`
*   **功能**: 處理律師相關的 HTTP 請求。
*   **細節**:
    *   `searchLawyerByNameController(req, res, next)`:
        *   從 `req.user.uid` 和 `req.params.name` 獲取用戶 ID 和律師名稱。
        *   **在 Firestore Transaction 中**:
            *   調用 `creditService.checkAndDeductUserCreditsInTransaction()`。
            *   調用 `lawyerService.searchLawyerData()`。
        *   成功後，**異步**調用 `userService.addLawyerSearchHistory()` 記錄歷史（記錄失敗不影響主回應）。
        *   返回 200 OK 及律師數據。處理錯誤類似 `searchJudgmentsController`。
    *   `getLawyerCasesDistributionController(req, res, next)`:
        *   處理類似 `searchLawyerByNameController`，但調用 `lawyerService.getStaticLawyerCasesDistribution()` (目前返回固定數據)。
    *   `getLawyerAnalysisController(req, res, next)`:
        *   處理類似 `searchLawyerByNameController`，但調用 `lawyerService.getGeneratedLawyerAnalysis()`。

#### 6.4. `controllers/user-controller.js`
*   **功能**: 處理使用者相關的 HTTP 請求。
*   **細節**:
    *   `getLawyerSearchHistoryController(req, res, next)`:
        *   從 `req.user.uid` 獲取用戶 ID。
        *   調用 `userService.getLawyerSearchHistory()`。
        *   返回 200 OK 及歷史記錄列表。
        *   捕獲錯誤並調用 `next(error)`。

### 7. `services/` - 業務邏輯服務層目錄

服務層封裝了應用程式的核心業務邏輯，與數據庫或其他外部服務進行交互。

#### 7.1. `services/search.js`
*   **功能**: 提供判決書搜尋及相關數據獲取服務。
*   **細節**:
    *   `performSearch(searchFilters, page, pageSize)`:
        *   依賴 `esClient` (來自 `config/elasticsearch.js`)。
        *   調用 `utils/query-builder.js` 的 `buildEsQuery()` 構建 ES 查詢。
        *   組裝完整的 ES 搜尋請求 (包括 `from`, `size`, `aggs`, `highlight`, `sort`)。
        *   執行 `esClient.search()`。
        *   調用 `utils/response-formatter.js` 的 `formatEsResponse()` 格式化結果。
        *   處理 ES 查詢錯誤並拋出標準化的服務層錯誤。
    *   `getAvailableFilters()`:
        *   執行一個僅包含聚合請求的 `esClient.search()` 來獲取前端篩選器選項。
        *   格式化聚合結果。

#### 7.2. `services/judgment.js`
*   **功能**: 提供獲取單一判決書詳情的服務。
*   **細節**:
    *   `getJudgmentDetails(judgmentId)`:
        *   依賴 `esClient`。
        *   執行 `esClient.get()` 根據 ID 獲取文檔。
        *   若找到，返回文檔的 `_source`；若 ES 返回 404，則服務層返回 `null`。
        *   處理其他 ES 錯誤。

#### 7.3. `services/lawyer.js`
*   **功能**: 提供律師數據搜尋、分析及相關文本生成的服務。
*   **細節**:
    *   `searchLawyerData(lawyerName)`:
        *   依賴 `esClient`。
        *   執行 `esClient.search()` 查詢特定律師參與的案件。
        *   調用 `analyzeAndStructureLawyerData()` (內部函數) 處理 ES 返回的案件列表。
    *   `analyzeAndStructureLawyerData(esHits, lawyerName, esAggregations)`: (原 `analyzeLawyerData` 函數)
        *   核心分析函數，初始化統計結構。
        *   遍歷 ES 命中的案件：
            *   調用 `utils/case-analyzer.js` 中的 `getMainType()`, `getSideFromPerformance()`, `getDetailedResult()`。
            *   統計近三年案件數、各案件類型數量。
        *   調用 `utils/win-rate-calculator.js` 中的 `calculateDetailedWinRates()` 計算勝率。
        *   統計最常見案件類型。
        *   調用 `utils/case-analyzer.js` 中的 `populateDynamicFilterOptions()`。
        *   計算律師評分 (`lawRating`)。
        *   調用 `utils/case-analyzer.js` 中的 `generateLawyerAnalysis()` 生成分析摘要。
        *   返回包含所有分析結果的結構化物件。
    *   `getStaticLawyerCasesDistribution(lawyerName)`: 返回固定的案件類型分佈數據 (根據原程式碼邏輯)。
    *   `getGeneratedLawyerAnalysis(lawyerName)`: 封裝對 `utils/case-analyzer.js` 中 `generateLawyerAnalysis()` 的調用。

#### 7.4. `services/credit.js`
*   **功能**: 提供使用者積分管理服務。
*   **細節**:
    *   `checkAndDeductUserCreditsInTransaction(transaction, userDocRef, userId, cost, logDetails)`:
        *   **必須在 Firestore Transaction 中執行**。
        *   `transaction`: Firestore 交易實例。
        *   `userDocRef`: 使用者 Firestore 文檔的引用。
        *   獲取使用者當前積分。
        *   比較積分與 `cost`。若不足，返回 `{ sufficient: false, currentCredits }`。
        *   若足夠，使用 `transaction.update()` 和 `admin.firestore.FieldValue.increment(-cost)` 原子性地扣除積分，並更新最後活動時間等。
        *   返回 `{ sufficient: true, currentCredits, newCredits }`。
        *   處理用戶文檔不存在的情況，拋出特定錯誤。
    *   未來可擴展 `addUserCredits`, `getUserCreditBalance` 等函數。

#### 7.5. `services/user.js`
*   **功能**: 提供使用者相關操作的服務。
*   **細節**:
    *   `addLawyerSearchHistory(userId, lawyerName, foundResults)`:
        *   依賴 `firebaseAdminInstance` (即 `admin`)。
        *   將一條律師搜尋記錄添加到指定使用者 Firestore 文檔下的 `lawyerSearchHistory` 子集合中。
        *   包含律師名、時間戳、是否找到結果等信息。
        *   處理 Firestore 寫入錯誤（通常記錄日誌，不阻塞主流程）。
    *   `getLawyerSearchHistory(userId, limit)`:
        *   查詢指定使用者的 `lawyerSearchHistory` 子集合，按時間戳降序排列，並限制返回數量。
        *   格式化結果，將 Firestore Timestamp 轉換為 ISO 日期字串。

## 總結

這個模組化結構旨在實現關注點分離 (Separation of Concerns)，提高程式碼的可讀性、可維護性和可測試性。每個模組都有其明確的職責，使得未來的功能擴展和問題排查更加高效。

---