# 🔧 Logz.io 日誌結構優化

## 📊 問題分析

### **原始問題**

Logz.io 會自動將嵌套對象展平（flatten），導致結構不一致：

**我們發送的日誌：**
```javascript
{
  userId: "user-123",
  operation: "judgment_keyword_search",
  filters: {
    keyword: "契約糾紛",
    caseTypes: "民事",
    court: "台北地方法院"
  }
}
```

**Logz.io 接收到的日誌：**
```json
{
  "userId": "user-123",
  "operation": "judgment_keyword_search",
  "filters.keyword": "契約糾紛",      // ❌ 被展平了
  "filters.caseTypes": "民事",
  "filters.court": "台北地方法院"
}
```

### **問題影響**

1. ❌ 查詢不一致：需要使用 `filters.keyword` 而不是 `filters.keyword`
2. ❌ 可讀性降低：結構被破壞
3. ❌ 無法使用嵌套查詢
4. ❌ 與原始代碼意圖不符

---

## ✅ 解決方案

### **採用展平結構（Flattened Structure）**

主動使用展平的命名方式，與 Logz.io 的行為保持一致。

**優化後的日誌：**
```javascript
{
  userId: "user-123",
  operation: "judgment_keyword_search",
  filter_keyword: "契約糾紛",        // ✅ 主動展平
  filter_caseTypes: "民事",
  filter_court: "台北地方法院",
  filter_verdict: "原告勝訴",
  filter_dateRange: "2020-01-01 ~ 2023-12-31"
}
```

---

## 📝 變更詳情

### **1. 關鍵字搜尋** (`services/search.js`)

#### **Before:**
```javascript
logger.info('開始執行判決書關鍵字搜尋', {
  userId,
  operation: 'judgment_keyword_search',
  filters: {
    keyword: searchFilters.keyword || '無',
    caseTypes: searchFilters.caseTypes || '全部',
    court: searchFilters.court || '全部',
    verdict: searchFilters.verdict || '全部',
    dateRange: '...'
  },
  page,
  pageSize
});
```

#### **After:**
```javascript
logger.info('開始執行判決書關鍵字搜尋', {
  userId,
  operation: 'judgment_keyword_search',
  filter_keyword: searchFilters.keyword || '無',
  filter_caseTypes: searchFilters.caseTypes || '全部',
  filter_court: searchFilters.court || '全部',
  filter_verdict: searchFilters.verdict || '全部',
  filter_dateRange: searchFilters.startDate && searchFilters.endDate ? 
    `${searchFilters.startDate} ~ ${searchFilters.endDate}` : '不限',
  page,
  pageSize
});
```

---

### **2. 語意搜尋** (`services/semanticSearchService.js`)

#### **Before:**
```javascript
logger.info('開始執行判決書語意搜尋', {
  userId,
  operation: 'judgment_semantic_search',
  userQuery,
  caseType,
  filters,  // ❌ 嵌套對象
  page,
  pageSize
});
```

#### **After:**
```javascript
logger.info('開始執行判決書語意搜尋', {
  userId,
  operation: 'judgment_semantic_search',
  userQuery,
  caseType,
  filter_court: filters.court || '全部',
  filter_dateRange: filters.startDate && filters.endDate ? 
    `${filters.startDate} ~ ${filters.endDate}` : '不限',
  page,
  pageSize
});
```

#### **GPT 優化結果：**

**Before:**
```javascript
logger.info('GPT 查詢優化完成', {
  userId,
  operation: 'semantic_query_enhancement',
  userQuery,
  enhanced: enhanced.enhanced,
  keywords: enhanced.keywords,  // ❌ 陣列
  duration
});
```

**After:**
```javascript
logger.info('GPT 查詢優化完成', {
  userId,
  operation: 'semantic_query_enhancement',
  userQuery,
  enhanced: enhanced.enhanced,
  keywordsJson: JSON.stringify(enhanced.keywords),  // ✅ 序列化
  lawsJson: JSON.stringify(enhanced.laws || []),
  duration
});
```

---

### **3. 案由搜尋** (`services/caseDescriptionSearchService.js`)

#### **Before:**
```javascript
logger.info('案情描述正規化完成', {
  userId,
  operation: 'case_description_normalization',
  normalizedSummary: result.normalized_summary,
  termGroupsCount: {  // ❌ 嵌套對象
    parties: result.parties_terms?.length || 0,
    technical: result.technical_terms?.length || 0,
    legalAction: result.legal_action_terms?.length || 0,
    statute: result.statute_terms?.length || 0
  },
  duration
});
```

#### **After:**
```javascript
logger.info('案情描述正規化完成', {
  userId,
  operation: 'case_description_normalization',
  normalizedSummary: result.normalized_summary,
  termCount_parties: result.parties_terms?.length || 0,
  termCount_technical: result.technical_terms?.length || 0,
  termCount_legalAction: result.legal_action_terms?.length || 0,
  termCount_statute: result.statute_terms?.length || 0,
  partiesTermsJson: JSON.stringify(result.parties_terms || []),
  technicalTermsJson: JSON.stringify(result.technical_terms || []),
  legalActionTermsJson: JSON.stringify(result.legal_action_terms || []),
  statuteTermsJson: JSON.stringify(result.statute_terms || []),
  duration
});
```

---

## 🎯 優化效果

### **1. 查詢更方便**

**Before（嵌套結構）：**
```
service:courtDataAPI AND filters.keyword:"契約糾紛"
```

**After（展平結構）：**
```
service:courtDataAPI AND filter_keyword:"契約糾紛"
```

### **2. 結構一致**

所有日誌欄位都在同一層級，不會被 Logz.io 自動展平。

### **3. 性能更好**

- 無需額外的序列化/反序列化
- 減少數據傳輸量
- 查詢速度更快

### **4. 可讀性提升**

欄位命名清晰：
- `filter_keyword` - 搜尋關鍵字
- `filter_caseTypes` - 案件類型
- `termCount_parties` - 當事人關鍵詞數量
- `keywordsJson` - 關鍵字列表（JSON 字符串）

---

## 📊 Logz.io 查詢範例

### **查詢特定關鍵字的搜尋**

```
service:courtDataAPI AND operation:judgment_keyword_search AND filter_keyword:"契約糾紛"
```

### **查詢特定法院的搜尋**

```
service:courtDataAPI AND filter_court:"台北地方法院"
```

### **查詢特定案件類型的語意搜尋**

```
service:courtDataAPI AND operation:judgment_semantic_search AND caseType:"民事"
```

### **查詢案由搜尋的關鍵詞提取結果**

```
service:courtDataAPI AND operation:case_description_normalization AND termCount_parties:>0
```

### **查詢 GPT 優化的關鍵字**

```
service:courtDataAPI AND operation:semantic_query_enhancement AND keywordsJson:*
```

---

## 🎨 命名規範

### **篩選條件（Filters）**

使用 `filter_` 前綴：
- `filter_keyword` - 搜尋關鍵字
- `filter_caseTypes` - 案件類型
- `filter_court` - 法院
- `filter_verdict` - 判決結果
- `filter_dateRange` - 日期範圍

### **計數（Counts）**

使用 `count_` 或 `termCount_` 前綴：
- `resultCount` - 結果數量
- `clusterCount` - 分群數量
- `termCount_parties` - 當事人關鍵詞數量
- `termCount_technical` - 技術關鍵詞數量

### **JSON 序列化**

使用 `Json` 後綴：
- `keywordsJson` - 關鍵字列表
- `lawsJson` - 法條列表
- `partiesTermsJson` - 當事人關鍵詞列表
- `technicalTermsJson` - 技術關鍵詞列表

---

## 🚀 預期結果

部署後，Logz.io 的日誌應該會是這樣：

### **關鍵字搜尋開始**

```json
{
  "message": "開始執行判決書關鍵字搜尋",
  "level": "info",
  "service": "courtDataAPI",
  "userId": "user-123",
  "operation": "judgment_keyword_search",
  "filter_keyword": "契約糾紛",
  "filter_caseTypes": "民事",
  "filter_court": "台北地方法院",
  "filter_verdict": "原告勝訴",
  "filter_dateRange": "2020-01-01 ~ 2023-12-31",
  "page": 1,
  "pageSize": 10,
  "@timestamp": "2025-11-04T17:43:40.319Z"
}
```

### **關鍵字搜尋完成**

```json
{
  "message": "判決書關鍵字搜尋完成",
  "level": "info",
  "type": "business_event",
  "service": "courtDataAPI",
  "userId": "user-123",
  "operation": "judgment_keyword_search",
  "keyword": "契約糾紛",
  "resultCount": 42,
  "duration": 292,
  "page": 1,
  "pageSize": 10,
  "hasResults": true,
  "@timestamp": "2025-11-04T17:43:40.611Z"
}
```

### **GPT 查詢優化**

```json
{
  "message": "GPT 查詢優化完成",
  "level": "info",
  "service": "courtDataAPI",
  "userId": "user-123",
  "operation": "semantic_query_enhancement",
  "userQuery": "房東不修漏水，我可以不付租金嗎？",
  "enhanced": "承租人因出租人未履行修繕義務而主張租金減免之民事糾紛",
  "keywordsJson": "[\"修繕義務\",\"租金減免\",\"租賃契約\"]",
  "lawsJson": "[\"民法第429條\",\"民法第423條\"]",
  "duration": 1200,
  "@timestamp": "2025-11-04T17:43:40.611Z"
}
```

---

## ✅ 驗證清單

部署後請驗證：

- [ ] Logz.io 日誌中沒有 `filters.keyword` 這樣的欄位
- [ ] 所有欄位都在同一層級
- [ ] 可以使用 `filter_keyword:"契約糾紛"` 查詢
- [ ] JSON 字符串可以正確顯示（如 `keywordsJson`）
- [ ] 中文內容沒有亂碼

---

**文檔版本**: 1.0  
**最後更新**: 2025-11-05  
**作者**: LawSowl 開發團隊

