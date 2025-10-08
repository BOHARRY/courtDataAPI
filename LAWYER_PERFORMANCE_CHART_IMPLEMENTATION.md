# 🎯 律師表現圖表實施總結

## 📋 需求分析

### 問題發現
用戶發現當前的圓餅圖顯示的是**案件勝敗**，而不是**律師表現**：
- ❌ 原告完全勝訴 / 原告部分勝訴 / 原告敗訴
- ❌ 沒有區分律師的立場（原告律師 vs 被告律師）
- ❌ 案件勝訴 ≠ 律師表現優秀

### 正確的邏輯
**數據來源**: `lawyer_performance` 欄位
```javascript
{
  "lawyer": "陳義文",
  "performance": "Excellent",  // ← 律師表現評級
  "outcome": "主要請求獲支持，確認債權不存在。",  // ← 律師的表現結果
  "justification": [...]
}
```

**關鍵區別**:
| 案件 | 律師立場 | 案件結果 | 律師表現 | 說明 |
|------|---------|---------|---------|------|
| A | 原告律師 | 原告完全勝訴 | Excellent | 原告律師表現優秀 ✅ |
| B | 被告律師 | 原告敗訴 | Good | 被告律師表現良好 ✅ |
| C | 原告律師 | 原告部分勝訴 | Fair | 原告律師表現普通 |
| D | 被告律師 | 原告完全勝訴 | Poor | 被告律師表現不佳 |

---

## 🎨 設計規格

### UI 布局
- **布局方式**: 圓餅圖左，表格右（左右布局）
- **表現等級視覺化**: 顏色圓點 + 文字（🟢 Excellent）
- **立場簡化**: 
  - 原告 → 原告
  - 被告 → 被告
  - 上訴人 → 上訴
  - 被上訴人 → 被訴

### 顏色方案
- **Excellent**: `#7fa37f` (深綠)
- **Good**: `#a8d5a8` (淺綠)
- **Fair**: `#f5c842` (黃色)
- **Poor**: `#e57373` (紅色)

---

## 🔧 實施內容

### 1️⃣ 後端修改

#### 文件: `services/lawyer.js`

**修改 1: 添加 `performance_details` 欄位** (line 111-131)
```javascript
const stats = {
  civil: {
    total_cases: 0,
    by_role: {
      plaintiff: { 
        total: 0, 
        trial_level: 0, 
        appeal_level: 0, 
        outcomes: {}, 
        performance: {}, 
        performance_details: [],  // 🆕 新增
        client_types: {} 
      },
      // ...
    }
  },
  // ...
};
```

**修改 2: 收集表現詳細數據** (line 133-185)
```javascript
cases.forEach(caseItem => {
  const performance = caseItem.lawyerPerfObject?.performance || 'unknown';
  const performanceOutcome = caseItem.lawyerPerfObject?.outcome || '';  // 🆕 新增
  
  // ...
  
  // 🆕 添加詳細的表現記錄（用於前端表格顯示）
  if (performance && performance !== 'unknown') {
    const perfKey = performance.toLowerCase();
    if (!roleStats.performance[perfKey]) roleStats.performance[perfKey] = 0;
    roleStats.performance[perfKey]++;
    
    roleStats.performance_details.push({
      performance: performance,
      outcome: performanceOutcome,
      case_id: caseItem.id
    });
  }
});
```

---

### 2️⃣ 前端修改

#### 新增文件 1: `LawyerPerformanceChart.js`

**功能**:
- 顯示律師表現分布圓餅圖（Excellent/Good/Fair/Poor）
- 顯示詳細表格（立場 + 律師表現 + 表現結果 + 案件數）

**關鍵函數**:

1. **`prepareChartData()`** - 準備圓餅圖數據
```javascript
const performanceData = {
  excellent: 0,
  good: 0,
  fair: 0,
  poor: 0
};

// 合併所有角色的表現數據
Object.values(data.by_role).forEach(roleData => {
  if (roleData.performance) {
    performanceData.excellent += roleData.performance.excellent || 0;
    performanceData.good += roleData.performance.good || 0;
    performanceData.fair += roleData.performance.fair || 0;
    performanceData.poor += roleData.performance.poor || 0;
  }
});
```

2. **`prepareTableData()`** - 準備表格數據
```javascript
Object.entries(data.by_role).forEach(([role, roleData]) => {
  if (roleData.performance_details && roleData.performance_details.length > 0) {
    // 按表現等級分組
    const grouped = {};
    roleData.performance_details.forEach(detail => {
      const key = `${detail.performance}_${detail.outcome}`;
      if (!grouped[key]) {
        grouped[key] = {
          role: simplifyRole(role),
          performance: detail.performance,
          outcome: detail.outcome,
          count: 0
        };
      }
      grouped[key].count++;
    });
    
    tableRows.push(...Object.values(grouped));
  }
});
```

3. **`simplifyRole()`** - 簡化立場名稱
```javascript
const simplifyRole = (role) => {
  const roleMap = {
    'plaintiff': '原告',
    'defendant': '被告',
    'appellant': '上訴',
    'appellee': '被訴'
  };
  return roleMap[role] || role;
};
```

---

#### 新增文件 2: `LawyerPerformanceChart.css`

**關鍵樣式**:

1. **左右布局**
```css
.lawyer-performance-container-lawyer-perf-green-v2 {
  display: flex;
  gap: 30px;
  padding: 20px;
}

.chart-section-lawyer-perf-green-v2 {
  flex: 0 0 300px;  /* 固定寬度 */
}

.table-section-lawyer-perf-green-v2 {
  flex: 1;  /* 自適應寬度 */
}
```

2. **顏色圓點**
```css
.performance-dot-lawyer-perf-green-v2 {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
```

3. **表格樣式**
```css
.performance-table-lawyer-perf-green-v2 thead {
  background: #f9fdf9;
  border-bottom: 2px solid #7fa37f;
}

.performance-table-lawyer-perf-green-v2 tbody tr:hover {
  background-color: #fafcfa;
}
```

---

#### 修改文件: `LawyerCaseTypeStats.js`

**修改 1: 導入新組件** (line 1-7)
```javascript
import LawyerPerformanceChart from './LawyerPerformanceChart';
```

**修改 2: 使用新組件** (line 173-199)
```javascript
<div className="case-type-stats">
  {typesToDisplay.map((typeKey) => {
    const data = detailedWinRates[typeKey];
    if (!data) return null;

    return (
      <div key={typeKey} className="case-type-stat-item">
        {/* ... */}
        <LawyerPerformanceChart data={data} caseType={typeKey} />
      </div>
    );
  })}
</div>
```

---

## 📊 數據流

```
判決書 (新格式)
  ↓
lawyer_performance
  → performance: "Excellent"/"Good"/"Fair"/"Poor"
  → outcome: "主要請求獲支持"
  ↓
後端 calculateEnhancedWinRates
  → 統計 performance 數量
  → 收集 performance_details
  ↓
前端 LawyerPerformanceChart
  → 圓餅圖: 顯示表現分布
  → 表格: 顯示立場 + 表現 + 結果
```

---

## 🎯 預期效果

### Before (修正前)
```
圓餅圖顯示:
- 原告完全勝訴 (綠色)
- 原告部分勝訴 (黃色)
- 原告敗訴 (紅色)

問題: 無法區分律師立場，案件勝訴 ≠ 律師表現優秀
```

### After (修正後)
```
圓餅圖顯示:
- Excellent: 1 筆 (深綠)
- Good: 2 筆 (淺綠)
- Fair: 1 筆 (黃色)
- Poor: 1 筆 (紅色)

表格顯示:
| 立場 | 律師表現 | 表現結果 | 案件數 |
|------|---------|---------|--------|
| 原告 | 🟢 Excellent | 主要請求獲支持 | 1 |
| 原告 | 🟢 Good | 部分請求獲支持 | 2 |
| 上訴 | 🟡 Fair | 上訴駁回 | 1 |
| 被訴 | 🔴 Poor | 請求駁回 | 1 |
```

---

## 📋 測試檢查清單

### 後端測試
- [ ] `performance_details` 正確收集
- [ ] `outcome` 正確傳遞
- [ ] 新舊數據都能正常處理

### 前端測試
- [ ] 圓餅圖正確顯示表現分布
- [ ] 表格正確顯示立場、表現、結果
- [ ] 顏色圓點正確顯示
- [ ] 立場名稱正確簡化（上訴人→上訴，被上訴人→被訴）
- [ ] 沒有控制台錯誤

---

**實施時間**: 2025-10-08
**狀態**: 待測試
**影響範圍**: 律師搜尋結果頁面的案件類型統計圖表

