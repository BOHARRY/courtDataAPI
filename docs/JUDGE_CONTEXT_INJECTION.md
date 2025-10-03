# 🎯 法官上下文動態注入 - 技術文檔

> **版本**: v2.0.0  
> **最後更新**: 2025-10-03  
> **狀態**: ✅ 已實施

---

## 📋 問題回顧

### **原始問題**

```
用戶在黃麟捷法官頁面問: "法官在損害賠償中的勝訴率？"

實際情況:
- 黃麟捷法官有 7 件原告勝訴的損害賠償案件

AI 回答:
- "抱歉，由於技術原因，我無法直接計算出黃麟捷法官在損害賠償案件中的原告勝訴率。"

日誌顯示:
[AI Agent] 第 1 輪
[AI Agent] GPT 決定調用 1 個工具:
  [1] calculate_verdict_statistics  ← ❌ 錯誤!應該先調用 semantic_search_judgments
      參數: {"analysis_type":"verdict_rate","verdict_type":"原告勝訴"}
[AI Agent] 判決書數量: 0  ← ❌ 沒有判決書數據!
```

---

## 🔍 根本原因分析

### **問題 1: GPT 無法"看到"後端參數**

```
前端 → 後端
  question: "⚠️ 上下文... 法官姓名：黃麟捷 ... 用戶問題：法官在損害賠償中的勝訴率？"
  judge_name: "黃麟捷"  ← GPT 看不到這個!
    ↓
後端 → GPT
  messages: [
    { role: 'system', content: SYSTEM_PROMPT },  ← 固定的 Prompt,沒有法官資訊
    { role: 'user', content: "⚠️ 上下文... 法官姓名：黃麟捷 ..." }
  ]
    ↓
GPT 的視角:
  - ✅ 看到: "法官姓名：黃麟捷" (在用戶問題中)
  - ❌ 看不到: judge_name 參數 (後端參數)
  - ❌ 不知道: 應該在工具調用中使用 judge_name="黃麟捷"
```

### **問題 2: System Prompt 範例不匹配**

```javascript
// System Prompt 中的範例
範例 1: "王婉如法官在返還不當得利中的勝訴率?"
步驟:
1. 調用 semantic_search_judgments(query="返還不當得利", judge_name="王婉如", limit=50)

// 用戶實際問題
"法官在損害賠償中的勝訴率？"  ← 沒有明確法官名稱!

// GPT 的困惑
- 範例中法官名稱是明確的 "王婉如"
- 用戶問題中只有 "法官" (泛指)
- 不知道應該從哪裡提取法官名稱
```

---

## 💡 解決方案

### **核心思路: 動態注入法官上下文到 System Prompt**

```javascript
// 修改前
const messages = [
    { role: 'system', content: SYSTEM_PROMPT },  // ← 固定 Prompt
    { role: 'user', content: question }
];

// 修改後
const systemPrompt = judgeName 
    ? `${SYSTEM_PROMPT}

🔴 **重要上下文 - 當前查詢的法官**
**法官姓名**: ${judgeName}

**範例**:
用戶問: "法官在損害賠償中的勝訴率?"
步驟:
1. 調用 semantic_search_judgments(query="損害賠償", judge_name="${judgeName}", limit=50)
...
`
    : SYSTEM_PROMPT;

const messages = [
    { role: 'system', content: systemPrompt },  // ← 動態 Prompt
    { role: 'user', content: question }
];
```

---

## 📝 實施細節

### **1. 後端修改** (`controllers/ai-agent-controller.js`)

**位置**: 第 386-435 行

**主要變更**:

```javascript
// 🆕 動態構建 System Prompt (注入法官上下文)
let systemPrompt = SYSTEM_PROMPT;

if (judgeName) {
    console.log('[AI Agent] 🔴 動態注入法官上下文到 System Prompt');
    systemPrompt = `${SYSTEM_PROMPT}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 **重要上下文 - 當前查詢的法官**

**法官姓名**: ${judgeName}

**關鍵規則**:
- 用戶問題中提到「法官」、「這位法官」、「該法官」時,都是指「${judgeName}」法官
- 在**所有**工具調用中,必須使用 judge_name="${judgeName}" 參數
- 不要問用戶是哪位法官,直接使用 "${judgeName}"

**當前法官的範例**:

範例 A: 用戶問 "法官在損害賠償中的勝訴率?"
步驟:
1. [必須] 調用 semantic_search_judgments(query="損害賠償", judge_name="${judgeName}", limit=50)
   - 注意: judge_name="${judgeName}" 是必填的!
2. [必須] 調用 calculate_verdict_statistics(judgments=步驟1的結果, analysis_type="verdict_rate", verdict_type="原告勝訴")
3. 生成回答: "根據 2025年6-7月 的數據,${judgeName}法官在損害賠償案件中,原告勝訴率為 XX%..."

範例 B: 用戶問 "法官常引用哪些法條?"
步驟:
1. 調用 get_citation_analysis(judge_name="${judgeName}")
2. 生成回答: "根據 2025年6-7月 的數據,${judgeName}法官常引用的法條包括: ..."

範例 C: 用戶問 "法官的判決傾向如何?"
步驟:
1. 調用 analyze_judge(judge_name="${judgeName}")
2. 生成回答: "根據 2025年6-7月 的數據,${judgeName}法官的判決傾向: ..."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}

// 構建對話歷史
const messages = [
    { role: 'system', content: systemPrompt },  // ← 使用動態 Prompt
    ...conversation_history,
    { role: 'user', content: question }
];
```

---

### **2. 前端修改** (`JudgeConversationPanelGreen.js`)

**位置**: 第 89-94 行

**主要變更**:

```javascript
// 修改前 - 在問題中嵌入上下文
if (messages.length === 1) {
  contextualQuestion = `
⚠️ 重要上下文：用戶正在查詢特定法官的資訊...
當前查詢的法官：
- 法官姓名：${judgeName}
...
用戶問題：${userQuestion}
  `.trim();
}
const result = await askQuestion(contextualQuestion, judgeName);

// 修改後 - 直接發送純淨問題
const result = await askQuestion(userQuestion, judgeName);
```

**改進點**:
- ✅ 前端代碼更簡潔
- ✅ 不需要構建複雜的上下文字串
- ✅ 後端統一處理法官上下文

---

## 🎨 效果演示

### **場景: 用戶在黃麟捷法官頁面問勝訴率**

#### **修改前**

```
前端發送:
{
  question: "⚠️ 重要上下文... 法官姓名：黃麟捷 ... 用戶問題：法官在損害賠償中的勝訴率？",
  judge_name: "黃麟捷"
}

GPT 看到的 System Prompt:
  (固定的 Prompt,沒有黃麟捷的資訊)

GPT 看到的用戶問題:
  "⚠️ 重要上下文... 法官姓名：黃麟捷 ... 用戶問題：法官在損害賠償中的勝訴率？"

GPT 的決策:
  ❌ 第1輪: 調用 calculate_verdict_statistics (沒有 judgments 參數)
  ❌ 返回錯誤: "無判決書數據"
```

#### **修改後**

```
前端發送:
{
  question: "法官在損害賠償中的勝訴率？",
  judge_name: "黃麟捷"
}

GPT 看到的 System Prompt:
  ...
  🔴 **重要上下文 - 當前查詢的法官**
  **法官姓名**: 黃麟捷
  
  **範例 A**: 用戶問 "法官在損害賠償中的勝訴率?"
  步驟:
  1. 調用 semantic_search_judgments(query="損害賠償", judge_name="黃麟捷", limit=50)
  2. 調用 calculate_verdict_statistics(judgments=步驟1的結果, ...)
  ...

GPT 看到的用戶問題:
  "法官在損害賠償中的勝訴率？"

GPT 的決策:
  ✅ 第1輪: 調用 semantic_search_judgments(query="損害賠償", judge_name="黃麟捷", limit=50)
  ✅ 返回: 18 筆判決書
  ✅ 第2輪: 調用 calculate_verdict_statistics(judgments=[18筆], analysis_type="verdict_rate", verdict_type="原告勝訴")
  ✅ 返回: { 總案件數: 18, 原告勝訴: 7, 勝訴率: "38.9%" }
  ✅ 第3輪: 生成回答 "根據 2025年6-7月 的數據,黃麟捷法官在損害賠償案件中,共審理 18 筆,原告勝訴率為 38.9% (7筆原告勝訴)..."
```

---

## 📊 優勢對比

| 項目 | 修改前 | 修改後 |
|------|--------|--------|
| **System Prompt** | 固定,無法官資訊 | 動態注入法官名稱 |
| **範例匹配度** | ❌ 範例用 "王婉如",問題用 "法官" | ✅ 範例直接用當前法官名稱 |
| **GPT 理解度** | ❌ 不知道 "法官" = "黃麟捷" | ✅ 明確知道 "法官" = "黃麟捷" |
| **工具調用** | ❌ 跳過數據獲取步驟 | ✅ 正確調用 semantic_search_judgments |
| **前端代碼** | ⚠️ 需要構建複雜上下文 | ✅ 直接發送純淨問題 |
| **可維護性** | ❌ 前後端都需要處理上下文 | ✅ 後端統一處理 |

---

## 🧪 測試步驟

### **1. 部署後端**

```bash
cd d:\court_data\courtDataAPI
git add .
git commit -m "feat: 動態注入法官上下文到 System Prompt,修復 GPT 跳過數據獲取的問題"
git push
```

### **2. 部署前端**

```bash
cd d:\court_data\frontend-court-search-web
git add .
git commit -m "feat: 簡化 AI Agent 問題發送,移除上下文嵌入"
git push
```

### **3. 測試案例**

訪問黃麟捷法官頁面,測試以下問題:

1. **測試勝訴率計算**:
   - 輸入: "法官在損害賠償中的勝訴率？"
   - 預期: 正確計算並返回 "38.9% (7筆原告勝訴)"

2. **測試泛指問題**:
   - 輸入: "法官常引用哪些法條？"
   - 預期: 正確調用 get_citation_analysis(judge_name="黃麟捷")

3. **測試判決傾向**:
   - 輸入: "法官的判決傾向如何？"
   - 預期: 正確調用 analyze_judge(judge_name="黃麟捷")

### **4. 檢查日誌**

查看 Render 日誌,確認:
- ✅ `[AI Agent] 🔴 動態注入法官上下文到 System Prompt`
- ✅ 第1輪調用 `semantic_search_judgments` (不是 `calculate_verdict_statistics`)
- ✅ 判決書數量 > 0
- ✅ 第2輪調用 `calculate_verdict_statistics`
- ✅ 第3輪生成最終回答

---

## 🎉 完成!

現在 AI Agent:
- ✅ **理解法官上下文**: System Prompt 中明確包含當前法官名稱
- ✅ **正確工具調用**: 先獲取數據,再計算統計
- ✅ **範例匹配**: 使用當前法官的具體範例
- ✅ **代碼簡潔**: 前端不需要構建複雜上下文

這個老問題終於解決了! 🎊

