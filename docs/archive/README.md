# 📦 Archive - 已棄用的文檔

> **注意**: 此目錄包含開發過程中的計畫文檔和舊版本實作說明,已被新版本取代。  
> **最新文檔**: 請參考根目錄的 `AI_AGENT_GUIDE.md` 和 `README.md`

---

## 📁 文檔列表

### 1. OPENAI_FUNCTION_CALLING_PLAN.md
- **用途**: OpenAI Function Calling 實施計畫
- **創建日期**: 2025-10-02
- **狀態**: ⚠️ 已完成,僅供參考
- **替代文檔**: `AI_AGENT_GUIDE.md`

**內容摘要**:
- 5 週開發計畫
- 技術棧選擇
- 工具設計方案
- 成本估算

**為何棄用**: 計畫已執行完成,實際開發只用了 2 天,且部分設計有調整

---

### 2. OPENAI_FUNCTION_CALL.md
- **用途**: OpenAI Function Calling 詳細技術文檔
- **創建日期**: 2025-10-02
- **狀態**: ⚠️ 部分過時
- **替代文檔**: `AI_AGENT_GUIDE.md` + `README.md`

**內容摘要**:
- 2017 行超詳細技術文檔
- 包含代碼示例、架構圖、實作步驟
- 涵蓋前端、後端、MCP Server 所有細節

**為何棄用**: 
- 文檔過於龐大 (2000+ 行)
- 部分設計在實作時有調整
- 新的 `AI_AGENT_GUIDE.md` 更簡潔實用

**保留價值**: 
- 詳細的技術原理說明
- 豐富的代碼示例
- 可作為深入學習的參考

---

### 3. 法官語意AI助手.md
- **用途**: 前端語意AI助手實作文檔
- **創建日期**: 2025-10-02
- **狀態**: ⚠️ 前端已完成,後端方案已調整
- **替代文檔**: `AI_AGENT_GUIDE.md`

**內容摘要**:
- 前端對話組件設計
- 後端 API 設計方案
- 數據邊界控制策略
- 安全性考量

**為何棄用**:
- 後端實作方案已改為 OpenAI Function Calling
- 前端組件已整合到主系統
- 部分設計細節已過時

**保留價值**:
- 前端組件設計思路
- 數據邊界控制策略仍然適用
- 安全性考量仍然重要

---

### 4. 雙版本部署方案.md
- **用途**: 雙版本部署策略文檔
- **創建日期**: 2025-10-02
- **狀態**: ⚠️ 未採用
- **替代文檔**: 無 (功能未實作)

**內容摘要**:
- A/B 測試方案
- 灰度發布策略
- 版本切換機制

**為何棄用**:
- 項目規模不需要雙版本部署
- 直接採用單一版本快速迭代
- 未來如需要可參考此文檔

---

## 📊 文檔遷移對照表

| 舊文檔 | 新文檔 | 章節 |
|--------|--------|------|
| OPENAI_FUNCTION_CALLING_PLAN.md | AI_AGENT_GUIDE.md | 第 5 章: 開發歷程 |
| OPENAI_FUNCTION_CALL.md | AI_AGENT_GUIDE.md | 第 2-4 章: 架構和功能 |
| 法官語意AI助手.md | AI_AGENT_GUIDE.md | 第 3 章: 核心功能 |
| 雙版本部署方案.md | - | 未實作 |

---

## 🔍 如何查找信息

### **想了解 AI Agent 架構?**
→ 閱讀 `AI_AGENT_GUIDE.md` 第 2 章

### **想了解開發歷程?**
→ 閱讀 `d:\esmcp\FROM_ZERO_TO_HERO.md`

### **想了解 API 文檔?**
→ 閱讀 `README.md`

### **想了解語意搜尋實作?**
→ 閱讀 `docs/ai-agent/SEMANTIC_SEARCH_IMPLEMENTATION.md`

### **想了解 Session 管理?**
→ 閱讀 `docs/ai-agent/SESSION_FIX.md`

---

## 🗑️ 清理建議

**可以安全刪除此目錄嗎?**

✅ **是的**,如果:
- 您已經閱讀並理解了新文檔
- 不需要參考詳細的技術原理
- 項目已穩定運行

⚠️ **建議保留**,如果:
- 需要參考詳細的代碼示例
- 想了解設計決策的演進過程
- 需要深入學習 OpenAI Function Calling

---

## 📝 版本對照

| 版本 | 日期 | 主要文檔 | 狀態 |
|------|------|---------|------|
| v0.1 | 2025-10-02 | OPENAI_FUNCTION_CALLING_PLAN.md | 計畫階段 |
| v1.0 | 2025-10-02 | OPENAI_FUNCTION_CALL.md | 開發階段 |
| v2.0 | 2025-10-03 | AI_AGENT_GUIDE.md | ✅ 當前版本 |

---

## 📚 學習路徑

如果您是新接手的工程師,建議按以下順序閱讀:

1. **快速上手** (30 分鐘)
   - `AI_AGENT_GUIDE.md` - 了解整體架構
   - `README.md` - 了解 API 文檔

2. **深入理解** (2 小時)
   - `d:\esmcp\FROM_ZERO_TO_HERO.md` - 了解開發歷程
   - `docs/ai-agent/` - 了解具體實作

3. **進階學習** (可選)
   - `docs/archive/OPENAI_FUNCTION_CALL.md` - 深入技術原理
   - `docs/archive/法官語意AI助手.md` - 前端設計思路

---

**最後更新**: 2025-10-03  
**維護者**: LawSowl Development Team

