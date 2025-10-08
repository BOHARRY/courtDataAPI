# 🎨 添加中文標籤：優異 / 不錯 / 尚可 / 可惜

## 需求

左側圖例顯示中文標籤，避免使用 "Poor" 這種可能讓律師不悅的英文詞彙。

---

## 中文標籤對應

| 英文 | 中文 | 說明 |
|------|------|------|
| Excellent | 優異 | 表現非常出色 |
| Good | 不錯 | 表現良好 |
| Fair | 尚可 | 表現普通 |
| Poor | 可惜 | 表現不佳（委婉說法） |

---

## 修改內容

**文件**: `lawsowl/src/components/lawyer/LawyerPerformanceChart.js`

### 1️⃣ 添加中文標籤映射函數

```javascript
// 獲取表現等級的中文標籤
const getPerformanceLabel = (performance) => {
  const labelMap = {
    'Excellent': '優異',
    'Good': '不錯',
    'Fair': '尚可',
    'Poor': '可惜'
  };
  return labelMap[performance] || performance;
};
```

### 2️⃣ 修改圖例顯示

```javascript
// Before
<div key={label} className="legend-item-lawyer-perf-green-v2">
  {getPerformanceDot(label)}
  <span className="legend-value-lawyer-perf-green-v2">{chartData.datasets[0].data[index]}</span>
</div>

// After
<div key={label} className="legend-item-lawyer-perf-green-v2">
  {getPerformanceDot(label)}
  <span className="legend-label-lawyer-perf-green-v2">{getPerformanceLabel(label)}</span>
  <span className="legend-value-lawyer-perf-green-v2">{chartData.datasets[0].data[index]}</span>
</div>
```

---

## 視覺效果

### Before (修改前)
```
🟢 1
🟢 2
🔴 2
```

### After (修改後)
```
🟢 優異 1
🟢 不錯 2
🔴 可惜 2
```

---

## 優點

### 1️⃣ **更友善的用詞**
- "可惜" 比 "Poor" 更委婉
- 避免律師看到負面評價時不悅

### 2️⃣ **符合中文使用習慣**
- 中文用戶更容易理解
- 不需要翻譯英文

### 3️⃣ **保持一致性**
- 整個系統使用中文介面
- 圖例也應該使用中文

---

## 相關文件

- ✅ `lawsowl/src/components/lawyer/LawyerPerformanceChart.js`

---

**修改時間**: 2025-10-08
**狀態**: 已完成
**影響**: 律師搜尋結果頁面的案件類型統計圖表圖例顯示

