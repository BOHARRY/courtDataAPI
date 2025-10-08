# 律師數據分析重構完成總結

## ✅ 完成的工作

### 1. 後端重構 (`services/lawyer.js`)

#### 新增的輔助函數

**1.1 `getLawyerRoleFromCase(caseData, lawyerName)`**
- 使用新欄位 `trial_party_lawyers` 和 `appeal_party_lawyers`
- 精確識別律師角色（原告/被告）
- 區分審級（初審/上訴審）
- 提取當事人類型（個人/組織）

**1.2 `getLawyerPerformanceFromCase(caseData, lawyerName)`**
- 使用新欄位 `lawyer_performance`
- 提取 AI 評估的律師表現（Good/Fair/Poor）
- 獲取判決結果和理由

**1.3 `getDispositionClass(caseData)`**
- 使用新欄位 `disposition.class`
- 標準化判決結果分類
- 回退到舊的 `verdict_type` 判斷

**1.4 `calculateEnhancedWinRates(cases)` 🆕**
- 全新的統計計算邏輯
- 返回結構化的數據：
  ```javascript
  {
    civil: {
      total_cases: 6,
      overall: 70,  // 整體勝率
      by_role: {
        plaintiff: {
          total: 5,
          trial_level: 4,
          appeal_level: 1,
          outcomes: { win: 2, partial_win: 1, loss: 1, settlement: 1 },
          performance: { good: 3, fair: 1, poor: 1 },
          client_types: { person: 2, organization: 3 },
          win_rate: 75
        },
        defendant: { ... }
      }
    },
    criminal: { ... },
    administrative: { ... }
  }
  ```

#### 修改的主要邏輯

**案件處理循環（line 198-250）**
- 使用新的輔助函數提取律師角色
- 優先使用 `lawyer_performance` 數據
- 回退到舊的 `lawyer_assessment` 和 `position_based_analysis`
- 在 `lawyerPerfObject` 中添加新欄位：
  - `dispositionClass`: 標準化判決分類
  - `performance`: AI 評估（Good/Fair/Poor）
  - `level`: 審級（trial/appeal）
  - `partyType`: 當事人類型（person/organization）

**統計計算（line 302-309）**
- 優先使用新的 `calculateEnhancedWinRates` 函數
- 如果失敗，回退到舊的 `calculateDetailedWinRates`
- 確保向後兼容

---

### 2. 前端重構 (`LawyerCaseTypeStats.js`)

#### 修改的函數

**`convertToChartData(data, caseType)` (line 17-84)**
- 適配新的數據結構 `data.by_role.plaintiff/defendant`
- 使用新的欄位名稱：
  - `outcomes.win` (完全勝訴)
  - `outcomes.partial_win` (部分勝訴)
  - `outcomes.loss` (敗訴)
  - `outcomes.settlement` (和解)
  - `outcomes.procedural` (程序駁回)
- 為每個結果添加顏色標記
- 添加詳細的調試日誌

#### 圖表數據格式

**民事案件**
```javascript
[
  { result: '原告完全勝訴', count: 2, color: '#7fa37f', percent: 40 },
  { result: '原告部分勝訴', count: 1, color: '#a8d5a8', percent: 20 },
  { result: '原告敗訴', count: 1, color: '#e74c3c', percent: 20 },
  { result: '和解', count: 1, color: '#3498db', percent: 20 }
]
```

**刑事案件**
```javascript
[
  { result: '無罪/免訴', count: 2, color: '#7fa37f', percent: 25 },
  { result: '成功減刑', count: 4, color: '#a8d5a8', percent: 50 },
  { result: '依法量刑', count: 2, color: '#f39c12', percent: 25 }
]
```

**行政案件**
```javascript
[
  { result: '完全撤銷', count: 1, color: '#7fa37f', percent: 33 },
  { result: '部分撤銷', count: 1, color: '#a8d5a8', percent: 33 },
  { result: '駁回', count: 1, color: '#e74c3c', percent: 34 }
]
```

---

## 🎯 新數據結構的優勢

### 1. **精確的律師角色識別**
- 舊方式：只能從 `lawyers` 或 `lawyersdef` 陣列判斷
- 新方式：從 `trial_party_lawyers` 精確綁定律師↔當事人↔角色

### 2. **AI 評估的律師表現**
- 舊方式：沒有表現評估
- 新方式：Good/Fair/Poor 三級評估 + 詳細理由

### 3. **標準化的判決分類**
- 舊方式：依賴不一致的 `verdict_type` 文字
- 新方式：使用 `disposition.class` 標準化分類

### 4. **審級區分**
- 舊方式：無法區分初審和上訴審
- 新方式：明確標記 trial/appeal

### 5. **客戶類型分析**
- 舊方式：無法識別客戶類型
- 新方式：區分個人/組織客戶

---

## 🔍 測試建議

### 1. 後端測試
```bash
# 測試律師 API
curl -X GET "https://courtdataapi.onrender.com/api/lawyers/蕭嘉豪" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**檢查點**:
- `stats.detailedWinRates` 結構是否正確
- `by_role.plaintiff/defendant` 是否有數據
- `outcomes` 欄位是否使用新的命名
- `performance` 統計是否存在

### 2. 前端測試
**檢查點**:
- 民事案件圖表是否顯示
- 圖表數據是否正確（win, partial_win, loss, settlement）
- 顏色是否正確應用
- 控制台是否有錯誤

### 3. 調試日誌
**後端**:
```
[calculateEnhancedWinRates] 新統計結果: { civil: {...}, criminal: {...}, administrative: {...} }
```

**前端**:
```
[convertToChartData] civil plaintiff: { total: 5, outcomes: {...}, performance: {...} }
[convertToChartData] 過濾後的圖表數據: [...]
```

---

## 📋 向後兼容性

### 保留的舊邏輯
1. **後端**: 如果新統計失敗，自動回退到 `calculateDetailedWinRates`
2. **前端**: 如果 `data.by_role` 不存在，返回空陣列
3. **數據提取**: 優先使用新欄位，回退到舊欄位

### 回退機制
```javascript
// 後端
if (!resultData.stats.detailedWinRates || Object.keys(resultData.stats.detailedWinRates).length === 0) {
  console.log('[Lawyer Service] 新統計方式失敗，使用舊方式');
  resultData.stats.detailedWinRates = calculateDetailedWinRates(resultData.cases, resultData.stats.detailedWinRates);
}

// 前端
if (!data || !data.by_role) {
  console.log('[convertToChartData] 無效的數據結構:', data);
  return [];
}
```

---

## 🚀 下一步

1. **測試真實數據**: 使用「蕭嘉豪」等律師測試完整流程
2. **驗證圖表顯示**: 確認民事/刑事/行政案件圖表正確顯示
3. **性能優化**: 如果數據量大，考慮添加緩存
4. **添加更多指標**: 
   - 平均標的金額（民事）
   - 辯護成功率（刑事）
   - TOP 3 案由分析

---

## 📝 修改的文件清單

### 後端
- ✅ `services/lawyer.js` (新增 4 個函數，修改主邏輯)

### 前端
- ✅ `components/lawyer/LawyerCaseTypeStats.js` (修改 `convertToChartData`)

### 文檔
- ✅ `LAWYER_DATA_REFACTOR_PLAN.md` (重構計劃)
- ✅ `REFACTOR_COMPLETE_SUMMARY.md` (本文檔)

---

---

## ⚠️ 重要修正

### 律師表現等級
根據提示詞 `STAGE3_LAWYER_ANALYSIS_PROMPT`，律師表現有 **4 個等級**：
- **Excellent** (卓越)
- **Good** (良好)
- **Fair** (一般)
- **Poor** (不佳)

後端已更新支援所有 4 個等級，並新增 `excellence_rate` 指標：
```javascript
excellence_rate = (excellent + good) / total * 100
```

### disposition.class 優先級
案件處理邏輯已更新為：
1. **優先使用** `disposition.class` 作為 `neutralOutcomeCode`
2. **回退機制**: 如果 `disposition.class` 不存在或為 'unknown'，才使用舊的 `getDetailedResult` 函數

這確保了新舊數據的兼容性。

---

**重構完成時間**: 2025-10-08
**測試狀態**: 待測試
**部署狀態**: 待部署
**最後更新**: 2025-10-08 (修正律師表現等級支援)

