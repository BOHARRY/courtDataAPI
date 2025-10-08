# 🎨 布局調整：30% 圖例 + 70% 表格

## 需求

1. ✅ 左右比例從均分改為 **30% : 70%**
2. ✅ 移除圓餅圖（只保留圖例）
3. ✅ 右側表格固定高度 **340px**，超過顯示滾動條

---

## 修改內容

### 1️⃣ CSS 修改

**文件**: `lawsowl/src/components/lawyer/LawyerPerformanceChart.css`

#### 修改 1: 左側區域改為 30%
```css
/* 左側：圖例區域（30%） */
.chart-section-lawyer-perf-green-v2 {
  flex: 0 0 30%;  /* 從 300px 改為 30% */
  display: flex;
  flex-direction: column;
  align-items: flex-start;  /* 從 center 改為 flex-start */
  gap: 20px;
}
```

#### 修改 2: 隱藏圓餅圖
```css
/* 移除圓餅圖 */
.chart-wrapper-lawyer-perf-green-v2 {
  display: none;  /* 新增 */
}
```

#### 修改 3: 右側區域改為 70%，固定高度 340px
```css
/* 右側：表格區域（70%，固定高度 340px，超過顯示滾動條） */
.table-section-lawyer-perf-green-v2 {
  flex: 0 0 70%;  /* 從 flex: 1 改為 flex: 0 0 70% */
  max-height: 340px;  /* 新增 */
  overflow-y: auto;  /* 新增 */
  overflow-x: auto;
}
```

---

### 2️⃣ 組件修改

**文件**: `lawsowl/src/components/lawyer/LawyerPerformanceChart.js`

#### 修改 1: 移除 Doughnut import
```javascript
// Before
import { Doughnut } from 'react-chartjs-2';

// After
// 移除（不再需要）
```

#### 修改 2: 移除圓餅圖渲染
```javascript
// Before
<div className="chart-section-lawyer-perf-green-v2">
  <div className="chart-wrapper-lawyer-perf-green-v2">
    <Doughnut data={chartData} options={chartOptions} />
  </div>
  <div className="chart-legend-lawyer-perf-green-v2">
    {/* 圖例 */}
  </div>
</div>

// After
<div className="chart-section-lawyer-perf-green-v2">
  <div className="chart-legend-lawyer-perf-green-v2">
    {/* 只保留圖例 */}
  </div>
</div>
```

---

## 布局對比

### Before (修改前)
```
┌─────────────────────────────────────────────────┐
│              民事案件表現                        │
├──────────────────┬──────────────────────────────┤
│                  │                              │
│   圓餅圖          │         表格                 │
│   (300px)        │       (flex: 1)              │
│                  │                              │
│   圖例            │                              │
│                  │                              │
└──────────────────┴──────────────────────────────┘
```

### After (修改後)
```
┌─────────────────────────────────────────────────┐
│              民事案件表現                        │
├──────────┬──────────────────────────────────────┤
│          │                                      │
│  圖例     │         表格                         │
│  (30%)   │       (70%, max-height: 340px)      │
│          │       ↕️ 滾動條（如果超過 340px）      │
│          │                                      │
└──────────┴──────────────────────────────────────┘
```

---

## 優點

### 1️⃣ **更多空間顯示表格內容**
- 表格從 `flex: 1` 改為 `70%`
- 可以顯示更多的「表現結果」文字（AI 生成的自然語言描述）

### 2️⃣ **簡化視覺**
- 移除圓餅圖，減少視覺干擾
- 圖例已經足夠表達表現分布

### 3️⃣ **固定高度，避免頁面過長**
- 表格固定高度 340px
- 超過高度顯示滾動條
- 保持頁面整潔

---

## 預期效果

### 左側（30%）
```
┌──────────────┐
│ 🟢 Excellent │ 1
│ 🟢 Good      │ 2
│ 🔴 Poor      │ 2
└──────────────┘
```

### 右側（70%，max-height: 340px）
```
┌────────────────────────────────────────────────┐
│ 立場 │ 律師表現 │ 表現結果 │ 案件數 │
├──────┼─────────┼─────────┼────────┤
│ 原告 │ 🟢 Excellent │ 原告全部勝訴 │ 1 │
│ 原告 │ 🟢 Good │ 原告對主要被告勝訴，對其餘被告敗訴 │ 1 │
│ 原告 │ 🟢 Good │ 部分勝訴，慰撫金請求未獲支持 │ 1 │
│ 原告 │ 🔴 Poor │ 原告全數敗訴 │ 1 │
│ 被告 │ 🟡 Fair │ 部分敗訴部分勝訴 │ 1 │
│ 上訴 │ 🔴 Poor │ 上訴駁回，原判決維持 │ 1 │
└────────────────────────────────────────────────┘
↕️ 滾動條（如果超過 340px）
```

---

## 相關文件

- ✅ `lawsowl/src/components/lawyer/LawyerPerformanceChart.css`
- ✅ `lawsowl/src/components/lawyer/LawyerPerformanceChart.js`

---

**修改時間**: 2025-10-08
**狀態**: 已完成
**影響**: 律師搜尋結果頁面的案件類型統計圖表布局

