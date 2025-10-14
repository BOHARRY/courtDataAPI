# 援引判決查詢 Firebase 快取層實作文檔

## 📋 概述

為了減少 Chrome MCP 調用成本和提高響應速度，我們為援引判決查詢功能添加了 Firebase Firestore 快取層。

## 🎯 核心功能

### 快取流程

```
用戶查詢援引判決
    ↓
解析案號 (parseCitationText)
    ↓
生成緩存 Key (generateCacheKey)
    ↓
檢查 Firebase 快取 (getCitationFromCache)
    ↓
├─ 快取命中 ────→ 返回快取結果 + 更新統計
│                  (hitCount++, lastAccessedAt)
│                  耗時 < 1 秒
│
└─ 快取未命中 ───→ 調用 Chrome MCP + GPT-4.1 查詢
                      ↓
                  存入 Firebase 快取 (saveCitationToCache)
                      ↓
                  返回查詢結果
                      ↓
                  耗時 20-40 秒
```

---

## 🗂️ Firebase 數據結構

### Collection: `citationCache`

### Document ID 格式

```
${court}-${year}-${category}-${number}
```

**範例**：
- `最高法院-96-台上-489`
- `臺灣高等法院-108-上訴-1234`
- `臺北地方法院-109-訴-5678`

### Document 欄位

```javascript
{
  // 基本資訊
  court: "最高法院",           // 法院名稱
  year: "96",                  // 年度
  category: "台上",            // 案件類別
  number: "489",               // 案號
  caseType: "civil",           // 案件類型 (civil/criminal/administrative)

  // 查詢結果
  judgementUrl: "https://judgment.judicial.gov.tw/FJUD/data.aspx?ty=JD&id=...",

  // 元數據
  createdAt: Timestamp,        // 創建時間
  updatedAt: Timestamp,        // 更新時間
  hitCount: 3,                 // 命中次數
  lastAccessedAt: Timestamp,   // 最後訪問時間

  // 查詢資訊
  queryDuration: 25000,        // 首次查詢耗時（毫秒）
  sessionId: "abc123"          // 首次查詢的 Chrome MCP Session ID
}
```

---

## 🔧 核心函數

### 1. `generateCacheKey(citationInfo)`

**功能**：生成緩存 Key

**參數**：
```javascript
{
  court: "最高法院",
  year: "96",
  category: "台上",
  number: "489"
}
```

**返回**：
```javascript
"最高法院-96-台上-489"
```

---

### 2. `getCitationFromCache(cacheKey)`

**功能**：從 Firebase 緩存中獲取援引判決 URL

**流程**：
1. 查詢 Firestore 文檔
2. 如果存在，更新 `hitCount` 和 `lastAccessedAt`
3. 返回緩存數據

**返回**：
```javascript
{
  judgementUrl: "https://...",
  court: "最高法院",
  year: "96",
  category: "台上",
  number: "489",
  caseType: "civil",
  queryDuration: 25000,
  _cached: true,
  _hitCount: 3,
  _createdAt: Timestamp
}
```

**如果未命中**：返回 `null`

---

### 3. `saveCitationToCache(cacheKey, citationData)`

**功能**：將援引判決查詢結果存入 Firebase 緩存

**參數**：
```javascript
{
  court: "最高法院",
  year: "96",
  category: "台上",
  number: "489",
  caseType: "civil",
  judgementUrl: "https://...",
  queryDuration: 25000,
  sessionId: "abc123"
}
```

**特點**：
- 異步執行，不阻塞主流程
- 使用 `.catch()` 捕獲錯誤，避免影響查詢結果返回

---

## 📊 使用統計

### 快取命中率追蹤

每次快取命中時，會自動更新：
- `hitCount`: 累計命中次數 +1
- `lastAccessedAt`: 更新為當前時間

### 查詢統計

可以通過 Firestore 查詢獲取：

**最常查詢的判決書**（按命中次數排序）：
```javascript
db.collection('citationCache')
  .orderBy('hitCount', 'desc')
  .limit(10)
  .get()
```

**最近查詢的判決書**（按最後訪問時間排序）：
```javascript
db.collection('citationCache')
  .orderBy('lastAccessedAt', 'desc')
  .limit(10)
  .get()
```

---

## 🚀 性能提升

### 首次查詢（未命中）

```
解析案號 → 判斷案件類型 → Chrome MCP 查詢 → 存入快取
耗時：20-40 秒
```

### 第二次查詢（命中）

```
解析案號 → 檢查快取 → 返回結果
耗時：< 1 秒
```

**性能提升**：20-40 倍 🚀

---

## 💰 成本節省

### Chrome MCP 調用成本

假設：
- 每次 Chrome MCP 查詢成本：$0.05
- 每月查詢 1000 次
- 快取命中率：60%

**無快取**：
```
1000 次 × $0.05 = $50/月
```

**有快取**：
```
400 次（未命中） × $0.05 = $20/月
節省：$30/月（60%）
```

---

## 🎯 實作細節

### 修改的文件

**`services/citationQueryService.js`**

#### 新增 Import

```javascript
import admin from 'firebase-admin';
```

#### 新增常量

```javascript
const CITATION_CACHE_COLLECTION = 'citationCache';
```

#### 新增函數

1. `generateCacheKey(citationInfo)` - 生成緩存 Key
2. `getCitationFromCache(cacheKey)` - 從快取獲取
3. `saveCitationToCache(cacheKey, citationData)` - 存入快取

#### 修改函數

1. `queryCitation(citationText, judgementId)` - 添加快取邏輯
2. `queryCitationWithSSE(citationText, judgementId, progressCallback)` - 添加快取邏輯

---

## 📝 使用範例

### 查詢援引判決（帶快取）

```javascript
import { queryCitation } from './services/citationQueryService.js';

// 首次查詢（快取未命中）
const result1 = await queryCitation('最高法院96年台上字第489號', 'TPSV,96,台上,489,20070315,1');
console.log(result1);
// {
//   success: true,
//   url: "https://...",
//   citation_info: { court: "最高法院", year: "96", ... },
//   query_steps: [...],
//   cached: false
// }

// 第二次查詢（快取命中）
const result2 = await queryCitation('最高法院96年台上字第489號', 'TPSV,96,台上,489,20070315,1');
console.log(result2);
// {
//   success: true,
//   url: "https://...",
//   citation_info: { court: "最高法院", year: "96", ... },
//   query_steps: [],
//   cached: true,
//   hitCount: 1
// }
```

---

## 🔍 監控與維護

### 查看快取統計

```javascript
const db = admin.firestore();

// 總快取數量
const snapshot = await db.collection('citationCache').get();
console.log(`總快取數量: ${snapshot.size}`);

// 快取命中率最高的判決書
const topHits = await db.collection('citationCache')
  .orderBy('hitCount', 'desc')
  .limit(10)
  .get();

topHits.forEach(doc => {
  const data = doc.data();
  console.log(`${doc.id}: ${data.hitCount} 次命中`);
});
```

### 清理舊快取（可選）

```javascript
// 刪除 90 天未訪問的快取
const ninetyDaysAgo = new Date();
ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

const oldCache = await db.collection('citationCache')
  .where('lastAccessedAt', '<', ninetyDaysAgo)
  .get();

const batch = db.batch();
oldCache.forEach(doc => {
  batch.delete(doc.ref);
});

await batch.commit();
console.log(`已刪除 ${oldCache.size} 個舊快取`);
```

---

## ✅ 測試建議

### 1. 快取命中測試

```bash
# 第一次查詢（應該未命中）
curl -X POST http://localhost:3000/api/citation/query \
  -H "Content-Type: application/json" \
  -d '{"citationText": "最高法院96年台上字第489號", "judgementId": "test-id"}'

# 第二次查詢（應該命中）
curl -X POST http://localhost:3000/api/citation/query \
  -H "Content-Type: application/json" \
  -d '{"citationText": "最高法院96年台上字第489號", "judgementId": "test-id"}'
```

### 2. 並發查詢測試

```javascript
// 同時查詢 3 個不同的判決書
const results = await Promise.all([
  queryCitation('最高法院96年台上字第489號', 'test-id-1'),
  queryCitation('最高法院95年台上字第310號', 'test-id-2'),
  queryCitation('最高法院94年台上字第1234號', 'test-id-3')
]);

console.log('所有查詢完成:', results);
```

---

## 🎉 總結

### 優勢

1. ✅ **大幅降低成本**：重複查詢不需要調用 Chrome MCP
2. ✅ **極速響應**：緩存命中 < 1 秒
3. ✅ **越用越健壯**：常見判決書會被緩存
4. ✅ **降低錯誤率**：緩存的結果是已驗證成功的
5. ✅ **統計數據**：可以看到哪些判決書最常被查詢

### 實作日期

2025-10-14

### 實作者

LawSowl 開發團隊

---

**🚀 援引判決查詢系統現在更快、更穩定、更經濟！**

