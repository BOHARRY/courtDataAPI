# 檔案整理計劃

## 📋 整理日期：2025-10-14

---

## 🎯 整理原則

1. **保留** - 重要的、最新的文檔
2. **合併** - 相關主題的文檔合併成一個
3. **刪除** - 過時的、重複的、測試用的文檔

---

## 📁 根目錄檔案

### ✅ 保留並提交

無

### 🗑️ 刪除（臨時檔案）

1. `CHROME_MCP_V2_UPGRADE_SUMMARY.md` - 已有 docs 版本
2. `GIT_COMMIT_MESSAGE.md` - 臨時檔案，已提交後不需要

### 📝 移動到 docs/archive

無

---

## 📁 docs/ 目錄檔案

### ✅ 保留並提交（重要文檔）

#### **Chrome MCP 相關**
1. `CHROME_MCP_V2_QUICK_REFERENCE.md` - 快速參考指南 ✅
2. `CHROME_MCP_V2_UPGRADE.md` - 升級文檔 ✅

#### **快取實作相關**
3. `LAW_CACHE_IMPLEMENTATION.md` - 法條快取實作（已修改）✅
4. `CITATION_CACHE_IMPLEMENTATION.md` - 引用快取實作 ✅

#### **部署相關**
5. `DEPLOYMENT_CHECKLIST.md` - 部署檢查清單 ✅
6. `DEPLOYMENT_GUIDE_NEW_TOOLS.md` - 新工具部署指南 ✅

#### **架構相關**
7. `ARCHITECTURE_ANALYSIS.md` - 架構分析 ✅
8. `JUDGE_SEARCH_ARCHITECTURE.md` - 法官搜索架構 ✅

---

### 🔄 合併（相關主題）

#### **合併組 1: Chrome MCP 升級系列**
**目標檔案**: `CHROME_MCP_V2_COMPLETE_GUIDE.md`（新建）

**來源檔案**（合併後刪除）:
- `CHROME_MCP_V2_P1_UPGRADE.md`
- `CHROME_MCP_SESSION_CLEANUP_ANALYSIS.md`
- `CHROME_MCP_SESSION_ISOLATION_UPGRADE_COMPLETE.md`
- `CHROME_MCP_SMART_PAGE_CHECK_UPGRADE.md`
- `CHROME_MCP_PLAN_B_SIMPLIFY_FLOW.md`
- `CHROME_MCP_PLAN_C_FIX_LINK_TEXT.md`

**合併內容**:
- 升級歷程
- Session 隔離
- 智能頁面檢查
- 流程簡化
- 連結文字修復

---

#### **合併組 2: 快取系列**
**目標檔案**: `CACHE_IMPLEMENTATION_COMPLETE.md`（新建）

**來源檔案**（合併後刪除）:
- `CITATION_CACHE_UPGRADE_SUMMARY.md`
- `LAW_CACHE_BUG_FIX.md`

**保留原始檔案**:
- `LAW_CACHE_IMPLEMENTATION.md`（已修改，保留）
- `CITATION_CACHE_IMPLEMENTATION.md`（保留）

**合併內容**:
- 法條快取實作
- 引用快取實作
- Bug 修復記錄
- 升級總結

---

#### **合併組 3: Perplexity 遷移系列**
**目標檔案**: `LAW_SEARCH_HYBRID_IMPLEMENTATION.md`（新建）

**來源檔案**（合併後刪除）:
- `PERPLEXITY_MIGRATION.md`
- `PERPLEXITY_ROLLBACK.md`

**合併內容**:
- Perplexity 遷移嘗試
- 測試結果（50% 正確率）
- 回退決策
- **最終方案：SerpAPI + Perplexity 混合版（100% 正確率）**

---

#### **合併組 4: AI Agent 優化系列**
**目標檔案**: `AI_AGENT_OPTIMIZATION_COMPLETE.md`（新建）

**來源檔案**（合併後刪除）:
- `AI_AGENT_PROMPT_OPTIMIZATION.md`
- `CONTEXT_AWARENESS_FIX.md`
- `CONTEXT_PRIORITY_OPTIMIZATION.md`
- `EMOJI_FIX.md`
- `INTENT_CLASSIFIER.md`
- `INTENT_CLASSIFIER_FIX.md`
- `INTENT_CLASSIFIER_SIMPLIFICATION.md`
- `INTENT_CLASSIFIER_FIX_SUMMARY.md`

**合併內容**:
- 提示詞優化
- 上下文感知修復
- 意圖分類器
- Emoji 修復

---

#### **合併組 5: 工具增強系列**
**目標檔案**: `TOOLS_ENHANCEMENT_COMPLETE.md`（新建）

**來源檔案**（合併後刪除）:
- `NEW_TOOLS_IMPLEMENTATION_SUMMARY.md`
- `TOOL_ENHANCEMENT_ANALYSIS.md`
- `ADVICE_QUESTION_FIX_SUMMARY.md`
- `ADVICE_RESPONSE_IMPROVEMENT_SUMMARY.md`
- `LAWYER_DISCLAIMER_FIX.md`

**合併內容**:
- 新工具實作
- 工具增強分析
- 法律建議修復
- 律師免責聲明

---

#### **合併組 6: Smart Field 系列**
**目標檔案**: `SMART_FIELD_COMPLETE_GUIDE.md`（新建）

**來源檔案**（合併後刪除）:
- `README_SMART_FIELD.md`
- `SMART_FIELD_CODE_CHANGES.md`
- `SMART_FIELD_OPTIMIZATION_PROPOSALS.md`
- `SMART_FIELD_SELECTION_PLAN.md`
- `SMART_FIELD_TESTING_PLAN.md`
- `SMART_FIELD_THREE_LAYER_ARCHITECTURE.md`

**合併內容**:
- Smart Field 架構
- 代碼變更
- 優化提案
- 測試計劃

---

#### **合併組 7: 其他修復系列**
**目標檔案**: `BUG_FIXES_SUMMARY.md`（新建）

**來源檔案**（合併後刪除）:
- `AMOUNT_FIELD_FIX_SUMMARY.md`
- `JUDGE_CONTEXT_INJECTION.md`
- `BEFORE_AFTER_COMPARISON.md`

**合併內容**:
- 金額欄位修復
- 法官上下文注入
- 修復前後對比

---

### 🗑️ 直接刪除（過時或重複）

1. `IMPLEMENTATION_SUMMARY_V2.md` - 已有更新版本
2. `IMPLEMENTATION_SUMMARY.md` - 已有更新版本
3. `QUICK_REFERENCE_V2.md` - 已有更新版本
4. `QUICK_DEPLOY_GUIDE.md` - 已有 DEPLOYMENT_CHECKLIST.md
5. `FINAL_DOCUMENTATION_STATUS.md` - 臨時狀態檔案

---

## 📁 test/ 目錄檔案

### ✅ 保留並提交（重要測試）

1. `test-hybrid-simple.js` - 混合版法條查詢測試（100% 正確率）✅

### 🗑️ 刪除（過時測試）

1. `test-citation-cache.js` - 功能已整合
2. `test-hybrid-law-search.js` - 已有 simple 版本
3. `test-law-ai-explain-fixed.js` - 過時
4. `test-law-ai-explain.js` - 過時
5. `test-openai-law-search.js` - 已回退
6. `test-perplexity-law-search.js` - 已回退
7. `test-perplexity-quick.js` - 已回退

---

## 📁 根目錄其他檔案

### 🗑️ 刪除

1. `test-chrome-mcp-v2-upgrade.js` - 測試完成，不需要
2. `mcp援引查詢log.txt` - 臨時 log
3. `mcp援引查詢後端log.txt` - 臨時 log

---

## 📊 整理統計

### 整理前
- 根目錄未追蹤檔案: 27 個
- docs/ 未追蹤檔案: 15 個
- test/ 未追蹤檔案: 7 個

### 整理後（預期）
- 保留並提交: 10 個
- 新建合併檔案: 7 個
- 刪除: 32 個

### 最終結果
- 總檔案數: 17 個（精簡 37%）
- 文檔更清晰、更有組織

---

## ✅ 執行步驟

1. 創建 7 個合併檔案
2. 刪除過時檔案
3. 提交保留的檔案
4. 驗證整理結果

