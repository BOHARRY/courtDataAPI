# 🦉 LawSowl 律師AI服務應用 - 完整架構分析

> **版本**: v1.0.0  
> **分析日期**: 2025-10-03  
> **分析範圍**: 前端 + 後端 + 基礎設施

---

## 📋 目錄

1. [系統概覽](#系統概覽)
2. [前端架構](#前端架構)
3. [後端架構](#後端架構)
4. [數據層架構](#數據層架構)
5. [AI服務架構](#ai服務架構)
6. [部署架構](#部署架構)
7. [技術棧總覽](#技術棧總覽)
8. [關鍵流程](#關鍵流程)

---

## 1. 系統概覽

### 1.1 整體架構圖

```
┌─────────────────────────────────────────────────────────────────┐
│                         用戶層                                    │
│  律師、法官、當事人 (Web Browser - Chrome/Firefox/Safari)         │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      前端層 (Vercel)                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  React 18.2.0 SPA                                        │   │
│  │  - 判決書搜尋工作區 (JudgmentWorkspace)                   │   │
│  │  - 法官分析 (SearchJudge)                                │   │
│  │  - 律師戰歷 (SearchLawyer)                               │   │
│  │  - AI 助手 (AIAssistant)                                 │   │
│  │  - 訴狀生成 (PleadingGeneration)                         │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  狀態管理: React Context API (Auth, Theme, Workspace)            │
│  路由: React Router 7.5.3                                        │
│  UI: 純 CSS3 + Framer Motion                                    │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTPS/REST API
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    後端層 (Render.com)                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Node.js + Express 4.18.2                                │   │
│  │                                                          │   │
│  │  API 路由 (/api/*)                                       │   │
│  │  ├─ /search          - 判決書搜尋                        │   │
│  │  ├─ /semantic-search - 語意搜尋                          │   │
│  │  ├─ /judges          - 法官分析                          │   │
│  │  ├─ /lawyers         - 律師分析                          │   │
│  │  ├─ /ai              - AI 分析服務                       │   │
│  │  ├─ /ai-agent        - AI Agent 對話                     │   │
│  │  ├─ /law-search      - 法條搜尋                          │   │
│  │  ├─ /workspaces      - 工作區管理                        │   │
│  │  ├─ /users           - 用戶管理                          │   │
│  │  └─ /payment         - 金流處理                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  中介軟體: Auth (Firebase Token), Credit (點數扣除)               │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      數據層                                       │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │  Elasticsearch   │  │  Firebase        │  │  MCP Server  │  │
│  │  8.x             │  │  Firestore       │  │  (Python)    │  │
│  │                  │  │  Authentication  │  │  FastMCP     │  │
│  │  - 7000+ 判決書  │  │  Storage         │  │              │  │
│  │  - 全文檢索      │  │  - 用戶資料      │  │  - 判決檢索  │  │
│  │  - 向量搜尋      │  │  - 工作區        │  │  - 語意搜尋  │  │
│  │  - 法條資料      │  │  - 訂閱記錄      │  │  - 法官分析  │  │
│  └──────────────────┘  └──────────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AI 服務層                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  OpenAI      │  │  Anthropic   │  │  xAI (Grok)          │  │
│  │  GPT-4o      │  │  Claude Opus │  │  Grok-4              │  │
│  │              │  │  4.1         │  │                      │  │
│  │  - 對話      │  │  - 訴狀生成  │  │  - 案件驗證          │  │
│  │  - 分析      │  │  - 法律寫作  │  │  - 深度分析          │  │
│  │  - 向量化    │  │              │  │                      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 核心功能模組

| 功能模組 | 前端組件 | 後端服務 | 數據源 |
|---------|---------|---------|--------|
| **判決書搜尋** | JudgmentWorkspace | search.js | Elasticsearch |
| **語意搜尋** | SemanticSearch | semanticSearchService.js | ES + OpenAI Embedding |
| **法官分析** | SearchJudge | judgeService.js | ES + Firestore |
| **律師戰歷** | SearchLawyer | lawyer.js | ES + Firestore |
| **AI 助手** | AIAssistant | ai-agent-controller.js | MCP + OpenAI |
| **訴狀生成** | PleadingGeneration | pleadingGenerationService.js | Claude Opus |
| **法條搜尋** | LawSearchModal | lawSearchService.js | ES (法條索引) |
| **工作區管理** | WorkspacePanel | workspace.js | Firestore |
| **用戶認證** | AuthContext | auth.js (middleware) | Firebase Auth |
| **支付系統** | PaymentResult | paymentController.js | 藍新金流 |

---

## 2. 前端架構

### 2.1 技術棧

```javascript
{
  "核心框架": "React 18.2.0",
  "路由": "React Router 7.5.3",
  "狀態管理": "React Context API + useReducer",
  "UI框架": "純 CSS3 (無第三方框架)",
  "動畫": "Framer Motion 12.18.1",
  "圖表": "Chart.js 4.4.9 + react-chartjs-2",
  "拖拽": "@dnd-kit/core 6.3.1",
  "認證": "Firebase 11.6.1",
  "工作流": "ReactFlow 11.11.4",
  "圖標": "React Icons 5.5.0"
}
```

### 2.2 目錄結構

```
lawsowl/src/
├── components/          # UI 組件 (100+ 個)
│   ├── HomePage.js
│   ├── JudgmentWorkspace.js
│   ├── SearchJudge.js
│   ├── SearchLawyer.js
│   ├── AIAssistant.js
│   ├── judge/          # 法官相關組件
│   ├── lawyer/         # 律師相關組件
│   ├── mcp/            # MCP 聊天組件
│   └── sidebar/        # 側邊欄組件
├── pages/              # 頁面組件
│   ├── AIAgentTestPage.js
│   ├── JudgeMCPDemoPage.js
│   └── PaymentResultPage.js
├── contexts/           # Context Providers
│   ├── WorkspaceContext.js
│   └── DeviceContext.js
├── hooks/              # 自定義 Hooks
│   └── useAIAgent.js
├── services/           # 前端服務層
│   ├── WorkspaceAPIService.js
│   ├── firestoreService.js
│   ├── paymentService.js
│   └── CommunicationService.js
├── nodes/              # 節點系統 (工作流)
│   ├── JudgementNode/
│   ├── AnalysisNode/
│   ├── PleadingGenerationNode/
│   └── ResultNode/
├── core/               # 核心系統
│   └── NodeRegistry.js
├── utils/              # 工具函數
├── config/             # 配置文件
├── App.js              # 根組件
├── index.js            # 入口文件
└── firebase.js         # Firebase 配置
```

### 2.3 狀態管理架構

```javascript
// Context Providers 層級結構
<BrowserRouter>
  <DeviceProvider>           // 設備檢測 (最高優先級)
    <AuthProvider>           // 用戶認證
      <ThemeProvider>        // 主題管理
        <WorkspaceProvider>  // 工作區狀態
          <App />
        </WorkspaceProvider>
      </ThemeProvider>
    </AuthProvider>
  </DeviceProvider>
</BrowserRouter>
```

**核心 Context:**

1. **AuthContext** - 用戶認證狀態
   - `currentUser`: 當前用戶資訊
   - `loginWithGoogle()`: Google OAuth 登入
   - `logout()`: 登出
   - 整合 Firebase Auth + Firestore 用戶資料

2. **ThemeContext** - 主題管理
   - 7 種主題切換
   - localStorage 持久化

3. **WorkspaceContext** - 工作區狀態
   - 節點管理
   - 連線管理
   - 數據同步

4. **DeviceContext** - 設備檢測
   - 手機/平板/桌機識別
   - 響應式佈局控制

### 2.4 路由配置

```javascript
<Routes>
  {/* 公開頁面 */}
  <Route path="/" element={<HomePage />} />
  <Route path="/payment-result" element={<PaymentResultPage />} />
  
  {/* 受保護頁面 (需登入) */}
  <Route path="/search-judgement" element={<ProtectedRoute><JudgmentWorkspace /></ProtectedRoute>} />
  <Route path="/search-judge" element={<ProtectedRoute><SearchJudge /></ProtectedRoute>} />
  <Route path="/search-lawyer" element={<ProtectedRoute><SearchLawyer /></ProtectedRoute>} />
  <Route path="/ai-assistant" element={<ProtectedRoute><AIAssistant /></ProtectedRoute>} />
  <Route path="/collection" element={<ProtectedRoute><Collection /></ProtectedRoute>} />
  <Route path="/notebook" element={<ProtectedRoute><Notebook /></ProtectedRoute>} />
  
  {/* 管理員頁面 */}
  <Route path="/admin/*" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
  
  {/* 測試頁面 */}
  <Route path="/ai-agent-test" element={<AIAgentTestPage />} />
  <Route path="/judge-mcp-demo" element={<JudgeMCPDemoPage />} />
</Routes>
```

---

## 3. 後端架構

### 3.1 技術棧

```javascript
{
  "運行時": "Node.js 18+",
  "框架": "Express 4.18.2",
  "數據庫客戶端": "@elastic/elasticsearch 8.13.0",
  "認證": "firebase-admin 13.3.0",
  "AI SDK": {
    "OpenAI": "openai 4.99.0",
    "Anthropic": "@anthropic-ai/sdk 0.30.1"
  },
  "工具": {
    "HTTP": "axios 1.9.0",
    "郵件": "nodemailer 7.0.3",
    "文件上傳": "multer 2.0.0",
    "UUID": "uuid 11.1.0"
  }
}
```

### 3.2 目錄結構

```
courtDataAPI/
├── index.js                 # 入口文件
├── config/                  # 配置層
│   ├── environment.js       # 環境變數
│   ├── express.js           # Express 配置
│   ├── firebase.js          # Firebase Admin 初始化
│   └── elasticsearch.js     # ES 客戶端
├── routes/                  # 路由層 (14 個路由文件)
│   ├── index.js             # 主路由
│   ├── search.js
│   ├── semantic-search.js
│   ├── judge.js
│   ├── lawyer.js
│   ├── ai-agent.js
│   ├── law-search.js
│   └── ...
├── controllers/             # 控制器層 (15 個控制器)
│   ├── search-controller.js
│   ├── ai-agent-controller.js
│   ├── judgeController.js
│   └── ...
├── services/                # 服務層 (25+ 個服務)
│   ├── search.js
│   ├── semanticSearchService.js
│   ├── judgeService.js
│   ├── lawSearchService.js
│   ├── aiAnalysisService.js
│   ├── pleadingGenerationService.js
│   └── pleading/            # 訴狀生成子模組
│       ├── ai/
│       ├── prompt/
│       ├── task/
│       └── validation/
├── middleware/              # 中介軟體
│   ├── auth.js              # Firebase Token 驗證
│   ├── adminAuth.js         # 管理員權限
│   └── credit.js            # 點數扣除
├── utils/                   # 工具函數
│   ├── ai-agent-tools.js    # AI Agent 工具定義
│   ├── ai-agent-local-functions.js
│   ├── case-analyzer.js
│   └── win-rate-calculator.js
└── docs/                    # 文檔
```

### 3.3 API 路由總覽

| 路由前綴 | 功能 | 主要端點 |
|---------|------|---------|
| `/api/search` | 判決書搜尋 | POST `/` |
| `/api/semantic-search` | 語意搜尋 | POST `/legal-issues` |
| `/api/judges` | 法官分析 | GET `/:judgeName` |
| `/api/lawyers` | 律師分析 | GET `/:lawyerName` |
| `/api/ai-agent` | AI Agent | POST `/chat` |
| `/api/law-search` | 法條搜尋 | POST `/search`, `/semantic` |
| `/api/ai` | AI 分析 | POST `/success-analysis`, `/citation-analysis` |
| `/api/workspaces` | 工作區 | GET `/`, POST `/`, PUT `/:id` |
| `/api/users` | 用戶管理 | GET `/profile`, PUT `/credits` |
| `/api/payment` | 金流 | POST `/create-order`, `/callback` |

### 3.4 中介軟體鏈

```javascript
// 典型的 API 請求流程
Request
  ↓
CORS (允許前端域名)
  ↓
Body Parser (JSON/URL-encoded)
  ↓
Logger (請求日誌)
  ↓
verifyToken (Firebase Token 驗證)
  ↓
checkAndDeductCredits (點數扣除)
  ↓
Controller (業務邏輯)
  ↓
Service (數據處理)
  ↓
Response
```

---

## 4. 數據層架構

### 4.1 Elasticsearch 架構

**索引**: `search-boooook`

**文檔結構**:
```json
{
  "JID": "TPHV,111,上,397,20250730,1",
  "JTITLE": "臺灣高等法院民事判決",
  "JFULL": "完整判決書內容...",
  "JYEAR": "111",
  "JCASE": "上",
  "JNO": "397",
  "JDATE": "20250730",
  "court": "臺灣高等法院",
  "judge_names": ["王婉如", "李明"],
  "lawyer_names": ["陳律師"],
  "verdict_type": "原告勝訴",
  "summary_ai": "AI 生成摘要",
  "main_reasons_ai": ["理由1", "理由2"],
  "legal_issues": [
    {
      "issue": "契約效力",
      "position": "原告",
      "argument": "...",
      "result": "勝訴"
    }
  ],
  "citations": [
    {
      "law": "民法",
      "article": "第184條",
      "content": "..."
    }
  ],
  "text_embedding": [0.123, 0.456, ...] // 1536 維向量
}
```

**查詢類型**:
1. **全文檢索**: `match`, `multi_match`
2. **精確匹配**: `term`, `terms`
3. **範圍查詢**: `range` (日期、金額)
4. **向量搜尋**: `knn` (語意搜尋)
5. **聚合分析**: `aggregations` (統計)

### 4.2 Firebase Firestore 架構

**集合結構**:

```
users/                          # 用戶集合
  {userId}/
    - email: string
    - displayName: string
    - credits: number           # 剩餘點數
    - level: string             # 會員等級
    - profession: string        # 職業
    - isAdmin: boolean
    - createdAt: timestamp
    
    searchHistory/              # 子集合: 搜尋歷史
      {historyId}/
        - query: object
        - timestamp: timestamp
        - type: string
    
    collections/                # 子集合: 收藏
      {collectionId}/
        - judgmentId: string
        - timestamp: timestamp

workspaces/                     # 工作區集合
  {workspaceId}/
    - userId: string
    - name: string
    - nodes: array              # 節點數據
    - edges: array              # 連線數據
    - createdAt: timestamp
    - updatedAt: timestamp

orders/                         # 訂單集合
  {orderId}/
    - userId: string
    - productId: string
    - amount: number
    - status: string
    - createdAt: timestamp

platformStatus/                 # 平台狀態
  databaseStats/
    - totalJudgments: number
    - lastUpdated: timestamp
```

---

## 5. AI 服務架構

### 5.1 AI Agent 架構

```
用戶問題: "分析王婉如法官的判決傾向"
    ↓
OpenAI GPT-4o (Function Calling)
    ↓ 決策: 需要調用哪些工具?
    ├─ MCP 工具 (6 個)
    │  ├─ search_judgments          # 搜尋判決書
    │  ├─ semantic_search_judgments # 語意搜尋
    │  ├─ analyze_judge             # 法官分析
    │  ├─ get_citation_analysis     # 引用分析
    │  ├─ get_case_details          # 案件詳情
    │  └─ get_perspective_analysis  # 觀點分析
    │
    └─ 本地函數 (5 個)
       ├─ calculate_verdict_statistics    # 判決統計
       ├─ extract_top_citations           # 提取常用法條
       ├─ analyze_amount_trends           # 金額趨勢
       ├─ compare_judges                  # 法官比較
       └─ calculate_case_type_distribution # 案由分布
    ↓
數據整合 + 分析
    ↓
自然語言回答
```

**MCP Server** (Python + FastMCP):
- 部署: Render.com
- 端點: `https://lawsowl-mcp.onrender.com`
- 協議: JSON-RPC 2.0
- 傳輸: HTTP (Streamable)

### 5.2 AI 分析服務

| 服務 | AI 模型 | 用途 | 點數消耗 |
|------|---------|------|---------|
| **勝訴關鍵分析** | GPT-4o | 分析判決書勝訴因素 | 50 |
| **歸納共同點** | GPT-4o | 多判決書共同點提取 | 30 |
| **案例比對** | GPT-4o | 判例比對分析 | 40 |
| **引用分析** | GPT-4o | 法條引用分析 | 20 |
| **訴狀生成** | Claude Opus 4.1 | 生成法律文書 | 100 |
| **寫作助手** | GPT-4o | 法律寫作輔助 | 10 |
| **語意搜尋** | text-embedding-3-large | 向量化查詢 | 5 |

### 5.3 訴狀生成流程

```
用戶輸入 (案件資訊 + 證據)
    ↓
前端: PleadingGenerationNode
    ↓ POST /api/ai/pleading-generation
後端: pleadingGenerationService.js
    ↓
1. 驗證輸入 (validation/)
2. 構建 Prompt (prompt/)
3. 調用 Claude Opus 4.1 (ai/)
4. 審核輸出 (audit/)
5. 格式化文書 (utils/)
    ↓
返回: 完整訴狀 (Word/PDF)
```

---

## 6. 部署架構

### 6.1 部署環境

| 組件 | 平台 | 方案 | URL |
|------|------|------|-----|
| **前端 (Stable)** | Vercel | Pro | https://frontend-court-search-web.vercel.app |
| **前端 (Beta)** | Vercel | Pro | https://frontend-court-search-web-beta.vercel.app |
| **後端 (Stable)** | Render.com | Starter | https://courtdataapi.onrender.com |
| **後端 (Beta)** | Render.com | Free | https://courtdataapi-beta.onrender.com |
| **MCP Server** | Render.com | Starter | https://lawsowl-mcp.onrender.com |
| **Elasticsearch** | Elastic Cloud | Standard | ap-southeast-1.aws.elastic.cloud |
| **Firebase** | Google Cloud | Blaze | - |

### 6.2 環境變數配置

**前端 (.env)**:
```bash
# API 端點
REACT_APP_API_BASE_URL=https://courtdataapi.onrender.com
REACT_APP_MCP_SERVER_URL=https://lawsowl-mcp.onrender.com

# Firebase
REACT_APP_FIREBASE_API_KEY=...
REACT_APP_FIREBASE_AUTH_DOMAIN=...
REACT_APP_FIREBASE_PROJECT_ID=...

# 功能開關
REACT_APP_SUPPRESS_FREQUENT_LOGS=true
REACT_APP_DISABLE_HEARTBEAT=true
```

**後端 (.env)**:
```bash
# Elasticsearch
ES_URL=https://...elastic.cloud
ES_API_KEY=...

# Firebase Admin
FIREBASE_SERVICE_ACCOUNT_KEY_JSON={"type":"service_account",...}

# OpenAI
OPENAI_API_KEY=sk-proj-...

# Anthropic
CLAUDE_API_KEY=sk-ant-...

# xAI
XAI_API_KEY=xai-...

# 金流
NEWEBPAY_MERCHANT_ID=...
NEWEBPAY_HASH_KEY=...
NEWEBPAY_HASH_IV=...
```

---

## 7. 技術棧總覽

### 7.1 前端技術棧

| 類別 | 技術 | 版本 | 用途 |
|------|------|------|------|
| **核心** | React | 18.2.0 | UI 框架 |
| | React Router | 7.5.3 | 路由管理 |
| | React Context API | - | 狀態管理 |
| **UI** | 純 CSS3 | - | 樣式 |
| | Framer Motion | 12.18.1 | 動畫 |
| | React Icons | 5.5.0 | 圖標 |
| **圖表** | Chart.js | 4.4.9 | 圖表渲染 |
| | react-chartjs-2 | 5.3.0 | React 封裝 |
| **工作流** | ReactFlow | 11.11.4 | 節點編輯器 |
| | @dnd-kit/core | 6.3.1 | 拖拽功能 |
| **認證** | Firebase | 11.6.1 | 用戶認證 |
| **工具** | Axios | - | HTTP 請求 |
| | date-fns | 4.1.0 | 日期處理 |
| | lodash-es | 4.17.21 | 工具函數 |

### 7.2 後端技術棧

| 類別 | 技術 | 版本 | 用途 |
|------|------|------|------|
| **核心** | Node.js | 18+ | 運行時 |
| | Express | 4.18.2 | Web 框架 |
| **數據庫** | @elastic/elasticsearch | 8.13.0 | ES 客戶端 |
| | firebase-admin | 13.3.0 | Firestore 客戶端 |
| **AI** | openai | 4.99.0 | OpenAI SDK |
| | @anthropic-ai/sdk | 0.30.1 | Claude SDK |
| **工具** | axios | 1.9.0 | HTTP 客戶端 |
| | nodemailer | 7.0.3 | 郵件發送 |
| | multer | 2.0.0 | 文件上傳 |
| | uuid | 11.1.0 | UUID 生成 |

---

## 8. 關鍵流程

### 8.1 用戶登入流程

```
1. 用戶點擊 "Google 登入"
2. 前端: AuthContext.loginWithGoogle()
3. Firebase Auth: Google OAuth 彈窗
4. 用戶授權
5. Firebase 返回 ID Token
6. 前端: 存儲 Token 到 localStorage
7. 前端: 監聽 onAuthStateChanged
8. Firestore: 讀取用戶詳細資料 (credits, level)
9. 前端: 更新 currentUser 狀態
10. 重定向到主頁
```

### 8.2 判決書搜尋流程

```
1. 用戶輸入關鍵字 + 篩選條件
2. 前端: JudgmentWorkspace 發送 POST /api/search
3. 後端: search-controller.js 接收請求
4. 後端: verifyToken 中介軟體驗證 Token
5. 後端: search.js 服務構建 ES 查詢
6. Elasticsearch: 執行查詢
7. 後端: 格式化結果
8. 前端: 顯示搜尋結果列表
9. 用戶點擊判決書
10. 前端: 創建 JudgementNode 節點
11. 前端: 顯示判決書詳情
```

### 8.3 AI 分析流程

```
1. 用戶選擇判決書 + 點擊 "勝訴關鍵分析"
2. 前端: POST /api/ai/success-analysis
3. 後端: verifyToken + checkAndDeductCredits (扣 50 點)
4. 後端: aiSuccessAnalysisService.js
5. 後端: 調用 OpenAI GPT-4o
6. OpenAI: 分析判決書內容
7. 後端: 格式化分析結果
8. 前端: 顯示分析結果 (圖表 + 文字)
9. Firestore: 更新用戶點數
```

---

## 總結

LawSowl 是一個**全棧法律科技平台**,整合了:

✅ **現代化前端**: React + Context API + 純 CSS3  
✅ **穩健後端**: Node.js + Express + 多層架構  
✅ **強大數據層**: Elasticsearch + Firestore  
✅ **先進 AI**: OpenAI + Claude + xAI  
✅ **專業部署**: Vercel + Render.com + Elastic Cloud  

**核心優勢**:
- 🎯 **7000+ 判決書** 全文檢索
- 🤖 **AI Agent** 自然語言查詢
- 📊 **多維度分析** (法官/律師/案由)
- 📝 **訴狀生成** Claude Opus 4.1
- 🔍 **語意搜尋** 向量化檢索
- 💳 **完整商業化** 點數系統 + 金流

**技術亮點**:
- MCP (Model Context Protocol) 整合
- Function Calling 智能工具調用
- ReactFlow 節點工作流
- 雙環境部署 (Stable + Beta)
- 完整的錯誤處理和日誌系統

