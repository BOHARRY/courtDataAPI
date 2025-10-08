# 🔧 修正：lawyerPerfObject 未傳遞到 calculateEnhancedWinRates

## 問題發現

通過後端日誌分析，發現了一個關鍵問題：

### ❌ 症狀
```javascript
{
  "civil": {
    "by_role": {
      "plaintiff": {
        "total": 5,
        "outcomes": { "win": 1, "partial_win": 2, "loss": 1 },
        "performance": {},  // ❌ 空的！
        "client_types": {}  // ❌ 空的！
      }
    }
  }
}
```

**問題**：
1. ❌ `performance` 是空對象，應該有 `excellent/good/fair/poor` 的統計
2. ❌ `client_types` 是空對象，應該有 `person/organization` 的統計
3. ❌ `excellence_rate` 是 0，因為沒有 performance 數據

---

## 🔍 根本原因

### 案件對象缺少 `lawyerPerfObject`

**原始代碼** (line 420-435):
```javascript
return {
  id: hit._id || source.JID,
  mainType,
  title: source.JTITLE || `${source.court || ''} ${mainType}案件`,
  court: source.court,
  jcase: source.JCASE,
  date: source.JDATE,
  dateNum: caseDate,
  cause: source.cause || '未指定',
  result: description,
  sideFromPerf: sideFromPerf,
  neutralOutcomeCode,
  // ❌ 缺少 lawyerPerfObject！
};
```

**問題**：
- `lawyerPerfObject` 包含了重要的數據：
  - `performance`: "Excellent"/"Good"/"Fair"/"Poor"
  - `level`: "trial"/"appeal"
  - `partyType`: "person"/"organization"
  - `dispositionClass`: "win"/"partial_win"/"loss"/etc.
- 但這個對象沒有被傳遞到返回的案件對象中
- 導致 `calculateEnhancedWinRates` 無法訪問這些數據

---

## ✅ 修正方案

### 修改案件對象，包含 `lawyerPerfObject`

**修正後的代碼** (line 420-436):
```javascript
return {
  id: hit._id || source.JID,
  mainType,
  title: source.JTITLE || `${source.court || ''} ${mainType}案件`,
  court: source.court,
  jcase: source.JCASE,
  date: source.JDATE,
  dateNum: caseDate,
  cause: source.cause || '未指定',
  result: description,
  sideFromPerf: sideFromPerf,
  neutralOutcomeCode,
  lawyerPerfObject,  // ✅ 新增！包含完整的律師表現對象
};
```

---

## 📊 修正後的預期結果

### Before (修正前)
```javascript
{
  "civil": {
    "by_role": {
      "plaintiff": {
        "total": 5,
        "outcomes": { "win": 1, "partial_win": 2, "loss": 1 },
        "performance": {},  // ❌ 空的
        "client_types": {},  // ❌ 空的
        "excellence_rate": 0  // ❌ 0%
      }
    }
  }
}
```

### After (修正後)
```javascript
{
  "civil": {
    "by_role": {
      "plaintiff": {
        "total": 5,
        "trial_level": 5,
        "appeal_level": 0,
        "outcomes": { "win": 1, "partial_win": 2, "loss": 1 },
        "performance": {  // ✅ 有數據！
          "excellent": 1,
          "good": 2,
          "fair": 1,
          "poor": 1
        },
        "client_types": {  // ✅ 有數據！
          "person": 2,
          "organization": 3
        },
        "win_rate": 60,
        "excellence_rate": 60  // ✅ (1+2)/5 = 60%
      }
    }
  }
}
```

---

## 🎯 影響範圍

### 前端顯示
修正後，前端可以顯示：
1. ✅ **律師表現優秀率**: `(excellent + good) / total * 100`
2. ✅ **客戶類型分布**: 個人客戶 vs 企業客戶
3. ✅ **審級分布**: 初審 vs 上訴審
4. ✅ **更準確的勝率計算**: 基於 `disposition.class`

### 數據完整性
修正後，`lawyerPerfObject` 包含：
```javascript
{
  side: "plaintiff",
  verdict: "部分勝訴部分敗訴",
  dispositionClass: "partial_win",  // 🆕 標準化分類
  performance: "Good",              // 🆕 AI 評估
  level: "trial",                   // 🆕 審級
  partyType: "organization"         // 🆕 客戶類型
}
```

---

## 🔧 相關修改

### 文件
- ✅ `services/lawyer.js` (line 420-436)

### 其他清理
- ✅ 註釋掉調試日誌 (line 321, 406-411)
- ✅ 保留關鍵的 `calculateEnhancedWinRates` 日誌

---

## 📋 測試檢查清單

### 後端測試
- [ ] `performance` 對象有數據（excellent/good/fair/poor）
- [ ] `client_types` 對象有數據（person/organization）
- [ ] `excellence_rate` 正確計算
- [ ] `trial_level` 和 `appeal_level` 正確統計

### 前端測試
- [ ] 圖表正確顯示
- [ ] 「近三年案件數」顯示正確（應該是 6）
- [ ] 勝率計算正確
- [ ] 沒有控制台錯誤

---

## 🚀 預期效果

### 「蕭嘉豪」律師的完整統計
```
總案件數: 6 筆
近三年案件數: 6 筆

民事案件（5 筆）:
- 原告角色: 5 筆
  - 完全勝訴: 1 筆 (Excellent)
  - 部分勝訴: 2 筆 (Good x2)
  - 敗訴: 1 筆 (Poor)
  - 上訴駁回: 1 筆 (Fair)
  
- 勝率: 60% (3/5)
- 表現優秀率: 60% (3/5)
- 客戶類型:
  - 個人: 2 筆
  - 組織: 3 筆
- 審級:
  - 初審: 5 筆
  - 上訴審: 0 筆
```

---

---

## 🐛 第二個問題：前端 getCaseCount 使用舊數據結構

### 問題發現

後端日誌顯示：
```
[Lawyer Service] 當前 totalCasesLast3Years: 6  ✅
```

但前端顯示：
```
參與案件數: 0  ❌
```

### 根本原因

**SearchLawyerResults.js** (line 130-138):
```javascript
const getCaseCount = (caseType) => {
  if (!displayData.stats?.detailedWinRates?.[caseType]) return 0;
  const data = displayData.stats.detailedWinRates[caseType];
  let total = 0;
  if (data.plaintiff?.total) total += data.plaintiff.total;  // ❌ 舊結構
  if (data.defendant?.total) total += data.defendant.total;  // ❌ 舊結構
  return total;
};
```

**問題**：
- 新的數據結構是 `data.by_role.plaintiff.total` 和 `data.total_cases`
- 但這個函數還在找 `data.plaintiff.total`（舊結構）
- 所以返回 0

### 修正方案

**修正後的代碼** (line 130-150):
```javascript
const getCaseCount = (caseType) => {
  if (!displayData.stats?.detailedWinRates?.[caseType]) return 0;
  const data = displayData.stats.detailedWinRates[caseType];

  // 🆕 優先使用新的數據結構 total_cases
  if (data.total_cases !== undefined) {
    return data.total_cases;
  }

  // 🆕 適配新的數據結構 by_role
  let total = 0;
  if (data.by_role?.plaintiff?.total) total += data.by_role.plaintiff.total;
  if (data.by_role?.defendant?.total) total += data.by_role.defendant.total;

  // 回退到舊結構
  if (data.plaintiff?.total) total += data.plaintiff.total;
  if (data.defendant?.total) total += data.defendant.total;

  return total;
};
```

### 預期效果

#### Before (修正前)
```javascript
civilCaseCount = 0  // ❌ data.plaintiff.total 不存在
參與案件數 = 0
```

#### After (修正後)
```javascript
civilCaseCount = 5  // ✅ data.total_cases
參與案件數 = 5  // ✅ 正確！
```

---

**修正時間**: 2025-10-08
**測試狀態**: 待測試
**預期影響**:
- ✅ 後端：performance 從空對象 → 有完整統計
- ✅ 後端：client_types 從空對象 → 有完整統計
- ✅ 後端：excellence_rate 從 0% → 60%
- ✅ 前端：參與案件數從 0 → 5
- ✅ 前端：圖表正確顯示

