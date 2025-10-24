# 金額分析 UI 重新設計總結

## 📅 更新日期
2025-10-24

## 🎯 設計理念轉變

### **從「AI 教律師」→「給律師數據，讓律師自己判斷」**

**移除**：
- ❌ AI 洞察文字（主觀推測、解釋性語言）
- ❌ 代表性案例選擇
- ❌ 異常值詳細說明

**新增**：
- ✅ 箱型圖（Box Plot）視覺化
- ✅ 案件明細表（可追溯、可比較）
- ✅ TAB 切換介面（圖表 vs 列表）

---

## 🔧 後端修改

### **文件：`services/amountAnalysisService.js`**

#### **移除的功能**
1. **代表性案例選擇**
   ```javascript
   // ❌ 移除
   // const representativeCases = selectRepresentativeCases(normalAmounts, statistics);
   ```

2. **AI 洞察生成**
   ```javascript
   // ❌ 移除
   // let insights = [];
   // try {
   //     insights = await generateAmountInsights(statistics, normalAmounts, position);
   // } catch (error) {
   //     insights = generateBasicInsights(statistics, normalAmounts);
   // }
   ```

#### **修改後的返回結構**
```javascript
const analysisResult = {
    statistics,              // 統計數據（中位數、IQR、標準差等）
    amounts: normalAmounts,  // 正常範圍內的案件（包含 caseId, caseTitle, claimAmount, grantedAmount）
    excludedCount,           // 排除的案件數（請求或獲准金額為 0）
    outlierCount,            // 異常值案件數
    outliers                 // 異常值案件列表
    // ❌ representativeCases: 移除
    // ❌ insights: 移除
};
```

---

## 🎨 前端修改

### **1. 新增組件**

#### **`src/components/BoxPlotChart.js`**
- 使用 `Chart.js` + `@sgratzl/chartjs-chart-boxplot`
- 顯示請求金額和獲准金額的箱型圖
- 包含圖例說明（箱體、中線、鬚線、異常值）

**數據轉換**：
```javascript
data: [
  {
    min: statistics.claimAmount.min / 10000,
    q1: statistics.claimAmount.q1 / 10000,
    median: statistics.claimAmount.median / 10000,
    q3: statistics.claimAmount.q3 / 10000,
    max: statistics.claimAmount.max / 10000
  },
  // ... 獲准金額
]
```

#### **`src/components/CaseDetailTable.js`**
- 顯示案件明細列表
- 欄位：案件名稱（JID）、案由（JTITLE）、請求金額、獲准金額、獲准率
- 支持響應式設計

**數據來源**：
```javascript
amounts.map((amount) => ({
  caseId: amount.caseId,        // JID
  caseTitle: amount.caseTitle,  // JTITLE
  claimAmount: amount.claimAmount,
  grantedAmount: amount.grantedAmount
}))
```

#### **`src/components/CaseDetailTable.css`**
- 使用 `-amountguide` 詞綴避免 CSS 污染
- 表格樣式、hover 效果、響應式設計

### **2. 修改組件**

#### **`src/nodes/ResultNode/AmountAnalysisNodeV2.js`**

**新增狀態**：
```javascript
const [activeTab, setActiveTab] = useState('chart'); // 'chart' | 'list'
```

**移除的數據**：
```javascript
// ❌ 移除
// const representativeCases = amountData?.representativeCases || [];
// const insights = amountData?.insights || [];
// const outliers = amountData?.outliers || [];
```

**新增 UI 結構**：
```jsx
{/* TAB 切換按鈕 */}
<div className="amount-tabs-amountguide">
  <button onClick={() => setActiveTab('chart')}>
    📊 基本分析(圖表)
  </button>
  <button onClick={() => setActiveTab('list')}>
    📋 案件列表
  </button>
</div>

{/* TAB 內容區 */}
{activeTab === 'chart' && (
  <BoxPlotChart statistics={statistics} amounts={amounts} />
)}

{activeTab === 'list' && (
  <CaseDetailTable amounts={amounts} />
)}
```

#### **`src/nodes/ResultNode/AmountAnalysisNodeV2.css`**

**新增樣式**：
- `.amount-tabs-amountguide` - TAB 按鈕容器
- `.amount-tab-button-amountguide` - TAB 按鈕
- `.amount-tab-button-amountguide.active` - 激活狀態
- `.amount-chart-tab-amountguide` - 圖表視圖容器
- `.amount-list-tab-amountguide` - 列表視圖容器
- `.boxplot-container-amountguide` - 箱型圖容器
- `.boxplot-legend-amountguide` - 箱型圖圖例

---

## 📦 依賴安裝

```bash
npm install @sgratzl/chartjs-chart-boxplot
```

**已安裝的依賴**：
- `chart.js`: ^4.4.9
- `react-chartjs-2`: ^5.3.0

---

## 🔍 數據流

```
前端觸發金額分析
  ↓
後端 amountAnalysisService.js
  ↓
從 ES 獲取 50 篇判決的 JID 列表
  ↓
keyMetricsFetcher.js: batchGetKeyMetrics(jids)
  _source: ['JID', 'JTITLE', 'key_metrics']
  ↓
返回案件數組：
  {
    caseId: JID,
    caseTitle: JTITLE,
    claimAmount: key_metrics.civil_metrics.claim_amount,
    grantedAmount: key_metrics.civil_metrics.granted_amount
  }
  ↓
amountUtils.js: extractAmountData(cases)
  - 篩選：claimAmount > 0 AND grantedAmount > 0
  ↓
amountUtils.js: calculateStatistics(validAmounts)
  - 使用 2σ 法則排除異常值
  - 計算統計數據（中位數、IQR、標準差）
  ↓
返回給前端：
  {
    statistics,
    amounts: normalAmounts,  // 包含 caseId, caseTitle, claimAmount, grantedAmount
    excludedCount,
    outlierCount,
    outliers
  }
  ↓
前端顯示：
  - TAB 1: 箱型圖（BoxPlotChart）
  - TAB 2: 案件列表（CaseDetailTable）
```

---

## ✅ 優勢

### **1. 信任感**
- 律師看到的是「原始數據」而非「AI 解讀」
- 每個數據點都能追溯到具體案件（JID）

### **2. 專業感**
- 箱型圖是統計學標準工具，律師認可
- 數據可視化清晰、直觀

### **3. 可追溯性**
- 案件列表顯示 JID 和 JTITLE
- 律師可以自行查閱原始判決

### **4. 可引用性**
- 可以直接截圖放進報告、簡報
- 數據客觀、無主觀推測

---

## 🧪 測試建議

1. **後端測試**：
   - 確認返回的 `amounts` 包含 `caseId` 和 `caseTitle`
   - 確認異常值已被正確排除

2. **前端測試**：
   - TAB 切換是否正常
   - 箱型圖是否正確顯示
   - 案件列表是否正確顯示 JID 和 JTITLE
   - 金額格式化是否正確（萬元 vs 元）

3. **UI/UX 測試**：
   - 響應式設計是否正常
   - CSS 是否有污染其他組件
   - 顏色、字體是否符合設計規範

---

## 📝 未來改進方向

1. **案件列表增強**：
   - 排序功能（按金額、獲准率）
   - 搜尋功能（案件名稱、案由）
   - 點擊跳轉到判決全文

2. **箱型圖增強**：
   - 與案件列表聯動（hover 高亮）
   - 異常值點擊顯示詳情
   - 支持篩選條件（法院、年份、法官）

3. **數據導出**：
   - 導出為 Excel
   - 導出為 PDF 報告

---

## 🎯 總結

這次重新設計將金額分析從「AI 教律師」轉變為「給律師數據工具」，更符合律師的使用習慣和專業需求。通過箱型圖和案件列表的組合，律師可以快速了解金額分布，並追溯到具體案件，從而做出更準確的判斷。

