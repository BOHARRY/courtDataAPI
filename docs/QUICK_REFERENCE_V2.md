# 快速參考: 輕量級"交棒" + 自動提取數據

## 🎯 核心概念

### 問題
GPT-4o 無法在工具調用之間傳遞大型數據結構 (如 18 筆判決書 = 5000-10000 tokens)

### 解決方案
1. **Intent Classifier** 提取關鍵資訊 (問題類型、案由、判決類型)
2. **AI Agent** 收到結構化上下文和建議工作流程
3. **`calculate_verdict_statistics`** 自動從對話歷史中提取數據

---

## 📋 修改的文件

| 文件 | 修改內容 | 行數變化 |
|------|---------|---------|
| `services/intentClassifier.js` | 返回 JSON 格式,提取關鍵資訊 | +70 |
| `controllers/ai-agent-controller.js` | 動態注入上下文,傳遞對話歷史 | +90 |
| `utils/ai-agent-local-functions.js` | 自動提取數據邏輯 | +60 |
| `utils/ai-agent-tools.js` | 更新工具定義 | +8 |

---

## 🔧 關鍵代碼片段

### 1. Intent Classifier 返回格式

```javascript
{
  "intent": "legal_analysis",
  "extractedInfo": {
    "question_type": "勝訴率",  // 勝訴率、列表、法條、判決傾向、金額、其他
    "case_type": "損害賠償",
    "verdict_type": "原告勝訴"
  }
}
```

### 2. AI Agent 動態注入上下文

```javascript
const extractedInfo = intentResult.extractedInfo || {};
const questionType = extractedInfo.question_type;

if (questionType === '勝訴率') {
    systemPrompt += `
**建議工作流程** (勝訴率計算):
1. [第1輪] 調用 semantic_search_judgments(...)
2. [第2輪] 調用 calculate_verdict_statistics(...)
   - ⚠️ **不要傳遞 judgments 參數!**
3. [第3輪] 生成回答
`;
}
```

### 3. 自動提取數據邏輯

```javascript
export function calculate_verdict_statistics(judgments, options = {}, conversationHistory = []) {
    // 如果沒有 judgments,從對話歷史中提取
    if (!Array.isArray(judgments) || judgments.length === 0) {
        for (let i = conversationHistory.length - 1; i >= 0; i--) {
            const msg = conversationHistory[i];
            if (msg.role === 'tool') {
                const data = JSON.parse(msg.content);
                if (data['判決書']) {
                    judgments = data['判決書'];
                    break;
                }
            }
        }
    }
    // 繼續計算統計...
}
```

---

## 🧪 測試命令

```bash
# 測試 Intent Classifier
node test-intent-classifier-v2.js

# 測試端到端工作流程
node test-e2e-workflow.js
```

---

## 📊 預期行為

### 用戶問: "法官在損害賠償中的勝訴率?"

**第1輪 (Intent Classifier)**:
```
輸入: "法官在損害賠償中的勝訴率?"
輸出: {
  intent: "legal_analysis",
  question_type: "勝訴率",
  case_type: "損害賠償",
  verdict_type: "原告勝訴"
}
```

**第2輪 (AI Agent - 第1次工具調用)**:
```
GPT 決定: semantic_search_judgments(
  query="損害賠償",
  judge_name="黃麟捷",
  limit=50
)
返回: { 總數: 18, 判決書: [...18筆...] }
```

**第3輪 (AI Agent - 第2次工具調用)**:
```
GPT 決定: calculate_verdict_statistics(
  analysis_type="verdict_rate",
  verdict_type="原告勝訴"
  // ⚠️ 注意: 沒有傳遞 judgments 參數!
)

函數內部:
  → 檢測到沒有 judgments 參數
  → 從對話歷史中提取 18 筆判決書
  → 計算統計

返回: {
  總案件數: 18,
  原告勝訴: 7,
  勝訴率: "38.9%"
}
```

**第4輪 (AI Agent - 生成回答)**:
```
"根據 2025年6-7月 的數據,黃麟捷法官在損害賠償案件中,原告勝訴率為 38.9%..."
```

---

## ⚠️ 注意事項

### 1. Token 消耗
- Intent Classifier: ~500 tokens (增加 ~200 tokens)
- AI Agent: ~5000 tokens (保持不變)
- **總體**: 輕微增加

### 2. 向後兼容
- `calculate_verdict_statistics` 仍然支持直接傳遞 `judgments` 參數
- 如果提供了 `judgments`,不會從對話歷史中提取

### 3. 過濾邏輯
- 如果提供 `judge_name` 或 `case_type`,會收集**所有** tool 消息中的判決書,然後過濾
- 如果沒有過濾條件,只使用**最近的一個** tool 消息

---

## 🐛 故障排除

### 問題 1: Intent Classifier 返回舊格式 (字符串而非 JSON)

**原因**: GPT-4o-mini 沒有按照 System Prompt 返回 JSON

**解決**: 代碼已包含向後兼容邏輯,會自動處理舊格式

```javascript
try {
    parsedResult = JSON.parse(rawResponse);
} catch (e) {
    // 向後兼容: 當作舊格式處理
    parsedResult = {
        intent: rawResponse.toLowerCase(),
        question_type: null,
        case_type: null,
        verdict_type: null
    };
}
```

### 問題 2: `calculate_verdict_statistics` 找不到數據

**檢查**:
1. 對話歷史中是否有 `tool` 消息?
2. `tool` 消息的 `content` 是否包含 `判決書` 欄位?
3. 是否有過濾條件導致所有數據被過濾掉?

**調試**:
```javascript
console.log('[統計函數] 對話歷史長度:', conversationHistory.length);
console.log('[統計函數] 對話歷史:', JSON.stringify(conversationHistory, null, 2));
```

### 問題 3: GPT 仍然嘗試傳遞 `judgments` 參數

**原因**: System Prompt 可能不夠明確

**解決**: 檢查動態注入的上下文是否正確生成

```javascript
console.log('[AI Agent] System Prompt:', systemPrompt);
```

---

## 📚 相關文檔

- [完整實施總結](./IMPLEMENTATION_SUMMARY_V2.md)
- [Intent Classifier 文檔](./INTENT_CLASSIFIER.md)
- [Judge Context Injection 文檔](./JUDGE_CONTEXT_INJECTION.md)

---

## 🎉 成功指標

✅ GPT 正確執行兩步工作流程:
  1. `semantic_search_judgments`
  2. `calculate_verdict_statistics` (不傳遞 judgments)

✅ `calculate_verdict_statistics` 成功從對話歷史中提取數據

✅ 返回正確的統計結果

✅ 生成專業的回答

