# Intent Classifier 修復: "法官有沒有經手XX案件" 問題

## 📅 修復日期
2025-10-03

## 🔴 **發現的問題**

### **用戶問題**
```
請問黃麟捷法官有沒有經手刑事案件?
```

### **Intent Classifier 的錯誤判斷**
```json
{
  "intent": "out_of_scope",
  "question_type": null,
  "case_type": null,
  "verdict_type": null
}
```

### **為什麼被誤判?**

Intent Classifier 認為這是 `out_of_scope`,可能的原因:

1. **數據範圍限制**: System Prompt 中說明數據僅包含 2025年6月至7月 的判決書數據
2. **刑事 vs 民事**: 可能數據庫主要是民事案件,Intent Classifier 認為刑事案件超出範圍
3. **"有沒有經手" 的措辭**: 聽起來像是在問法官的個人經歷,而非分析判決數據

### **但實際上**

這**應該是** `legal_analysis`!

**理由**:
- ✅ 用戶在問法官審理的案件類型
- ✅ 這是合法的法律分析問題
- ✅ 應該調用工具查詢是否有刑事案件
- ✅ 如果沒有,應該回答 "根據 2025年6-7月 的數據,黃麟捷法官沒有審理刑事案件"

---

## 💡 **解決方案**

### **修改 Intent Classifier 的 System Prompt**

**文件**: `services/intentClassifier.js`

---

### **修改 1: 明確 legal_analysis 的範圍**

**之前**:
```
**意圖分類 (intent)**:
1. "legal_analysis" - 問題與法官、判決、案件、勝訴率、法條等法律分析相關
2. "greeting" - 打招呼、問候、自我介紹
3. "out_of_scope" - 與法律無關的問題 (如: 法官個人生活、天氣、股票等)
4. "unclear" - 問題不清楚或無法理解
```

**修改後**:
```
**意圖分類 (intent)**:
1. "legal_analysis" - 問題與法官、判決、案件、勝訴率、法條等法律分析相關
   - 包括: 詢問法官是否審理某類案件 (如: "法官有沒有經手刑事案件?")
   - 包括: 詢問法官審理的案件類型 (如: "法官審理過哪些案件?")
   - 包括: 詢問特定案由的案件 (即使數據庫中可能沒有)
2. "greeting" - 打招呼、問候、自我介紹
3. "out_of_scope" - 與法律無關的問題 (如: 法官個人生活、天氣、股票等)
   - 注意: 詢問法官審理的案件類型**不是** out_of_scope
4. "unclear" - 問題不清楚或無法理解
```

**關鍵改進**:
- ✅ 明確說明詢問法官是否審理某類案件屬於 `legal_analysis`
- ✅ 強調即使數據庫中可能沒有該類案件,也應該分類為 `legal_analysis`
- ✅ 在 `out_of_scope` 中明確排除案件類型查詢

---

### **修改 2: 添加更多範例**

**之前**:
```
問題: "法官常引用哪些法條?"
返回: {"intent":"legal_analysis","question_type":"法條","case_type":null,"verdict_type":null}

問題: "你好"
返回: {"intent":"greeting","question_type":null,"case_type":null,"verdict_type":null}

問題: "法官單身嗎?"
返回: {"intent":"out_of_scope","question_type":null,"case_type":null,"verdict_type":null}
```

**修改後**:
```
問題: "法官常引用哪些法條?"
返回: {"intent":"legal_analysis","question_type":"法條","case_type":null,"verdict_type":null}

問題: "法官有沒有經手刑事案件?"
返回: {"intent":"legal_analysis","question_type":"列表","case_type":"刑事","verdict_type":null}

問題: "法官審理過民事案件嗎?"
返回: {"intent":"legal_analysis","question_type":"列表","case_type":"民事","verdict_type":null}

問題: "法官有處理過交通事故的案子嗎?"
返回: {"intent":"legal_analysis","question_type":"列表","case_type":"交通","verdict_type":null}

問題: "你好"
返回: {"intent":"greeting","question_type":null,"case_type":null,"verdict_type":null}

問題: "法官單身嗎?"
返回: {"intent":"out_of_scope","question_type":null,"case_type":null,"verdict_type":null}

問題: "法官幾歲?"
返回: {"intent":"out_of_scope","question_type":null,"case_type":null,"verdict_type":null}
```

**關鍵改進**:
- ✅ 添加 "法官有沒有經手刑事案件?" 的範例
- ✅ 添加 "法官審理過民事案件嗎?" 的範例
- ✅ 添加 "法官有處理過交通事故的案子嗎?" 的範例
- ✅ 明確區分 legal_analysis 和 out_of_scope

---

## 📊 **修復前後對比**

### **問題: "請問黃麟捷法官有沒有經手刑事案件?"**

| 項目 | 修復前 | 修復後 |
|------|--------|--------|
| **Intent** | `out_of_scope` ❌ | `legal_analysis` ✅ |
| **Question Type** | `null` | `列表` ✅ |
| **Case Type** | `null` | `刑事` ✅ |
| **後續處理** | 返回拒絕訊息 ❌ | 調用工具查詢 ✅ |

---

## 🎯 **預期效果**

### **場景 1: 數據庫中有刑事案件**

**用戶問**: "請問黃麟捷法官有沒有經手刑事案件?"

**修復前** ❌:
```
Intent Classifier: out_of_scope
回答: "抱歉,我只能回答與黃麟捷法官判決內容相關的問題。"
```

**修復後** ✅:
```
Intent Classifier: legal_analysis (question_type: 列表, case_type: 刑事)
  ↓
AI Agent: 調用 semantic_search_judgments(query="刑事", judge_name="黃麟捷", limit=50)
  ↓
回答: "根據 2025年6-7月 的數據,黃麟捷法官審理了 5 件刑事案件,包括:
  1. 案號: XXX - 案由: 竊盜
  2. 案號: YYY - 案由: 詐欺
  ..."
```

---

### **場景 2: 數據庫中沒有刑事案件**

**用戶問**: "請問黃麟捷法官有沒有經手刑事案件?"

**修復前** ❌:
```
Intent Classifier: out_of_scope
回答: "抱歉,我只能回答與黃麟捷法官判決內容相關的問題。"
```

**修復後** ✅:
```
Intent Classifier: legal_analysis (question_type: 列表, case_type: 刑事)
  ↓
AI Agent: 調用 semantic_search_judgments(query="刑事", judge_name="黃麟捷", limit=50)
  ↓
返回: { 總數: 0, 判決書: [] }
  ↓
回答: "根據 2025年6-7月 的數據,黃麟捷法官沒有審理刑事案件。
      在這段期間,黃麟捷法官主要審理民事案件,包括損害賠償、返還不當得利等案由。"
```

---

## ✅ **關鍵改進**

1. ✅ **明確 legal_analysis 的範圍**
   - 包括詢問法官是否審理某類案件
   - 包括詢問法官審理的案件類型
   - 即使數據庫中可能沒有該類案件

2. ✅ **添加具體範例**
   - "法官有沒有經手刑事案件?"
   - "法官審理過民事案件嗎?"
   - "法官有處理過交通事故的案子嗎?"

3. ✅ **明確區分 legal_analysis 和 out_of_scope**
   - legal_analysis: 詢問案件類型、審理情況
   - out_of_scope: 詢問法官個人生活 (年齡、婚姻狀況等)

---

## 🧪 **測試案例**

### **應該分類為 legal_analysis 的問題**

1. ✅ "法官有沒有經手刑事案件?"
2. ✅ "法官審理過民事案件嗎?"
3. ✅ "法官有處理過交通事故的案子嗎?"
4. ✅ "法官有沒有損害賠償的案件?"
5. ✅ "法官審理過哪些案件?"

### **應該分類為 out_of_scope 的問題**

1. ✅ "法官幾歲?"
2. ✅ "法官單身嗎?"
3. ✅ "法官住在哪裡?"
4. ✅ "法官的興趣是什麼?"

---

## 📝 **後續建議**

### 1. 監控誤判率
- 收集被誤判為 `out_of_scope` 的問題
- 定期檢查是否有新的邊緣案例
- 根據實際情況調整 System Prompt

### 2. 持續優化範例
- 添加更多真實用戶問題的範例
- 覆蓋更多邊緣案例
- 保持範例的多樣性

### 3. A/B 測試
- 對比修復前後的分類準確率
- 收集用戶反饋
- 根據數據調整策略

---

## 🎉 **總結**

成功修復了 Intent Classifier 對 "法官有沒有經手XX案件" 類問題的誤判:

1. ✅ **明確範圍** - 詢問案件類型屬於 legal_analysis
2. ✅ **添加範例** - 提供具體的分類範例
3. ✅ **明確區分** - 區分 legal_analysis 和 out_of_scope

**預期效果**: Intent Classifier 將能夠正確識別詢問案件類型的問題,不再誤判為 out_of_scope,而是正確分類為 legal_analysis,並調用相應的工具進行查詢。

