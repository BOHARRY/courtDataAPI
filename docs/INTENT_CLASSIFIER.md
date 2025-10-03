# 🎯 意圖識別層 - 技術文檔

> **版本**: v1.0.0  
> **最後更新**: 2025-10-03  
> **狀態**: ✅ 已實施

---

## 📋 概述

意圖識別層是一個輕量級的預處理層,使用 **GPT-4o-mini** 快速判斷用戶問題是否與法官判決分析相關,從而:
- ✅ 過濾無關問題,節省 Token 消耗
- ✅ 提升響應速度 (0.5秒 vs 2秒)
- ✅ 降低 API 成本 (節省 94% Token)

---

## 🏗️ 架構設計

### **流程圖**

```
用戶問題
    ↓
【意圖識別層】GPT-4o-mini
    ├─ Input: 簡短 Prompt (~200 tokens) + 用戶問題
    ├─ Output: 意圖分類 (4 種)
    ├─ 成本: ~300 tokens × $0.15/1M = $0.000045
    └─ 時間: ~500ms
    ↓
┌─────────────────────────────────────┐
│ 意圖分類結果                         │
├─────────────────────────────────────┤
│ 1. legal_analysis   → 進入完整分析   │
│ 2. greeting         → 返回歡迎訊息   │
│ 3. out_of_scope     → 返回拒絕訊息   │
│ 4. unclear          → 返回澄清訊息   │
└─────────────────────────────────────┘
    ↓
【如果是 legal_analysis】
    ↓
完整 AI Agent 流程 (GPT-4o)
    ├─ System Prompt (~2,800 tokens)
    ├─ 工具定義 (~1,800 tokens)
    └─ 多輪工具調用
```

---

## 📁 文件結構

```
courtDataAPI/
├── services/
│   └── intentClassifier.js       # 意圖識別服務
├── controllers/
│   └── ai-agent-controller.js    # AI Agent 控制器 (已整合)
├── tests/
│   └── test-intent-classifier.js # 測試腳本
└── docs/
    └── INTENT_CLASSIFIER.md      # 本文檔
```

---

## 🔧 核心功能

### **1. 意圖分類**

**函數**: `classifyIntent(question, context)`

**參數**:
- `question` (string): 用戶問題
- `context` (string, 可選): 上下文資訊 (如: 當前查詢的法官名稱)

**返回值**:
```javascript
{
  intent: 'legal_analysis',      // 意圖類型
  isLegalRelated: true,          // 是否法律相關
  confidence: 'high',            // 信心度
  duration: 523,                 // 耗時 (ms)
  tokenUsage: {
    input: 245,
    output: 3,
    total: 248,
    estimatedCost: 0.0000372    // 估算成本 (USD)
  }
}
```

**意圖類型**:
1. **`legal_analysis`** - 法律分析相關
   - 範例: "王婉如法官在交通案件中的勝訴率?"
   - 動作: 進入完整 AI Agent 流程

2. **`greeting`** - 打招呼
   - 範例: "你好", "嗨,你是誰?"
   - 動作: 返回歡迎訊息

3. **`out_of_scope`** - 超出範圍
   - 範例: "法官單身嗎?", "今天天氣如何?"
   - 動作: 返回拒絕訊息

4. **`unclear`** - 不清楚
   - 範例: "asdfgh", "???"
   - 動作: 返回澄清訊息

---

### **2. 生成回應**

**函數**: `generateOutOfScopeResponse(intent, question)`

**參數**:
- `intent` (string): 意圖類型
- `question` (string): 用戶問題

**返回值**: 友好的回應訊息 (string)

**範例**:
```javascript
// greeting
generateOutOfScopeResponse('greeting', '你好')
// → "您好!我是 LawSowl 法官分析助手。我可以幫您: ..."

// out_of_scope
generateOutOfScopeResponse('out_of_scope', '法官單身嗎?')
// → "抱歉,我只能回答與**法官判決分析**相關的問題。..."

// unclear
generateOutOfScopeResponse('unclear', 'asdfgh')
// → "抱歉,我不太理解您的問題。..."
```

---

## 💰 成本分析

### **Token 消耗對比**

| 問題類型 | 無意圖識別 | 有意圖識別 | 節省 |
|---------|-----------|-----------|------|
| **無關問題** | ~4,800 tokens | ~300 tokens | **94%** |
| **簡單問題** | ~10,000 tokens | ~10,300 tokens | -3% |
| **複雜問題** | ~30,000 tokens | ~30,300 tokens | -1% |

### **成本對比**

| 問題類型 | 無意圖識別 | 有意圖識別 | 節省 |
|---------|-----------|-----------|------|
| **無關問題** | $0.012 | $0.00005 | **$0.01195** |
| **簡單問題** | $0.025 | $0.02505 | -$0.00005 |
| **複雜問題** | $0.075 | $0.07505 | -$0.00005 |

### **每月節省估算**

假設:
- 每月 10,000 次查詢
- 30% 是無關問題

**節省**:
- Token: 10,000 × 30% × 4,500 = **13,500,000 tokens**
- 成本: 10,000 × 30% × $0.012 = **$36/月**

---

## 🧪 測試

### **運行測試**

```bash
cd d:\court_data\courtDataAPI
node tests/test-intent-classifier.js
```

### **測試案例**

測試腳本包含 13 個測試案例:
- ✅ 5 個法律分析相關問題
- ✅ 2 個打招呼問題
- ✅ 4 個超出範圍問題
- ✅ 2 個不清楚問題

### **預期結果**

```
========================================
測試總結
========================================
總測試數: 13
通過: 13
失敗: 0
準確率: 100.0%

平均 Token 使用: 250
總 Token 使用: 3250
總成本: $0.000488
平均耗時: 520ms
總耗時: 6760ms

========================================
成本對比 (vs 直接使用 GPT-4o)
========================================
超出範圍問題數: 8
節省 Token: 36000
節省成本: $0.090000
淨節省: $0.089512
```

---

## 📊 監控指標

### **關鍵指標**

1. **準確率**: 意圖分類的準確性
   - 目標: > 95%
   - 監控: 每週檢查誤分類案例

2. **響應時間**: 意圖識別耗時
   - 目標: < 1 秒
   - 監控: P50, P95, P99

3. **Token 使用**: 平均 Token 消耗
   - 目標: < 300 tokens/次
   - 監控: 每日平均值

4. **成本節省**: 實際節省的成本
   - 目標: > $30/月
   - 監控: 每月統計

### **日誌格式**

```
[Intent Classifier] 開始分類意圖...
[Intent Classifier] 問題: 法官單身嗎?
[Intent Classifier] 分類結果: out_of_scope
[Intent Classifier] Token 使用: { input: 245, output: 3, total: 248 }
[Intent Classifier] 耗時: 523 ms
[Intent Stats] { intent: 'out_of_scope', confidence: 'high', duration: 523, ... }
```

---

## 🔮 未來優化

### **短期** (1-2 週)

1. **添加緩存機制**
   - 緩存常見問題的分類結果
   - 減少重複調用 API

2. **優化 Prompt**
   - 進一步縮短 System Prompt
   - 提升分類準確率

### **中期** (1-2 月)

1. **本地模型**
   - 使用輕量級本地模型 (如 DistilBERT)
   - 完全消除 API 成本

2. **A/B 測試**
   - 測試不同模型的效果
   - 優化成本和準確率平衡

### **長期** (3-6 月)

1. **自動學習**
   - 收集用戶反饋
   - 持續優化分類邏輯

2. **多語言支持**
   - 支持英文、簡體中文等
   - 擴展國際市場

---

## 📞 聯繫方式

如有問題或建議,請聯繫開發團隊。

---

**文檔版本**: v1.0.0  
**最後更新**: 2025-10-03  
**維護者**: LawSowl Development Team

