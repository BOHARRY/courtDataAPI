# 實施總結: 方案 A (輕量級"交棒") + 方案 1 (自動提取數據)

## 📅 實施日期
2025-10-03

## 🎯 目標
解決 GPT-4o 在計算勝訴率時跳過數據檢索步驟的問題,通過以下兩個方案的組合:
1. **方案 A**: Intent Classifier 作為輕量級"交棒手",提取關鍵資訊
2. **方案 1**: `calculate_verdict_statistics` 函數自動從對話歷史中提取數據

## 🔧 實施內容

### 1. Intent Classifier 增強 (輕量級預處理)

**文件**: `services/intentClassifier.js`

**修改內容**:
- 修改 System Prompt,要求返回 JSON 格式
- 提取關鍵資訊:
  - `question_type`: 問題類型 (勝訴率、列表、法條、判決傾向、金額、其他)
  - `case_type`: 案由關鍵字
  - `verdict_type`: 判決類型
- 修改 `classifyIntent` 函數,解析 JSON 返回
- 增加 `max_tokens` 從 10 → 100 以支持 JSON 返回

**返回格式**:
```javascript
{
  "intent": "legal_analysis",
  "isLegalRelated": true,
  "confidence": "high",
  "extractedInfo": {
    "question_type": "勝訴率",
    "case_type": "損害賠償",
    "verdict_type": "原告勝訴"
  },
  "tokenUsage": { ... }
}
```

**Token 消耗**:
- 之前: ~300 tokens
- 現在: ~500 tokens
- 增加: ~200 tokens (~$0.00003 per request)

---

### 2. AI Agent 控制器增強 (動態注入提取的資訊)

**文件**: `controllers/ai-agent-controller.js`

**修改內容**:
- 從 Intent Classifier 結果中提取 `extractedInfo`
- 動態構建 System Prompt,注入:
  - 法官姓名
  - 問題類型
  - 案由
  - 判決類型
- 根據問題類型提供**建議的工作流程**

**範例 (勝訴率問題)**:
```
🔴 **重要上下文 - 問題預處理結果**

**法官姓名**: 黃麟捷
**問題類型**: 勝訴率
**案由**: 損害賠償
**判決類型**: 原告勝訴

**建議工作流程** (勝訴率計算):
1. [第1輪] 調用 semantic_search_judgments(query="損害賠償", judge_name="黃麟捷", limit=50)
2. [第2輪] 調用 calculate_verdict_statistics(analysis_type="verdict_rate", verdict_type="原告勝訴")
   - ⚠️ **不要傳遞 judgments 參數!** 函數會自動從對話歷史中提取數據
3. [第3輪] 生成回答
```

---

### 3. 本地函數增強 (自動提取數據)

**文件**: `utils/ai-agent-local-functions.js`

**修改內容**:
- 修改 `calculate_verdict_statistics` 函數簽名,接收 `conversationHistory` 參數
- 實現自動數據提取邏輯:
  - 如果沒有 `judgments` 參數,從對話歷史中提取
  - 支持兩種策略:
    1. **無過濾條件**: 使用最近的一個 tool 消息
    2. **有過濾條件** (judge_name 或 case_type): 收集所有 tool 消息,然後過濾
- 支持根據 `judge_name` 和 `case_type` 過濾數據

**核心邏輯**:
```javascript
// 從對話歷史中查找 tool 消息
for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const msg = conversationHistory[i];
    if (msg.role === 'tool') {
        const data = JSON.parse(msg.content);
        if (data['判決書'] && Array.isArray(data['判決書'])) {
            judgments = data['判決書'];
            // 可選: 根據 judge_name 和 case_type 過濾
            break;
        }
    }
}
```

---

### 4. 工具定義更新

**文件**: `utils/ai-agent-tools.js`

**修改內容**:
- 更新 `calculate_verdict_statistics` 工具定義:
  - `judgments` 從 `required` 中移除
  - 添加 `judge_name` 和 `case_type` 參數
  - 更新 description 說明自動提取機制

**新的工具定義**:
```javascript
{
  name: "calculate_verdict_statistics",
  description: "計算判決結果統計。如果沒有提供 judgments 參數,函數會自動從對話歷史中提取最近一次 semantic_search_judgments 或 search_judgments 的結果。",
  parameters: {
    properties: {
      judgments: {
        type: "array",
        description: "[可選] 判決書陣列。如果不提供,函數會自動從對話歷史中提取。"
      },
      analysis_type: { ... },
      verdict_type: { ... },
      judge_name: {
        type: "string",
        description: "[可選] 法官姓名,用於過濾對話歷史中的判決書數據"
      },
      case_type: {
        type: "string",
        description: "[可選] 案由關鍵字,用於過濾對話歷史中的判決書數據"
      }
    },
    required: ["analysis_type"]  // 移除 judgments
  }
}
```

---

### 5. 函數調用鏈更新

**文件**: `controllers/ai-agent-controller.js`

**修改內容**:
- `executeToolCall` 函數接收 `conversationHistory` 參數
- `callLocalFunction` 函數接收 `conversationHistory` 參數
- 在工具調用時傳遞對話歷史

**調用鏈**:
```
handleAIAgentChat
  → executeToolCall(toolCall, messages)
    → callLocalFunction(functionName, args, conversationHistory)
      → calculate_verdict_statistics(judgments, options, conversationHistory)
```

---

## ✅ 測試結果

### 端到端測試 (`test-e2e-workflow.js`)

**測試 1**: 不傳遞 judgments 參數 (應該自動提取)
- ✅ **通過**: 成功從對話歷史中提取 5 筆判決書
- 結果: 總案件數 5, 原告勝訴 3 筆 (60.0%)

**測試 2**: 傳遞空陣列 (應該自動提取)
- ✅ **通過**: 成功從對話歷史中提取數據

**測試 3**: 沒有對話歷史 (應該返回錯誤)
- ✅ **通過**: 正確返回錯誤訊息

**測試 4**: 使用 judge_name 過濾
- ✅ **通過**: 成功過濾法官,從 6 筆 → 5 筆 (排除王婉如的 1 筆)

---

## 📊 預期效果

### 1. 解決核心問題
- ✅ GPT 不再需要傳遞大型數據結構 (18 筆判決書 = 5000-10000 tokens)
- ✅ `calculate_verdict_statistics` 自動從對話歷史中提取數據
- ✅ 支持根據 `judge_name` 和 `case_type` 過濾

### 2. 提升問題理解
- ✅ Intent Classifier 提取關鍵資訊 (問題類型、案由、判決類型)
- ✅ AI Agent 收到結構化的上下文
- ✅ 提供明確的工作流程建議

### 3. Token 優化
- Intent Classifier: +200 tokens (~$0.00003)
- AI Agent: 保持不變 (~5000 tokens)
- **總體**: 輕微增加,但提升了準確性

### 4. 保持靈活性
- ✅ AI Agent 仍然可以自主決策
- ✅ 不強制執行固定的工作流程
- ✅ 向後兼容 (仍然可以直接傳遞 judgments)

---

## 🔄 工作流程對比

### 之前 (有問題)
```
用戶: "法官在損害賠償中的勝訴率?"
  ↓
AI Agent (第1輪): semantic_search_judgments(...) → 返回 18 筆判決書
  ↓
AI Agent (第2輪): calculate_verdict_statistics(judgments=[...18筆...], ...)
  ↓
❌ 錯誤: GPT 無法傳遞大型數據結構
  ↓
AI Agent (第2輪): calculate_verdict_statistics(analysis_type="verdict_rate", ...)
  ↓
❌ 錯誤: "無判決書數據"
```

### 現在 (已修復)
```
用戶: "法官在損害賠償中的勝訴率?"
  ↓
Intent Classifier: 
  - intent: legal_analysis
  - question_type: 勝訴率
  - case_type: 損害賠償
  - verdict_type: 原告勝訴
  ↓
AI Agent (收到上下文 + 建議工作流程)
  ↓
AI Agent (第1輪): semantic_search_judgments(query="損害賠償", judge_name="黃麟捷", limit=50)
  → 返回 18 筆判決書
  → 添加到對話歷史
  ↓
AI Agent (第2輪): calculate_verdict_statistics(analysis_type="verdict_rate", verdict_type="原告勝訴")
  → 函數自動從對話歷史中提取 18 筆判決書
  → 計算統計
  ↓
✅ 成功: 返回 { 總案件數: 18, 原告勝訴: 7, 勝訴率: "38.9%" }
  ↓
AI Agent (第3輪): 生成回答
  → "根據 2025年6-7月 的數據,黃麟捷法官在損害賠償案件中,原告勝訴率為 38.9%..."
```

---

## 📝 後續建議

### 1. 監控和調整
- 監控 Intent Classifier 的提取準確性
- 收集 GPT 的實際行為數據
- 根據實際效果調整 System Prompt

### 2. 擴展到其他函數
- 考慮將自動提取機制應用到其他本地函數:
  - `analyze_amount_trends`
  - `calculate_case_type_distribution`

### 3. 優化 Token 消耗
- 如果 Intent Classifier 的 Token 消耗過高,考慮簡化提取邏輯
- 監控實際的 Token 使用情況

---

## 🎉 總結

成功實施了 **方案 A (輕量級"交棒") + 方案 1 (自動提取數據)** 的組合方案:

1. ✅ **Intent Classifier** 作為輕量級預處理器,提取關鍵資訊
2. ✅ **AI Agent** 收到結構化的上下文和建議工作流程
3. ✅ **`calculate_verdict_statistics`** 自動從對話歷史中提取數據
4. ✅ **所有測試通過**,驗證了實施的正確性

這個方案:
- 解決了 GPT 無法傳遞大型數據結構的根本問題
- 提升了問題理解的準確性
- 保持了系統的靈活性
- Token 消耗增加輕微,但提升了準確性

**預期效果**: GPT 將能夠正確執行勝訴率計算的完整工作流程,不再跳過數據檢索步驟。

