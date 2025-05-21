# Boooook 後端 API 文件

## 目錄
1. [專案簡介](#專案簡介)
2. [專案結構與目錄說明](#專案結構與目錄說明)
3. [安裝、環境變數與啟動](#安裝環境變數與啟動)
4. [系統架構與核心流程](#系統架構與核心流程)
5. [API 路由總覽](#api-路由總覽)
6. [資料結構總覽](#資料結構總覽)
7. [功能模組說明](#功能模組說明)
8. [Middleware（中介軟體）](#middleware中介軟體)
9. [錯誤處理與日誌策略](#錯誤處理與日誌策略)
10. [維護與擴充建議](#維護與擴充建議)
11. [FAQ/常見問題](#faq常見問題)
12. [程式碼分析報告](#程式碼分析報告)
13. [版本/更新紀錄](#版本更新紀錄)

---

## 專案簡介

Boooook 是一個司法資訊檢索與分析平台，後端採用 Node.js + Express，支援判決書檢索、律師/法官分析、AI 特徵分析、點數機制與使用者管理。

**技術棧：**
- Node.js + Express
- Firebase Firestore（資料儲存、認證、點數）
- Elasticsearch（判決書索引）
- OpenAI API（AI 分析）
- 前後端分離設計

---

## 專案結構與目錄說明

```
.
├── config/                   # 設定檔
│   ├── firebase.js           # Firebase 初始化
│   ├── elasticsearch.js      # Elasticsearch 設定
│   ├── environment.js        # 環境變數管理
│   └── express.js            # Express 設定
├── middleware/               # 中介軟體
│   ├── auth.js               # 身分驗證
│   └── credit.js             # 點數檢查
├── services/                 # 商業邏輯
│   ├── search.js             # 判決書搜尋
│   ├── lawyer.js             # 律師分析
│   ├── credit.js             # 點數管理
│   ├── judgment.js           # 判決書詳情
│   ├── user.js               # 使用者管理
│   ├── aiAnalysisService.js  # 法官AI特徵分析
│   └── judgeService.js       # 法官分析與聚合
├── utils/                    # 工具函式
│   ├── query-builder.js      # ES查詢建構
│   ├── response-formatter.js # 回應格式化
│   ├── case-analyzer.js      # 案件分析
│   ├── win-rate-calculator.js # 勝訴率計算
│   ├── constants.js          # 常數定義
│   └── judgeAnalysisUtils.js # 法官案件聚合
├── routes/                   # API 路由
│   ├── index.js              # 主路由
│   ├── search.js             # 搜尋
│   ├── judgment.js           # 判決書詳情
│   ├── lawyer.js             # 律師
│   ├── user.js               # 使用者
│   └── judge.js              # 法官
├── controllers/              # 控制器
│   ├── search-controller.js
│   ├── judgment-controller.js
│   ├── lawyer-controller.js
│   ├── user-controller.js
│   └── judgeController.js
├── index.js                  # 進入點
└── .env                      # 環境變數
```

---

## 安裝、環境變數與啟動

### 安裝
```bash
npm install
```

### 設定環境變數
建立 `.env`，範例如下：
```
FIREBASE_PROJECT_ID=xxx
FIREBASE_CLIENT_EMAIL=xxx
FIREBASE_PRIVATE_KEY=xxx
ELASTICSEARCH_NODE=http://localhost:9200
OPENAI_API_KEY=sk-xxx
OPENAI_MODEL_NAME=gpt-4.1
```

### 啟動
```bash
npm start
# 或
node index.js
```

---

## 系統架構與核心流程

- **認證**：前端取得 Firebase ID Token，後端用 middleware/auth.js 驗證。
- **點數機制**：middleware/credit.js 檢查與扣除點數，所有需消耗點數 API 皆需掛載。
- **資料查詢**：主要查詢來源為 Elasticsearch（判決書），用戶/點數/歷史紀錄等存於 Firestore。
- **AI 分析**：法官分析時，先聚合統計（utils/judgeAnalysisUtils.js），再異步觸發 AI（services/aiAnalysisService.js），結果寫回 Firestore。
- **錯誤處理**：所有錯誤統一傳遞至 Express 錯誤處理中介軟體。

---

## API 路由總覽

| 路由                                | 方法 | 說明                       | 控制器/服務                      | 需驗證 | 點數成本 |
|-------------------------------------|------|----------------------------|-----------------------------------|--------|----------|
| /api/search                        | GET  | 判決書搜尋                 | search-controller.js/searchService| 是     | 1        |
| /api/search/filters                | GET  | 搜尋篩選器                 | search-controller.js/searchService| 否     | 0        |
| /api/judgments/:id                 | GET  | 判決書詳情                 | judgment-controller.js/judgment.js| 是     | 1        |
| /api/lawyers/:name                 | GET  | 律師分析                   | lawyer-controller.js/lawyer.js    | 是     | 1~2      |
| /api/lawyers/:name/cases-distribution | GET | 律師案件分布               | lawyer-controller.js/lawyer.js    | 是     | 1        |
| /api/lawyers/:name/analysis        | GET  | 律師優劣勢分析             | lawyer-controller.js/lawyer.js    | 是     | 2        |
| /api/users/lawyer-search-history   | GET  | 律師搜尋歷史               | user-controller.js/user.js        | 是     | 0        |
| /api/judges/:name/analytics        | GET  | 法官分析（含AI）           | judgeController.js/judgeService   | 是     | 3        |
| /api/judges/:name/ai-status        | GET  | 法官AI分析狀態             | judgeController.js/judgeService   | 是     | 0        |
| /api/judges/:name/reanalyze        | POST | 重新觸發法官AI分析         | judgeController.js/judgeService   | 是     | 0        |

---

## 資料結構總覽

### Firestore judges 文件結構

| 欄位                | 型別      | 說明                                   |
|---------------------|-----------|----------------------------------------|
| name                | string    | 法官姓名                               |
| caseStats           | object    | 案件統計（見下方說明）                 |
| verdictDistribution | array     | 判決結果分布（見下方說明）             |
| legalStats          | object    | 法條與理由強度統計（見下方說明）       |
| caseTypeAnalysis    | object    | 主案件類型分析（見下方說明）           |
| representativeCases | array     | 代表案件清單（見下方說明）             |
| traits              | array     | AI 分析特徵標籤（見下方說明）          |
| tendency            | object    | AI 裁判傾向分析（見下方說明）          |
| processingStatus    | string    | 狀態：complete/partial/failed/no_cases_found |
| aiProcessedAt       | timestamp | AI 分析完成時間                        |
| lastUpdated         | timestamp | 文件最後更新時間                       |
| processingError     | string    | AI 分析失敗時的錯誤訊息                |

### Elasticsearch 案件欄位設計

| 欄位                    | 型別      | 說明                       |
|-------------------------|-----------|----------------------------|
| JID                     | string    | 案件唯一識別碼             |
| JYEAR                   | string    | 年度                       |
| JCASE                   | string    | 案件字別                   |
| JNO                     | string    | 案件號碼                   |
| JDATE                   | string    | 裁判日期（YYYYMMDD）       |
| JTITLE                  | string    | 案件標題                   |
| court                   | string    | 法院名稱                   |
| case_type               | string    | 案件類型                   |
| verdict                 | string    | 判決主文                   |
| verdict_type            | string    | 判決結果類型               |
| summary_ai              | string/array | AI 產生之案件摘要         |
| main_reasons_ai         | string/array | AI 產生之理由摘要         |
| legal_basis             | array     | 法條依據                   |
| outcome_reasoning_strength | string | 理由強度（高/中/低）      |
| SCORE                   | number    | 案件分數（排序用）         |
| lawyerperformance       | array     | 律師表現資料（見下方）     |
| judges                  | array     | 法官名單                   |

### API 回傳格式與狀態欄位

- `status`：API 處理狀態，complete=全部完成，partial=AI 尚未完成，failed=失敗
- `processingStatus`：Firestore 文件內部狀態，與 status 對應
- `processingError`：AI 分析失敗時的錯誤訊息
- `aiProcessedAt`、`lastUpdated`：時間戳記

### 聚合統計物件結構

#### caseStats
```json
{
  "totalCases": 100,
  "recentCases": 20,
  "caseTypes": [
    { "type": "民事", "count": 60, "percent": 60 }
  ]
}
```
#### verdictDistribution
```json
[
  { "result": "原告勝訴", "count": 40, "percent": 40 }
]
```
#### legalStats
```json
{
  "legalBasis": [{ "code": "民法184", "count": 30 }],
  "reasoningStrength": { "high": 50, "medium": 30, "low": 20 }
}
```
#### caseTypeAnalysis
```json
{
  "civil": {
    "count": 60,
    "plaintiffClaimFullySupportedRate": 0.5,
    "plaintiffClaimPartiallySupportedRate": 0.2,
    "plaintiffClaimDismissedRate": 0.1,
    "settlementRate": 0.1,
    "withdrawalRate": 0.05,
    "proceduralDismissalRate": 0.05,
    "averageClaimAmount": 100000,
    "averageGrantedAmount": 80000,
    "overallGrantedToClaimRatio": 80
  }
}
```
#### representativeCases
```json
[
  {
    "id": "xxx",
    "title": "台北地院 112年度民訴字第123號",
    "cause": "民事",
    "result": "原告勝訴",
    "year": "112",
    "date": "20230101"
  }
]
```

### AI 分析欄位結構

#### traits
```json
[
  { "text": "重視程序正義", "icon": "⚖️", "confidence": "高" },
  { "text": "判決用詞簡潔", "icon": "✍️", "confidence": "中" }
]
```
- text：特徵描述（6-10字）
- icon：單一 emoji
- confidence：高/中/低

#### tendency
```json
{
  "dimensions": [
    { "name": "舉證要求", "score": 4, "value": "偏高", "icon": "⚖️", "explanation": "多數案件要求完整證據鏈" }
  ],
  "chartData": {
    "labels": ["舉證要求", "程序瑕疵敏感度", ...],
    "data": [4, 3, ...]
  }
}
```
- dimensions：六大維度，每個含 name, score(1-5), value, icon, explanation
- chartData：labels 與 data 對應維度

#### 律師表現資料結構（lawyerperformance）
```json
[
  {
    "lawyer": "王小明",
    "side": "plaintiff",
    "claim_amount": 100000,
    "granted_amount": 80000,
    "percentage_awarded": 80,
    "comment": "主張明確，部分獲准"
  }
]
```

---

## 功能模組說明

### 1. 使用者認證與點數機制
- Firebase Auth 驗證，middleware/auth.js 驗證 ID Token。
- middleware/credit.js 檢查與扣除點數，所有需消耗點數 API 皆需掛載。
- 點數操作於 Firestore Transaction 內保證原子性。

### 2. 判決書搜尋
- 路由：`GET /api/search`
- 控制器：search-controller.js
- 服務：services/search.js
- 支援多條件查詢、分頁、篩選器（/api/search/filters）

### 3. 律師分析
- 路由：`GET /api/lawyers/:name`
- 控制器：lawyer-controller.js
- 服務：services/lawyer.js
- 提供案件分布、優劣勢、勝訴率等分析

### 4. 法官分析與 AI 特徵
- 路由：`GET /api/judges/:name/analytics`
- 控制器：judgeController.js
- 服務：services/judgeService.js、aiAnalysisService.js
- 先聚合統計（utils/judgeAnalysisUtils.js），再異步觸發 AI 分析，結果寫回 Firestore
- 支援輪詢 AI 狀態、重新分析

### 5. 使用者歷史紀錄
- 路由：`GET /api/users/lawyer-search-history`
- 控制器：user-controller.js
- 服務：services/user.js
- 查詢律師搜尋歷史

---

## Middleware（中介軟體）

- `middleware/auth.js`：驗證 Firebase ID Token，將驗證後的使用者資訊附加於 `req.user`，所有需授權 API 均需掛載。
- `middleware/credit.js`：檢查並扣除使用者點數，依 API 設定不同點數成本，於 Firestore Transaction 內保證原子性。

---

## 錯誤處理與日誌策略

- 所有控制器皆有 try/catch，錯誤統一傳遞至 Express 錯誤處理中介軟體。
- 常見錯誤（如點數不足、認證失敗、AI 失敗）皆有明確 statusCode 與訊息。
- 重要操作（如 AI 分析、資料更新）皆有 console.log/console.error 記錄，建議正式環境串接雲端日誌服務。

---

## 維護與擴充建議

- 所有商業邏輯集中於 services/，便於單元測試與擴充。
- 聚合分析、AI 分析等複雜邏輯建議獨立於 utils/ 或 services/，避免 controller 過重。
- 新增 API 時，請同步於 README.md 路由總覽與資料結構章節補充說明。
- 建議撰寫單元測試（可用 Jest/Mocha），並於 PR 時自動化檢查。

---

## FAQ/常見問題

- Q: 如何新增一個新的 API？
  - A: 於 routes/ 新增路由，controllers/ 新增控制器，services/ 實作商業邏輯，並於 README.md 路由總覽補充。
- Q: 如何擴充 AI 分析？
  - A: 於 services/aiAnalysisService.js 擴充分析邏輯，並同步更新資料結構說明。
- Q: 如何本地測試？
  - A: 參考「安裝、啟動」章節，建議搭配前端專案一同啟動。

---

## 程式碼分析報告

### 一、總體評價

本專案 (Boooook 後端 API) 整體程式碼結構清晰，模組劃分合理，易於理解和維護。Node.js 與 Express 的使用符合業界標準實踐。Firebase 和 Elasticsearch 的整合也體現了良好的架構設計。註解覆蓋率尚可，但在部分複雜邏輯區塊仍有提升空間。測試案例相對缺乏，是未來需要重點補強的部分。

### 二、主要發現與建議

1.  **程式碼結構與組織**
    *   優點：遵循 MVC-like 設計模式 (routes, controllers, services)，職責分離明確。`config/` 目錄集中管理設定，`middleware/` 處理通用請求邏輯，`utils/` 提供工具函式，皆為良好實踐。
    *   建議：目前 `services/` 下的檔案較多，未來可考慮依照核心業務領域 (如 search, user, payment) 再細分一層子目錄，提升大型專案的可維護性。

2.  **API 設計**
    *   優點：RESTful 風格一致，路由命名直觀。API 版本管理未明確體現，但目前規模尚可接受。
    *   建議：對於分頁、排序、篩選等通用查詢參數，建議標準化並提供文件說明。部分 API (如律師分析) 回傳資料量可能較大，考慮引入更細緻的欄位選擇 (field selection) 機制。

3.  **資料庫互動**
    *   優點：Firebase (Firestore) 用於使用者資料與點數管理，Elasticsearch 用於判決書檢索，各司其職。`query-builder.js` 封裝 ES 查詢，降低了 controller/service 的複雜度。
    *   建議：部分 Firestore 查詢 (如 `judgeService.js` 中聚合分析前的資料獲取) 若資料量過大，可能有效能瓶頸，建議評估是否需要增加索引或優化查詢邏輯。Elasticsearch mapping 設計詳細，但應持續關注查詢效能與索引大小。

4.  **錯誤處理與日誌**
    *   優點：統一的錯誤處理中介軟體，控制器中 try/catch 機制健全。
    *   建議：日誌記錄目前以 `console.log/error` 為主，正式環境應串接專業日誌服務 (如 Sentry, Winston + ELK Stack)，並確保日誌包含足夠的上下文資訊 (如 request ID, user ID) 以利追蹤。

5.  **安全性**
    *   優點：使用 Firebase Auth 進行身份驗證，安全性有基本保障。
    *   建議：除了身份驗證，應全面檢視其他安全風險，如：輸入驗證 (防止 XSS, NoSQL Injection 等)、相依套件漏洞掃描 (npm audit)、API 速率限制等。`.env` 檔案應嚴格管理，避免敏感資訊洩漏。

6.  **效能**
    *   優點：AI 分析採用異步處理，避免阻塞主線程。
    *   建議：針對 Elasticsearch 查詢，特別是複雜聚合，應進行效能測試與優化。圖片等靜態資源可考慮使用 CDN。Node.js 單線程特性需注意，避免長時間 CPU密集型操作阻塞事件循環，必要時可考慮 worker threads 或微服務化。

7.  **註解與文件**
    *   優點：README.md 文件結構良好，涵蓋了主要面向。
    *   建議：程式碼內部註解可以更豐富，特別是複雜的業務邏輯或演算法部分。JSDoc 等工具可輔助產生更標準化的 API 文件。

8.  **測試**
    *   缺點：目前專案缺乏自動化測試 (單元測試、整合測試)。
    *   建議：這是亟需補強的一環。建議引入 Jest 或 Mocha 等測試框架，優先針對核心服務 (services) 和工具函式 (utils) 編寫單元測試。API 層級的整合測試也應逐步建立。CI/CD 流程中應包含自動化測試環節。

### 三、結論

Boooook 後端 API 是一個具備良好基礎的專案，但也存在一些可改進之處，尤其在測試覆蓋、日誌管理和部分效能考量上。透過持續的重構與優化，專案的健壯性與可維護性將能進一步提升。

---

## 版本/更新紀錄

- 2025/05：重構文件，補充 AI/法官分析、資料結構、API 路由、維護建議等章節。
- 2024/xx：初版文件。

---

### Elasticsearch Mapping 詳細說明

本專案 search-boooook 索引的 mapping 結構如下，涵蓋欄位型別、複合欄位、analyzer、tokenizer、synonym filter 等設計：

```json
{
  "search-boooook": {
    "mappings": {
      "properties": {
        ...（此處省略，請見下方重點欄位與設計說明）
      }
    },
    "settings": {
      "index": {
        "analysis": {
          "filter": {
            "legal_synonym": {
              "type": "synonym",
              "synonyms": [ ... ]
            }
          },
          "analyzer": {
            "legal_search_analyzer": {
              "filter": ["lowercase", "legal_synonym", "cjk_bigram"],
              "type": "custom",
              "tokenizer": "standard"
            },
            "edge_ngram_analyzer": {
              "filter": ["lowercase"],
              "type": "custom",
              "tokenizer": "edge_ngram_tokenizer"
            },
            "ngram_analyzer": {
              "filter": ["lowercase"],
              "type": "custom",
              "tokenizer": "ngram_tokenizer"
            },
            "chinese_combined_analyzer": {
              "filter": ["lowercase", "cjk_width", "cjk_bigram", "asciifolding"],
              "type": "custom",
              "tokenizer": "standard"
            }
          },
          "tokenizer": {
            "edge_ngram_tokenizer": {
              "token_chars": ["letter", "digit", "punctuation", "symbol"],
              "min_gram": "1",
              "type": "edge_ngram",
              "max_gram": "5"
            },
            "ngram_tokenizer": {
              "token_chars": ["letter", "digit"],
              "min_gram": "2",
              "type": "ngram",
              "max_gram": "3"
            }
          }
        }
      }
    }
  }
}
```

#### 主要欄位型別設計

- `keyword`：精確比對（如 JID, JCASE, JDATE, JNO, case_type, legal_basis, verdict_type, is_ruling, ...）
- `text`：全文檢索（如 JFULL, JTITLE, court, defendant, plaintiff, reason_text, main_text, summary_ai, ...）
- `nested`：巢狀結構（如 lawyerperformance，內含 claim_amount, lawyer, side, comment, ...）
- `integer`/`float`/`boolean`：數值與布林（如 JYEAR, SCORE, detention_days, claim_amount, ...）

#### 重要複合欄位與 analyzer

- `JFULL`, `JTITLE`, `summary_ai` 等欄位設有多重 analyzer（cjk、edge_ngram、ngram），支援中文分詞、模糊查詢、前綴查詢。
- `judges`, `lawyers`, `lawyersdef` 欄位同時有 text（支援模糊/分詞）與 raw（keyword，支援精確比對），便於法官/律師名單查詢。
- `lawyerperformance` 為 nested 結構，便於複雜聚合與條件查詢。

#### 重要分析器設計

- `legal_synonym` filter：大量法律、犯罪、民事、行政、金融、社會等領域同義詞，提升查詢涵蓋率。
- `chinese_combined_analyzer`：結合 cjk_bigram、cjk_width、asciifolding，優化中文與混合文本檢索。
- `edge_ngram_analyzer`/`ngram_analyzer`：支援前綴、模糊、部分字詞查詢，提升使用者體驗。

#### 查詢應用建議

- 精確查詢（如 JID、JCASE、verdict_type）請用 keyword/raw 欄位。
- 模糊/全文查詢（如 JFULL, JTITLE, summary_ai）請用 text 欄位，並可指定 analyzer。
- 法官、律師查詢建議用 `judges.raw`、`lawyers.raw` 精確比對，或用 text 欄位支援模糊搜尋。
- 巢狀查詢（如 lawyerperformance）請用 nested query。

#### mapping 片段（重點欄位）

```json
"JFULL": {
  "type": "text",
  "fields": {
    "cjk": { "type": "text", "analyzer": "chinese_combined_analyzer" },
    "edge_ngram": { "type": "text", "analyzer": "edge_ngram_analyzer", "search_analyzer": "standard" },
    "ngram": { "type": "text", "analyzer": "ngram_analyzer", "search_analyzer": "standard" }
  }
},
"judges": {
  "type": "text",
  "fields": { "raw": { "type": "keyword" } },
  "analyzer": "edge_ngram_analyzer",
  "search_analyzer": "standard"
},
"lawyerperformance": {
  "type": "nested",
  "properties": {
    "lawyer": { "type": "text", "analyzer": "edge_ngram_analyzer" },
    "side": { "type": "keyword" },
    "claim_amount": { "type": "float", "ignore_malformed": true },
    "granted_amount": { "type": "float", "ignore_malformed": true },
    "comment": { "type": "text", "analyzer": "chinese_combined_analyzer" }
    // ... 其餘欄位略
  }
}
```

---
