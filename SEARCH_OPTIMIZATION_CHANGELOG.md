# 判決書搜索系統優化變更日誌

## 📅 更新日期
2025-01-XX

## 🎯 優化目標
1. 清理遺留欄位（`outcome_reasoning_strength`）
2. 擴充搜索範圍以利用新 mapping 的豐富欄位
3. 提升搜索覆蓋率和準確性

---

## ✅ 階段一：清理遺留欄位

### 1.1 前端清理

#### **SearchResultItem.js**
- ❌ 移除：`outcome_reasoning_strength` 欄位解構（第 62 行）
- ❌ 移除：判斷結構顯示邏輯（第 236-240 行）

**修改前：**
```javascript
const {
  // ...
  outcome_reasoning_strength,
  // ...
} = resultItemData || {};

// ...
{outcome_reasoning_strength && (
  <span className={`reasoning-strength ${outcome_reasoning_strength.toLowerCase()}`}>
    判斷結構: {outcome_reasoning_strength}
  </span>
)}
```

**修改後：**
```javascript
const {
  // ...
  // outcome_reasoning_strength 已移除
  // ...
} = resultItemData || {};

// 判斷結構顯示邏輯已完全移除
```

---

#### **SearchContext.js**
- ❌ 移除：`initialFilters` 中的 `reasoningStrength` 欄位（第 30 行）
- ❌ 移除：`dynamicOptions` 中的 `reasoningStrengths` 陣列（第 86 行）

**修改前：**
```javascript
const initialFilters = {
  // ...
  reasoningStrength: '',
  // ...
};

const initialState = {
  dynamicOptions: {
    // ...
    reasoningStrengths: [],
    // ...
  }
};
```

**修改後：**
```javascript
const initialFilters = {
  // ...
  // reasoningStrength 已移除
  // ...
};

const initialState = {
  dynamicOptions: {
    // ...
    // reasoningStrengths 已移除
    // ...
  }
};
```

---

#### **CurrentFiltersDisplay.js**
- ❌ 移除：`reasoningStrengthOptions` 參數（第 11 行）
- ❌ 移除：`filters.reasoningStrength` 檢查（第 23 行）
- ❌ 移除：推理強度標籤顯示邏輯（第 93-99 行）

**修改前：**
```javascript
const CurrentFiltersDisplay = memo(({
  // ...
  reasoningStrengthOptions
}) => {
  const hasActiveFilters =
    // ...
    filters.reasoningStrength !== '' ||
    // ...

  {/* 結果推理強度標籤 */}
  {filters.reasoningStrength && (
    <span key="reasoning" className="tag-item filter-tag">
      💡 推理強度: {filters.reasoningStrength}
      <button onClick={() => onRemoveFilter('reasoningStrength', '')} />
    </span>
  )}
});
```

**修改後：**
```javascript
const CurrentFiltersDisplay = memo(({
  // ...
  // reasoningStrengthOptions 已移除
}) => {
  const hasActiveFilters =
    // ...
    // filters.reasoningStrength 檢查已移除
    // ...

  // 推理強度標籤顯示邏輯已完全移除
});
```

---

#### **JudgementFilterBar.js**
- ❌ 移除：`reasoningStrengthOptions` 參數（第 39 行）
- ❌ 移除：傳遞給 `CurrentFiltersDisplay` 的 `reasoningStrengthOptions`（第 490 行）
- ❌ 移除：memo 比較函數中的 `reasoningStrengthOptions` 長度比較（第 516 行）

**修改前：**
```javascript
const JudgementFilterBar = memo(({
  // ...
  reasoningStrengthOptions = [],
  // ...
}) => {
  // ...
  <CurrentFiltersDisplay
    // ...
    reasoningStrengthOptions={reasoningStrengthOptions}
  />
  // ...
}, (prevProps, nextProps) => {
  const optionsEqual =
    // ...
    (prevProps.reasoningStrengthOptions?.length ?? 0) === (nextProps.reasoningStrengthOptions?.length ?? 0);
});
```

**修改後：**
```javascript
const JudgementFilterBar = memo(({
  // ...
  // reasoningStrengthOptions 已移除
  // ...
}) => {
  // ...
  <CurrentFiltersDisplay
    // ...
    // reasoningStrengthOptions 已移除
  />
  // ...
}, (prevProps, nextProps) => {
  const optionsEqual =
    // ...
    // reasoningStrengthOptions 比較已移除
});
```

---

### 1.2 後端清理

#### **query-builder.js**
- ✅ 已註解：`outcome_reasoning_strength` 篩選邏輯（第 150-153 行）
- ✅ 已註解：`citations_count` 欄位引用（第 188-189 行）

**狀態：** 後端已在之前的版本中正確處理，無需額外修改。

---

## ✅ 階段二：擴充搜索範圍

### 2.1 後端搜索欄位擴充

#### **query-builder.js - buildSubQuery() 函數**

**新增搜索欄位：**

1. **法律請求基礎** (`legal_claim_basis`)
   - Boost: 2.5
   - 用途：搜索法律請求的基礎理由

2. **原告主張摘要** (`plaintiff_claims_summary`)
   - Boost: 2
   - 用途：搜索原告的主張內容

3. **被告抗辯摘要** (`defendant_defenses_summary`)
   - Boost: 2
   - 用途：搜索被告的抗辯內容

4. **可複製策略文本** (`replicable_strategies_text`)
   - Boost: 2
   - 用途：搜索可複製的訴訟策略

5. **法律術語搜索** (`.legal` 子欄位)
   - `JFULL.legal` - Boost: 2.5
   - `summary_ai.legal` - Boost: 1.8
   - 用途：利用 `legal_search_analyzer` 進行法律同義詞匹配

---

### 2.2 Nested 欄位查詢支援

#### **新增 Nested 查詢：**

1. **可引用段落** (`citable_paragraphs`)
   ```javascript
   {
     nested: {
       path: "citable_paragraphs",
       query: {
         match_phrase: {
           "citable_paragraphs.paragraph_text": {
             query: searchTerm,
             boost: 2.5
           }
         }
       }
     }
   }
   ```
   - 用途：搜索具有法律重要性的可引用段落

2. **法律爭點** (`legal_issues`)
   ```javascript
   {
     nested: {
       path: "legal_issues",
       query: {
         bool: {
           should: [
             { match_phrase: { "legal_issues.question": { query: searchTerm, boost: 3 } } },
             { match_phrase: { "legal_issues.answer":   { query: searchTerm, boost: 2 } } }
           ]
         }
       }
     }
   }
   ```
   - 用途：搜索法律爭點的問題和答案

---

## 📊 搜索欄位總覽

### 原有欄位（保留）
| 欄位 | Boost | 說明 |
|------|-------|------|
| `JFULL` | 3 | 判決書全文 |
| `JTITLE` | 4 | 判決書標題 |
| `summary_ai` | 2 | AI 摘要 |
| `main_reasons_ai` | 2 | 主要理由 |
| `tags` | 1.5 | 標籤 |
| `lawyers.exact` | 8 | 律師姓名（精確） |
| `judges.exact` | 8 | 法官姓名（精確） |

### 新增欄位
| 欄位 | Boost | 類型 | 說明 |
|------|-------|------|------|
| `legal_claim_basis` | 2.5 | text | 法律請求基礎 |
| `plaintiff_claims_summary` | 2 | text | 原告主張摘要 |
| `defendant_defenses_summary` | 2 | text | 被告抗辯摘要 |
| `replicable_strategies_text` | 2 | text | 可複製策略 |
| `JFULL.legal` | 2.5 | text | 全文（法律同義詞） |
| `summary_ai.legal` | 1.8 | text | 摘要（法律同義詞） |
| `citable_paragraphs.paragraph_text` | 2.5 | nested | 可引用段落 |
| `legal_issues.question` | 3 | nested | 法律爭點問題 |
| `legal_issues.answer` | 2 | nested | 法律爭點答案 |

**總計：** 從 7 個搜索欄位擴充至 16 個搜索欄位

---

## 🎯 預期效果

### 1. 搜索覆蓋率提升
- ✅ 新增 9 個搜索欄位，覆蓋更多判決書內容
- ✅ 支援 nested 欄位查詢，保持關聯性
- ✅ 利用法律同義詞分析器，提升法律術語匹配率

### 2. 搜索準確性提升
- ✅ 針對不同欄位設定合理的 boost 值
- ✅ 法律爭點問題的 boost (3) 高於答案 (2)
- ✅ 律師/法官姓名保持最高 boost (8)

### 3. 用戶體驗改善
- ✅ 移除無效的 `outcome_reasoning_strength` 欄位，避免混淆
- ✅ 搜索結果更全面，減少遺漏重要判決書的機率
- ✅ 法律術語搜索更智能，自動匹配同義詞

---

## 🔧 技術細節

### Boost 值設計原則
1. **人名欄位最高** (8)：律師、法官姓名
2. **標題次之** (4)：判決書標題
3. **爭點問題** (3)：法律爭點的問題
4. **核心內容** (2.5-3)：全文、可引用段落、法律請求基礎
5. **摘要分析** (2)：各類摘要、理由、答案
6. **輔助資訊** (1.5-1.8)：標籤、法律同義詞摘要

### Nested 查詢優勢
- 保持父子文檔的關聯性
- 避免扁平化導致的誤匹配
- 精確查詢特定爭點或段落

---

## 📝 後續建議

### 中優先級（可逐步實施）
1. 在前端展示新增的分析欄位
   - `position_based_analysis`（立場分析）
   - `lawyer_performance`（律師表現）
   - `issue_tilt_by_party`（爭點傾向）

2. 優化搜索結果高亮顯示
   - 支援 nested 欄位的高亮
   - 顯示匹配來源（例如：「匹配於法律爭點」）

### 低優先級（未來增強）
1. 多向量搜索選項
   - 按爭點搜索（`legal_issues_vector`）
   - 按策略搜索（`replicable_strategies_vector`）
   - 按立場搜索（`plaintiff_combined_vector` / `defendant_combined_vector`）

2. 引用分析可視化
   - 展示 `citation_analysis` 的詳細信息
   - 判決引用關係圖

---

## ✅ 測試建議

### 功能測試
1. 測試關鍵字搜索是否正常工作
2. 測試新增欄位是否被正確搜索
3. 測試 nested 查詢是否返回正確結果
4. 測試法律同義詞匹配是否生效

### 性能測試
1. 測試搜索響應時間是否在可接受範圍
2. 測試大量結果的分頁性能
3. 測試 nested 查詢的性能影響

### 回歸測試
1. 確認原有搜索功能未受影響
2. 確認篩選器功能正常
3. 確認搜索結果排序正確

---

## 📌 注意事項

1. **向後兼容**：所有修改都是新增或移除無效欄位，不影響現有功能
2. **數據庫要求**：確保 Elasticsearch 中的判決書都使用新 mapping 格式
3. **性能監控**：新增欄位可能略微增加查詢時間，需監控性能指標
4. **文檔更新**：建議更新用戶文檔，說明新的搜索能力

---

## 🔗 相關文件

- `D:\court_data\courtDataAPI\mapping.txt` - 新 mapping 格式定義
- `D:\court_data\courtDataAPI\TPHV,111,上,397,20250730,1.json` - 判決書樣本
- `D:\court_data\courtDataAPI\utils\query-builder.js` - 查詢構建器
- `D:\court_data\frontend-court-search-web\lawsowl\src\components\SearchResultItem.js` - 搜索結果顯示
- `D:\court_data\frontend-court-search-web\lawsowl\src\contexts\SearchContext.js` - 搜索狀態管理

