# 📋 日誌系統遷移計劃

## 🎯 目標

將所有 Service 層的 `console.log/error/warn` 遷移到統一的 Logger 系統，確保所有重要業務日誌都發送到 Logz.io。

---

## 📊 當前狀態分析

### ✅ 已完成遷移

1. **核心中間件**
   - `config/express.js` - HTTP 請求、CORS、全局錯誤
   - `middleware/auth.js` - 認證、Token 驗證
   - `middleware/credit.js` - 積分扣除

### ❌ 待遷移模組

#### **優先級 1：核心業務功能**

1. **判決書搜尋** (`services/judgment.js`)
   - 當前：幾乎沒有日誌
   - 需要：搜尋參數、結果數量、執行時間、用戶 ID

2. **語意搜尋** (`services/semanticSearchService.js`)
   - 當前：有基本日誌，但格式不統一
   - 需要：結構化日誌、用戶 ID、性能指標

3. **案由搜尋** (`services/caseDescriptionSearchService.js`)
   - 當前：有詳細日誌，但都是 console.log
   - 需要：遷移到 logger，添加用戶 ID

#### **優先級 2：分析功能**

4. **法官查詢** (`services/judgeService.js`)
   - 當前：日誌較完整
   - 需要：遷移到 logger，添加性能指標

5. **律師查詢** (`services/lawyer.js`)
   - 當前：日誌很少
   - 需要：添加完整的業務日誌

6. **法條搜尋** (`services/lawSearchService.js`)
   - 當前：有詳細日誌
   - 需要：結構化格式、用戶 ID

#### **優先級 3：AI 功能**

7. **AI 分析服務** (`services/aiAnalysisService.js`)
8. **意圖分類器** (`services/intentClassifier.js`)

---

## 🔧 遷移標準

### **必須包含的信息**

每個業務日誌應該包含：

```javascript
logger.business('Operation description', {
  userId: req.user?.uid,           // 用戶 ID
  operation: 'search_judgment',    // 操作類型
  parameters: {                    // 操作參數
    query: '...',
    filters: {...}
  },
  result: {                        // 操作結果
    count: 42,
    duration: 234
  },
  metadata: {                      // 額外元數據
    ip: req.ip,
    userAgent: req.get('user-agent')
  }
});
```

### **日誌級別使用規範**

| 級別 | 使用場景 | 範例 |
|------|---------|------|
| `error` | 錯誤、異常 | ES 連接失敗、API 調用失敗 |
| `warn` | 警告、降級 | 快取未命中、使用降級機制 |
| `info` | 業務事件 | 搜尋完成、數據更新 |
| `debug` | 調試信息 | 僅開發環境，不發送到 Logz.io |

### **專用方法使用**

```javascript
// HTTP 請求
logger.http('Incoming request', { method, url, ip });

// 業務事件
logger.business('Search completed', { userId, query, resultCount });

// 安全事件
logger.security('Unauthorized access', { userId, ip, reason });

// 性能日誌
logger.performance('API response', { endpoint, duration, statusCode });
```

---

## 📝 遷移範例

### **Before（現在）**

```javascript
// services/judgment.js
export async function searchJudgments(query, filters) {
  try {
    const result = await esClient.search({...});
    // ❌ 沒有日誌
    return result;
  } catch (error) {
    console.error('Search failed:', error);  // ❌ 不會發送到 Logz.io
    throw error;
  }
}
```

### **After（遷移後）**

```javascript
// services/judgment.js
import logger from '../utils/logger.js';

export async function searchJudgments(query, filters, userId) {
  const startTime = Date.now();
  
  try {
    logger.info('Starting judgment search', {
      userId,
      query,
      filters,
      operation: 'search_judgment'
    });
    
    const result = await esClient.search({...});
    const duration = Date.now() - startTime;
    
    logger.business('Judgment search completed', {
      userId,
      query,
      resultCount: result.hits.total.value,
      duration,
      operation: 'search_judgment'
    });
    
    return result;
  } catch (error) {
    logger.error('Judgment search failed', {
      userId,
      query,
      filters,
      error: error.message,
      stack: error.stack,
      duration: Date.now() - startTime
    });
    throw error;
  }
}
```

---

## 🚀 實施步驟

### **Phase 1: 判決書搜尋（本週）**

1. **Day 1-2**: 遷移 `services/judgment.js`
   - 添加 logger import
   - 替換所有 console.* 為 logger.*
   - 添加用戶 ID、執行時間

2. **Day 3**: 遷移 `services/semanticSearchService.js`
   - 結構化現有日誌
   - 添加性能指標

3. **Day 4**: 遷移 `services/caseDescriptionSearchService.js`
   - 保留現有詳細日誌
   - 改用 logger 方法

4. **Day 5**: 測試和驗證
   - 在 Logz.io 查看日誌
   - 確認所有信息完整

### **Phase 2: 分析功能（下週）**

5. **Day 6-7**: 遷移法官和律師查詢
6. **Day 8**: 遷移法條搜尋
7. **Day 9-10**: 測試和優化

### **Phase 3: AI 功能（第三週）**

8. **Day 11-12**: 遷移 AI 服務
9. **Day 13-14**: 全面測試
10. **Day 15**: 文檔更新和團隊培訓

---

## 📊 預期效果

遷移完成後，你將能夠在 Logz.io 看到：

### **1. 完整的用戶行為追蹤**

```
service:courtDataAPI AND userId:"user-123"
```

可以看到該用戶的所有操作：
- 搜尋了什麼判決
- 查詢了哪些法官
- 使用了哪些 AI 功能
- 每個操作的執行時間

### **2. 性能分析**

```
service:courtDataAPI AND type:business_event AND duration:>2000
```

找出所有慢操作（>2秒）

### **3. 錯誤追蹤**

```
service:courtDataAPI AND level:error AND operation:search_judgment
```

查看判決書搜尋的所有錯誤

### **4. 業務指標**

```
service:courtDataAPI AND operation:search_judgment
```

統計：
- 每日搜尋次數
- 平均執行時間
- 成功率
- 熱門搜尋關鍵字

---

## 🎯 成功指標

- ✅ 所有 Service 層都使用 logger
- ✅ 沒有 console.log/error/warn（除了啟動日誌）
- ✅ 所有業務日誌包含 userId
- ✅ 所有操作記錄執行時間
- ✅ Logz.io 可以追蹤完整的用戶旅程

---

## 📞 需要幫助？

如果在遷移過程中遇到問題：
1. 查看 `docs/LOGZIO_INTEGRATION.md`
2. 參考已遷移的模組（auth.js, credit.js）
3. 聯繫開發團隊

---

**文檔版本**: 1.0  
**最後更新**: 2025-11-05  
**作者**: LawSowl 開發團隊

