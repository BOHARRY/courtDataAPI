# 關鍵字參數讀取錯誤修正報告

## 📋 問題描述

**現象：**
```json
{
  "message": "🔍 判決搜尋: 全文搜尋",
  "filter_keyword": "無",
  "keyword": null
}
```

用戶搜尋「漏水」時，日誌顯示「全文搜尋」，且 `keyword` 為 `null`。

---

## 🔍 問題追蹤

### **1. 前端發送的請求**

**代碼位置：** `lawsowl\src\contexts\SearchContext.js:692`

```javascript
const params = new URLSearchParams();
if (filters.query) params.append('query', filters.query);  // ✅ 使用 'query'
```

**實際請求：**
```
GET /api/search?query=漏水&complexity=普通案件&page=1&pageSize=10
```

**前端狀態結構：**
```javascript
const initialFilters = {
    query: '',  // ✅ 使用 'query'
    caseTypes: [],
    verdict: '不指定',
    // ...
};
```

---

### **2. 後端 Controller 接收**

**代碼位置：** `controllers/search-controller.js:6`

```javascript
const searchFilters = req.query;  // ✅ 直接使用 req.query
```

**Render 日誌確認：**
```
[Credit Middleware] Search filters: { query: '漏水', complexity: '普通案件', page: '1', pageSize: '10' }
```

✅ Controller 正確接收到 `query: '漏水'`

---

### **3. 後端 Service 讀取（問題所在）**

**代碼位置：** `services/search.js:23`（修正前）

```javascript
const keyword = searchFilters.keyword?.trim() || '';  // ❌ 錯誤！
```

**問題：**
- Service 嘗試讀取 `searchFilters.keyword`
- 但前端傳的是 `query`，不是 `keyword`
- 導致 `keyword` 為 `undefined`，經過 `trim()` 後變成空字符串

---

## 🎯 根本原因

**前後端參數名稱不一致！**

| 層級 | 參數名稱 | 值 |
|------|---------|-----|
| 前端 SearchContext | `filters.query` | `"漏水"` |
| HTTP 請求 | `?query=漏水` | `"漏水"` |
| 後端 Controller | `req.query.query` | `"漏水"` |
| 後端 Service（修正前） | `searchFilters.keyword` | `undefined` ❌ |
| 後端 Service（修正後） | `searchFilters.query` | `"漏水"` ✅ |

---

## ✅ 解決方案

### **修正代碼**

**修正前：**
```javascript
const keyword = searchFilters.keyword?.trim() || '';
```

**修正後：**
```javascript
// 🔧 修正：前端傳的是 'query'，不是 'keyword'
// 同時支援兩者以保持向後兼容
const keyword = (searchFilters.query || searchFilters.keyword || '').trim();
```

**優點：**
1. ✅ 優先讀取 `query`（符合前端邏輯）
2. ✅ 向後兼容 `keyword`（如果有其他地方使用）
3. ✅ 安全的預設值（空字符串）

---

## 📊 修正後的預期結果

### **搜尋「漏水」**

**Before（錯誤）：**
```json
{
  "message": "🔍 判決搜尋: 全文搜尋",
  "keyword": null,
  "filter_keyword": "無"
}
```

**After（正確）：**
```json
{
  "message": "🔍 判決搜尋: \"漏水\"",
  "keyword": "漏水",
  "filter_keyword": "漏水"
}
```

### **搜尋「契約糾紛 | 民事」**

**Before（錯誤）：**
```json
{
  "message": "🔍 判決搜尋: 民事",
  "keyword": null,
  "filter_keyword": "無"
}
```

**After（正確）：**
```json
{
  "message": "🔍 判決搜尋: \"契約糾紛\" | 民事",
  "keyword": "契約糾紛",
  "filter_keyword": "契約糾紛"
}
```

### **全文搜尋（無關鍵字）**

**Before（正確）：**
```json
{
  "message": "🔍 判決搜尋: 全文搜尋",
  "keyword": null,
  "filter_keyword": "無"
}
```

**After（正確）：**
```json
{
  "message": "🔍 判決搜尋: 全文搜尋",
  "keyword": null,
  "filter_keyword": "無"
}
```

---

## 🔍 Logz.io 查詢範例

修正後，可以這樣查詢：

```
# 查詢特定關鍵字的搜尋
event:judgment_search AND keyword:"漏水"

# 查詢有關鍵字的搜尋（排除全文搜尋）
event:judgment_search AND _exists_:keyword

# 查詢全文搜尋（無關鍵字）
event:judgment_search AND operation:judgment_keyword_search AND NOT _exists_:keyword
```

---

## 📝 相關文件

- **前端狀態管理：** `lawsowl\src\contexts\SearchContext.js`
- **後端 Controller：** `controllers/search-controller.js`
- **後端 Service：** `services/search.js`
- **日誌工具：** `utils/logger.js`

---

## 🎯 經驗教訓

1. **前後端參數命名要一致**
   - 前端使用 `query`，後端也應該使用 `query`
   - 避免使用不同的名稱（如 `keyword`）

2. **添加日誌追蹤參數傳遞**
   - 在 Controller 和 Service 層添加日誌
   - 確認參數正確傳遞

3. **使用向後兼容的方式修正**
   - 同時支援 `query` 和 `keyword`
   - 避免破壞現有功能

4. **調試日誌的級別要注意**
   - `debug` 級別不會發送到 Logz.io（level: 'http'）
   - 使用 `info` 級別才會出現在 Logz.io

---

**修正版本：** 1.0  
**修正日期：** 2025-11-05  
**修正者：** LawSowl 開發團隊

