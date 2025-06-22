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
│   ├── commerceConfig.js     # 積分包與會員優惠設定
│   ├── subscriptionProducts.js # 訂閱方案詳情設定
│   └── intakeDomainConfig.js # AI 接待助理領域知識設定
├── middleware/               # 中介軟體
│   ├── auth.js               # 身分驗證
│   ├── credit.js             # 點數檢查
│   └── adminAuth.js          # 管理員權限驗證
├── services/                 # 商業邏輯
│   ├── search.js             # 判決書搜尋
│   ├── lawyer.js             # 律師分析
│   ├── credit.js             # 點數管理
│   ├── judgment.js           # 判決書詳情
│   ├── user.js               # 使用者管理
│   ├── aiAnalysisService.js  # 案件AI特徵分析
│   ├── judgeService.js       # 法官分析與聚合
│   ├── newebpayService.js    # 藍新金流加解密與參數組裝
│   ├── complaintService.js   # 民眾申訴處理
│   ├── orderService.js       # 訂單管理
│   ├── contactService.js     # 聯絡表單處理 (含郵件通知)
│   ├── platformStatusService.js # 平台狀態管理
│   ├── workspace.js          # 工作區管理
│   ├── intakeService.js      # AI 接待助理核心服務
│   └── conversationService.js # AI 對話 Session 管理
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
│   ├── complaint.js          # 訴狀智能分析
│   ├── judgmentProxy.js      # 判決書代理存取
│   ├── payment.js            # 金流 API 路由
│   ├── configRoutes.js       # 積分包與會員優惠設定 API 路由
│   ├── aiAnalysisRoutes.js   # AI 分析相關路由
│   ├── contactRoutes.js      # 聯絡我們表單路由
│   ├── platformStatusRoutes.js # 平台狀態路由
│   ├── workspace.js          # 工作區管理路由
│   ├── intake.js             # AI 接待助理路由
│   └── ezship.js             # ezShip 物流代理路由
├── controllers/              # 控制器
│   ├── search-controller.js      # 處理判決書搜尋請求
│   ├── judgment-controller.js    # 處理單一判決書詳情請求
│   ├── lawyer-controller.js      # 處理律師分析相關請求
│   ├── user-controller.js        # 處理使用者資料、歷史紀錄、訂閱等請求
│   ├── judgeController.js        # 處理法官分析相關請求
│   ├── complaint-controller.js   # 處理訴狀分析相關請求
│   ├── paymentController.js      # 處理金流、訂單與支付回調
│   ├── configController.js       # 提供前端所需的設定檔 (如訂閱方案)
│   ├── aiAnalysisController.js   # 處理 AI 勝訴關鍵分析請求
│   ├── contactController.js      # 處理聯絡我們表單提交
│   ├── platformStatusController.js # 處理平台狀態資訊的讀取與更新
│   ├── workspace-controller.js   # 處理使用者工作區的 CRUD 操作
│   └── intakeController.js       # 處理 AI 接待助理的對話流程
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

### AI 接待助理 (法握) 模組

此模組提供一個對話式 AI 介面，用於初步接待使用者、收集案件資訊並進行分類。

- `config/intakeDomainConfig.js`：AI 接待助理的核心設定檔，定義了其名稱、對話流程（如歡迎語、費用說明）、案件類型判斷規則、資訊擷取邏輯，以及一個詳細的、用於生成 OpenAI System Prompt 的動態模板。所有領域知識和 AI 行為模式都集中於此。
- `services/intakeService.js`：呼叫 OpenAI API 的核心服務。它會根據 `intakeDomainConfig.js` 的設定動態產生 Prompt，並將使用者的對話歷史傳送給 AI 進行處理，最後回傳結構化的 JSON 回應。
- `services/conversationService.js`：負責管理對話 Session 的生命週期。它處理 Session 在 Firestore 中的創建（延遲到使用者發送第一則訊息後才建立）、讀取、更新與列表查詢，確保對話狀態的持久化。
- `controllers/intakeController.js`：AI 接待助理的 API 控制器，負責協調上述服務。它管理對話狀態機、更新案件資訊，並處理 `/api/intake/*` 的所有請求。
- `routes/intake.js`：定義 AI 接待助理的所有 API 路由，包括 `/chat`（核心對話）、`/sessions`（歷史列表）、`/session`（單一查詢）和 `/new`（準備新對話）。

### 工作區 (Workspace) 管理模組

此模組提供讓使用者儲存、管理和組織其研究專案的功能。

- `services/workspace.js`：提供工作區完整的後端商業邏輯，包括在 Firestore 中對工作區進行創建、讀取、更新、刪除（CRUD）等操作。支援從範本創建、自動更新存取時間、刪除時清理關聯設定等。
- `controllers/workspace-controller.js`：工作區的 API 控制器，將 HTTP 請求映射到 `workspace.js` 服務中的對應函式。
- `routes/workspace.js`：定義了 `/api/workspace` 的 RESTful API 路由，所有操作都需要使用者登入驗證。

### 平台狀態與聯絡我們

- `services/platformStatusService.js`：管理一個全站共享的狀態文件（如總判決書數量、最新更新日期），提供讀取與（管理員）寫入的服務。
- `middleware/adminAuth.js`：管理員權限驗證中介軟體。它會檢查使用者的 Firestore 文件，確保只有 `isAdmin: true` 的使用者才能存取特定 API。
- `routes/platformStatusRoutes.js`：定義 `/api/platform-status/database-stats` 路由，其中 `PUT` 方法受到 `adminAuth` 保護。
- `services/contactService.js`：處理「聯絡我們」表單的完整後端服務。它負責將使用者上傳的附件存到 Firebase Storage、將表單內容存入 Firestore，並使用 `nodemailer` 寄送 Email 通知給管理者。
- `routes/contactRoutes.js`：定義 `/api/contact/submit` 路由，並使用 `multer` 中介軟體處理檔案上傳。

### 商務與金流擴充

- `config/subscriptionProducts.js`：詳細定義所有訂閱方案（免費、基本、進階、尊榮），包含價格、點數、功能列表，以及與藍新金流對接所需的定期定額參數。
- `services/orderService.js`：訂單管理服務。在使用者發起結帳流程時，此服務會在 Firestore 中創建一筆訂單紀錄，並在收到金流回調後更新其狀態。

### 其他

- `routes/ezship.js`：一個獨立的後端代理，專門用於串接台灣物流服務「ezShip」的退貨 API，處理其特殊的請求與回應格式。
- `routes/aiAnalysisRoutes.js`：定義 `/api/ai/success-analysis` 路由，並掛載了身分驗證與點數扣除中介軟體。

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
| /api/contact/submit                 | POST | 提交聯絡表單 (可含附件)    | contactController.js/contactService | 否     | 0        |
| /api/platform-status/database-stats | GET  | 獲取平台資料庫統計         | platformStatusController.js/platformStatusService | 是     | 0        |
| /api/platform-status/database-stats | PUT  | 更新平台資料庫統計         | platformStatusController.js/platformStatusService | 是 (管理員) | 0        |
| /api/workspace                      | POST | 創建新工作區               | workspace-controller.js/workspace.js | 是     | 0        |
| /api/workspace                      | GET  | 獲取所有工作區列表         | workspace-controller.js/workspace.js | 是     | 0        |
| /api/workspace/:workspaceId         | GET  | 獲取單一工作區詳情         | workspace-controller.js/workspace.js | 是     | 0        |
| /api/workspace/:workspaceId         | PUT  | 更新工作區內容             | workspace-controller.js/workspace.js | 是     | 0        |
| /api/workspace/:workspaceId         | DELETE| 刪除工作區                 | workspace-controller.js/workspace.js | 是     | 0        |
| /api/workspace/active/:workspaceId  | POST | 設定當前活動工作區         | workspace-controller.js/workspace.js | 是     | 0        |
| /api/intake/chat                    | POST | 與 AI 接待助理對話         | intakeController.js/intakeService | 否     | 0        |
| /api/intake/sessions                | GET  | 獲取使用者歷史對話列表     | intakeController.js/conversationService | 否     | 0        |
| /api/intake/session                 | POST | 獲取單一對話 Session       | intakeController.js/conversationService | 否     | 0        |
| /api/intake/new                     | POST | 準備一個新對話 Session     | intakeController.js/conversationService | 否     | 0        |
| /api/ezship/return                  | POST | 代理申請 ezShip 退貨編號   | ezship.js                         | 否     | 0        |

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

### Firestore `orders` 文件結構

| 欄位                | 型別      | 說明                                   |
|---------------------|-----------|----------------------------------------|
| merchantOrderNo     | string    | 平台產生的唯一訂單號 (文件 ID)         |
| userId              | string    | 使用者 UID                             |
| itemId              | string    | 商品 ID (如 `advanced` 或 `credits_100`) |
| itemType            | string    | 商品類型 (`plan` 或 `package`)         |
| amount              | number    | 訂單金額                               |
| itemDescription     | string    | 商品描述 (如 "進階方案-月繳")          |
| billingCycle        | string    | 付款週期 (`monthly` 或 `annually`)     |
| status              | string    | 訂單狀態 (PENDING_PAYMENT, PAID, FAILED) |
| paymentGateway      | string    | 支付閘道 (如 `newebpay`)               |
| gatewayTradeNo      | string    | 金流平台交易序號 (付款成功後更新)      |
| createdAt           | timestamp | 建立時間                               |
| updatedAt           | timestamp | 最後更新時間                           |

### Firestore `intake_sessions` 文件結構

| 欄位                | 型別      | 說明                                   |
|---------------------|-----------|----------------------------------------|
| sessionId           | string    | 唯一的對話 ID (文件 ID)                |
| anonymousUserId     | string    | 匿名使用者 ID                          |
| caseInfo            | object    | AI 收集到的結構化案件資訊              |
| conversationHistory | array     | 對話歷史紀錄 (user/assistant)          |
| status              | string    | 對話狀態 (`in_progress`, `completed`)  |
| createdAt           | timestamp | 建立時間                               |
| updatedAt           | timestamp | 最後更新時間                           |

### Firestore `contact_submissions` 文件結構

| 欄位                | 型別      | 說明                                   |
|---------------------|-----------|----------------------------------------|
| name                | string    | 聯絡人姓名                             |
| email               | string    | 聯絡人 Email                           |
| topic               | string    | 聯繫主題                               |
| message             | string    | 訊息內容                               |
| organization        | string    | 公司/組織 (可選)                       |
| userId              | string    | 使用者 UID (如果已登入)                |
| attachmentUrl       | string    | 附件在 Firebase Storage 的簽名 URL     |
| attachmentFileName  | string    | 附件原始檔名                           |
| status              | string    | 處理狀態 (`new`, `in_progress`, `closed`) |
| submittedAt         | timestamp | 提交時間                               |

### Firestore `users/{userId}/workspaces` 子集合文件結構

| 欄位                | 型別      | 說明                                   |
|---------------------|-----------|----------------------------------------|
| id                  | string    | 工作區 ID (文件 ID)                    |
| name                | string    | 工作區名稱                             |
| description         | string    | 工作區描述                             |
| searchState         | object    | 最後的搜尋條件狀態                     |
| tabs                | array     | 開啟的分頁籤列表                       |
| activeTabId         | string    | 當前活動分頁籤 ID                      |
| stats               | object    | 工作區統計資訊 (如搜尋次數)            |
| createdAt           | timestamp | 建立時間                               |
| updatedAt           | timestamp | 最後更新時間                           |
| lastAccessedAt      | timestamp | 最後存取時間                           |

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

### 判決書代理存取（judgmentProxy）

- 路由："/api/judgment-proxy"、"/proxy/*"
- 功能：代理司法官網判決書、靜態資源、AJAX、術語解釋等，處理跨域、資源重寫與 CORS，供前端安全存取外部司法資料。
- 回傳型態：依原始資源格式（HTML、JSON、圖片、字型等）動態轉發，無固定資料結構。
- 典型用途：前端嵌入判決書全文、載入術語解釋、取得原始 PDF/圖片等。

如需擴充代理規則，請參考 [`routes/judgmentProxy.js`](routes/judgmentProxy.js)。

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

本專案 `search-boooook` 索引的最新 mapping 結構如下，涵蓋所有重要欄位、型別、複合欄位、analyzer、tokenizer、synonym filter 等設計：

```json
{
  "search-boooook": {
    "aliases": {},
    "mappings": {
      "properties": {
        "CourtInsightsEND": { "type": "keyword", "index": false },
        "CourtInsightsStart": { "type": "keyword", "index": false },
        "JCASE": { "type": "keyword" },
        "JDATE": { "type": "date" },
        "JFULL": {
          "type": "text",
          "fields": { "legal": { "type": "text", "analyzer": "legal_search_analyzer" } },
          "analyzer": "chinese_combined_analyzer"
        },
        "JID": { "type": "keyword" },
        "JNO": { "type": "keyword" },
        "JPDF": { "type": "keyword" },
        "JTITLE": {
          "type": "text",
          "fields": {
            "edge_ngram": { "type": "text", "analyzer": "edge_ngram_analyzer" },
            "exact": { "type": "keyword" },
            "legal": { "type": "text", "analyzer": "legal_search_analyzer" }
          },
          "analyzer": "chinese_combined_analyzer"
        },
        "JYEAR": { "type": "keyword" },
        "SCORE": { "type": "integer" },
        "appellant": {
          "type": "text",
          "fields": { "exact": { "type": "keyword" } },
          "analyzer": "edge_ngram_analyzer"
        },
        "appellee": {
          "type": "text",
          "fields": { "exact": { "type": "keyword" } },
          "analyzer": "edge_ngram_analyzer"
        },
        "case_type": { "type": "keyword" },
        "challenged_administrative_action": {
          "type": "text",
          "fields": { "legal": { "type": "text", "analyzer": "legal_search_analyzer" } },
          "analyzer": "chinese_combined_analyzer"
        },
        "charges": { "type": "keyword" },
        "citable_paragraphs": {
          "type": "nested",
          "properties": {
            "para_id": { "type": "keyword" },
            "paragraph_text": {
              "type": "text",
              "fields": { "legal": { "type": "text", "analyzer": "legal_search_analyzer" } },
              "analyzer": "chinese_combined_analyzer"
            }
          }
        },
        "citation_analysis": {
          "type": "nested",
          "properties": {
            "citation": { "type": "keyword" },
            "occurrences": {
              "type": "nested",
              "properties": {
                "location": { "type": "keyword" },
                "paragraph": { "type": "text", "analyzer": "chinese_combined_analyzer" },
                "reason": { "type": "text", "analyzer": "chinese_combined_analyzer" }
              }
            }
          }
        },
        "citation_analysis_date": { "type": "date" },
        "citations": { "type": "keyword" },
        "court": {
          "type": "text",
          "fields": { "exact": { "type": "keyword" } },
          "analyzer": "chinese_combined_analyzer"
        },
        "court_level": { "type": "keyword" },
        "data_quality_score": { "type": "float" },
        "defendant": {
          "type": "text",
          "fields": { "exact": { "type": "keyword" } },
          "analyzer": "edge_ngram_analyzer"
        },
        "defendant_defenses_summary": { "type": "text", "analyzer": "chinese_combined_analyzer" },
        "embedding_model": { "type": "keyword" },
        "indexed_at": { "type": "date" },
        "is_complex_case": { "type": "boolean" },
        "is_procedural": { "type": "boolean" },
        "is_ruling": { "type": "boolean" },
        "judges": {
          "type": "text",
          "fields": { "exact": { "type": "keyword" } },
          "analyzer": "edge_ngram_analyzer"
        },
        "key_metrics": {
          "properties": {
            "administrative_metrics": { "properties": { "action_revoked": { "type": "keyword" } } },
            "civil_metrics": { "properties": { "claim_amount": { "type": "float" }, "granted_amount": { "type": "float" } } },
            "criminal_metrics": { "properties": { "final_verdict_raw": { "type": "text", "index": false }, "prosecutor_demand_raw": { "type": "text", "index": false } } }
          }
        },
        "law_domain": { "type": "keyword" },
        "lawyer_assessment": {
          "properties": {
            "defendant_side_comment": { "type": "text", "analyzer": "ai_analysis_analyzer" },
            "plaintiff_side_comment": { "type": "text", "analyzer": "ai_analysis_analyzer" }
          }
        },
        "lawyers": {
          "type": "text",
          "fields": { "exact": { "type": "keyword" } },
          "analyzer": "edge_ngram_analyzer"
        },
        "lawyersdef": {
          "type": "text",
          "fields": { "exact": { "type": "keyword" } },
          "analyzer": "edge_ngram_analyzer"
        },
        "legal_basis": { "type": "keyword" },
        "legal_claim_basis": {
          "type": "text",
          "fields": {
            "exact": { "type": "keyword" },
            "legal": { "type": "text", "analyzer": "legal_search_analyzer" }
          },
          "analyzer": "chinese_combined_analyzer"
        },
        "legal_issues": {
          "type": "nested",
          "properties": {
            "answer": {
              "type": "text",
              "fields": { "legal": { "type": "text", "analyzer": "legal_search_analyzer" } },
              "analyzer": "chinese_combined_analyzer"
            },
            "cited_para_id": { "type": "keyword" },
            "question": {
              "type": "text",
              "fields": {
                "exact": { "type": "keyword" },
                "legal": { "type": "text", "analyzer": "legal_search_analyzer" }
              },
              "analyzer": "chinese_combined_analyzer"
            }
          }
        },
        "legal_issues_count": { "type": "integer" },
        "legal_issues_embedding": {
          "type": "dense_vector", "dims": 1536, "index": true, "similarity": "cosine",
          "index_options": { "type": "int8_hnsw", "m": 32, "ef_construction": 128 }
        },
        "legal_issues_embedding_model": { "type": "keyword" },
        "legal_issues_embedding_token_count": { "type": "integer" },
        "main_reasons_ai": { "type": "keyword" },
        "plaintiff": {
          "type": "text",
          "fields": { "exact": { "type": "keyword" } },
          "analyzer": "edge_ngram_analyzer"
        },
        "plaintiff_claims_summary": { "type": "text", "analyzer": "chinese_combined_analyzer" },
        "procedural_focus": { "type": "keyword" },
        "prosecutor": {
          "type": "text",
          "fields": { "exact": { "type": "keyword" } },
          "analyzer": "edge_ngram_analyzer"
        },
        "schema_version": { "type": "keyword" },
        "summary_ai": {
          "type": "text",
          "fields": { "legal": { "type": "text", "analyzer": "legal_search_analyzer" } },
          "analyzer": "chinese_combined_analyzer"
        },
        "summary_ai_full": {
          "type": "text",
          "fields": { "legal": { "type": "text", "analyzer": "legal_search_analyzer" } },
          "analyzer": "chinese_combined_analyzer"
        },
        "tags": { "type": "keyword" },
        "text_embedding": {
          "type": "dense_vector", "dims": 1536, "index": true, "similarity": "cosine",
          "index_options": { "type": "int8_hnsw", "m": 32, "ef_construction": 128 }
        },
        "text_embedding_model": {
          "type": "text",
          "fields": { "keyword": { "type": "keyword", "ignore_above": 256 } }
        },
        "text_embedding_token_count": { "type": "integer" },
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
                "此處為法律同義詞庫，內容已省略..."
              ]
            },
            "ai_analysis_filter": {
              "type": "synonym",
              "synonyms": [
                "AI分析,人工智慧分析,智能分析",
                "律師績效,辯護效果,訴訟表現,策略評估",
                "判決預測,勝訴預測,案件預測,風險評估"
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
              "max_gram": "10"
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

- `keyword`：用於精確比對的欄位，如 `JID`, `JCASE`, `case_type`, `law_domain` 等。
- `text`：用於全文檢索的欄位，通常會搭配不同的分析器（analyzer）以支援中文分詞、法律同義詞、邊緣N-gram等。例如 `JFULL`, `JTITLE`, `summary_ai`。
- `nested`：用於處理巢狀結構的資料，例如 `citable_paragraphs`（可引用段落）和 `legal_issues`（法律爭點），允許對巢狀物件內的欄位進行獨立查詢。
- `dense_vector`：用於儲存向量資料（如 `text_embedding`），以支援向量相似度搜尋。
- `date`, `integer`, `float`, `boolean`：標準的日期、數值與布林型別。

#### 重要複合欄位與 analyzer

- **多重分析器**：`JFULL`, `JTITLE`, `summary_ai` 等核心文本欄位，通常會定義一個預設的中文分析器 (`chinese_combined_analyzer`)，並在 `fields` 中額外定義一個使用法律同義詞庫的分析器 (`legal_search_analyzer`)，以同時滿足一般性搜尋與專業領域搜尋的需求。
- **精確比對與模糊查詢並存**：`judges`, `lawyers`, `appellant` 等實體名稱欄位，通常會設定一個用於模糊查詢的 `edge_ngram_analyzer`，並在 `fields` 中額外定義一個 `exact` 的 `keyword` 欄位，以便進行精確的名稱比對。
- **巢狀結構 (Nested)**：新的 mapping 大量使用 `nested` 型別來組織複雜的關聯資料，如 `citable_paragraphs` 和 `legal_issues`。這使得我們可以對「某個法律爭點的答案」或「某個可引用段落的內文」進行精確查詢，而不會因為被扁平化而失去關聯性。
- **向量欄位 (Dense Vector)**：`text_embedding` 和 `legal_issues_embedding` 欄位用於儲存由 AI 模型（如 OpenAI）產生的語意向量，以實現基於語意相似度的進階搜尋功能。

#### 重要分析器設計

- `legal_synonym` filter：此同義詞過濾器是法律專業搜尋的核心，包含了大量法律術語的同義詞，能大幅提升查詢的涵蓋率與準確性。（註：此處省略詳細列表）
- `chinese_combined_analyzer`：結合了 `cjk_bigram`（中文二元分詞）、`cjk_width`（全形半形轉換）等，是優化中文檢索的基礎分析器。
- `edge_ngram_analyzer`：用於實現「輸入即搜尋」(search-as-you-type) 的前綴模糊查詢功能，提升使用者體驗。

#### 查詢應用建議

- **精確查詢**：當需要比對法官/律師姓名、案號、案件類型等確定性資訊時，應使用 `.exact` 結尾的 `keyword` 欄位，例如 `judges.exact: "王小明"`。
- **法律概念查詢**：當查詢法律概念或條文時，應優先使用 `.legal` 結尾的 `text` 欄位，以利用 `legal_search_analyzer` 的同義詞擴充功能。
- **巢狀查詢 (Nested Query)**：查詢 `legal_issues` 或 `citable_paragraphs` 等巢狀欄位時，必須使用 `nested` 查詢語法，以確保查詢條件作用在同一個巢狀物件內。
- **向量搜尋 (Vector Search)**：當需要尋找語意相似的案件或法律爭點時，應使用 `knn` 查詢語法，對 `text_embedding` 或 `legal_issues_embedding` 欄位進行查詢。

---
