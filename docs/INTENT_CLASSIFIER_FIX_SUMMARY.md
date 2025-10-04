# Intent Classifier 修正總結

## 問題描述

用戶報告：當詢問「可以給我 TPHV,113,上,656,20250701,4 這篇判決的摘要嗎?」時，Intent Classifier 錯誤地將其分類為 `out_of_scope`，導致系統拒絕回答。

## 根本原因分析

經過深入分析，發現了**三個核心問題**：

### 問題 1: 分類任務定義過窄 ❌

**錯誤定義**：
```
"判斷用戶問題是否與「法官判決分析」相關"
```

**問題**：
- 用戶問的是「給我這個判決書ID的摘要」，屬於**案件檢索/案件細節**
- 不屬於「法官分析」的範疇
- 模型在這個 framing 下容易判斷為 `out_of_scope`

### 問題 2: 對話層的「限制該法官」訊息在前 ❌

**問題場景**：
```
[AI Agent] 📌 此對話僅限於該法官的判決分析
[Intent Classifier] 問題: 可以給我 TPHV,113,上,656,20250701,4 這篇判決的摘要嗎?
```

**問題**：
- Intent Classifier 讀到「僅限該法官」的框架
- 問題又沒有提到該法官姓名
- 無法從字串直接確認這個 ID 的法官是否匹配
- 偏向「不屬於當前對話範圍」→ `out_of_scope`

### 問題 3: 提示詞缺少「摘要/ID 請求」的正樣例 ❌

**問題**：
- `question_type` 列表裡沒有「摘要/詳情/CaseID」類型
- 範例全是勝訴率/法條/列表
- 模型沒有被示範「摘要請求＝合法、屬於法律分析」
- 在缺少正樣例下，傾向安全地標 `out_of_scope`

---

## 完整修正方案

### 修正 1: 擴充分類 Schema ✅

**修正前**：
```javascript
{
  "intent": "legal_analysis" | "greeting" | "out_of_scope" | "unclear",
  "question_type": "勝訴率" | "列表" | "法條" | "判決傾向" | "金額" | "其他" | null,
  "case_type": "案由關鍵字" | null,
  "verdict_type": "原告勝訴" | "原告敗訴" | "部分勝訴部分敗訴" | null
}
```

**修正後**：
```javascript
{
  "intent": "legal_analysis" | "greeting" | "out_of_scope" | "unclear",
  "question_type": "勝訴率" | "列表" | "法條" | "判決傾向" | "金額" | "摘要" | "其他" | null,  // 🆕 添加 "摘要"
  "case_type": "案由關鍵字" | null,
  "verdict_type": "原告勝訴" | "原告敗訴" | "部分勝訴部分敗訴" | null,
  "case_id": "string | null"  // 🆕 添加 case_id 欄位
}
```

---

### 修正 2: 更新 System Prompt ✅

**修正前**：
```
你是一個意圖分類器。判斷用戶問題是否與「法官判決分析」相關。
```

**修正後**：
```
你是一個意圖分類器。判斷用戶問題是否與「法律案件/判決相關任務」有關（不限於法官分析），並抽取關鍵欄位。
```

**核心規則**：
1. **只要涉及「判決書/案件/案號/判決ID/摘要/理由/主文/裁判要旨/法條引用」，一律 intent=legal_analysis**
2. **可偵測案號/判決ID** 時，填入 case_id
3. **不要因為當前對話綁定了某位法官而把與案件相關的問題標為 out_of_scope**
4. **僅在明確與法律/判決無關**（如生活嗜好、天氣、八卦）時，才標 out_of_scope
5. **若不確定類別**，使用 question_type="其他" 並保持 intent=legal_analysis

---

### 修正 3: 添加正樣例 ✅

**新增範例**：
```javascript
問題: "TPHV,113,上,656,20250701,4 的判決摘要？"
→ {"intent":"legal_analysis","question_type":"摘要","case_type":null,"verdict_type":null,"case_id":"TPHV,113,上,656,20250701,4"}

問題: "可以給我 SLEV,114,士簡,720,20250731,1 這篇判決的摘要嗎?"
→ {"intent":"legal_analysis","question_type":"摘要","case_type":null,"verdict_type":null,"case_id":"SLEV,114,士簡,720,20250731,1"}

問題: "法官喜歡吃臭豆腐嗎？"
→ {"intent":"out_of_scope","question_type":null,"case_type":null,"verdict_type":null,"case_id":null}
```

---

### 修正 4: 更新工作流程 ✅

**在 System Prompt 中添加**：
```
3. [重要] **檢查案號ID** - 如果用戶問題包含判決書案號（如 TPHV,113,上,656,20250701,4），這是一個案件詳情查詢
   - **直接調用 get_case_details** 工具並傳入案號
   - 不需要先搜尋再查詢，直接用案號獲取詳情最高效
```

**添加新範例**：
```
範例 10: "可以給我 TPHV,113,上,656,20250701,4 這篇判決的摘要嗎?" - 🆕 案號查詢範例
步驟:
1. [重要] 識別出這是一個案號（判決書ID）
2. [重要] 直接調用 get_case_details (case_id="TPHV,113,上,656,20250701,4")
3. 生成回答: "這是 TPHV,113,上,656,20250701,4 案件的摘要: [摘要內容]..."
```

---

### 修正 5: 添加 case_id 處理邏輯 ✅

**在 ai-agent-controller.js 中添加**：
```javascript
// 🆕 如果 Intent Classifier 提取到 case_id，添加到上下文中
if (intentResult.extractedInfo?.case_id) {
    console.log('[AI Agent] 🆔 偵測到案號ID:', intentResult.extractedInfo.case_id);
    console.log('[AI Agent] 💡 提示: 這是一個案件詳情查詢，建議使用 get_case_details 工具');
}
```

---

## 修正效果對比

### 修正前 ❌

```
用戶: "可以給我 TPHV,113,上,656,20250701,4 這篇判決的摘要嗎?"

Intent Classifier 返回:
{
  "intent": "out_of_scope",  // ❌ 錯誤！
  "question_type": null,
  "case_type": null,
  "verdict_type": null
}

系統回應:
"抱歉,這裡是 **周美雲法官** 的檢索頁面,目前只能回答和 **周美雲法官判決內容** 相關的分析唷! 😊"
```

### 修正後 ✅

```
用戶: "可以給我 TPHV,113,上,656,20250701,4 這篇判決的摘要嗎?"

Intent Classifier 返回:
{
  "intent": "legal_analysis",  // ✅ 正確！
  "question_type": "摘要",
  "case_type": null,
  "verdict_type": null,
  "case_id": "TPHV,113,上,656,20250701,4"  // ✅ 自動提取案號！
}

系統行為:
1. 識別為 legal_analysis，進入完整分析流程
2. 偵測到 case_id，提示使用 get_case_details
3. GPT 調用 get_case_details(case_id="TPHV,113,上,656,20250701,4")
4. 返回案件摘要
```

---

## 測試驗證

### 測試結果 ✅

```
總測試數: 8
通過: 8 ✅
失敗: 0 ❌
通過率: 100.0%
```

### 測試案例

1. ✅ 案號查詢（完整格式）- "可以給我 TPHV,113,上,656,20250701,4 這篇判決的摘要嗎?"
2. ✅ 案號查詢（簡短格式）- "SLEV,114,士簡,720,20250731,1 這個案件的請求和獲准金額是?"
3. ✅ 法官分析（無案號）- "黃雅君法官在損害賠償案件中的勝訴率?"
4. ✅ 列表查詢（無案號）- "列出王婉如法官的判決書"
5. ✅ 打招呼 - "你好"
6. ✅ 超出範圍（個人生活）- "法官喜歡吃臭豆腐嗎？"
7. ✅ 案件摘要查詢（不同格式）- "幫我看案號 TPHV,113,上,656,20250701,4 的理由重點"
8. ✅ 金額查詢（有案號）- "SLEV,114,士簡,326,20250717,1 的請求金額和獲准金額是多少?"

---

## 修正的檔案

1. ✅ `d:\court_data\courtDataAPI\services\intentClassifier.js`
   - 更新 System Prompt
   - 添加 case_id 欄位處理
   - 添加正樣例

2. ✅ `d:\court_data\courtDataAPI\controllers\ai-agent-controller.js`
   - 添加 case_id 偵測邏輯
   - 添加提示訊息

3. ✅ `d:\court_data\courtDataAPI\utils\ai-agent-tools.js`
   - 更新工作流程
   - 添加範例 10（案號查詢）

4. ✅ `d:\court_data\courtDataAPI\test_intent_classifier_case_id.js`
   - 測試腳本

---

## 部署檢查清單

- [x] 修正 Intent Classifier System Prompt
- [x] 添加 case_id 欄位
- [x] 添加正樣例
- [x] 更新工作流程
- [x] 添加 case_id 處理邏輯
- [x] 本地測試通過
- [ ] 推送到 GitHub
- [ ] 部署到 Vercel
- [ ] 端到端測試

---

## 相關文件

- `test_intent_classifier_case_id.js` - 測試腳本
- `INTENT_CLASSIFIER_FIX_SUMMARY.md` - 本文件
- `AMOUNT_FIELD_FIX_SUMMARY.md` - 金額欄位修正總結
- `QUICK_DEPLOY_GUIDE.md` - 快速部署指南

---

**修正完成時間**: 2025-10-04  
**修正人員**: Augment Agent  
**問題報告人**: BOHARRY  
**特別感謝**: BOHARRY 提供的深入分析和修正建議

