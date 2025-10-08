# 🎨 漸層色條設計 + 降低紅色權重

## 需求

1. ✅ 在圖例上方添加 38px 高度的漸層色條
2. ✅ 漸層色根據表現比例動態生成（綠 → 紅）
3. ✅ 使用平滑漸層過渡（不是硬切換色塊）
4. ✅ 降低紅色（可惜）的視覺權重，避免律師生氣 😂

---

## 設計理念

### 視覺化律師表現分布

漸層色條提供了一個直觀的視覺化方式，讓用戶一眼就能看出律師的整體表現：

- **左側綠色多** = 表現優異的案件多
- **右側紅色多** = 表現不佳的案件多
- **中間黃色多** = 表現普通的案件多

### 降低紅色權重的原因

為了避免律師看到大片紅色而不悅，我們將紅色（可惜）的視覺權重減半：

```javascript
const poorPercent = (performanceData.poor / total) * 100 * 0.5; // 🎨 紅色權重減半
```

**效果**：
- 原本：優異 1、不錯 2、可惜 2 → 紅色佔 40%
- 調整後：優異 1、不錯 2、可惜 2 → 紅色佔約 25%

---

## 實現細節

### 1️⃣ 計算表現數據

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

### 2️⃣ 調整權重

```javascript
// 計算百分比（降低紅色權重）
const excellentPercent = (performanceData.excellent / total) * 100;
const goodPercent = (performanceData.good / total) * 100;
const fairPercent = (performanceData.fair / total) * 100;
const poorPercent = (performanceData.poor / total) * 100 * 0.5; // 🎨 紅色權重減半

// 重新計算總和以保持 100%
const adjustedTotal = excellentPercent + goodPercent + fairPercent + poorPercent;
const excellentAdjusted = (excellentPercent / adjustedTotal) * 100;
const goodAdjusted = (goodPercent / adjustedTotal) * 100;
const fairAdjusted = (fairPercent / adjustedTotal) * 100;
const poorAdjusted = (poorPercent / adjustedTotal) * 100;
```

### 3️⃣ 生成平滑漸層

```javascript
let gradientStops = [];
let currentPercent = 0;

// 優異（深綠 #7fa37f）
if (excellentAdjusted > 0) {
  gradientStops.push(`#7fa37f ${currentPercent}%`);
  currentPercent += excellentAdjusted;
}

// 不錯（淺綠 #a8d5a8）
if (goodAdjusted > 0) {
  gradientStops.push(`#a8d5a8 ${currentPercent}%`);
  currentPercent += goodAdjusted;
}

// 尚可（黃色 #f5c842）
if (fairAdjusted > 0) {
  gradientStops.push(`#f5c842 ${currentPercent}%`);
  currentPercent += fairAdjusted;
}

// 可惜（紅色 #e57373，權重已減半）
if (poorAdjusted > 0) {
  gradientStops.push(`#e57373 ${currentPercent}%`);
  currentPercent += poorAdjusted;
  gradientStops.push(`#e57373 ${currentPercent}%`);
}

return {
  background: `linear-gradient(to right, ${gradientStops.join(', ')})`
};
```

### 4️⃣ CSS 樣式

```css
.performance-gradient-bar-lawyer-perf-green-v2 {
  width: 100%;
  height: 38px;
  border-radius: 6px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
}

.performance-gradient-bar-lawyer-perf-green-v2:hover {
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
  transform: translateY(-1px);
}
```

---

## 視覺效果

### Before (修改前)
```
🟢 優異 1
🟢 不錯 2
🔴 可惜 2
```

### After (修改後)
```
┌────────────────────────────────────┐
│ 🟢🟢🟢🟢🟡🟡🟡🟡🟡🟡🔴🔴 │ ← 漸層色條（紅色權重減半）
└────────────────────────────────────┘

🟢 優異 1
🟢 不錯 2
🔴 可惜 2
```

---

## 權重調整對比

### 原始比例（未調整）
```
優異: 1/5 = 20%  ████
不錯: 2/5 = 40%  ████████
可惜: 2/5 = 40%  ████████  ← 紅色太多！
```

### 調整後比例（紅色減半）
```
優異: 1 → 1.0 = 25%   █████
不錯: 2 → 2.0 = 50%   ██████████
可惜: 2 → 1.0 = 25%   █████  ← 紅色減少了！
```

---

## 優點

### 1️⃣ **視覺化表現分布**
- 一眼就能看出律師的整體表現
- 漸層色比數字更直觀

### 2️⃣ **平滑過渡**
- 使用 CSS `linear-gradient` 實現平滑漸層
- 不是硬切換的色塊，更美觀

### 3️⃣ **降低負面視覺衝擊**
- 紅色權重減半，避免律師看到大片紅色而不悅
- 保持數據真實性的同時，優化視覺體驗

### 4️⃣ **互動效果**
- Hover 時有陰影和位移效果
- 提升用戶體驗

---

## 未來擴展

### 可調整的權重係數

可以讓用戶自定義紅色權重：

```javascript
const RED_WEIGHT = 0.5; // 可調整為 0.3, 0.4, 0.5, 0.6 等

const poorPercent = (performanceData.poor / total) * 100 * RED_WEIGHT;
```

### Tooltip 顯示詳細數據

滑鼠移動到漸層色條時，顯示詳細的百分比：

```
優異: 20% (1 件)
不錯: 40% (2 件)
可惜: 40% (2 件) → 視覺權重調整為 25%
```

---

## 相關文件

- ✅ `lawsowl/src/components/lawyer/LawyerPerformanceChart.js`
- ✅ `lawsowl/src/components/lawyer/LawyerPerformanceChart.css`

---

**修改時間**: 2025-10-08
**狀態**: 已完成
**影響**: 律師搜尋結果頁面的案件類型統計圖表視覺化
**特色**: 降低紅色權重，避免律師生氣 😂

