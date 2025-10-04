# 📚 方案 C: 智能欄位選擇 - 文檔導航

> **方案狀態**: 📝 待實施  
> **預期效果**: Token 節省 50-80%  
> **實施時間**: 2-3 天

---

## 🎯 快速開始

### 1. 閱讀順序

如果您是**第一次閱讀**，建議按照以下順序：

```
1️⃣ README_SMART_FIELD.md (本文檔) (5 分鐘)
   └─ 快速了解方案概述、文檔導航

2️⃣ SMART_FIELD_THREE_LAYER_ARCHITECTURE.md (15 分鐘)
   └─ 理解三層架構設計 (Intent Classifier → Router → Smart Fields → Local Calculation)

3️⃣ SMART_FIELD_SELECTION_PLAN.md (20 分鐘)
   └─ 深入理解設計理念、架構設計、技術細節

4️⃣ SMART_FIELD_CODE_CHANGES.md (30 分鐘)
   └─ 逐步的代碼修改指南

5️⃣ SMART_FIELD_TESTING_PLAN.md (20 分鐘)
   └─ 測試計劃與效果驗證

6️⃣ SMART_FIELD_OPTIMIZATION_PROPOSALS.md (15 分鐘) 🆕
   └─ 優化建議與改進方案 (可選)
```

**總計**: 約 1.75 小時

---

### 2. 如果您想...

#### 快速了解方案
👉 閱讀本文檔 (README_SMART_FIELD.md)

#### 理解三層架構
👉 閱讀 [SMART_FIELD_THREE_LAYER_ARCHITECTURE.md](./SMART_FIELD_THREE_LAYER_ARCHITECTURE.md)

#### 理解設計理念
👉 閱讀 [SMART_FIELD_SELECTION_PLAN.md](./SMART_FIELD_SELECTION_PLAN.md)

#### 開始實施
👉 閱讀 [SMART_FIELD_CODE_CHANGES.md](./SMART_FIELD_CODE_CHANGES.md)

#### 驗證效果
👉 閱讀 [SMART_FIELD_TESTING_PLAN.md](./SMART_FIELD_TESTING_PLAN.md)

#### 進一步優化 (可選)
👉 閱讀 [SMART_FIELD_OPTIMIZATION_PROPOSALS.md](./SMART_FIELD_OPTIMIZATION_PROPOSALS.md)

---

## 📄 文檔清單

### 1. **README_SMART_FIELD.md** (本文檔)

**用途**: 文檔導航與快速總結

**內容**:
- ✅ 閱讀順序建議
- ✅ 文檔清單
- ✅ 核心概念速覽
- ✅ 預期效果分析
- ✅ 實施檢查清單

**適合**: 所有人，第一份要讀的文檔

**閱讀時間**: 5 分鐘

---

### 2. [SMART_FIELD_THREE_LAYER_ARCHITECTURE.md](./SMART_FIELD_THREE_LAYER_ARCHITECTURE.md)

**用途**: 三層架構設計文檔

**內容**:
- ✅ Intent Classifier → Router → Smart Fields → Local Calculation
- ✅ 三層架構的優勢與價值
- ✅ 實際案例分析
- ✅ Token 節省統計
- ✅ 準確率提升分析

**適合**: 架構師、技術主管、想深入理解三層架構的人

**閱讀時間**: 15 分鐘

---

### 3. [SMART_FIELD_SELECTION_PLAN.md](./SMART_FIELD_SELECTION_PLAN.md)

**用途**: 方案概述與設計文檔

**內容**:
- ✅ 方案概述與核心概念
- ✅ 設計目標（包含三層架構）
- ✅ 需要修改的文件清單
- ✅ 詳細修改方案
- ✅ 預期效果分析
- ✅ 注意事項

**適合**: 架構師、技術主管、深入理解

**閱讀時間**: 20 分鐘

---

### 4. [SMART_FIELD_CODE_CHANGES.md](./SMART_FIELD_CODE_CHANGES.md)

**用途**: 代碼修改詳細指南

**內容**:
- ✅ 文件修改清單
- ✅ 逐步的代碼修改指南
- ✅ 修改前後對比
- ✅ 驗證清單

**適合**: 開發人員、實施人員

**閱讀時間**: 30 分鐘

---

### 5. [SMART_FIELD_TESTING_PLAN.md](./SMART_FIELD_TESTING_PLAN.md)

**用途**: 測試計劃與效果分析

**內容**:
- ✅ 測試目標
- ✅ 測試場景（6 個詳細場景）
- ✅ 整體效果分析
- ✅ 測試執行計劃
- ✅ 驗收標準
- ✅ 測試報告模板

**適合**: QA 工程師、測試人員、效果驗證

**閱讀時間**: 20 分鐘

---

### 6. [SMART_FIELD_OPTIMIZATION_PROPOSALS.md](./SMART_FIELD_OPTIMIZATION_PROPOSALS.md)

**用途**: 優化建議與改進方案

**內容**:
- ✅ Router 與 Intent Classifier 融合 (節省 68.6% Router 成本)
- ✅ 數據驗證層 (避免 NaN/NULL 錯誤)
- ✅ 用戶體驗優化 (更友善的回應)

**適合**: 架構師、技術主管、想進一步優化的人

**閱讀時間**: 15 分鐘

**實施順序**:
- 可以在方案 C 實施後再優化
- 也可以與方案 C 同時實施

---

## 🎯 核心概念速覽

### 問題

```
當前方案:
  用戶問: "牽涉金額最大的案件?"
  返回: 18 筆判決書 × 200 tokens/筆 = 3,600 tokens
  實際需要: 只需要 JID + 金額欄位 (~60 tokens/筆)
  浪費: 70% Token

另一個問題:
  用戶問: "法官喜歡吃臭豆腐嗎?"
  浪費: 5,000 tokens 去處理無效問題
```

### 解決方案 (三層架構)

```
方案 C (三層架構):

🔴 第0層: Intent Classifier (GPT-4o-mini)
  └─ 過濾: "法官喜歡吃臭豆腐嗎?" → out_of_scope → 直接返回
  └─ 提取: question_type="金額", case_type=null
  └─ Token: ~300 tokens
  └─ 節省: 94% Token (過濾無效問題)

🟡 第1層: Router (GPT-4o)
  └─ 分析: 這是「金額分析」問題
  └─ 決定: intended_analysis="amount_analysis"
  └─ 決定: 需要調用 MCP + 本地計算

🟢 第2層: Smart Fields (MCP Server)
  └─ semantic_search_judgments(intended_analysis="amount_analysis")
  └─ 智能選擇欄位: 只返回索引 + 金額欄位
  └─ 返回: 18 筆 × 60 tokens/筆 = 1,080 tokens
  └─ 節省: 70% Token

🔵 第3層: Local Calculation (本地函數)
  └─ calculate_verdict_statistics(analysis_type="amount_stats")
  └─ 本地計算: 最大金額、平均金額、總金額
  └─ 避免 GPT 算錯數字
  └─ 準確率: 100%

總節省: 55-70% Token + 過濾無效問題 + 數值100%準確
```

### 核心機制

```python
# MCP Server 端 (第2層)
def get_fields_for_analysis(intended_analysis: Optional[str] = None):
    """根據分析類型智能選擇欄位"""
    if intended_analysis == "amount_analysis":
        return ["JID", "JDATE", "JTITLE", "judges", "verdict_type", "court",
                "claim_amount", "granted_amount"]  # 只返回必要欄位
    elif intended_analysis == "list":
        return ["JID", "JDATE", "JTITLE", "judges", "verdict_type", "court"]
    # ... 其他類型
```

```javascript
// Intent Classifier (第0層)
const intentResult = await classifyIntent(question);
if (intentResult.intent === 'out_of_scope') {
    return "抱歉，這裡只能回答法官判決相關問題";
}
```

```javascript
// Router (第1層)
// System Prompt 引導 GPT 選擇正確的 intended_analysis
"如果用戶問金額相關問題，使用 intended_analysis='amount_analysis'"
```

```javascript
// Local Calculation (第3層)
function calculate_verdict_statistics(judgments, options) {
    if (options.analysis_type === 'amount_stats') {
        const amounts = judgments.map(j => j.granted_amount);
        return {
            max: Math.max(...amounts),  // 100% 準確
            avg: amounts.reduce((a, b) => a + b) / amounts.length,
            total: amounts.reduce((a, b) => a + b)
        };
    }
}
```

---

## 📊 預期效果

### Token 節省

| 場景 | 節省率 |
|------|--------|
| 列表查詢 | **75%** |
| 金額分析 | **70%** |
| 勝訴率分析 | **75%** |
| 法條分析 | **60%** |
| **平均** | **55%** |

### 實施成本

- **代碼修改**: 3 個文件
- **開發時間**: 3.5-4.5 小時
- **測試時間**: 1 天
- **部署時間**: 0.5 天
- **總計**: 2-3 天

---

## 🚀 實施檢查清單

### Phase 1: MCP Server 修改
- [ ] 添加欄位映射配置 (`FIELD_LAYERS`, `ANALYSIS_TO_FIELDS`)
- [ ] 添加 `get_fields_for_analysis()` 函數
- [ ] 修改 `SearchParams` 參數模型
- [ ] 修改 `SemanticSearchParams` 參數模型
- [ ] 修改 `search_judgments` 工具
- [ ] 修改 `semantic_search_judgments` 工具
- [ ] 本地測試

### Phase 2: 後端修改
- [ ] 更新 `semantic_search_judgments` 工具定義
- [ ] 更新 `search_judgments` 工具定義
- [ ] 更新 System Prompt

### Phase 3: 測試
- [ ] 單元測試
- [ ] 整合測試
- [ ] 端到端測試
- [ ] Token 消耗驗證
- [ ] 向後兼容測試

### Phase 4: 部署
- [ ] 部署 MCP Server
- [ ] 部署後端
- [ ] 生產環境測試
- [ ] 監控 Token 消耗
- [ ] 監控 GPT 準確率

---

## 📞 支援

### 問題反饋

如果在實施過程中遇到問題，請：

1. 檢查 [SMART_FIELD_CODE_CHANGES.md](./SMART_FIELD_CODE_CHANGES.md) 的驗證清單
2. 查看 [SMART_FIELD_TESTING_PLAN.md](./SMART_FIELD_TESTING_PLAN.md) 的測試場景
3. 聯繫開發團隊

### 文檔更新

如果發現文檔有誤或需要補充，請：

1. 提交 Issue
2. 或直接修改文檔並提交 PR

---

## 🎉 總結

方案 C (智能欄位選擇) 是一個**高效、靈活、向後兼容**的優化方案：

### 為什麼選擇方案 C？

1. **Token 節省顯著**: 平均節省 50-80%
2. **實施成本低**: 只需 2-3 天
3. **向後兼容**: 不影響現有功能
4. **擴展性強**: 易於添加新的分析類型
5. **符合設計理念**: 讓 AI 自動決策，而不是硬編碼

### 與其他方案對比

| 方案 | Token 節省 | 實施複雜度 | 靈活性 | 推薦度 |
|------|-----------|-----------|--------|--------|
| A: 欄位選擇器 | 30-50% | 低 | 中 | ⭐⭐⭐⭐ |
| B: 按需萃取工具組 | 40-75% | 中 | 高 | ⭐⭐⭐⭐⭐ |
| **C: 智能欄位預測** | **50-80%** | **中** | **最高** | **⭐⭐⭐⭐⭐** |

### 下一步

1. 閱讀 [SMART_FIELD_IMPLEMENTATION_SUMMARY.md](./SMART_FIELD_IMPLEMENTATION_SUMMARY.md)
2. 理解設計理念
3. 開始實施
4. 驗證效果
5. 部署上線

---

**文檔版本**: 1.0  
**最後更新**: 2025-10-04  
**維護者**: Harry + AI Assistant (Augment)  
**狀態**: 📝 待實施

---

## 📚 相關文檔

- [AI Agent 架構深度分析](./ARCHITECTURE_DEEP_DIVE.md)
- [Function Calling 與 MCP 協作指南](./FUNCTION_CALLING_MCP_GUIDE.md)
- [MCP 整合完整歷程](../esmcp/FROM_ZERO_TO_HERO.md)

