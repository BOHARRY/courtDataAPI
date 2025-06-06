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
│   ├── express.js            # Express 設定
│   ├── creditCosts.js        # 點數消耗規則設定
│   ├── plansData.js          # 訂閱方案資料
│   └── commerceConfig.js     # 積分包與會員優惠設定
├── middleware/               # 中介軟體
│   ├── auth.js               # 身分驗證
│   └── credit.js             # 點數檢查
├── services/                 # 商業邏輯
│   ├── search.js             # 判決書搜尋
│   ├── lawyer.js             # 律師分析
│   ├── credit.js             # 點數管理
│   ├── judgment.js           # 判決書詳情
│   ├── user.js               # 使用者管理
│   ├── aiAnalysisService.js  # 案件AI特徵分析
│   ├── judgeService.js       # 法官分析與聚合
│   ├── newebpayService.js    # 藍新金流加解密與參數組裝
│   └── complaintService.js   # 民眾申訴處理
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
│   ├── judge.js              # 法官
│   ├── complaint.js          # 訴狀智能分析（驗證訴狀、法官檢查、匹配度分析）
│   ├── judgmentProxy.js      # 判決書代理存取
│   ├── payment.js            # 金流 API 路由
│   └── configRoutes.js       # 積分包與會員優惠設定 API 路由
├── controllers/              # 控制器
│   ├── search-controller.js
│   ├── judgment-controller.js
│   ├── lawyer-controller.js
│   ├── user-controller.js
│   ├── judgeController.js
│   ├── complaint-controller.js
│   ├── paymentController.js  # 金流流程與回調處理
│   └── configController.js   # 查詢積分包與會員優惠設定
├── index.js                  # 進入點
└── .env                      # 環境變數
```

---

### 新增檔案與目錄補充說明

- `config/creditCosts.js`：定義各 API 功能所需消耗的點數規則。
- `config/plansData.js`：訂閱方案與權益資料。
  目前包含四種方案：
  - `free`（免費）：每月 0 點
  - `basic`（基本）：每月 250 點
  - `advanced`（進階）：每月 2500 點
  - `premium_plus`（尊榮客製版）：每月 5000 點
  方案名稱與每月贈送點數皆於此設定，供訂閱管理與權益判斷使用。

- `config/commerceConfig.js`：積分包與會員優惠設定。
  定義所有可購買的積分包（credits_20、credits_50、credits_100、credits_300、credits_500、credits_1000、credits_3000），每包包含點數、價格、單價、是否熱門、是否有折扣等屬性。
  並針對不同會員方案（如進階、尊榮客製版）設定購買 500 點以上積分包的專屬折扣（如 8 折、7 折），所有積分購買與優惠邏輯皆由此統一管理。

- `controllers/configController.js`：查詢積分包與會員優惠設定的 API 控制器。
  提供 `/api/config/commerce` 路由，回傳所有積分包與會員優惠設定，未來可擴充根據用戶地區等回傳不同設定。

- `routes/configRoutes.js`：積分包與會員優惠設定 API 路由。
  提供 `/api/config/commerce` GET 路由，對應 configController，預設不需驗證，供前端查詢所有積分包與優惠資訊。

- `services/aiAnalysisService.js`：法官 AI 特徵分析與裁判傾向分析服務。
  負責呼叫 OpenAI API，根據法官案件資料自動產生「判決特徵標籤」與「裁判傾向」六大維度分數，並將分析結果寫回 Firestore。支援異步分析、錯誤處理與資料結構標準化。

- `services/complaintService.js`：訴狀相關的商業邏輯（如訴狀驗證、法官匹配分析）。
- `routes/complaint.js`：訴狀智能分析 API 路由（包含訴狀驗證、法官檢查、匹配度分析）。
- `routes/judgmentProxy.js`：判決書代理存取，處理跨來源存取、格式轉換等需求。
- `controllers/complaint-controller.js`：訴狀相關 API 控制器，負責處理訴狀驗證、法官檢查、匹配度分析等請求。

如未來有新增目錄或檔案，請於本區塊補充說明，以利團隊與 AI 理解專案全貌。
- `services/newebpayService.js`：藍新金流（Newebpay）串接服務，負責交易參數加密、解密、雜湊驗證，支援幕前支付（MPG）與信用卡定期定額（Period）兩種模式。提供交易參數組裝、回傳資料驗證與解密等核心函式，所有金流相關流程皆依賴此服務。
#### 金流（藍新 Newebpay）串接重點說明

- **金流服務核心：**  
  [`services/newebpayService.js`](services/newebpayService.js:1) 實作藍新 Newebpay 所需的 AES 加密、解密、SHA256 雜湊，並封裝交易參數組裝（`prepareMpgTradeArgs`、`preparePeriodCreateArgs`）、回傳資料驗證與解密（`verifyAndDecryptMpgData`、`decryptPeriodData`）。所有金流請求與回調資料皆經過加解密與雜湊驗證，確保安全性與正確性。

- **金流 API 流程：**  
  [`controllers/paymentController.js`](controllers/paymentController.js:1) 整合訂單建立、金流參數生成、Notify/Return 處理。  
  - `initiateCheckoutController`：依據用戶購買方案（訂閱/積分包）組裝訂單，決定一次性付款（MPG）或定期定額（Period），並產生對應加密參數，回傳前端。
  - `handleMpgNotifyController` / `handlePeriodNotifyController`：接收藍新 Notify 回調，解密並驗證資料，根據支付結果自動更新訂單狀態、發放積分或更新訂閱。
  - `handleMpgReturnController` / `handlePeriodReturnController`：處理前景跳轉（ReturnURL），解密資料後導向前端顯示付款結果。
  - `handleGeneralNotifyController` / `handleGeneralReturnController`：通用回調入口，根據資料型態自動分流至 MPG/Period 處理。

- **API 路由設計：**  
  [`routes/payment.js`](routes/payment.js:1) 定義金流相關路由，包含：
  - `POST /api/payment/initiate-checkout`：發起結帳（需登入）
  - `POST /api/payment/notify/mpg`、`/notify/period`、`/notify/general`：接收藍新 Notify 回調
  - `POST /api/payment/return/general`：接收藍新 Return 跳轉

- **積分包與會員優惠設定：**  
  [`config/commerceConfig.js`](config/commerceConfig.js:1) 定義所有可購買積分包、價格、折扣規則，供金流流程與前端查詢。

**整體流程說明：**  
1. 前端呼叫 `/api/payment/initiate-checkout`，後端依據商品類型組裝訂單與金流參數，回傳前端表單資料與金流 gateway URL。
2. 用戶於藍新頁面付款，藍新於付款完成後以 Notify/Return 回調後端，後端解密驗證資料，根據結果自動更新訂單、發放積分或訂閱權益。
3. 支援一次性付款（MPG）與定期定額（Period）兩種模式，所有金流資料皆經過加解密與雜湊驗證，確保安全。

**安全性重點：**  
- 所有金流資料皆以 AES-256-CBC 加密，並以 SHA256 雜湊驗證。
- Notify/Return 回調皆需驗證商店代號與雜湊值，避免偽造。
- 訂單與用戶狀態更新皆於 Firestore Transaction 內完成，確保資料一致性。
- `controllers/paymentController.js`：金流 API 控制器，整合訂單建立、藍新支付參數生成、Notify/Return 處理、訂閱與積分包購買流程。支援一次性付款（MPG）與定期定額（Period），並根據藍新回傳結果自動更新訂單與用戶狀態，處理訂閱續期、積分發放、訂單狀態流轉等。
- `routes/payment.js`：金流相關 API 路由，包含 `/initiate-checkout`（發起結帳）、`/notify/mpg`、`/notify/period`、`/notify/general`（接收藍新 Notify）、`/return/general`（接收藍新 Return 跳轉）等，對應 paymentController 之各處理函式。
#### 【建議補充】金流串接更完整說明（供 AI 工程師快速上手）

- **金流 API 請求/回應範例：**

  - initiate-checkout 請求（POST `/api/payment/initiate-checkout`）：
    ```json
    {
      "itemId": "credits_100",
      "itemType": "package",
      "billingCycle": null
    }
    ```
    回應（一次性付款）：
    ```json
    {
      "merchantOrderNo": "202405290001",
      "orderSummary": { "itemId": "credits_100", "itemType": "package", ... },
      "paymentMethod": "MPG",
      "paymentGatewayUrl": "https://core.newebpay.com/MPG/mpg_gateway",
      "merchantID": "商店代號",
      "tradeInfo": "加密字串",
      "tradeSha": "雜湊值",
      "version": "2.2"
    }
    ```

  - Notify/Return POST body 範例（MPG）：
    ```json
    {
      "TradeInfo": "加密字串",
      "TradeSha": "雜湊值",
      "MerchantID": "商店代號"
    }
    ```

- **金流流程時序圖（文字描述）：**
  1. 前端呼叫 initiate-checkout，取得金流參數與 gateway URL。
  2. 前端自動送出表單至藍新金流頁面。
  3. 用戶付款後，藍新以 Notify/Return POST 回調後端。
  4. 後端解密、驗證、更新訂單與用戶狀態，回應前端付款結果。

- **金流相關環境變數：**
  - `NEWEBPAY_MERCHANT_ID`：藍新商店代號
  - `NEWEBPAY_HASH_KEY`、`NEWEBPAY_HASH_IV`：加解密金鑰
  - `NEWEBPAY_MPG_URL`、`NEWEBPAY_PERIOD_URL`：金流 gateway 端點
  - 需於 [`config/environment.js`](config/environment.js:1) 設定

- **訂單狀態流轉（常見狀態）：**
  - `PENDING_PAYMENT` → `PAID`（付款成功）/`FAILED`（失敗）
  - 訂閱：`AGREEMENT_CREATED`（定期定額建立）→ `PAID`（每期授權成功）→ `COMPLETED_PERIODS`（期滿結束）
  - 失敗時會記錄錯誤訊息與狀態

如需更完整串接細節，請參考 [`controllers/paymentController.js`](controllers/paymentController.js:1) 內各 API 實作。

- `controllers/aiAnalysisController.js`：AI 勝訴關鍵分析 API 控制器，負責驗證輸入並調用 AI 分析服務，回傳案件摘要與勝訴關鍵分析結果。
- `services/aiSuccessAnalysisService.js`：AI 勝訴率/判決結果分析服務，負責呼叫 OpenAI API 取得文本 embedding（採用 text-embedding-3-large，維度1536），並結合案件資料進行勝訴關鍵分析。
- `utils/case-analyzer.js`：案件類型判斷與資料標準化工具，根據 Elasticsearch 資料自動判斷案件主類型（民事、刑事、行政），並處理欄位標準化。
- `utils/constants.js`：專案常數定義，包含案件關鍵字、判決結果標準化代碼等，供多個模組引用。
- `utils/judgeAnalysisUtils.js`：法官案件聚合分析工具，提供案件類型分布、判決結果分類、代表案件挑選等聚合統計輔助函式。
- `utils/win-rate-calculator.js`：勝訴率與案件結果統計計算工具，負責案件結果分類、勝訴率百分比計算，供法官/律師分析模組調用。
---

## 安裝、環境變數與啟動

### 安裝
```bash
npm install
```

### AI 勝訴關鍵分析 API 輸入/輸出格式

- 路由：`POST /api/ai-analysis/success-factors`
- 需授權（JWT/Firebase Token）

#### Request Body 範例
```json
{
  "case_type_selected": "民事",
  "case_summary_text": "原告主張被告於2022年1月1日借款新台幣10萬元，至今未償還..."
}
```

#### 成功回傳
- 內容為 analysisResult 物件，詳見下方「AI 勝訴關鍵分析結果結構」。

#### 失敗回傳範例
```json
{
  "status": "failed",
  "message": "缺少必要參數：case_type_selected 和 case_summary_text 為必填。",
  "details": { "internal_code": "EMPTY_INPUT_TEXT" }
}
```
- 可能錯誤原因：缺少參數、案件類型錯誤、摘要過短、OpenAI 服務錯誤等。
### 訂閱方案資料結構

```json
{
  "free": { "name": "免費", "creditsPerMonth": 0 },
  "basic": { "name": "基本", "creditsPerMonth": 250 },
  "advanced": { "name": "進階", "creditsPerMonth": 2500 },
  "premium_plus": { "name": "尊榮客製版", "creditsPerMonth": 5000 }
}
```
- 方案資料定義於 [`config/plansData.js`](config/plansData.js)。
- 每個方案包含名稱（name）與每月贈送點數（creditsPerMonth），可依需求擴充更多權益欄位。
### AI 勝訴關鍵分析結果結構（analysisResult）

```json
{
  "status": "complete",
  "analyzedCaseCount": 30,
  "estimatedWinRate": 56.7,
  "monetaryStats": {
    "avgClaimedAmount": 100000,
    "avgGrantedAmount": 80000,
    "avgPercentageAwarded": 80.0,
    "distribution": { "0-20%": 2, "21-40%": 3, "41-60%": 5, "61-80%": 10, "81-100%": 10 },
    "quartiles": { "q1": 40.0, "median": 70.0, "q3": 90.0 },
    "totalCases": 30
  },
  "verdictDistribution": {
    "完全勝訴": 10,
    "大部分勝訴": 5,
    "部分勝訴": 8,
    "小部分勝訴": 2,
    "完全敗訴": 3,
    "和解": 2,
    "其他": 0
  },
  "strategyInsights": {
    "winningStrategies": ["策略1", "策略2"],
    "losingReasons": ["原因1", "原因2"],
    "keyInsight": "綜合建議"
  },
  "keyJudgementPoints": [
    "要點1",
    "要點2"
  ],
  "commonCitedCases": [
    {
      "jid": "裁判JID",
      "title": "裁判標題",
      "count": 5,
      "citingContexts": [
        {
          "sourceCaseJid": "來源案件JID",
          "sourceCaseJtitle": "來源案件標題",
          "contexts": [
            { "paragraph": "引用段落內容", "location": "段落位置" }
          ]
        }
      ]
    }
  ],
  "message": "AI分析完成。共分析 30 件相似案件。"
}
```

- embedding：本分析服務使用 OpenAI text-embedding-3-large，維度 1536，欄位為 text_embedding（Elasticsearch mapping 已備註）。
- analysisResult 物件為 AI 勝訴關鍵分析的完整回傳格式，所有欄位皆有明確意義，請參考上方範例與註解。
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
| /api/ai/success-analysis           | POST  | AI 勝訴關鍵分析             | aiAnalysisController.js/aiSuccessAnalysisService.js | 是     | 2        |
| /api/users/lawyer-search-history   | GET  | 律師搜尋歷史               | user-controller.js/user.js        | 是     | 0        |
| /api/users/credit-history          | GET  | 點數交易紀錄查詢           | user-controller.js/user.js        | 是     | 0        |
| /api/users/update-subscription     | POST | 更新訂閱方案               | user-controller.js/user.js        | 是     | 0        |
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
### 判決書代理存取（judgmentProxy）

- 路由："/api/judgment-proxy"、"/proxy/*"
- 功能：代理司法官網判決書、靜態資源、AJAX、術語解釋等，處理跨域、資源重寫與 CORS，供前端安全存取外部司法資料。
- 回傳型態：依原始資源格式（HTML、JSON、圖片、字型等）動態轉發，無固定資料結構。
- 典型用途：前端嵌入判決書全文、載入術語解釋、取得原始 PDF/圖片等。

如需擴充代理規則，請參考 [`routes/judgmentProxy.js`](routes/judgmentProxy.js)。
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
### 點數消耗與用途對照表

| 功能/用途                      | 常數名稱                  | 點數消耗 |
|-------------------------------|--------------------------|---------|
| 判決書搜尋                    | SEARCH_JUDGEMENT         | 1       |
| 查看判決書詳情                | VIEW_JUDGEMENT_DETAIL    | 1       |
| 查詢律師基本資料與案件列表    | LAWYER_PROFILE_BASIC     | 1       |
| 查詢律師案件分布              | LAWYER_CASES_DISTRIBUTION| 1       |
| 查詢律師AI優劣勢分析          | LAWYER_AI_ANALYSIS       | 2       |
| 法官AI分析與統計              | JUDGE_AI_ANALYTICS       | 3       |
| AI勝訴關鍵分析                | AI_SUCCESS_ANALYSIS      | 5       |
| 註冊獎勵                      | SIGNUP_BONUS             | +N      |
| 訂閱每月點數（基本/進階）     | SUBSCRIPTION_MONTHLY_GRANT_BASIC / ADVANCED | +N |
| 購買點數包                    | PURCHASE_CREDITS_PKG_20  | +N      |
| 管理員補發                    | ADMIN_GRANT              | +N      |
| 退款/調整                     | REFUND_ADJUSTMENT        | ±N      |

- 以上設定詳見 [`config/creditCosts.js`](config/creditCosts.js)。
- CREDIT_COSTS 代表各功能消耗點數，CREDIT_PURPOSES 代表點數異動用途，請於開發新功能時參考並維護此設定。
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
### 6. 訂閱管理與點數紀錄

- 路由：`POST /api/users/update-subscription`
### 7. AI 勝訴關鍵分析

- 路由：`POST /api/ai/success-analysis`
- 控制器：aiAnalysisController.js
- 服務：services/aiSuccessAnalysisService.js
- 主要工具依賴：
  - utils/case-analyzer.js：案件類型判斷與資料標準化
  - utils/constants.js：案件關鍵字與判決結果常數
  - utils/judgeAnalysisUtils.js：法官案件聚合與統計
  - utils/win-rate-calculator.js：勝訴率與案件結果計算
- 功能：根據用戶輸入的案件類型與摘要，結合 AI 與歷史資料，分析勝訴關鍵因素與預測勝率，回傳分析報告。
  - 控制器：user-controller.js
  - 服務：services/user.js
  - 功能：用戶可更新訂閱方案（如升級、降級、取消），需登入授權。請於 request body 傳入新方案資訊，後端將同步更新 Firestore 內的訂閱狀態。

- 路由：`GET /api/users/credit-history`
  - 控制器：user-controller.js
  - 服務：services/user.js
  - 功能：查詢用戶的點數交易紀錄（如購買、消耗、獎勵等），需登入授權。回傳內容包含每筆交易的時間、類型、點數變動與備註。
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

本專案 search-boooook 索引的最新 mapping 結構如下，涵蓋所有重要欄位、型別、複合欄位、analyzer、tokenizer、synonym filter 等設計：

```json
{
  "search-boooook": {
    "aliases": {},
    "mappings": {
      "properties": {
        "JCASE": { "type": "keyword" },
        "JDATE": { "type": "keyword" },
        "JFULL": {
          "type": "text",
          "fields": {
            "cjk": { "type": "text", "analyzer": "chinese_combined_analyzer" },
            "edge_ngram": { "type": "text", "analyzer": "edge_ngram_analyzer", "search_analyzer": "standard" },
            "legal": { "type": "text", "analyzer": "legal_search_analyzer" },
            "ngram": { "type": "text", "analyzer": "ngram_analyzer", "search_analyzer": "standard" }
          }
        },
        "JID": { "type": "keyword" },
        "JNO": { "type": "keyword" },
        "JPDF": { "type": "keyword" },
        "JTITLE": {
          "type": "text",
          "fields": {
            "cjk": { "type": "text", "analyzer": "chinese_combined_analyzer" },
            "edge_ngram": { "type": "text", "analyzer": "edge_ngram_analyzer", "search_analyzer": "standard" },
            "exact": { "type": "keyword" }
          }
        },
        "JYEAR": { "type": "keyword" },
        "SCORE": { "type": "integer" },
        "analysis_version": {
          "type": "text",
          "fields": { "keyword": { "type": "keyword", "ignore_above": 256 } }
        },
        "appellant": {
          "type": "text",
          "fields": { "exact": { "type": "keyword" } },
          "analyzer": "chinese_combined_analyzer"
        },
        "appellant_lawyers": {
          "type": "text",
          "fields": { "exact": { "type": "keyword" } },
          "analyzer": "edge_ngram_analyzer"
        },
        "appellee": {
          "type": "text",
          "fields": { "exact": { "type": "keyword" } },
          "analyzer": "chinese_combined_analyzer"
        },
        "appellee_lawyers": {
          "type": "text",
          "fields": { "exact": { "type": "keyword" } },
          "analyzer": "edge_ngram_analyzer"
        },
        "case_type": { "type": "keyword" },
        "citations": { "type": "keyword" },
        "court": {
          "type": "text",
          "fields": { "exact": { "type": "keyword" } },
          "analyzer": "chinese_combined_analyzer"
        },
        "data_quality_score": { "type": "float" },
        "defendant": {
          "type": "text",
          "fields": { "exact": { "type": "keyword" } },
          "analyzer": "chinese_combined_analyzer"
        },
        "defendant_defenses_summary": { "type": "text", "analyzer": "chinese_combined_analyzer" },
        "defendant_type": { "type": "keyword" },
        "embedding_model": { "type": "keyword" },
        "embedding_token_count": { "type": "integer" },
        "indexed_at": { "type": "date" },
        "is_complex_case": { "type": "boolean" },
        "is_procedural": { "type": "boolean" },
        "is_ruling": { "type": "boolean" },
        "judges": {
          "type": "text",
          "fields": { "exact": { "type": "keyword" } },
          "analyzer": "edge_ngram_analyzer",
          "search_analyzer": "standard"
        },
        "lawyerperformance": {
          "type": "nested",
          "properties": {
            "claim_amount": { "type": "float", "ignore_malformed": true },
            "claim_type": { "type": "keyword" },
            "comment": { "type": "text", "analyzer": "chinese_combined_analyzer" },
            "defense_effectiveness": { "type": "keyword" },
            "final_verdict": { "type": "text", "analyzer": "chinese_combined_analyzer" },
            "granted_amount": { "type": "float", "ignore_malformed": true },
            "is_procedural": { "type": "boolean" },
            "lawyer": {
              "type": "text",
              "fields": { "exact": { "type": "keyword" } },
              "analyzer": "edge_ngram_analyzer"
            },
            "lawyer_type": { "type": "keyword" },
            "percentage_awarded": { "type": "float", "ignore_malformed": true },
            "prosecutor_demand": { "type": "text", "analyzer": "chinese_combined_analyzer" },
            "side": { "type": "keyword" },
            "verdict": { "type": "keyword" }
          }
        },
        "lawyers": {
          "type": "text",
          "fields": { "exact": { "type": "keyword" } },
          "analyzer": "edge_ngram_analyzer",
          "search_analyzer": "standard"
        },
        "lawyersdef": {
          "type": "text",
          "fields": { "exact": { "type": "keyword" } },
          "analyzer": "edge_ngram_analyzer",
          "search_analyzer": "standard"
        },
        "legal_basis": {
          "type": "keyword",
          "fields": { "text": { "type": "text", "analyzer": "chinese_combined_analyzer" } }
        },
        "main_reasons_ai": {
          "type": "text",
          "fields": { "tags": { "type": "keyword" } },
          "analyzer": "chinese_combined_analyzer"
        },
        "outcome_reasoning_strength": { "type": "keyword" },
        "plaintiff": {
          "type": "text",
          "fields": { "exact": { "type": "keyword" } },
          "analyzer": "chinese_combined_analyzer"
        },
        "plaintiff_claims_summary": { "type": "text", "analyzer": "chinese_combined_analyzer" },
        "plaintiff_type": { "type": "keyword" },
        "procedural_focus": { "type": "keyword" },
        "summary_ai": {
          "type": "text",
          "fields": {
            "cjk": { "type": "text", "analyzer": "chinese_combined_analyzer" },
            "edge_ngram": { "type": "text", "analyzer": "edge_ngram_analyzer", "search_analyzer": "ai_analysis_analyzer" },
            "exact": { "type": "keyword" }
          }
        },
        "summary_ai_full": {
          "type": "text",
          "fields": {
            "cjk": { "type": "text", "analyzer": "chinese_combined_analyzer" },
            "legal": { "type": "text", "analyzer": "legal_search_analyzer" }
          }
        },
        "tags": {
          "type": "text",
          "fields": { "keyword": { "type": "keyword" } },
          "analyzer": "chinese_combined_analyzer"
        },
        "text_embedding": {
          "type": "dense_vector",
          "dims": 1536,  // 採用 OpenAI text-embedding-3-large，1536維
          "index": true,
          "similarity": "cosine",
          "index_options": { "type": "int8_hnsw", "m": 16, "ef_construction": 100 }
        },
        "verdict_type": { "type": "keyword" }
      }
    },
    "settings": {
      "index": {
        "analysis": {
          "filter": {
            "legal_synonym": {
              "type": "synonym",
              "synonyms": [
                // ...（此處省略，請見原始 JSON 以獲得完整同義詞設計）
              ]
            },
            "ai_analysis_filter": {
              "type": "synonym",
              "synonyms": [
                "AI分析,人工智慧分析,智能分析",
                "律師績效,辯護效果,訴訟表現",
                "判決預測,勝訴預測,案件預測"
              ]
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
            "ai_analysis_analyzer": {
              "filter": ["lowercase", "ai_analysis_filter", "cjk_bigram"],
              "type": "custom",
              "tokenizer": "standard"
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
