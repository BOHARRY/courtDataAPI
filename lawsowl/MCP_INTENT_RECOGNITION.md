# 🧠 MCP 意圖識別功能實作

> **實作日期**: 2025-10-02  
> **功能**: AI 意圖識別 + MCP 智能調用  
> **目標**: 支持案由篩選的智能問答

---

## 📋 功能概述

### **核心能力**

用戶可以自然語言提問,系統自動識別意圖並調用對應的 MCP 工具:

```
用戶: "這位法官對於交通判決的最近20筆判斷狀況"
    ↓
[AI 意圖識別]
    ↓
{
  "intent": "search_cases",
  "judge_name": "王婉如",
  "case_type": "交通",
  "limit": 20
}
    ↓
[MCP search_judgments]
    ↓
返回 20 筆交通相關判決
```

---

## 🏗️ 架構設計

### **數據流程**

```
前端 (JudgeMCPChat)
    ↓
parseIntent() ← 調用後端 API
    ↓
Backend (/api/mcp/parse-intent)
    ↓
OpenAI GPT-4o-mini ← 意圖識別
    ↓
返回結構化意圖
    ↓
smartSearchJudgments() ← 調用 MCP
    ↓
MCP Server (search_judgments)
    ↓
Elasticsearch 查詢
    ↓
返回判決書結果
```

---

## 🔧 實作細節

### **1. 後端 API - 意圖識別**

**文件**: `routes/mcp.js`

**端點**: `POST /api/mcp/parse-intent`

**功能**: 使用 OpenAI GPT-4o-mini 識別用戶意圖

**請求**:
```json
{
  "question": "這位法官對於交通判決的最近20筆判斷狀況",
  "currentJudge": {
    "name": "王婉如"
  }
}
```

**響應**:
```json
{
  "success": true,
  "intent": {
    "intent": "search_cases",
    "judge_name": "王婉如",
    "case_type": "交通",
    "limit": 20,
    "additional_filters": {}
  }
}
```

**支持的意圖類型**:
- `search_cases` - 搜尋判決書
- `analyze_judge` - 分析法官
- `compare_judges` - 比較法官 (未實作)
- `unknown` - 未知意圖

**案由關鍵字映射**:
- "交通事故"、"車禍" → "交通"
- "侵權行為" → "侵權"
- "債務"、"清償債務" → "債務"
- "詐欺"、"詐騙" → "詐欺"
- "損害賠償" → "損害賠償"

---

### **2. 前端 Hook - 智能搜尋**

**文件**: `lawsowl/src/hooks/useMCPJudgeAnalysis.js`

**新增方法**:

#### **parseIntent()**
```javascript
const parseIntent = useCallback(async (question, currentJudge = null) => {
  // 調用後端 API 識別意圖
  const response = await fetch(buildApiUrl('/mcp/parse-intent'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ question, currentJudge })
  });
  
  const result = await response.json();
  return result.intent;
}, [getIdToken]);
```

#### **smartSearchJudgments()**
```javascript
const smartSearchJudgments = useCallback(async (judgeName, caseType = null, limit = 20) => {
  // 構建搜尋查詢
  const query = caseType ? `${judgeName} ${caseType}` : judgeName;
  
  // 調用 MCP search_judgments 工具
  const mcpRequest = {
    jsonrpc: "2.0",
    id: Date.now(),
    method: "tools/call",
    params: {
      name: "search_judgments",
      arguments: {
        params: {
          query: query,
          limit: limit
        }
      }
    }
  };
  
  // ... MCP 調用邏輯
}, []);
```

---

### **3. 對話組件 - 意圖處理**

**文件**: `lawsowl/src/components/mcp/JudgeMCPChat.js`

**修改**: `handleFollowUpQuestion()`

```javascript
const handleFollowUpQuestion = async (question) => {
  // 步驟 1: 識別意圖
  const intent = await parseIntent(question, currentJudge);
  
  // 步驟 2: 根據意圖調用對應工具
  if (intent.intent === 'search_cases') {
    const judgeName = intent.judge_name || currentJudge.name;
    const caseType = intent.case_type;
    const limit = intent.limit || 20;
    
    const searchResult = await smartSearchJudgments(judgeName, caseType, limit);
    const formattedResult = formatSearchResults(searchResult, caseType, limit);
    addMessage(formattedResult, 'assistant', searchResult);
  }
  // ... 其他意圖處理
};
```

**新增**: `formatSearchResults()`

格式化搜尋結果,顯示判決書列表。

---

## 🎯 使用範例

### **範例 1: 基本案由搜尋**

**用戶**: "這位法官的交通案件判決如何?"

**系統處理**:
1. 識別意圖: `search_cases`
2. 提取案由: `交通`
3. 調用 MCP: `search_judgments(query="王婉如 交通", limit=20)`
4. 返回結果

**顯示**:
```
📄 搜尋結果

🔍 案由: 交通
✅ 找到 15 筆判決書,顯示前 15 筆

**1. 110,台上,1234**
   📅 日期: 20211015
   📋 案由: 過失傷害
   ⚖️ 結果: 原告勝訴
   👨‍⚖️ 法官: 王婉如
   
**2. 110,台上,5678**
   ...
```

---

### **範例 2: 指定數量**

**用戶**: "顯示最近20筆侵權判決"

**系統處理**:
1. 識別意圖: `search_cases`
2. 提取案由: `侵權`
3. 提取數量: `20`
4. 調用 MCP: `search_judgments(query="王婉如 侵權", limit=20)`

---

### **範例 3: 無案由搜尋**

**用戶**: "查看這位法官的判決書"

**系統處理**:
1. 識別意圖: `search_cases`
2. 案由: `null`
3. 調用 MCP: `search_judgments(query="王婉如", limit=20)`

---

## ✅ 支持的問法

### **案由搜尋**
```
✅ "這位法官的交通案件判決如何?"
✅ "顯示侵權判決"
✅ "查看債務案件"
✅ "車禍案件的判決"
✅ "詐欺案件有哪些?"
```

### **指定數量**
```
✅ "顯示最近20筆判決"
✅ "查看10筆交通案件"
✅ "給我5個侵權判決"
```

### **組合查詢**
```
✅ "這位法官對於交通判決的最近20筆判斷狀況"
✅ "顯示15筆侵權案件的判決"
```

---

## ❌ 目前限制

### **不支持的功能**

1. **時間範圍** ❌
   ```
   ❌ "最近一年的判決"
   ❌ "2023年的案件"
   ```
   **原因**: 資料庫只有兩個月的判決書

2. **多法官比較** ❌
   ```
   ❌ "比較王婉如和黃建都"
   ```
   **原因**: 未實作比較邏輯

3. **複雜篩選** ❌
   ```
   ❌ "原告勝訴的交通案件"
   ❌ "金額超過100萬的判決"
   ```
   **原因**: MCP 工具不支持複雜篩選

---

## 🚀 部署步驟

### **1. 後端部署**

確保後端已部署並包含新的 `/api/mcp/parse-intent` 端點。

### **2. 前端部署**

```bash
cd lawsowl
npm run build
# 部署到 Vercel
```

### **3. 測試**

訪問: https://frontend-court-search-web.vercel.app/judge-mcp-demo

測試問題:
1. "分析法官王婉如"
2. "這位法官的交通案件判決如何?"
3. "顯示最近20筆侵權判決"

---

## 📊 性能考量

### **OpenAI API 調用**

- **模型**: GPT-4o-mini (便宜、快速)
- **成本**: ~$0.0001 per request
- **延遲**: ~500ms

### **優化建議**

1. **緩存常見意圖** - 減少 API 調用
2. **本地關鍵字匹配** - 簡單問題不調用 AI
3. **批量處理** - 合併多個問題

---

## 🔮 未來擴展

### **短期 (1 週)**

1. **律師查詢** - 整合 `get_lawyer_history` 工具
2. **錯誤提示優化** - 更友好的錯誤訊息
3. **快速問題按鈕** - 預設常見問題

### **中期 (2-4 週)**

4. **對話歷史** - 維護上下文
5. **多輪推理** - 支持複雜問答
6. **可視化圖表** - Chart.js 整合

### **長期 (1-2 月)**

7. **RAG 架構** - 深度判決書分析
8. **多法官比較** - 並行分析
9. **導出報告** - PDF 生成

---

## 📝 更新日誌

### 2025-10-02
- ✅ 實作 AI 意圖識別
- ✅ 新增 `parseIntent()` 方法
- ✅ 新增 `smartSearchJudgments()` 方法
- ✅ 支持案由篩選
- ✅ 支持數量指定

---

**維護者**: LawSowl Development Team  
**版本**: 1.1.0

