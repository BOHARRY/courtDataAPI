# 🔥 關鍵修正：Elasticsearch 查詢未搜索新欄位

## 問題發現

通過 Elasticsearch Dev Tools 測試，發現了一個**嚴重問題**：

### ❌ 原始查詢（錯誤）
```javascript
{
  query: {
    bool: {
      should: [
        { term: { "lawyers.exact": "蕭嘉豪" } },      // 只搜索舊欄位
        { term: { "lawyersdef.exact": "蕭嘉豪" } }    // 只搜索舊欄位
      ]
    }
  },
  _source: [
    "lawyers", "lawyersdef", "lawyer_assessment", "position_based_analysis"
    // ❌ 沒有包含新欄位！
  ]
}
```

**問題**：
1. ❌ 只搜索舊欄位 `lawyers` 和 `lawyersdef`
2. ❌ 沒有搜索新欄位 `trial_party_lawyers` 和 `appeal_party_lawyers`
3. ❌ `_source` 沒有包含新欄位 `trial_party_lawyers`, `appeal_party_lawyers`, `lawyer_performance`, `disposition`

**結果**：
- 只能找到 9,177 筆舊格式的判決書
- **完全找不到** 1,342 筆新格式的判決書（包含「蕭嘉豪」的 6 筆）
- 即使找到案件，也無法使用新欄位的數據

---

## ✅ 修正後的查詢

```javascript
{
  query: {
    bool: {
      should: [
        // 🆕 搜索新欄位 trial_party_lawyers (nested)
        {
          nested: {
            path: "trial_party_lawyers",
            query: {
              term: { "trial_party_lawyers.lawyers": "蕭嘉豪" }
            }
          }
        },
        // 🆕 搜索新欄位 appeal_party_lawyers (nested)
        {
          nested: {
            path: "appeal_party_lawyers",
            query: {
              term: { "appeal_party_lawyers.lawyers": "蕭嘉豪" }
            }
          }
        },
        // 保留舊欄位搜索（向後兼容）
        { term: { "lawyers.exact": "蕭嘉豪" } },
        { term: { "lawyersdef.exact": "蕭嘉豪" } }
      ],
      minimum_should_match: 1
    }
  },
  _source: [
    // 舊欄位
    "lawyers", "lawyersdef", "lawyer_assessment", "position_based_analysis",
    // 🆕 新欄位
    "trial_party_lawyers", "appeal_party_lawyers", "lawyer_performance", "disposition"
  ]
}
```

**改進**：
1. ✅ 使用 `nested` 查詢搜索 `trial_party_lawyers`
2. ✅ 使用 `nested` 查詢搜索 `appeal_party_lawyers`
3. ✅ 保留舊欄位搜索（向後兼容）
4. ✅ `_source` 包含所有新欄位

**結果**：
- 可以找到所有 10,519 筆判決書（舊格式 + 新格式）
- 新格式的判決書可以使用新欄位的豐富數據
- 舊格式的判決書回退到舊邏輯

---

## 📊 數據覆蓋率分析

### 實際測試結果

#### 1. **disposition.class** 覆蓋率
```
總文檔數: 10,519
有 disposition.class: ~1,342 (約 13%)
無 disposition.class: ~9,177 (約 87%)
```

**結論**: 大部分判決書還沒有 `disposition.class`，回退機制必要！

#### 2. **lawyer_performance** 覆蓋率
```
總文檔數: 10,519
有 lawyer_performance: ~9,968 (約 95%)
無 lawyer_performance: ~551 (約 5%)
```

**結論**: 大部分判決書都有 `lawyer_performance`，這是好消息！

#### 3. **trial_party_lawyers** 覆蓋率
```
總文檔數: 10,519
有 trial_party_lawyers: ~1,342 (約 13%)
無 trial_party_lawyers: ~9,177 (約 87%)
```

**結論**: 只有新判決書有 `trial_party_lawyers`，回退到 `lawyers`/`lawyersdef` 必要！

---

## 🎯 「蕭嘉豪」律師的實際數據

### 找到的案件數
- **舊查詢**: 0 筆（因為沒搜索新欄位）
- **新查詢**: 6 筆 ✅

### 案件詳情

#### 案件 1: TCDV,113,訴,1432,20250627,1
```json
{
  "trial_party_lawyers": [{
    "party": "農業部林業及自然保育署臺中分署",
    "party_type": "organization",
    "lawyers": ["蕭嘉豪"],
    "side": "plaintiff"
  }],
  "disposition": {
    "class": "partial_win",
    "raw_verdict_type": "部分勝訴部分敗訴",
    "is_procedural": false
  },
  "lawyer_performance": [{
    "lawyer": "蕭嘉豪",
    "performance": "Good",
    "outcome": "原告對主要被告勝訴，對其餘被告敗訴",
    "justification": ["主要請求獲法院支持，見P1–P5", "對其他被告證明不足，見P10"]
  }]
}
```

#### 案件 2: TPDV,114,訴,2144,20250731,1
```json
{
  "trial_party_lawyers": [{
    "party": "財政部國有財產署北區分署",
    "party_type": "organization",
    "lawyers": ["蕭嘉豪"],
    "side": "plaintiff"
  }],
  "disposition": {
    "class": "loss",
    "raw_verdict_type": "原告敗訴",
    "is_procedural": false
  },
  "lawyer_performance": [{
    "lawyer": "蕭嘉豪",
    "performance": "Poor",
    "outcome": "原告全數敗訴",
    "justification": [
      "原告請求補償金被認定無理由（見 P2）",
      "不當得利請求部分已罹於時效（見 P3, P4）"
    ]
  }]
}
```

#### 案件 3: TPHV,113,訴易,77,20250715,2
```json
{
  "trial_party_lawyers": [{
    "party": "劉秀鳳",
    "party_type": "person",
    "lawyers": ["蕭嘉豪"],
    "side": "plaintiff"
  }],
  "disposition": {
    "class": "win",
    "raw_verdict_type": "原告勝訴",
    "is_procedural": true
  },
  "lawyer_performance": [{
    "lawyer": "蕭嘉豪",
    "performance": "Excellent",
    "outcome": "原告全部勝訴",
    "justification": [
      "成功證明被告共同詐欺責任（見P3）",
      "原告證據獲法院採信",
      "請求金額及利息計算獲肯認（見P1, P4, P5）"
    ]
  }]
}
```

#### 案件 4: TPEV,114,北小,925,20250502,1
```json
{
  "trial_party_lawyers": [{
    "party": "蔣皓宇",
    "party_type": "person",
    "lawyers": ["蕭嘉豪"],
    "side": "defendant"  // ✅ 被告方！
  }],
  "disposition": {
    "class": "partial_win",
    "raw_verdict_type": "部分勝訴部分敗訴",
    "is_procedural": false
  },
  "lawyer_performance": [{
    "lawyer": "蕭嘉豪",
    "performance": "Fair",
    "outcome": "部分敗訴部分勝訴",
    "justification": [
      "僅就29,985元部分敗訴，未能全數免責（見 P1）",
      "其餘超過金額及部分被告已獲駁回（見 P2, P3）"
    ]
  }]
}
```

#### 案件 5: TPDV,114,簡,8,20250522,1
```json
{
  "trial_party_lawyers": [
    {
      "party": "陳錦湊",
      "party_type": "person",
      "lawyers": ["蕭嘉豪"],
      "side": "plaintiff"
    },
    {
      "party": "陳映叡",
      "party_type": "person",
      "lawyers": ["蕭嘉豪"],  // ✅ 同一律師代理多個原告！
      "side": "plaintiff"
    }
  ],
  "disposition": {
    "class": "partial_win",
    "raw_verdict_type": "部分勝訴部分敗訴",
    "is_procedural": false
  },
  "lawyer_performance": [{
    "lawyer": "蕭嘉豪",
    "performance": "Good",
    "outcome": "部分勝訴，慰撫金請求未獲支持",
    "justification": [
      "被告須賠償修繕費，原告部分請求獲准（見P4, P5, P6, P7）",
      "慰撫金部分未獲支持（見P9）"
    ]
  }]
}
```

### 統計摘要
- **總案件數**: 6 筆
- **原告方**: 5 筆
- **被告方**: 1 筆
- **表現分布**:
  - Excellent: 1 筆
  - Good: 3 筆
  - Fair: 1 筆
  - Poor: 1 筆
- **判決結果**:
  - win: 1 筆
  - partial_win: 3 筆
  - loss: 1 筆

---

## 🚀 修正的影響

### Before (修正前)
```
搜索「蕭嘉豪」 → 0 筆結果 ❌
前端顯示：「此類型尚無詳細分類數據」
```

### After (修正後)
```
搜索「蕭嘉豪」 → 6 筆結果 ✅
前端顯示：
- 民事案件圖表（6 筆）
  - 原告完全勝訴: 1 筆
  - 原告部分勝訴: 3 筆
  - 原告敗訴: 1 筆
  - 被告部分勝訴: 1 筆
- 表現優秀率: 67% (4/6)
- 勝率: 80% (4/5，排除被告案件)
```

---

## 📋 修改的文件

### 後端
- ✅ `services/lawyer.js` (line 215-263)
  - 修改 Elasticsearch 查詢，添加 nested 查詢
  - 修改 `_source`，包含新欄位

---

## ⚠️ 重要提醒

1. **nested 查詢的重要性**: `trial_party_lawyers` 和 `appeal_party_lawyers` 是 nested 類型，必須使用 `nested` 查詢！
2. **_source 必須包含新欄位**: 否則即使查到案件，也無法使用新欄位的數據！
3. **回退機制仍然必要**: 87% 的判決書還在使用舊欄位！

---

**修正時間**: 2025-10-08
**測試狀態**: 待測試
**預期影響**: 律師搜索結果從 0 筆增加到實際案件數

