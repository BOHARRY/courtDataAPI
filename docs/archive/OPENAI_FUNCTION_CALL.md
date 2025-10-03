# 🎯 OpenAI Function Calling 實施指南
## **法官知識通 AI Agent 完整技術文檔**

> **目標讀者**: 接手此專案的工程師  
> **預計閱讀時間**: 30-45 分鐘  
> **前置要求**: 熟悉 Node.js, React, Elasticsearch, OpenAI API

---

## 📚 **目錄**

1. [專案背景與現狀](#1-專案背景與現狀)
2. [核心概念與技術](#2-核心概念與技術)
3. [當前架構深度解析](#3-當前架構深度解析)
4. [OpenAI Function Calling 原理](#4-openai-function-calling-原理)
5. [實施計畫](#5-實施計畫)
6. [代碼結構與文件導覽](#6-代碼結構與文件導覽)
7. [關鍵發現與限制](#7-關鍵發現與限制)
8. [實作步驟](#8-實作步驟)
9. [測試與部署](#9-測試與部署)
10. [常見問題](#10-常見問題)

---

## **1. 專案背景與現狀**

### **1.1 專案簡介**

**LawSowl (法學梟)** 是一個法律 AI 平台,核心功能是 **法官知識通** - 幫助律師和當事人分析法官的判決傾向。

**當前問題**:
- 🔴 對話系統只能回答固定的問題
- 🔴 無法進行複雜的統計分析
- 🔴 無法組合多個查詢
- 🔴 用戶體驗受限於硬編碼的意圖識別

**目標**:
- ✅ 打造真正的 AI Agent,可以理解任意問題
- ✅ 自動組合工具完成複雜分析
- ✅ 提供自然語言對話體驗

---

### **1.2 技術棧**

**前端**:
- React 18
- 部署: Vercel
- URL: https://frontend-court-search-web.vercel.app

**後端**:
- Node.js + Express
- 部署: Render.com
- URL: https://lawnode.onrender.com

**MCP Server**:
- Python + FastMCP
- 部署: Render.com
- URL: https://esmcp.onrender.com

**資料庫**:
- Elasticsearch (Elastic Cloud)
- 索引: `search-boooook`
- 約 7000+ 筆判決書 (2025-06 ~ 2025-07)

**AI 服務**:
- OpenAI GPT-4o (主要)
- OpenAI GPT-4o-mini (意圖識別)

---

### **1.3 當前數據限制** ⚠️

**重要**: 這是影響整個系統設計的關鍵限制!

**判決書數量**:
- ⚠️ **只有 2 個月的數據** (2025-06 ~ 2025-07)
- ⚠️ 約 7000+ 筆判決書
- ⚠️ 無法進行長期趨勢分析

**應對策略**:
1. 在所有 AI 回答中明確說明數據範圍
2. 聚焦短期分析 (判決傾向、案由分布、勝訴率)
3. 不承諾長期趨勢預測
4. 充分利用豐富的 AI 分析欄位

---

## **2. 核心概念與技術**

### **2.1 什麼是 MCP (Model Context Protocol)?**

**MCP** 是一種標準化協議,讓 AI 模型能夠訪問外部工具和數據源。

**類比**:
- AI 模型 = 大腦
- MCP Server = 工具箱
- MCP 工具 = 各種工具 (搜尋、計算、分析)

**在本專案中**:
- MCP Server 提供判決書數據訪問能力
- 使用 FastMCP 框架 (Python)
- 通過 JSON-RPC 2.0 協議通信

**關鍵文件**:
- `d:\esmcp\lawsowl_mcp.py` - MCP Server 主程序
- `lawsowl\MCP_README.md` - MCP 整合文檔
- `lawsowl\MCP_INTEGRATION_JOURNEY.md` - 整合歷程

---

### **2.2 什麼是 OpenAI Function Calling?**

**Function Calling** 是 OpenAI 提供的機制,讓 GPT 模型能夠:
1. **理解**用戶需求
2. **決定**需要調用哪些函數
3. **生成**函數調用的參數
4. **整合**函數結果並生成回答

**重要**: GPT 本身**不執行**函數,只是**決定調用哪個函數**。實際執行由你的代碼完成。

**官方文檔**:
- https://platform.openai.com/docs/guides/function-calling

---

### **2.3 MCP vs OpenAI Function Calling**

| 特性 | MCP | OpenAI Function Calling |
|------|-----|------------------------|
| **定位** | 工具提供者 | 決策者 |
| **職責** | 執行具體操作 | 決定調用哪些工具 |
| **協議** | JSON-RPC 2.0 | OpenAI API |
| **語言** | 任意 (本專案用 Python) | 任意 (本專案用 Node.js) |
| **標準化** | MCP 標準 | OpenAI 專有 |

**關係**: 
- OpenAI Function Calling 可以調用 MCP 工具
- MCP 提供標準化的工具接口
- 兩者互補,不衝突

---

## **3. 當前架構深度解析**

### **3.1 當前數據流程**

```
用戶輸入問題
    ↓
前端 (JudgeMCPChat.js)
    ↓
意圖識別 API (POST /api/mcp/parse-intent)
    ↓
OpenAI GPT-4o-mini (固定模版提示詞)
    ↓
返回固定格式的意圖 JSON
{
  "intent": "search_cases" | "analyze_judge" | "compare_judges" | "unknown",
  "judge_name": "王婉如",
  "case_type": "交通",
  "verdict_type": "原告勝訴",
  "limit": 20
}
    ↓
前端硬編碼的 if-else 邏輯
if (intent === 'search_cases') {
  調用 smartSearchJudgments()
} else if (intent === 'analyze_judge') {
  調用 analyzeJudgeWithMCP()
}
    ↓
調用 MCP Server
    ↓
MCP Server 查詢 Elasticsearch
    ↓
返回結果
    ↓
前端格式化顯示
```

**問題**:
- 🔴 **硬性程度 80%**: 只能識別 4 種固定意圖
- 🔴 **無法組合工具**: 不能同時調用多個工具
- 🔴 **無法處理複雜需求**: 如 "王婉如法官在交通案件中,原告勝訴率是多少?"

---

### **3.2 關鍵代碼文件**

#### **前端**

**1. `lawsowl/src/hooks/useMCPJudgeAnalysis.js`**
- **職責**: MCP 通信邏輯
- **關鍵方法**:
  - `checkJudgeExists()` - 驗證法官是否存在
  - `analyzeJudgeWithMCP()` - 分析法官
  - `smartSearchJudgments()` - 智能搜尋判決書
  - `parseIntent()` - 調用意圖識別 API
- **重點**: 
  - 第 314-398 行: `smartSearchJudgments` 實作
  - 第 26-50 行: MCP Session 初始化邏輯

**2. `lawsowl/src/components/mcp/JudgeMCPChat.js`**
- **職責**: 對話界面組件
- **關鍵方法**:
  - `handleFollowUpQuestion()` - 處理用戶問題 (第 188-240 行)
  - `formatSearchResults()` - 格式化搜尋結果 (第 242-290 行)
- **重點**:
  - 第 202-233 行: **硬編碼的 if-else 邏輯** (需要改造的核心)

**3. `lawsowl/src/pages/JudgeMCPDemoPage.js`**
- **職責**: Demo 頁面
- **重點**: UI 展示,不涉及核心邏輯

---

#### **後端**

**1. `routes/mcp.js`**
- **職責**: MCP 相關 API 路由
- **端點**:
  - `POST /api/mcp/parse-intent` - 意圖識別 (第 17-91 行)
  - `POST /api/mcp/judge-insights` - 法官建議生成 (第 98-169 行)
- **重點**:
  - 第 27-66 行: **固定模版的意圖識別提示詞** (需要改造)

**2. `routes/index.js`**
- **職責**: 主路由配置
- **重點**: 第 41 行掛載 MCP 路由

**3. `middleware/auth.js`**
- **職責**: JWT 身份驗證
- **重點**: `verifyToken` 中間件

**4. `middleware/credit.js`**
- **職責**: 積分扣除
- **重點**: `checkAndDeductCredits` 中間件

---

#### **MCP Server**

**1. `d:\esmcp\lawsowl_mcp.py`**
- **職責**: MCP Server 主程序
- **當前工具** (3 個):
  - `search_judgments` (第 202-283 行) - 搜尋判決書
  - `analyze_judge` (第 285-380 行) - 分析法官
  - `get_lawyer_history` (第 382-470 行) - 律師歷史案件
- **重點**:
  - 第 55-73 行: Pydantic 參數模型定義
  - 第 95-103 行: Elasticsearch 查詢執行函數
  - 第 213-229 行: **查詢構建邏輯** (已優化支持 `query="*"`)

**2. `d:\esmcp\.env`**
- **職責**: 環境變數配置
- **重要變數**:
  - `ES_URL` - Elasticsearch URL
  - `ES_API_KEY` - Elasticsearch API Key
  - `ES_INDEX` - 索引名稱 (search-boooook)

---

### **3.3 Elasticsearch Mapping 分析**

**文件**: `lawsowl/mapping_json.txt` (833 行)

**超級豐富的欄位** (這是您的優勢!):

#### **基礎欄位**
- `JID` (判決字號), `JDATE` (判決日期), `JTITLE` (案由)
- `judges` (法官, keyword 陣列), `verdict_type` (判決結果, keyword)
- `court` (法院), `case_type` (案件類型: civil/criminal/administrative)

#### **AI 分析欄位** ⭐
- `summary_ai` (AI 摘要, text)
- `main_reasons_ai` (主要理由, keyword 陣列)
- `legal_issues` (法律爭議點, nested)
  - `question` (爭議問題)
  - `answer` (法院見解)
- `citation_analysis` (引用法條分析, nested)
  - `citation` (法條)
  - `occurrences` (出現位置和原因)
- `citations` (引用法條列表, keyword 陣列)

#### **當事人欄位**
- `plaintiff` (原告), `defendant` (被告)
- `lawyers` (原告律師), `lawyersdef` (被告律師)
- `appellant` (上訴人), `appellee` (被上訴人)

#### **金額欄位** (民事案件)
- `key_metrics.civil_metrics.claim_amount` (請求金額, float)
- `key_metrics.civil_metrics.granted_amount` (判賠金額, float)

#### **立場分析欄位** ⭐⭐⭐ (超級豐富!)
- `position_based_analysis.plaintiff_perspective` (原告視角)
  - `successful_elements` (成功要素)
  - `critical_failures` (關鍵失誤)
  - `key_lessons` (關鍵教訓)
- `position_based_analysis.defendant_perspective` (被告視角)
  - `successful_strategies` (成功策略)
  - `failed_strategies` (失敗策略)
- `position_based_analysis.agency_perspective` (機關視角)
- `position_based_analysis.citizen_perspective` (人民視角)

#### **向量欄位** (支持語意搜尋)
- `text_embedding` (全文向量, dense_vector, 1536 維)
- `legal_issues_embedding` (法律爭議向量)
- `main_reasons_ai_vector` (主要理由向量)

**重點**: 這些豐富的欄位可以支持非常深度的分析!

---

## **4. OpenAI Function Calling 原理**

### **4.1 完整執行流程**

**範例問題**: "王婉如法官在交通案件中,原告勝訴率是多少?"

#### **第 1 輪: GPT 決定第一步**

**發送給 OpenAI**:
```json
{
  "model": "gpt-4o",
  "messages": [
    {
      "role": "system",
      "content": "你是法律 AI 助手,可以調用工具來回答問題"
    },
    {
      "role": "user",
      "content": "王婉如法官在交通案件中,原告勝訴率是多少?"
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "search_judgments_by_judge",
        "description": "搜尋特定法官的判決書",
        "parameters": {
          "type": "object",
          "properties": {
            "judge_name": { "type": "string" },
            "case_type": { "type": "string" },
            "limit": { "type": "number" }
          },
          "required": ["judge_name"]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "calculate_verdict_rate",
        "description": "計算勝訴率",
        "parameters": { ... }
      }
    }
  ],
  "tool_choice": "auto"
}
```

**OpenAI 返回**:
```json
{
  "choices": [{
    "finish_reason": "tool_calls",
    "message": {
      "role": "assistant",
      "tool_calls": [{
        "id": "call_abc123",
        "type": "function",
        "function": {
          "name": "search_judgments_by_judge",
          "arguments": "{\"judge_name\":\"王婉如\",\"case_type\":\"交通\",\"limit\":100}"
        }
      }]
    }
  }]
}
```

**解讀**: GPT 決定先調用 `search_judgments_by_judge` 獲取交通案件數據。

---

#### **第 2 輪: 執行函數並返回結果**

**後端執行**:
```javascript
// 調用 MCP Server
const result = await callMCPTool("search_judgments", {
  judge_name: "王婉如",
  case_type: "交通",
  limit: 100
});
// 結果: 找到 37 筆交通案件
```

**發送給 OpenAI**:
```json
{
  "messages": [
    ... (之前的對話),
    {
      "role": "assistant",
      "tool_calls": [{ ... }]
    },
    {
      "role": "tool",
      "tool_call_id": "call_abc123",
      "content": "{\"總數\":37,\"判決書\":[...]}"
    }
  ],
  "tools": [ ... ]
}
```

**OpenAI 返回**:
```json
{
  "choices": [{
    "finish_reason": "tool_calls",
    "message": {
      "tool_calls": [{
        "id": "call_def456",
        "function": {
          "name": "calculate_verdict_rate",
          "arguments": "{\"judgments\":[...],\"verdict_type\":\"原告勝訴\"}"
        }
      }]
    }
  }]
}
```

**解讀**: GPT 看到搜尋結果後,決定調用 `calculate_verdict_rate` 計算勝訴率。

---

#### **第 3 輪: 生成最終回答**

**後端執行**:
```javascript
const rateResult = calculateVerdictRate({
  judgments: [...],
  verdict_type: "原告勝訴"
});
// 結果: {total: 37, matches: 15, rate: "40.5%"}
```

**發送給 OpenAI**:
```json
{
  "messages": [
    ...,
    {
      "role": "tool",
      "tool_call_id": "call_def456",
      "content": "{\"total\":37,\"matches\":15,\"rate\":\"40.5%\"}"
    }
  ]
}
```

**OpenAI 返回**:
```json
{
  "choices": [{
    "finish_reason": "stop",
    "message": {
      "role": "assistant",
      "content": "根據 2025 年 6-7 月的數據分析,王婉如法官在 37 筆交通案件中,原告勝訴 15 筆,勝訴率為 40.5%。這表示在交通案件中,原告的勝訴機會略低於一半。"
    }
  }]
}
```

**完成!** 用戶得到自然語言回答。

---

### **4.2 關鍵概念**

**1. 工具定義 (Tool Definition)**:
- 告訴 GPT 有哪些工具可用
- 每個工具的功能描述
- 每個工具的參數定義

**2. 工具調用 (Tool Call)**:
- GPT 決定調用哪個工具
- GPT 生成工具參數
- 你的代碼執行工具

**3. 工具結果 (Tool Result)**:
- 你的代碼返回執行結果
- 結果以 JSON 格式返回給 GPT
- GPT 根據結果決定下一步

**4. 循環執行**:
- GPT 可能連續調用多個工具
- 每次調用都基於前一次的結果
- 直到 GPT 認為可以生成最終回答

---

## **5. 實施計畫**

### **5.1 整體架構**

**新架構**:
```
用戶問題
    ↓
前端 (useAIAgent Hook)
    ↓
AI Agent API (POST /api/ai-agent/chat)
    ↓
OpenAI GPT-4o (Function Calling)
    ↓
循環調用工具:
├─→ MCP 工具 (數據獲取)
│   ├─ search_judgments_by_judge
│   ├─ get_citation_analysis
│   └─ get_case_details
│
└─→ 本地函數 (數據處理)
    ├─ calculate_verdict_rate
    ├─ extract_top_citations
    └─ compare_distributions
    ↓
GPT 生成自然語言回答
    ↓
返回給用戶
```

**優勢**:
- ✅ AI 自主決策,無需預定義所有場景
- ✅ 支持複雜的多步驟推理
- ✅ 可以處理未預見的需求組合
- ✅ 保留 MCP 架構,職責分離清晰

---

### **5.2 需要新增的工具**

#### **P0 - 核心工具 (必須實作)**

**1. MCP 工具**:
- `search_judgments_by_judge` - 搜尋法官判決書 (已有,需優化)
- `get_citation_analysis` - 引用法條分析 (新增)
- `get_case_details` - 獲取案件詳情 (新增)

**2. 本地函數**:
- `calculate_verdict_statistics` - 計算統計數據
- `extract_top_citations` - 提取 TOP 法條
- `analyze_amount_trends` - 金額分析

#### **P1 - 重要工具 (第二週)**

**3. MCP 工具**:
- `compare_judges` - 比較法官
- `get_perspective_analysis` - 立場分析

**4. 本地函數**:
- `compare_verdict_distributions` - 比較判決分布
- `extract_success_strategies` - 提取成功策略

#### **P2 - 增強工具 (第三週)**

**5. MCP 工具**:
- `semantic_search` - 語意搜尋
- `get_lawyer_performance` - 律師表現分析

---

### **5.3 實施時間表**

**Week 1-2: 基礎架構**
- [ ] 新增 AI Agent 路由 (`routes/ai-agent.js`)
- [ ] 實作工具定義 (`utils/ai-agent-tools.js`)
- [ ] 實作本地計算函數 (`utils/ai-agent-functions.js`)
- [ ] 新增 3 個核心 MCP 工具

**Week 2-3: AI Agent 實作**
- [ ] 實作 AI Agent 控制器 (`controllers/ai-agent-controller.js`)
- [ ] 整合 OpenAI Function Calling
- [ ] 測試工具調用流程
- [ ] 實作錯誤處理和重試邏輯

**Week 3-4: 前端整合**
- [ ] 新增 AI Agent Hook (`src/hooks/useAIAgent.js`)
- [ ] 更新對話組件 (`src/components/mcp/JudgeMCPChat.js`)
- [ ] UI/UX 優化
- [ ] 顯示工具調用過程 (可選)

**Week 4-5: 測試與上線**
- [ ] 功能測試 (各種問題類型)
- [ ] 性能優化 (緩存、並行調用)
- [ ] 成本優化 (使用 GPT-4o-mini 處理簡單查詢)
- [ ] 生產環境部署

---

## **6. 代碼結構與文件導覽**

### **6.1 工作區結構**

```
d:\court_data\
├── courtDataAPI\              # 後端 (Node.js)
│   ├── routes\
│   │   ├── mcp.js            # 當前 MCP 路由 (需改造)
│   │   ├── ai-agent.js       # 新增: AI Agent 路由
│   │   └── index.js          # 主路由配置
│   ├── controllers\
│   │   └── ai-agent-controller.js  # 新增: AI Agent 控制器
│   ├── utils\
│   │   ├── ai-agent-tools.js       # 新增: 工具定義
│   │   └── ai-agent-functions.js   # 新增: 本地函數
│   ├── middleware\
│   │   ├── auth.js           # JWT 驗證
│   │   └── credit.js         # 積分扣除
│   └── config\
│       └── environment.js    # 環境變數
│
├── frontend-court-search-web\lawsowl\  # 前端 (React)
│   ├── src\
│   │   ├── hooks\
│   │   │   ├── useMCPJudgeAnalysis.js  # 當前 MCP Hook
│   │   │   └── useAIAgent.js           # 新增: AI Agent Hook
│   │   ├── components\mcp\
│   │   │   └── JudgeMCPChat.js         # 對話組件 (需改造)
│   │   └── pages\
│   │       └── JudgeMCPDemoPage.js     # Demo 頁面
│   ├── mapping_json.txt      # Elasticsearch Mapping
│   ├── MCP_README.md         # MCP 整合文檔
│   └── MCP_INTEGRATION_JOURNEY.md  # 整合歷程
│
└── esmcp\                     # MCP Server (Python)
    ├── lawsowl_mcp.py        # MCP Server 主程序 (需擴展)
    ├── .env                  # 環境變數
    └── requirements.txt      # Python 依賴
```

---

### **6.2 必讀文件清單**

**優先級 P0 (必讀)**:
1. ✅ 本文件 (`OPENAI_FUNCTION_CALL.md`)
2. ✅ `lawsowl/MCP_README.md` - MCP 整合說明
3. ✅ `routes/mcp.js` - 當前意圖識別實作
4. ✅ `lawsowl/src/hooks/useMCPJudgeAnalysis.js` - MCP 通信邏輯
5. ✅ `d:\esmcp\lawsowl_mcp.py` - MCP Server 工具定義

**優先級 P1 (建議閱讀)**:
6. ✅ `lawsowl/mapping_json.txt` - Elasticsearch Mapping
7. ✅ `lawsowl/src/components/mcp/JudgeMCPChat.js` - 對話組件
8. ✅ `lawsowl/MCP_INTEGRATION_JOURNEY.md` - 整合歷程
9. ✅ OpenAI Function Calling 官方文檔

**優先級 P2 (參考)**:
10. ✅ `middleware/auth.js` - 身份驗證
11. ✅ `middleware/credit.js` - 積分扣除
12. ✅ `routes/index.js` - 路由配置

---

## **7. 關鍵發現與限制**

### **7.1 數據限制** ⚠️

**發現 1: 只有 2 個月的判決書**
- 時間範圍: 2025-06 ~ 2025-07
- 約 7000+ 筆數據
- **影響**: 無法進行長期趨勢分析

**應對**:
```javascript
// 在所有 AI 回答中加入數據範圍說明
const SYSTEM_PROMPT = `
你是法律 AI 助手。

重要限制:
- 你只能訪問 2025 年 6-7 月的判決書數據 (約 7000+ 筆)
- 所有分析結果僅基於這兩個月的數據
- 不要承諾長期趨勢預測
- 在回答中明確說明數據範圍

範例回答:
"根據 2025 年 6-7 月的數據分析,王婉如法官在 37 筆交通案件中..."
`;
```

---

### **7.2 Elasticsearch Mapping 優勢** ✅

**發現 2: 超級豐富的 AI 分析欄位**

您的 Elasticsearch mapping 包含非常豐富的 AI 分析欄位:
- `position_based_analysis` - 多視角分析
- `citation_analysis` - 引用法條詳細分析
- `legal_issues` - 法律爭議點
- 多個向量欄位支持語意搜尋

**優勢**:
- ✅ 可以進行深度案件分析
- ✅ 可以提取成功/失敗策略
- ✅ 可以進行法條引用分析
- ✅ 可以進行語意相似案件搜尋

**建議**:
- 充分利用這些欄位
- 設計工具時優先使用這些豐富的數據
- 在 AI 回答中展示這些深度分析

---

### **7.3 當前架構限制** 🔴

**發現 3: 硬編碼的意圖識別**

當前的意圖識別只能識別 4 種固定意圖:
```javascript
// routes/mcp.js 第 36 行
"intent": "search_cases" | "analyze_judge" | "compare_judges" | "unknown"
```

**問題**:
- 無法處理複雜組合需求
- 無法進行多步驟推理
- 每個新需求都要修改代碼

**解決方案**: OpenAI Function Calling

---

### **7.4 MCP 工具限制** 🔴

**發現 4: 工具無法組合**

當前的 MCP 工具是獨立的,無法互相調用:
```python
# lawsowl_mcp.py
@mcp.tool()
async def search_judgments(params: SearchParams) -> str:
    # 只能搜尋,無法統計

@mcp.tool()
async def analyze_judge(params: JudgeAnalysisParams) -> str:
    # 只能分析,無法比較
```

**問題**:
- 無法實現 "先搜尋,再統計" 的組合邏輯
- 每個工具都要重複實現相似功能

**解決方案**: 
- 保留 MCP 工具負責數據獲取
- 新增本地函數負責數據處理
- 由 OpenAI Function Calling 組合調用

---

### **7.5 成本考量** 💰

**發現 5: GPT-4 調用成本**

**GPT-4o 定價**:
- Input: $2.50 / 1M tokens
- Output: $10.00 / 1M tokens

**預估**:
- 單次對話: 約 6000 tokens (3 輪工具調用)
- 成本: ~$0.05 / 次
- 月度 (1000 次): ~$50

**優化策略**:
1. 簡單查詢使用 GPT-4o-mini ($0.15/$0.60 per 1M tokens)
2. 限制最大工具調用次數 (10 次)
3. 緩存常見查詢結果 (5 分鐘)
4. 通過積分機制轉嫁成本給用戶

---

## **8. 實作步驟**

### **8.1 Step 1: 新增 MCP 工具**

**目標**: 擴展 MCP Server,新增 3 個核心工具

**文件**: `d:\esmcp\lawsowl_mcp.py`

**新增工具 1: get_citation_analysis**

```python
class CitationAnalysisParams(BaseModel):
    """引用法條分析參數"""
    judge_name: str = Field(description="法官姓名")
    case_type: Optional[str] = Field(default=None, description="案由類型")
    limit: int = Field(default=50, ge=1, le=200, description="分析的判決書數量")

@mcp.tool()
async def get_citation_analysis(params: CitationAnalysisParams) -> str:
    """
    分析法官引用的法條
    
    Returns:
        JSON 格式的法條分析結果,包含:
        - 最常引用的法條 (TOP 10)
        - 每個法條的引用次數
        - 引用上下文
    """
    # 構建查詢
    must_clauses = [
        {"match_all": {}},
        {"term": {"judges": params.judge_name}}
    ]
    
    if params.case_type:
        must_clauses.append({
            "multi_match": {
                "query": params.case_type,
                "fields": ["JTITLE"]
            }
        })
    
    query = {
        "size": params.limit,
        "query": {"bool": {"must": must_clauses}},
        "_source": ["JID", "JDATE", "JTITLE", "citations", "citation_analysis"],
        "sort": [{"JDATE": {"order": "desc"}}]
    }
    
    result = await execute_es_query(query)
    if not result:
        return json.dumps({"error": "查詢失敗"}, ensure_ascii=False)
    
    hits = result.get("hits", {}).get("hits", [])
    
    # 統計法條引用
    citation_counts = {}
    citation_contexts = {}
    
    for hit in hits:
        source = hit["_source"]
        citations = source.get("citations", [])
        citation_analysis = source.get("citation_analysis", [])
        
        for citation in citations:
            citation_counts[citation] = citation_counts.get(citation, 0) + 1
            
            # 提取引用上下文
            if citation not in citation_contexts:
                citation_contexts[citation] = []
            
            for analysis in citation_analysis:
                if analysis.get("citation") == citation:
                    for occurrence in analysis.get("occurrences", []):
                        citation_contexts[citation].append({
                            "case_id": source.get("JID"),
                            "reason": occurrence.get("reason", "")
                        })
    
    # 排序並取 TOP 10
    top_citations = sorted(
        citation_counts.items(),
        key=lambda x: x[1],
        reverse=True
    )[:10]
    
    return json.dumps({
        "法官": params.judge_name,
        "分析案件數": len(hits),
        "TOP_10_法條": [
            {
                "法條": citation,
                "引用次數": count,
                "引用上下文": citation_contexts.get(citation, [])[:3]  # 只返回前 3 個上下文
            }
            for citation, count in top_citations
        ]
    }, ensure_ascii=False, indent=2)
```

**測試**:
```bash
cd d:\esmcp
python -c "
import asyncio
from lawsowl_mcp import get_citation_analysis, CitationAnalysisParams

async def test():
    params = CitationAnalysisParams(judge_name='王婉如', limit=50)
    result = await get_citation_analysis(params)
    print(result)

asyncio.run(test())
"
```

---

**新增工具 2: get_case_details**

```python
class CaseDetailsParams(BaseModel):
    """案件詳情參數"""
    case_ids: List[str] = Field(description="案件 ID 列表")
    include_fields: Optional[List[str]] = Field(
        default=None,
        description="要包含的欄位列表,如果為 None 則返回所有欄位"
    )

@mcp.tool()
async def get_case_details(params: CaseDetailsParams) -> str:
    """
    獲取案件詳細資訊
    
    支持批量查詢,可以指定返回的欄位
    """
    query = {
        "size": len(params.case_ids),
        "query": {
            "terms": {"JID.keyword": params.case_ids}
        }
    }
    
    if params.include_fields:
        query["_source"] = params.include_fields
    
    result = await execute_es_query(query)
    if not result:
        return json.dumps({"error": "查詢失敗"}, ensure_ascii=False)
    
    hits = result.get("hits", {}).get("hits", [])
    cases = [hit["_source"] for hit in hits]
    
    return json.dumps({
        "總數": len(cases),
        "案件": cases
    }, ensure_ascii=False, indent=2)
```

---

**新增工具 3: get_perspective_analysis**

```python
class PerspectiveAnalysisParams(BaseModel):
    """立場分析參數"""
    judge_name: str = Field(description="法官姓名")
    perspective: str = Field(
        description="視角類型",
        enum=["plaintiff", "defendant", "agency", "citizen"]
    )
    verdict_type: Optional[str] = Field(default=None, description="判決結果類型")
    limit: int = Field(default=20, ge=1, le=100, description="分析的判決書數量")

@mcp.tool()
async def get_perspective_analysis(params: PerspectiveAnalysisParams) -> str:
    """
    獲取特定視角的分析
    
    Returns:
        JSON 格式的視角分析結果,包含:
        - 成功策略
        - 失敗策略
        - 關鍵教訓
    """
    # 構建查詢
    must_clauses = [
        {"match_all": {}},
        {"term": {"judges": params.judge_name}}
    ]
    
    if params.verdict_type:
        must_clauses.append({
            "term": {"verdict_type": params.verdict_type}
        })
    
    # 映射視角到欄位
    perspective_field_map = {
        "plaintiff": "position_based_analysis.plaintiff_perspective",
        "defendant": "position_based_analysis.defendant_perspective",
        "agency": "position_based_analysis.agency_perspective",
        "citizen": "position_based_analysis.citizen_perspective"
    }
    
    perspective_field = perspective_field_map.get(params.perspective)
    
    query = {
        "size": params.limit,
        "query": {"bool": {"must": must_clauses}},
        "_source": ["JID", "JDATE", "JTITLE", "verdict_type", perspective_field],
        "sort": [{"JDATE": {"order": "desc"}}]
    }
    
    result = await execute_es_query(query)
    if not result:
        return json.dumps({"error": "查詢失敗"}, ensure_ascii=False)
    
    hits = result.get("hits", {}).get("hits", [])
    
    # 提取視角分析
    analyses = []
    for hit in hits:
        source = hit["_source"]
        perspective_data = source.get("position_based_analysis", {}).get(
            f"{params.perspective}_perspective",
            {}
        )
        
        if perspective_data:
            analyses.append({
                "案件ID": source.get("JID"),
                "判決日期": source.get("JDATE"),
                "案由": source.get("JTITLE"),
                "判決結果": source.get("verdict_type"),
                "分析": perspective_data
            })
    
    return json.dumps({
        "法官": params.judge_name,
        "視角": params.perspective,
        "分析案件數": len(analyses),
        "案件分析": analyses
    }, ensure_ascii=False, indent=2)
```

---

### **8.2 Step 2: 實作本地計算函數**

**目標**: 實作數據處理函數,不需要調用 MCP

**文件**: `utils/ai-agent-functions.js` (新建)

```javascript
/**
 * 計算判決統計數據
 */
export function calculateVerdictStatistics(judgments, analysisType, verdictType = null) {
  const total = judgments.length;
  
  if (analysisType === 'verdict_rate' && verdictType) {
    // 計算特定判決結果的比率
    const matches = judgments.filter(j => j.verdict_type === verdictType).length;
    return {
      total,
      matches,
      rate: ((matches / total) * 100).toFixed(1) + "%",
      verdict_type: verdictType
    };
  }
  
  if (analysisType === 'verdict_distribution') {
    // 計算判決結果分布
    const distribution = {};
    judgments.forEach(j => {
      const verdict = j.verdict_type || '未知';
      distribution[verdict] = (distribution[verdict] || 0) + 1;
    });
    
    return {
      total,
      distribution: Object.entries(distribution)
        .map(([verdict, count]) => ({
          verdict_type: verdict,
          count,
          percentage: ((count / total) * 100).toFixed(1) + "%"
        }))
        .sort((a, b) => b.count - a.count)
    };
  }
  
  if (analysisType === 'case_distribution') {
    // 計算案由分布
    const distribution = {};
    judgments.forEach(j => {
      const caseType = j.JTITLE || '未知';
      distribution[caseType] = (distribution[caseType] || 0) + 1;
    });
    
    return {
      total,
      distribution: Object.entries(distribution)
        .map(([case_type, count]) => ({
          case_type,
          count,
          percentage: ((count / total) * 100).toFixed(1) + "%"
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)  // TOP 10
    };
  }
  
  if (analysisType === 'all') {
    // 返回所有統計
    return {
      verdict_rate: verdictType ? calculateVerdictStatistics(judgments, 'verdict_rate', verdictType) : null,
      verdict_distribution: calculateVerdictStatistics(judgments, 'verdict_distribution'),
      case_distribution: calculateVerdictStatistics(judgments, 'case_distribution')
    };
  }
  
  return { error: '不支持的分析類型' };
}

/**
 * 提取 TOP 引用法條
 */
export function extractTopCitations(judgments, topN = 10) {
  const citationCounts = {};
  
  judgments.forEach(j => {
    const citations = j.citations || [];
    citations.forEach(citation => {
      citationCounts[citation] = (citationCounts[citation] || 0) + 1;
    });
  });
  
  return Object.entries(citationCounts)
    .map(([citation, count]) => ({
      citation,
      count,
      percentage: ((count / judgments.length) * 100).toFixed(1) + "%"
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}

/**
 * 分析金額趨勢
 */
export function analyzeAmountTrends(judgments) {
  const civilCases = judgments.filter(j => 
    j.key_metrics?.civil_metrics?.claim_amount !== undefined
  );
  
  if (civilCases.length === 0) {
    return { error: '沒有包含金額資訊的民事案件' };
  }
  
  const claimAmounts = civilCases.map(j => j.key_metrics.civil_metrics.claim_amount);
  const grantedAmounts = civilCases.map(j => j.key_metrics.civil_metrics.granted_amount || 0);
  
  const avgClaim = claimAmounts.reduce((a, b) => a + b, 0) / claimAmounts.length;
  const avgGranted = grantedAmounts.reduce((a, b) => a + b, 0) / grantedAmounts.length;
  const grantRate = (avgGranted / avgClaim * 100).toFixed(1);
  
  return {
    total_cases: civilCases.length,
    average_claim_amount: Math.round(avgClaim),
    average_granted_amount: Math.round(avgGranted),
    grant_rate: grantRate + "%",
    max_claim: Math.max(...claimAmounts),
    min_claim: Math.min(...claimAmounts),
    max_granted: Math.max(...grantedAmounts)
  };
}

/**
 * 比較法官判決分布
 */
export function compareVerdictDistributions(judge1Data, judge2Data) {
  const judge1Dist = calculateVerdictStatistics(judge1Data.judgments, 'verdict_distribution');
  const judge2Dist = calculateVerdictStatistics(judge2Data.judgments, 'verdict_distribution');
  
  return {
    judge1: {
      name: judge1Data.name,
      total: judge1Dist.total,
      distribution: judge1Dist.distribution
    },
    judge2: {
      name: judge2Data.name,
      total: judge2Dist.total,
      distribution: judge2Dist.distribution
    },
    comparison: {
      // 比較原告勝訴率
      plaintiff_win_rate_diff: calculateRateDiff(
        judge1Dist.distribution,
        judge2Dist.distribution,
        '原告勝訴'
      )
    }
  };
}

function calculateRateDiff(dist1, dist2, verdictType) {
  const rate1 = dist1.find(d => d.verdict_type === verdictType)?.percentage || "0%";
  const rate2 = dist2.find(d => d.verdict_type === verdictType)?.percentage || "0%";
  
  const num1 = parseFloat(rate1);
  const num2 = parseFloat(rate2);
  
  return {
    judge1_rate: rate1,
    judge2_rate: rate2,
    difference: (num1 - num2).toFixed(1) + "%"
  };
}
```

---

### **8.3 Step 3: 定義工具列表**

**目標**: 定義 OpenAI Function Calling 的工具列表

**文件**: `utils/ai-agent-tools.js` (新建)

```javascript
export const AGENT_TOOLS = [
  // 工具 1: 搜尋法官判決書
  {
    type: "function",
    function: {
      name: "search_judgments_by_judge",
      description: "搜尋特定法官的判決書,支持按案由、判決結果、時間範圍篩選。這是獲取判決書數據的主要工具。",
      parameters: {
        type: "object",
        properties: {
          judge_name: {
            type: "string",
            description: "法官姓名,必填"
          },
          case_type: {
            type: "string",
            description: "案由關鍵字,如: 交通、侵權、債務、詐欺、損害賠償。可選。"
          },
          verdict_type: {
            type: "string",
            description: "判決結果類型。可選。",
            enum: ["原告勝訴", "原告敗訴", "部分勝訴部分敗訴", "上訴駁回", "原判決廢棄改判"]
          },
          limit: {
            type: "number",
            description: "返回數量,預設 50,最大 100",
            default: 50
          }
        },
        required: ["judge_name"]
      }
    }
  },
  
  // 工具 2: 計算統計數據
  {
    type: "function",
    function: {
      name: "calculate_verdict_statistics",
      description: "計算判決統計數據,包括勝訴率、案由分布、判決結果分布。需要先使用 search_judgments_by_judge 獲取判決書數據。",
      parameters: {
        type: "object",
        properties: {
          judgments: {
            type: "array",
            description: "判決書列表,從 search_judgments_by_judge 獲取"
          },
          analysis_type: {
            type: "string",
            description: "分析類型",
            enum: ["verdict_rate", "case_distribution", "verdict_distribution", "all"]
          },
          verdict_type: {
            type: "string",
            description: "要計算的判決結果類型 (僅當 analysis_type 為 verdict_rate 時需要)",
            enum: ["原告勝訴", "原告敗訴", "部分勝訴部分敗訴"]
          }
        },
        required: ["judgments", "analysis_type"]
      }
    }
  },
  
  // 工具 3: 引用法條分析
  {
    type: "function",
    function: {
      name: "get_citation_analysis",
      description: "分析法官引用的法條,返回最常引用的法條及其引用上下文。這個工具直接從 MCP Server 獲取數據。",
      parameters: {
        type: "object",
        properties: {
          judge_name: {
            type: "string",
            description: "法官姓名"
          },
          case_type: {
            type: "string",
            description: "案由類型,可選"
          },
          limit: {
            type: "number",
            description: "分析的判決書數量,預設 50",
            default: 50
          }
        },
        required: ["judge_name"]
      }
    }
  },
  
  // 工具 4: 提取 TOP 引用法條
  {
    type: "function",
    function: {
      name: "extract_top_citations",
      description: "從判決書列表中提取最常引用的法條。需要先使用 search_judgments_by_judge 獲取判決書數據。",
      parameters: {
        type: "object",
        properties: {
          judgments: {
            type: "array",
            description: "判決書列表"
          },
          top_n: {
            type: "number",
            description: "返回 TOP N 法條,預設 10",
            default: 10
          }
        },
        required: ["judgments"]
      }
    }
  },
  
  // 工具 5: 金額分析
  {
    type: "function",
    function: {
      name: "analyze_amount_trends",
      description: "分析民事案件的金額趨勢,包括請求金額 vs 判賠金額。需要先使用 search_judgments_by_judge 獲取判決書數據。",
      parameters: {
        type: "object",
        properties: {
          judgments: {
            type: "array",
            description: "判決書列表"
          }
        },
        required: ["judgments"]
      }
    }
  },
  
  // 工具 6: 比較法官
  {
    type: "function",
    function: {
      name: "compare_judges",
      description: "比較多位法官的判決傾向。需要先分別使用 search_judgments_by_judge 獲取每位法官的判決書數據。",
      parameters: {
        type: "object",
        properties: {
          judge1_data: {
            type: "object",
            description: "第一位法官的數據,包含 name 和 judgments",
            properties: {
              name: { type: "string" },
              judgments: { type: "array" }
            }
          },
          judge2_data: {
            type: "object",
            description: "第二位法官的數據,包含 name 和 judgments",
            properties: {
              name: { type: "string" },
              judgments: { type: "array" }
            }
          }
        },
        required: ["judge1_data", "judge2_data"]
      }
    }
  },
  
  // 工具 7: 立場分析
  {
    type: "function",
    function: {
      name: "get_perspective_analysis",
      description: "獲取特定視角的分析,包括成功策略、失敗策略、關鍵教訓。這個工具直接從 MCP Server 獲取數據。",
      parameters: {
        type: "object",
        properties: {
          judge_name: {
            type: "string",
            description: "法官姓名"
          },
          perspective: {
            type: "string",
            description: "視角類型",
            enum: ["plaintiff", "defendant", "agency", "citizen"]
          },
          verdict_type: {
            type: "string",
            description: "判決結果類型,可選"
          },
          limit: {
            type: "number",
            description: "分析的判決書數量,預設 20",
            default: 20
          }
        },
        required: ["judge_name", "perspective"]
      }
    }
  }
];

// System Prompt
export const SYSTEM_PROMPT = `你是台灣法律 AI 助手,專精於法官判決分析。

你可以調用以下工具來回答用戶問題:
1. search_judgments_by_judge - 搜尋法官判決書
2. calculate_verdict_statistics - 計算統計數據
3. get_citation_analysis - 分析引用法條
4. extract_top_citations - 提取 TOP 法條
5. analyze_amount_trends - 分析金額趨勢
6. compare_judges - 比較法官
7. get_perspective_analysis - 立場分析

重要限制:
- 你只能訪問 2025 年 6-7 月的判決書數據 (約 7000+ 筆)
- 所有分析結果僅基於這兩個月的數據
- 不要承諾長期趨勢預測
- 在回答中明確說明數據範圍

回答格式:
- 使用繁體中文
- 語氣專業但易懂
- 提供具體數據支持
- 明確說明數據來源和限制

範例回答:
"根據 2025 年 6-7 月的數據分析,王婉如法官在 37 筆交通案件中,原告勝訴 15 筆,勝訴率為 40.5%。這表示在交通案件中,原告的勝訴機會略低於一半。

注意: 本分析僅基於近兩個月的數據,僅供參考。"
`;
```

---

### **8.4 Step 4: 實作 AI Agent 控制器**

**目標**: 實作核心的 AI Agent 邏輯

**文件**: `controllers/ai-agent-controller.js` (新建)

```javascript
import OpenAI from 'openai';
import { AGENT_TOOLS, SYSTEM_PROMPT } from '../utils/ai-agent-tools.js';
import {
  calculateVerdictStatistics,
  extractTopCitations,
  analyzeAmountTrends,
  compareVerdictDistributions
} from '../utils/ai-agent-functions.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// MCP Server URL
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'https://esmcp.onrender.com';

/**
 * 調用 MCP 工具
 */
async function callMCPTool(toolName, params) {
  try {
    const response = await fetch(`${MCP_SERVER_URL}/mcp/v1/call_tool`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: { params }
        }
      })
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    // 解析 SSE 格式的響應
    const content = data.result?.content?.[0]?.text || '{}';
    return JSON.parse(content);
  } catch (error) {
    console.error(`MCP 工具調用失敗 (${toolName}):`, error);
    return { error: error.message };
  }
}

/**
 * 執行函數調用
 */
async function executeFunction(functionName, functionArgs) {
  console.log(`執行函數: ${functionName}`, functionArgs);

  try {
    switch (functionName) {
      // MCP 工具
      case 'search_judgments_by_judge':
        return await callMCPTool('search_judgments', {
          query: functionArgs.case_type || '*',
          judge_name: functionArgs.judge_name,
          verdict_type: functionArgs.verdict_type,
          limit: functionArgs.limit || 50
        });

      case 'get_citation_analysis':
        return await callMCPTool('get_citation_analysis', functionArgs);

      case 'get_perspective_analysis':
        return await callMCPTool('get_perspective_analysis', functionArgs);

      // 本地函數
      case 'calculate_verdict_statistics':
        return calculateVerdictStatistics(
          functionArgs.judgments,
          functionArgs.analysis_type,
          functionArgs.verdict_type
        );

      case 'extract_top_citations':
        return extractTopCitations(
          functionArgs.judgments,
          functionArgs.top_n || 10
        );

      case 'analyze_amount_trends':
        return analyzeAmountTrends(functionArgs.judgments);

      case 'compare_judges':
        return compareVerdictDistributions(
          functionArgs.judge1_data,
          functionArgs.judge2_data
        );

      default:
        return { error: `未知的函數: ${functionName}` };
    }
  } catch (error) {
    console.error(`函數執行失敗 (${functionName}):`, error);
    return { error: error.message };
  }
}

/**
 * AI Agent 主控制器
 */
export async function chatWithAgent(req, res) {
  const { question, conversationHistory = [] } = req.body;
  const userId = req.user?.id;

  if (!question) {
    return res.status(400).json({ error: '問題不能為空' });
  }

  try {
    // 構建對話歷史
    const messages = [
      {
        role: "system",
        content: SYSTEM_PROMPT
      },
      ...conversationHistory,
      {
        role: "user",
        content: question
      }
    ];

    // 第一次調用 OpenAI
    let response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messages,
      tools: AGENT_TOOLS,
      tool_choice: "auto",
      temperature: 0.7
    });

    // 循環處理工具調用
    let iterationCount = 0;
    const MAX_ITERATIONS = 10; // 防止無限循環
    const toolCallsLog = []; // 記錄工具調用

    while (
      response.choices[0].finish_reason === "tool_calls" &&
      iterationCount < MAX_ITERATIONS
    ) {
      const toolCalls = response.choices[0].message.tool_calls;
      messages.push(response.choices[0].message);

      // 執行每個工具調用
      for (const toolCall of toolCalls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);

        // 記錄工具調用
        toolCallsLog.push({
          iteration: iterationCount + 1,
          function: functionName,
          arguments: functionArgs
        });

        // 執行函數
        const result = await executeFunction(functionName, functionArgs);

        // 將結果返回給 GPT
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        });
      }

      // 再次調用 OpenAI
      response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: messages,
        tools: AGENT_TOOLS,
        tool_choice: "auto",
        temperature: 0.7
      });

      iterationCount++;
    }

    // 檢查是否達到最大迭代次數
    if (iterationCount >= MAX_ITERATIONS) {
      return res.status(500).json({
        error: '達到最大工具調用次數限制',
        toolCallsLog
      });
    }

    // 返回最終回答
    const finalAnswer = response.choices[0].message.content;

    res.json({
      answer: finalAnswer,
      conversationHistory: messages,
      toolCallsCount: iterationCount,
      toolCallsLog: toolCallsLog,
      usage: response.usage
    });

  } catch (error) {
    console.error('AI Agent 錯誤:', error);
    res.status(500).json({
      error: '處理請求時發生錯誤',
      details: error.message
    });
  }
}
```

---

### **8.5 Step 5: 新增 AI Agent 路由**

**目標**: 新增 API 端點

**文件**: `routes/ai-agent.js` (新建)

```javascript
import express from 'express';
import { chatWithAgent } from '../controllers/ai-agent-controller.js';
import { verifyToken } from '../middleware/auth.js';
import { checkAndDeductCredits } from '../middleware/credit.js';

const router = express.Router();

/**
 * POST /api/ai-agent/chat
 * AI Agent 對話端點
 *
 * 需要身份驗證
 * 消耗 5 積分
 */
router.post(
  '/chat',
  verifyToken,
  checkAndDeductCredits(5), // 每次對話消耗 5 積分
  chatWithAgent
);

export default router;
```

**更新**: `routes/index.js`

```javascript
// 新增這一行
import aiAgentRoutes from './ai-agent.js';

// 在路由配置中新增
router.use('/ai-agent', aiAgentRoutes);
```

---

### **8.6 Step 6: 前端整合**

**目標**: 新增前端 Hook 和更新對話組件

**文件**: `lawsowl/src/hooks/useAIAgent.js` (新建)

```javascript
import { useState, useCallback } from 'react';

export const useAIAgent = () => {
  const [conversationHistory, setConversationHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * 發送問題給 AI Agent
   */
  const askAgent = useCallback(async (question) => {
    setIsLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');

      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/ai-agent/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          question,
          conversationHistory
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '請求失敗');
      }

      const data = await response.json();

      // 更新對話歷史
      setConversationHistory(data.conversationHistory);

      return {
        answer: data.answer,
        toolCallsCount: data.toolCallsCount,
        toolCallsLog: data.toolCallsLog,
        usage: data.usage
      };

    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [conversationHistory]);

  /**
   * 清除對話歷史
   */
  const clearHistory = useCallback(() => {
    setConversationHistory([]);
    setError(null);
  }, []);

  return {
    askAgent,
    clearHistory,
    conversationHistory,
    isLoading,
    error
  };
};
```

**更新**: `lawsowl/src/components/mcp/JudgeMCPChat.js`

```javascript
// 在文件頂部新增 import
import { useAIAgent } from '../../hooks/useAIAgent';

// 在組件內部
const { askAgent, clearHistory, isLoading: agentLoading } = useAIAgent();

// 修改 handleFollowUpQuestion 函數
const handleFollowUpQuestion = async (question) => {
  if (!question.trim()) return;

  // 添加用戶消息
  addMessage(question, 'user');
  setFollowUpQuestion('');

  try {
    // 調用 AI Agent
    const result = await askAgent(question);

    // 添加 AI 回答
    addMessage(result.answer, 'assistant', {
      toolCallsCount: result.toolCallsCount,
      toolCallsLog: result.toolCallsLog
    });

  } catch (error) {
    console.error('AI Agent 錯誤:', error);
    addMessage(
      `抱歉,處理您的問題時發生錯誤: ${error.message}`,
      'assistant'
    );
  }
};
```

---

## **9. 測試與部署**

### **9.1 測試用例**

**簡單查詢**:
```
Q: "王婉如法官有多少筆判決?"
預期: 調用 search_judgments_by_judge,返回總數

Q: "列出原告勝訴的案件"
預期: 調用 search_judgments_by_judge (verdict_type="原告勝訴")
```

**統計分析**:
```
Q: "王婉如法官的原告勝訴率是多少?"
預期:
1. 調用 search_judgments_by_judge
2. 調用 calculate_verdict_statistics (analysis_type="verdict_rate")
3. 返回勝訴率

Q: "交通案件的勝訴率如何?"
預期:
1. 調用 search_judgments_by_judge (case_type="交通")
2. 調用 calculate_verdict_statistics
3. 返回統計結果
```

**深度分析**:
```
Q: "王婉如法官在原告勝訴的案件中,最常引用哪些法條?"
預期:
1. 調用 search_judgments_by_judge (verdict_type="原告勝訴")
2. 調用 extract_top_citations
3. 返回 TOP 10 法條

Q: "侵權案件的平均判賠金額是多少?"
預期:
1. 調用 search_judgments_by_judge (case_type="侵權")
2. 調用 analyze_amount_trends
3. 返回金額統計
```

**比較分析**:
```
Q: "比較王婉如和陳玟珍兩位法官的判決傾向"
預期:
1. 調用 search_judgments_by_judge (judge_name="王婉如")
2. 調用 search_judgments_by_judge (judge_name="陳玟珍")
3. 調用 compare_judges
4. 返回比較結果
```

---

### **9.2 部署步驟**

**Step 1: 部署 MCP Server**
```bash
cd d:\esmcp
git add lawsowl_mcp.py
git commit -m "feat: 新增 citation_analysis 和 perspective_analysis 工具"
git push origin main

# Render.com 會自動部署
```

**Step 2: 部署後端**
```bash
cd d:\court_data\courtDataAPI
git add .
git commit -m "feat: 實作 OpenAI Function Calling AI Agent"
git push origin main

# Render.com 會自動部署
```

**Step 3: 部署前端**
```bash
cd d:\court_data\frontend-court-search-web
git add .
git commit -m "feat: 整合 AI Agent 到對話組件"
git push origin main

# Vercel 會自動部署
```

---

## **10. 常見問題**

### **Q1: OpenAI Function Calling 和 MCP 有什麼區別?**

**A**:
- **OpenAI Function Calling**: AI 決策層,決定調用哪些工具
- **MCP**: 工具提供層,提供標準化的工具接口
- 兩者互補,OpenAI 調用 MCP 工具

---

### **Q2: 為什麼要保留 MCP 架構?**

**A**:
- ✅ 職責分離: MCP 負責數據訪問,後端負責業務邏輯
- ✅ 可重用: MCP 工具可以被其他系統調用
- ✅ 標準化: MCP 是標準協議,易於維護和擴展

---

### **Q3: 成本會不會太高?**

**A**:
- 單次對話約 $0.05
- 月度 1000 次約 $50
- 可以通過積分機制轉嫁給用戶
- 簡單查詢可以使用 GPT-4o-mini 降低成本

---

### **Q4: 如何處理數據限制?**

**A**:
- 在 System Prompt 中明確說明數據範圍
- 在所有回答中加入數據來源說明
- 不承諾長期趨勢預測
- 聚焦短期分析和深度分析

---

### **Q5: 如何優化性能?**

**A**:
- 緩存常見查詢結果 (5 分鐘)
- 並行調用多個 MCP 工具
- 限制最大工具調用次數 (10 次)
- 使用 GPT-4o-mini 處理簡單查詢

---

## **📝 總結**

### **核心優勢**

1. **真正的 AI**: 不再是硬編碼的 if-else,而是 AI 自主決策
2. **無限可能**: 可以處理任意複雜的問題組合
3. **易於擴展**: 只需添加新工具定義,無需修改核心邏輯
4. **保留 MCP**: 職責分離,可重用,標準化

### **關鍵挑戰**

1. **數據限制**: 只有 2 個月的判決書
2. **成本控制**: GPT-4 調用成本需要優化
3. **性能優化**: 多輪工具調用可能較慢

### **下一步行動**

1. **Week 1-2**: 實作 MCP 工具和本地函數
2. **Week 2-3**: 實作 AI Agent 控制器
3. **Week 3-4**: 前端整合和測試
4. **Week 4-5**: 優化和部署

---

**祝您實作順利!** 🚀

如有任何問題,請參考:
- OpenAI Function Calling 官方文檔
- MCP 官方文檔
- 本專案的 MCP_README.md

---

**文件版本**: v1.0
**最後更新**: 2025-10-03
**作者**: AI Agent Team

