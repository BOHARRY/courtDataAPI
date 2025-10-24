# 向量欄位測試修改說明

## 📋 修改概述

**目的**：測試使用 `plaintiff_combined_vector` 替代 `legal_issues_vector`，以提高案件匹配精度

**修改日期**：2025-01-XX

---

## 🎯 核心修改

### 1. **向量欄位選擇邏輯** (`searchStrategy.js`)

**修改位置**：`getPositionBasedSearchStrategy()` 函數

**修改內容**：
- ✅ **原告立場** (`plaintiff`)：使用 `plaintiff_combined_vector`
- ✅ **被告立場** (`defendant`)：使用 `defendant_combined_vector`
- ✅ **中立立場** (`neutral`)：使用 `legal_issues_vector`（保持原有邏輯）

**選擇理由**：
- `plaintiff_combined_vector` 包含：原告的成功要素、失敗教訓、風險警告
- `defendant_combined_vector` 包含：被告的成功策略、勝訴公式、失敗策略
- 這些內容更聚焦於**案件實質**，排除了法條引用的干擾

---

## 📊 日誌優化

### 統一日誌前綴：`[VECTOR-TEST]`

所有與此次測試相關的日誌都使用 `[VECTOR-TEST]` 前綴，方便過濾和觀察。

### 日誌輸出示例

```
================================================================================
[VECTOR-TEST] 🎯 向量欄位選擇
[VECTOR-TEST] 立場: plaintiff
[VECTOR-TEST] 案件類型: 民事
[VECTOR-TEST] 選擇向量欄位: plaintiff_combined_vector
[VECTOR-TEST] 選擇理由: 原告立場：使用原告策略向量（包含成功要素、失敗教訓、風險警告）
================================================================================

[VECTOR-TEST] 🔍 補足案件事由: "房屋買賣契約履行糾紛"
[VECTOR-TEST] ✅ 補足完成: { legalIssueQuery: "...", ... }

[VECTOR-TEST] 📊 搜索參數: 角度數=4, 閾值=0.55

[VECTOR-TEST] 📄 [法律爭點] 案例 1: TYDV,111,訴,1864 | 相似度: 85.3% | 案由: 損害賠償等...
[VECTOR-TEST] 📄 [法律爭點] 案例 2: KSDV,112,訴,1437 | 相似度: 82.1% | 案由: 減少價金...
[VECTOR-TEST] 📄 [法律爭點] 案例 3: PCDV,112,簡上,436 | 相似度: 78.9% | 案由: 損害賠償...

[VECTOR-TEST] ✅ [法律爭點] ES返回 25 個 → 篩選後 20 個（閾值: 0.55）
[VECTOR-TEST] ✅ [核心概念] ES返回 25 個 → 篩選後 18 個（閾值: 0.55）
[VECTOR-TEST] ✅ [法律術語] ES返回 25 個 → 篩選後 15 個（閾值: 0.55）
[VECTOR-TEST] ✅ [實務用詞] ES返回 25 個 → 篩選後 12 個（閾值: 0.55）

[VECTOR-TEST] ✅ 多角度搜尋完成: 4/4 成功，共 65 個結果

[VECTOR-TEST] 🔄 開始合併多角度搜尋結果...
[VECTOR-TEST] 🎯 合併完成: 處理 65 個 → 優化後 50 個
[VECTOR-TEST] 📊 多角度命中: 12 個

[VECTOR-TEST] 🏆 TOP 1: TYDV,111,訴,1864 | 相似度: 85.3% | 出現次數: 3 | 案由: 損害賠償等...
[VECTOR-TEST] 🏆 TOP 2: KSDV,112,訴,1437 | 相似度: 82.1% | 出現次數: 3 | 案由: 減少價金...
[VECTOR-TEST] 🏆 TOP 3: PCDV,112,簡上,436 | 相似度: 78.9% | 出現次數: 2 | 案由: 損害賠償...
...
```

---

## 🔍 測試方法

### 1. **啟動後端服務**

```bash
cd D:\court_data\courtDataAPI
npm start
```

### 2. **觀察日誌**

在終端中過濾 `[VECTOR-TEST]` 日誌：

```bash
# Windows PowerShell
npm start | Select-String "VECTOR-TEST"
```

### 3. **測試案例**

使用以下案例進行測試：

**測試案例 1：房屋買賣糾紛**
```
案件描述：某甲與某乙因房屋買賣契約履行事宜產生糾紛，雙方對於房屋之交付、瑕疵責任及契約條款的解釋存在不同見解。
立場：原告
預期結果：應該匹配到房屋買賣相關案件，而不是贈與案件
```

**測試案例 2：不動產贈與糾紛**
```
案件描述：原告主張贈與契約無效，請求塗銷所有權移轉登記
立場：原告
預期結果：應該匹配到贈與相關案件
```

### 4. **對比測試**

可以手動切換向量欄位進行對比測試：

```javascript
// 在 searchStrategy.js 中臨時修改
primaryVectorField = 'legal_issues_vector';  // 舊版本
primaryVectorField = 'plaintiff_combined_vector';  // 新版本
```

---

## 📈 預期改進

### 問題：使用 `legal_issues_vector` 的問題

**案件 A（房屋買賣）的 `legal_issues_vector` 文本**：
```
爭點：房屋是否符合合約條件？ 
判斷：依民法第354條、第359條，出賣人應擔保物之瑕疵...
```

**案件 B（贈與）的 `legal_issues_vector` 文本**：
```
爭點：贈與契約是否有效？ 
判斷：依民法第406條、第758條，贈與契約有效...
```

**問題**：兩者都包含大量民法條文引用，導致向量相似度高

---

### 改進：使用 `plaintiff_combined_vector`

**案件 A（房屋買賣）的 `plaintiff_combined_vector` 文本**：
```
未能證明房屋存在重大瑕疵，導致請求被駁回 | 
應提供專業鑑定報告證明房屋瑕疵 | 
成功證明房屋瑕疵，獲得減少價金的判決
```

**案件 B（贈與）的 `plaintiff_combined_vector` 文本**：
```
未能證明贈與人無贈與真意，導致請求被駁回 | 
應提供醫療證明證明贈與人意思能力有瑕疵 | 
成功證明部分款項未經授權提領，獲得不當得利返還
```

**改進**：
- ✅ 詞彙差異更大（「房屋瑕疵」vs「贈與真意」）
- ✅ 排除法條引用干擾
- ✅ 聚焦於案件實質內容

---

## 🔄 回滾方法

如果測試結果不理想，可以快速回滾：

```javascript
// 在 searchStrategy.js 中修改
export function getPositionBasedSearchStrategy(position, caseType = '民事') {
    // 回滾到原有邏輯
    const primaryVectorField = 'legal_issues_vector';
    
    return {
        primaryVectorField: primaryVectorField,
        vectorFields: vectorFields,
        filterQuery: null
    };
}
```

---

## 📝 後續優化方向

### 短期
- ✅ 測試 `plaintiff_combined_vector` 的效果
- ✅ 收集測試數據和用戶反饋

### 中期
- 🔄 測試多向量混合搜索（加權平均）
- 🔄 優化相似度閾值

### 長期
- 🔄 修改 `legal_issues_vector` 的生成邏輯（只使用 `question`）
- 🔄 增加案件類型的語意過濾

---

## 📞 聯絡資訊

如有問題，請聯絡開發團隊。

