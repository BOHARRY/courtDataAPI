# 📊 判決書搜尋日誌整合總結

## ✅ 已完成遷移

### **1. 關鍵字搜尋** (`services/search.js`)

**日誌內容：**

```javascript
// 搜尋開始
logger.info('開始執行判決書關鍵字搜尋', {
  userId: 'user-abc123',
  operation: 'judgment_keyword_search',
  filters: {
    keyword: '契約糾紛',
    caseTypes: '民事',
    court: '台北地方法院',
    verdict: '原告勝訴',
    dateRange: '2020-01-01 ~ 2023-12-31'
  },
  page: 1,
  pageSize: 10
});

// 搜尋成功
logger.business('判決書關鍵字搜尋完成', {
  userId: 'user-abc123',
  operation: 'judgment_keyword_search',
  keyword: '契約糾紛',
  resultCount: 42,
  duration: 234,
  page: 1,
  pageSize: 10,
  hasResults: true
});

// 性能監控（如果 >3 秒）
logger.performance('判決書搜尋響應較慢', {
  userId: 'user-abc123',
  operation: 'judgment_keyword_search',
  duration: 3500,
  resultCount: 42,
  threshold: 3000
});

// 錯誤處理
logger.error('判決書關鍵字搜尋失敗', {
  userId: 'user-abc123',
  operation: 'judgment_keyword_search',
  filters: {...},
  duration: 1200,
  error: 'Connection timeout',
  stack: '...',
  esError: {...}
});
```

**Logz.io 查詢範例：**

```
# 查看所有關鍵字搜尋
service:courtDataAPI AND operation:judgment_keyword_search

# 查看特定用戶的搜尋
service:courtDataAPI AND operation:judgment_keyword_search AND userId:"user-123"

# 查看慢查詢
service:courtDataAPI AND operation:judgment_keyword_search AND duration:>3000

# 查看搜尋錯誤
service:courtDataAPI AND operation:judgment_keyword_search AND level:error
```

---

### **2. 語意搜尋** (`services/semanticSearchService.js`)

**日誌內容：**

```javascript
// 搜尋開始
logger.info('開始執行判決書語意搜尋', {
  userId: 'user-abc123',
  operation: 'judgment_semantic_search',
  userQuery: '房東不修漏水，我可以不付租金嗎？',
  caseType: '民事',
  filters: {},
  page: 1,
  pageSize: 10
});

// GPT 查詢優化
logger.info('GPT 查詢優化完成', {
  userId: 'user-abc123',
  operation: 'semantic_query_enhancement',
  userQuery: '房東不修漏水，我可以不付租金嗎？',
  enhanced: '承租人因出租人未履行修繕義務而主張租金減免或終止租約之民事糾紛',
  keywords: ['修繕義務', '租金減免', '租賃契約'],
  duration: 1200
});

// 搜尋成功
logger.business('判決書語意搜尋完成', {
  userId: 'user-abc123',
  operation: 'judgment_semantic_search',
  userQuery: '房東不修漏水，我可以不付租金嗎？',
  caseType: '民事',
  resultCount: 15,
  clusterCount: 3,
  duration: 4500,
  searchMode: 'semantic_clustered'
});

// 性能監控（如果 >5 秒）
logger.performance('語意搜尋響應較慢', {
  userId: 'user-abc123',
  operation: 'judgment_semantic_search',
  duration: 6000,
  resultCount: 15,
  threshold: 5000
});
```

**Logz.io 查詢範例：**

```
# 查看所有語意搜尋
service:courtDataAPI AND operation:judgment_semantic_search

# 查看 GPT 優化過程
service:courtDataAPI AND operation:semantic_query_enhancement

# 查看慢查詢
service:courtDataAPI AND operation:judgment_semantic_search AND duration:>5000

# 查看特定案件類型的搜尋
service:courtDataAPI AND operation:judgment_semantic_search AND caseType:"民事"
```

---

### **3. 案由搜尋** (`services/caseDescriptionSearchService.js`)

**日誌內容：**

```javascript
// 搜尋開始
logger.info('開始執行案由搜尋', {
  userId: 'user-abc123',
  operation: 'case_description_search',
  descriptionLength: 150,
  lawDomain: '民事',
  partySide: 'plaintiff',
  page: 1,
  pageSize: 10
});

// 案情正規化
logger.info('案情描述正規化完成', {
  userId: 'user-abc123',
  operation: 'case_description_normalization',
  normalizedSummary: '本件為承租人因出租人未履行修繕義務而主張租金減免之民事糾紛',
  termGroupsCount: {
    parties: 2,
    technical: 3,
    legalAction: 2,
    statute: 1
  },
  duration: 1500
});

// 快取命中
logger.info('案由搜尋快取命中', {
  userId: 'user-abc123',
  operation: 'case_description_search',
  cacheKey: 'hash-abc123',
  cachedResultCount: 25
});

// 搜尋成功
logger.business('案由搜尋完成', {
  userId: 'user-abc123',
  operation: 'case_description_search',
  descriptionLength: 150,
  lawDomain: '民事',
  partySide: 'plaintiff',
  resultCount: 25,
  cached: true,
  duration: 2500,
  page: 1,
  pageSize: 10
});

// 性能監控（如果 >8 秒）
logger.performance('案由搜尋響應較慢', {
  userId: 'user-abc123',
  operation: 'case_description_search',
  duration: 9000,
  resultCount: 25,
  cached: false,
  threshold: 8000
});

// 非法律案由被拒絕
logger.business('案情描述被拒絕（非法律案由）', {
  userId: 'user-abc123',
  operation: 'case_description_normalization',
  descriptionLength: 50,
  rejectionReason: '您的輸入似乎是關於美食推薦，而非法律案由',
  duration: 800
});
```

**Logz.io 查詢範例：**

```
# 查看所有案由搜尋
service:courtDataAPI AND operation:case_description_search

# 查看快取命中率
service:courtDataAPI AND operation:case_description_search AND cached:true

# 查看慢查詢
service:courtDataAPI AND operation:case_description_search AND duration:>8000

# 查看被拒絕的案由
service:courtDataAPI AND operation:case_description_normalization AND rejectionReason:*

# 查看特定立場的搜尋
service:courtDataAPI AND operation:case_description_search AND partySide:"plaintiff"
```

---

## 🎯 日誌特色

### **1. 中文可讀性**

所有日誌訊息都使用繁體中文，方便團隊理解：

```
✅ "開始執行判決書關鍵字搜尋"
✅ "判決書語意搜尋完成"
✅ "案由搜尋響應較慢"
❌ "Starting judgment keyword search"
```

### **2. 結構化數據**

每個日誌都包含完整的上下文信息：

- `userId` - 用戶 ID（追蹤用戶行為）
- `operation` - 操作類型（分類日誌）
- `duration` - 執行時間（性能分析）
- `resultCount` - 結果數量（業務指標）
- 其他業務相關參數

### **3. 性能監控**

自動標記慢查詢：

- 關鍵字搜尋：>3 秒
- 語意搜尋：>5 秒
- 案由搜尋：>8 秒

### **4. 業務追蹤**

完整記錄業務流程：

- 搜尋參數（關鍵字、篩選條件）
- 結果數量
- 快取狀態
- 用戶立場（原告/被告）

---

## 📈 預期效果

部署後，你將能夠在 Logz.io 看到：

### **1. 用戶行為追蹤**

```
service:courtDataAPI AND userId:"user-123"
```

可以看到該用戶的完整搜尋歷程：
- 09:15 - 關鍵字搜尋「契約糾紛」，找到 42 筆
- 09:18 - 語意搜尋「房東不修漏水」，找到 15 筆
- 09:22 - 案由搜尋（原告立場），找到 25 筆

### **2. 熱門搜尋關鍵字**

```
service:courtDataAPI AND operation:judgment_keyword_search
```

統計最常被搜尋的關鍵字。

### **3. 性能分析**

```
service:courtDataAPI AND type:performance
```

找出所有慢查詢，優化系統性能。

### **4. 快取效率**

```
service:courtDataAPI AND operation:case_description_search AND cached:true
```

分析案由搜尋的快取命中率。

---

## 🚀 下一步

### **立即測試**

1. 等待 Render.com 部署完成（約 2-5 分鐘）
2. 使用前端網站進行搜尋：
   - 關鍵字搜尋
   - 語意搜尋
   - 案由搜尋
3. 在 Logz.io Dashboard 查看日誌

### **建議的 Kibana Dashboard**

**Dashboard 1: 搜尋概覽**
- 每日搜尋次數（按類型分組）
- 平均響應時間
- 成功率

**Dashboard 2: 用戶行為**
- 熱門搜尋關鍵字
- 用戶搜尋路徑
- 搜尋結果數量分布

**Dashboard 3: 性能監控**
- 慢查詢列表
- 響應時間趨勢
- 快取命中率

**Dashboard 4: 錯誤追蹤**
- 搜尋錯誤率
- 錯誤類型分布
- 錯誤詳情

---

## 📞 技術支援

如有問題，請查看：
- `docs/LOGZIO_INTEGRATION.md` - Logz.io 整合指南
- `docs/LOGGING_MIGRATION_PLAN.md` - 完整遷移計劃

---

**文檔版本**: 1.0  
**最後更新**: 2025-11-05  
**作者**: LawSowl 開發團隊

