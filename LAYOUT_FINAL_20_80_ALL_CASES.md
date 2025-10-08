# 🎨 最終布局調整：20% 圖例 + 80% 表格（顯示所有案件）

## 需求

1. ✅ 左右比例改為 **20% : 80%**
2. ✅ 表頭「律師表現」改為「表現」
3. ✅ 移除「案件數」欄位
4. ✅ 圖例不顯示英文（只顯示顏色圓點 + 數字）
5. ✅ 表格顯示所有案件（不分組）
6. ✅ 表現欄位只顯示顏色圓點（不顯示英文）

---

## 修改內容

### 1️⃣ CSS 修改

**文件**: `lawsowl/src/components/lawyer/LawyerPerformanceChart.css`

#### 修改 1: 左側區域改為 20%
```css
/* 左側：圖例區域（20%） */
.chart-section-lawyer-perf-green-v2 {
  flex: 0 0 20%;  /* 從 30% 改為 20% */
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 20px;
}
```

#### 修改 2: 右側區域改為 80%
```css
/* 右側：表格區域（80%，固定高度 340px，超過顯示滾動條） */
.table-section-lawyer-perf-green-v2 {
  flex: 0 0 80%;  /* 從 70% 改為 80% */
  max-height: 340px;
  overflow-y: auto;
  overflow-x: auto;
}
```

---

### 2️⃣ 組件修改

**文件**: `lawsowl/src/components/lawyer/LawyerPerformanceChart.js`

#### 修改 1: 圖例不顯示英文
```javascript
// Before
<div key={label} className="legend-item-lawyer-perf-green-v2">
  {getPerformanceDot(label)}
  <span className="legend-label-lawyer-perf-green-v2">{label}</span>  // ❌ 移除
  <span className="legend-value-lawyer-perf-green-v2">{chartData.datasets[0].data[index]}</span>
</div>

// After
<div key={label} className="legend-item-lawyer-perf-green-v2">
  {getPerformanceDot(label)}
  <span className="legend-value-lawyer-perf-green-v2">{chartData.datasets[0].data[index]}</span>
</div>
```

#### 修改 2: 表頭調整
```javascript
// Before
<thead>
  <tr>
    <th>立場</th>
    <th>律師表現</th>  // ❌ 改為「表現」
    <th>表現結果</th>
    <th>案件數</th>  // ❌ 移除
  </tr>
</thead>

// After
<thead>
  <tr>
    <th>立場</th>
    <th>表現</th>  // ✅ 簡化
    <th>表現結果</th>
  </tr>
</thead>
```

#### 修改 3: 表格內容調整
```javascript
// Before
<td className="performance-cell-lawyer-perf-green-v2">
  {getPerformanceDot(row.performance)}
  <span>{row.performance}</span>  // ❌ 移除英文
</td>
<td className="count-cell-lawyer-perf-green-v2">{row.count}</td>  // ❌ 移除案件數

// After
<td className="performance-cell-lawyer-perf-green-v2">
  {getPerformanceDot(row.performance)}  // ✅ 只顯示顏色圓點
</td>
```

#### 修改 4: 顯示所有案件（不分組）
```javascript
// Before
const prepareTableData = () => {
  const tableRows = [];
  
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
            count: 0  // ❌ 計數
          };
        }
        grouped[key].count++;
      });
      
      tableRows.push(...Object.values(grouped));
    }
  });
  
  return tableRows;
};

// After
const prepareTableData = () => {
  const tableRows = [];
  
  Object.entries(data.by_role).forEach(([role, roleData]) => {
    if (roleData.performance_details && roleData.performance_details.length > 0) {
      // 直接顯示所有案件，不分組
      roleData.performance_details.forEach(detail => {
        tableRows.push({
          role: simplifyRole(role),
          performance: detail.performance,
          outcome: detail.outcome,
          case_id: detail.case_id  // ✅ 保留案件 ID（未來可用於摘要）
        });
      });
    }
  });
  
  return tableRows;
};
```

---

## 布局對比

### Before (修改前)
```
┌─────────────────────────────────────────────────┐
│              民事案件表現                        │
├──────────┬──────────────────────────────────────┤
│          │                                      │
│  圖例     │         表格                         │
│  (30%)   │       (70%, max-height: 340px)      │
│          │                                      │
│ 🟢 Excellent │ 立場 │ 律師表現 │ 表現結果 │ 案件數 │
│ 🟢 Good      │ 原告 │ Excellent │ ... │ 1 │
│ 🔴 Poor      │ 原告 │ Good │ ... │ 2 │
│          │                                      │
└──────────┴──────────────────────────────────────┘
```

### After (修改後)
```
┌─────────────────────────────────────────────────┐
│              民事案件表現                        │
├──────┬──────────────────────────────────────────┤
│      │                                          │
│ 圖例  │         表格（所有案件）                  │
│(20%) │       (80%, max-height: 340px)          │
│      │                                          │
│ 🟢 1 │ 立場 │ 表現 │ 表現結果                    │
│ 🟢 2 │ 原告 │ 🟢  │ 原告全部勝訴                │
│ 🔴 2 │ 原告 │ 🟢  │ 原告對主要被告勝訴...        │
│      │ 原告 │ 🟢  │ 部分勝訴，慰撫金...          │
│      │ 原告 │ 🔴  │ 原告全數敗訴                │
│      │ 被告 │ 🟡  │ 部分敗訴部分勝訴            │
│      │ 上訴 │ 🔴  │ 上訴駁回，原判決維持         │
│      │                                          │
└──────┴──────────────────────────────────────────┘
```

---

## 優點

### 1️⃣ **更簡潔的視覺**
- 圖例只顯示顏色圓點 + 數字
- 表格只顯示顏色圓點（不顯示英文）
- 減少視覺干擾

### 2️⃣ **更多空間顯示表現結果**
- 表格從 70% 改為 80%
- 移除「案件數」欄位
- 可以顯示更長的「表現結果」文字

### 3️⃣ **顯示所有案件**
- 不再分組統計
- 每個案件都單獨顯示
- 方便查看律師在每個案件的具體表現

### 4️⃣ **符合實際使用場景**
- 普通律師一個月 2-3 件案子
- 近三年約 72-108 件案子
- 340px 高度 + 滾動條足夠顯示

---

## 預期效果

### 左側圖例（20%）
```
🟢 1
🟢 2
🔴 2
```

### 右側表格（80%）
```
┌────────────────────────────────────────────────┐
│ 立場 │ 表現 │ 表現結果                          │
├──────┼─────┼───────────────────────────────────┤
│ 原告 │ 🟢  │ 原告全部勝訴                       │
│ 原告 │ 🟢  │ 原告對主要被告勝訴，對其餘被告敗訴  │
│ 原告 │ 🟢  │ 部分勝訴，慰撫金請求未獲支持        │
│ 原告 │ 🔴  │ 原告全數敗訴                       │
│ 被告 │ 🟡  │ 部分敗訴部分勝訴                   │
│ 上訴 │ 🔴  │ 上訴駁回，原判決維持                │
└────────────────────────────────────────────────┘
↕️ 滾動條（如果超過 340px）
```

---

## 未來擴展

### 案件摘要功能（預留）
- 滑鼠移動到表格行上時，顯示案件摘要
- 使用 `case_id` 獲取案件詳細信息
- 可以顯示：案件名稱、法院、日期、主要爭點等

---

## 相關文件

- ✅ `lawsowl/src/components/lawyer/LawyerPerformanceChart.css`
- ✅ `lawsowl/src/components/lawyer/LawyerPerformanceChart.js`

---

**修改時間**: 2025-10-08
**狀態**: 已完成
**影響**: 律師搜尋結果頁面的案件類型統計圖表布局和顯示邏輯

