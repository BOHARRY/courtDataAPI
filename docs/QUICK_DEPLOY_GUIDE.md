# 快速部署指南

## 修正總覽

本次修正解決了三個獨立的問題：
1. ✅ 金額欄位路徑錯誤（MCP Server）
2. ✅ Intent Classifier 對話歷史處理錯誤（後端）
3. ✅ System Prompt 指導不足（後端）

---

## 部署步驟

### Step 1: 部署 MCP Server (Render.com)

```bash
# 切換到 MCP Server 目錄
cd d:\esmcp

# 檢查修改
git status

# 添加修改的檔案
git add lawsowl_mcp.py test_amount_fix.py

# 提交
git commit -m "修正金額欄位路徑：使用 key_metrics.civil_metrics

- 更新 FIELD_LAYERS 配置（amount 和 full 層）
- 修正 search_judgments 動態構建邏輯
- 修正 semantic_search_judgments 動態構建邏輯
- 修正 get_case_details 金額提取
- 修正 analyze_judge 金額提取
- 添加測試腳本 test_amount_fix.py
- 所有測試通過 ✅"

# 推送到 GitHub
git push origin main

# 等待 Render.com 自動部署（約 2-3 分鐘）
# 或者手動觸發部署：https://dashboard.render.com
```

**驗證部署**：
```bash
# 檢查 Render.com 部署日誌
# 確認沒有錯誤
# 確認服務狀態為 "Live"
```

---

### Step 2: 部署後端 (Vercel)

```bash
# 切換到後端目錄
cd d:\court_data\courtDataAPI

# 檢查修改
git status

# 添加修改的檔案
git add services/intentClassifier.js
git add utils/ai-agent-tools.js
git add test_intent_classifier_fix.js
git add test_system_prompt_fix.md
git add docs/AMOUNT_FIELD_FIX_SUMMARY.md
git add docs/QUICK_DEPLOY_GUIDE.md

# 提交
git commit -m "修正金額查詢和 Intent Classifier 問題

修正 1: Intent Classifier 對話歷史過濾
- 過濾掉 tool 和 tool_calls 訊息
- 避免 OpenAI API 錯誤
- 測試通過 ✅

修正 2: System Prompt 指導強化
- 更新重要規則：優先選擇包含所需資料的類型
- 更新金額分析描述：明確關鍵字觸發條件
- 添加工作流程檢查步驟：檢查對話歷史是否缺少欄位
- 添加範例 8：列表 + 金額查詢
- 添加範例 9：延續性問題處理

修正 3: 本地統計函式
- 更新金額欄位提取邏輯
- 只使用中文欄位名稱

相關問題: 用戶查詢金額時返回「未提供」"

# 推送到 GitHub
git push origin main

# 等待 Vercel 自動部署（約 1-2 分鐘）
# 或者手動觸發部署：https://vercel.com/dashboard
```

**驗證部署**：
```bash
# 檢查 Vercel 部署日誌
# 確認沒有錯誤
# 確認部署狀態為 "Ready"
```

---

## 端到端測試

### 測試案例 1: 列表 + 金額查詢

**問題**: "黃雅君法官經手的三件損害賠償的案子，的請求金額和獲准金額個別是?"

**預期結果**:
```
以下是黃雅君法官經手的三件損害賠償案件的金額資訊：

1. 損害賠償 (2025-07-31)
   - 請求金額: 420,000 元
   - 獲准金額: 420,000 元

2. 損害賠償(簡判) (2025-07-17)
   - 請求金額: 753,848 元
   - 獲准金額: 200,000 元

3. 損害賠償 (2025-07-04)
   - 請求金額: 230,000 元
   - 獲准金額: 80,000 元
```

**驗證點**:
- ✅ 所有案件都有金額資料
- ✅ GPT 調用了 `semantic_search_judgments` 並指定 `intended_analysis="amount_analysis"`
- ✅ MCP Server 返回了包含 `key_metrics` 的資料

---

### 測試案例 2: 延續性問題

**對話流程**:
```
用戶: "黃雅君法官經手的三件損害賠償的案子，的請求金額和獲准金額個別是?"
GPT: [返回三件案件的金額資訊]

用戶: "請給我前兩個案子的案號"
```

**預期結果**:
```
以下是前兩個案件的案號：

1. 損害賠償 (2025-07-31)
   - 案號: SLEV,114,士簡,720,20250731,1

2. 損害賠償(簡判) (2025-07-17)
   - 案號: SLEV,114,士簡,326,20250717,1
```

**驗證點**:
- ✅ GPT 從對話歷史中提取案號
- ✅ 不需要重新調用工具
- ✅ 回答準確

---

### 測試案例 3: 單一案件詳情查詢

**問題**: "SLEV,114,士簡,720,20250731,1 這個案件的請求和獲准金額是?"

**預期結果**:
```
在案件 SLEV,114,士簡,720,20250731,1 中，黃雅君法官的判決結果如下：

• 請求金額: 420,000 元
• 獲准金額: 420,000 元

此案件的判決結果為原告勝訴...
```

**驗證點**:
- ✅ GPT 調用了 `get_case_details`
- ✅ 返回了正確的金額資料
- ✅ 回答包含案件詳情

---

### 測試案例 4: Intent Classifier 不崩潰

**對話流程**:
```
用戶: "黃雅君法官在損害賠償案件中的勝訴率?"
GPT: [調用工具，返回結果]

用戶: "那平均獲准金額是多少?"
GPT: [調用工具，返回結果]

用戶: "請給我這兩個案子的案號"  ← 延續性問題，對話歷史包含 tool/tool_calls
```

**預期結果**:
- ✅ Intent Classifier 不會崩潰
- ✅ 不會出現 "messages with role 'tool' must be a response to a preceeding message with 'tool_calls'" 錯誤
- ✅ 正確識別意圖並返回案號

---

## 回滾計畫

如果部署後發現問題，可以快速回滾：

### 回滾 MCP Server

```bash
cd d:\esmcp
git revert HEAD
git push origin main
```

### 回滾後端

```bash
cd d:\court_data\courtDataAPI
git revert HEAD
git push origin main
```

---

## 監控指標

部署後需要監控以下指標：

### 成功指標
- ✅ 金額查詢返回完整資料（不再有「未提供」）
- ✅ Intent Classifier 不再崩潰
- ✅ GPT 正確使用 `intended_analysis` 參數
- ✅ Token 消耗符合預期（約 60% 節省）

### 錯誤指標
- ❌ 金額查詢仍然返回「未提供」
- ❌ Intent Classifier 出現 400 錯誤
- ❌ GPT 不調用工具或調用錯誤的工具
- ❌ Token 消耗異常增加

---

## 常見問題

### Q1: 部署後金額仍然顯示「未提供」？

**可能原因**:
1. Elasticsearch 中該案件確實沒有金額資料
2. MCP Server 沒有正確部署
3. GPT 沒有使用 `intended_analysis="amount_analysis"`

**排查步驟**:
1. 檢查 Render.com 部署日誌
2. 檢查 GPT 調用的工具參數
3. 檢查 MCP Server 返回的資料結構

---

### Q2: Intent Classifier 仍然崩潰？

**可能原因**:
1. Vercel 沒有正確部署
2. 對話歷史仍然包含 tool/tool_calls 訊息

**排查步驟**:
1. 檢查 Vercel 部署日誌
2. 檢查 `intentClassifier.js` 的過濾邏輯
3. 檢查對話歷史的內容

---

### Q3: GPT 不調用工具？

**可能原因**:
1. System Prompt 沒有正確更新
2. GPT 認為對話歷史中已有足夠資料

**排查步驟**:
1. 檢查 `ai-agent-tools.js` 的 System Prompt
2. 檢查對話歷史的內容
3. 嘗試清空對話歷史重新測試

---

## 聯絡資訊

如有問題，請聯絡：
- **開發者**: Augment Agent
- **問題報告**: BOHARRY
- **修正日期**: 2025-10-04

---

**祝部署順利！🚀**

