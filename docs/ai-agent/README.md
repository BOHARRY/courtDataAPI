# 🤖 AI Agent 實作文檔

> **目錄用途**: 存放 AI Agent 功能的實作細節文檔  
> **狀態**: ✅ 最新版本  
> **最後更新**: 2025-10-03

---

## 📁 文檔列表

### 1. SESSION_FIX.md ⭐ 重要!
- **用途**: MCP Session 管理修復文檔
- **狀態**: ✅ 已實作並驗證
- **重要性**: ⭐⭐⭐

**內容摘要**:
- Session 過期檢測機制 (5 分鐘)
- 自動重試機制 (最多 2 次)
- 強制重新初始化功能

**解決的問題**:
- ❌ 第一次查詢成功,第二次失敗
- ❌ 錯誤: "No valid session ID provided"
- ✅ 連續查詢穩定性: 50% → 99%+

**何時閱讀**: 
- 遇到 Session 相關錯誤時
- 需要理解 Session 管理機制時
- 需要調整 Session 過期時間時

---

### 2. SEMANTIC_SEARCH_IMPLEMENTATION.md ⭐ 重要!
- **用途**: 語意搜尋功能實施總結
- **狀態**: ✅ 已實作並驗證
- **重要性**: ⭐⭐⭐

**內容摘要**:
- OpenAI Embeddings 整合
- Elasticsearch kNN 搜尋實作
- 工具選擇策略
- 測試結果和性能指標

**解決的問題**:
- ❌ 同義詞匹配失敗 ("債務清償" ≠ "清償債務")
- ❌ 口語化查詢無法理解 ("欠錢不還")
- ✅ 查詢成功率: 60% → 95%+

**何時閱讀**:
- 需要理解語意搜尋原理時
- 需要調整向量搜尋參數時
- 需要添加新的向量欄位時

---

### 3. TESTING_GUIDE.md
- **用途**: 語意搜尋功能測試指南
- **狀態**: ✅ 測試通過
- **重要性**: ⭐⭐

**內容摘要**:
- 6 個核心測試案例
- 測試步驟和預期結果
- 檢查清單

**測試案例**:
1. 基礎查詢 (Session 初始化)
2. 語意搜尋 - 同義詞匹配
3. 口語化查詢
4. 複雜語意查詢
5. 連續查詢 (Session 穩定性)
6. 錯誤處理

**何時閱讀**:
- 部署新版本前
- 修改核心功能後
- 需要驗證功能正常時

---

### 4. DEPLOY_SEMANTIC_SEARCH.md
- **用途**: 語意搜尋功能部署指南
- **狀態**: ✅ 已部署
- **重要性**: ⭐⭐

**內容摘要**:
- 快速部署步驟 (5 分鐘)
- 環境變數設置
- 部署驗證方法

**部署流程**:
1. MCP Server 部署 (2 分鐘)
2. AI Agent Backend 部署 (2 分鐘)
3. 前端部署 (1 分鐘)

**何時閱讀**:
- 需要部署新版本時
- 需要設置新環境時
- 遇到部署問題時

---

## 🎯 快速導航

### **我遇到了...**

| 問題 | 查看文檔 | 章節 |
|------|---------|------|
| Session 錯誤 | SESSION_FIX.md | 全部 |
| 同義詞匹配失敗 | SEMANTIC_SEARCH_IMPLEMENTATION.md | 第 3 章 |
| 查詢無結果 | SEMANTIC_SEARCH_IMPLEMENTATION.md | 第 4 章 |
| 需要測試功能 | TESTING_GUIDE.md | 全部 |
| 需要部署 | DEPLOY_SEMANTIC_SEARCH.md | 全部 |

---

## 📊 文檔關聯圖

```
AI_AGENT_GUIDE.md (根目錄)
    │
    ├─ 第 2 章: 系統架構
    │   └─ 參考: SEMANTIC_SEARCH_IMPLEMENTATION.md
    │
    ├─ 第 7 章: 部署指南
    │   └─ 參考: DEPLOY_SEMANTIC_SEARCH.md
    │
    └─ 第 8 章: 故障排查
        ├─ 參考: SESSION_FIX.md
        └─ 參考: TESTING_GUIDE.md
```

---

## 🔧 技術細節速查

### Session 管理

```javascript
// Session 過期時間
const SESSION_TIMEOUT = 5 * 60 * 1000; // 5 分鐘

// 自動重試次數
const MAX_RETRIES = 2;
```

**詳見**: `SESSION_FIX.md`

---

### 語意搜尋

```python
# OpenAI Embedding
model: "text-embedding-3-large"
dimensions: 1536
similarity: "cosine"

# Elasticsearch kNN
field: "summary_ai_vector" (預設)
k: limit (用戶指定)
num_candidates: limit * 2
```

**詳見**: `SEMANTIC_SEARCH_IMPLEMENTATION.md`

---

### 向量欄位

| 欄位 | 用途 | 維度 |
|------|------|------|
| `summary_ai_vector` | 通用搜尋 (預設) | 1536 |
| `text_embedding` | 深度內容搜尋 | 1536 |
| `legal_issues_embedding` | 法律爭點搜尋 | 1536 |
| `main_reasons_ai_vector` | 主要理由搜尋 | 1536 |
| `plaintiff_combined_vector` | 原告立場搜尋 | 1536 |
| `defendant_combined_vector` | 被告立場搜尋 | 1536 |

**詳見**: `SEMANTIC_SEARCH_IMPLEMENTATION.md` 第 1.3 章

---

## 📝 更新記錄

| 日期 | 文檔 | 變更 |
|------|------|------|
| 2025-10-03 | SESSION_FIX.md | 創建 |
| 2025-10-03 | SEMANTIC_SEARCH_IMPLEMENTATION.md | 創建 |
| 2025-10-03 | TESTING_GUIDE.md | 創建 |
| 2025-10-03 | DEPLOY_SEMANTIC_SEARCH.md | 創建 |

---

## 🚀 下一步

### **如果您是新接手的工程師**:

1. **先閱讀** (30 分鐘)
   - `../AI_AGENT_GUIDE.md` - 了解整體架構
   - `SESSION_FIX.md` - 了解 Session 管理
   - `SEMANTIC_SEARCH_IMPLEMENTATION.md` - 了解語意搜尋

2. **然後測試** (15 分鐘)
   - 按照 `TESTING_GUIDE.md` 執行測試
   - 確認所有功能正常

3. **最後部署** (5 分鐘)
   - 按照 `DEPLOY_SEMANTIC_SEARCH.md` 部署
   - 驗證生產環境正常

---

## 💡 最佳實踐

### **修改代碼前**:
1. 閱讀相關文檔
2. 理解現有實作
3. 運行測試確認功能正常

### **修改代碼後**:
1. 更新相關文檔
2. 運行測試確認無破壞
3. 更新 `AI_AGENT_GUIDE.md` (如有必要)

### **遇到問題時**:
1. 查看 `SESSION_FIX.md` 和 `TESTING_GUIDE.md`
2. 檢查後端日誌
3. 運行本地測試腳本

---

## 📞 支持

**遇到問題?**
1. 查看本目錄的相關文檔
2. 查看 `../AI_AGENT_GUIDE.md` 第 8 章: 故障排查
3. 查看 `d:\esmcp\FROM_ZERO_TO_HERO.md` 問題解決章節

---

**最後更新**: 2025-10-03  
**維護者**: LawSowl Development Team

