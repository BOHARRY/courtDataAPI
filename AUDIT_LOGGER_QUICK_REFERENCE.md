# 審計日誌快速參考

## 📊 資源標籤對照表

| 資源 (resource) | 中文標籤 (resourceLabel) |
|----------------|------------------------|
| workspaces | 工作區 |
| judgments | 判決資料 |
| users | 使用者資料 |
| auditLogs | 操作紀錄 |
| **judges** | **法官資料** ⭐ |
| **lawyers** | **律師資料** ⭐ |
| search | 判決搜尋 |
| semantic-search | 語意搜尋 |
| ai-agent | AI 對話 |
| law-search | 法條查詢 |
| citation | 引用判決 |
| mcp | MCP 工具 |
| ai | AI 分析 |
| complaint | 訴狀分析 |
| payment | 付款 |
| intake | 案件接案 |

---

## 🎯 常見操作摘要

### 法官相關
| 路由 | 摘要 |
|------|------|
| `GET /api/judges/:judgeName` | 查詢法官分析 (王婉如) |
| `GET /api/judges/:judgeName/analysis-status` | 查詢法官AI分析狀態 (王婉如) |
| `POST /api/judges/:judgeName/reanalyze` | 觸發法官重新分析 (王婉如) |

### 律師相關
| 路由 | 摘要 |
|------|------|
| `GET /api/lawyers/:name` | 查詢律師基本資料 (陳建宏) |
| `GET /api/lawyers/:name/cases-distribution` | 查詢律師案件分布 (陳建宏) |
| `GET /api/lawyers/:name/analysis` | 查詢律師優劣勢分析 (陳建宏) |

### AI 分析
| 路由 | 摘要 |
|------|------|
| `POST /api/ai-agent/chat` | AI 對話查詢 |
| `POST /api/ai/analyze-success-factors` | AI 勝訴關鍵分析 |
| `POST /api/ai/summarize-common-points` | AI 歸納判例共同點 |
| `POST /api/ai/citation-analysis` | AI 引用分析 |
| `POST /api/ai/writing-assistant` | AI 寫作助手 |
| `POST /api/ai/pleading-generation` | AI 訴狀生成 |

### 搜尋
| 路由 | 摘要 |
|------|------|
| `GET /api/search` | 搜尋判決書 |
| `GET /api/semantic-search` | 語意搜尋判決書 |

### 其他
| 路由 | 摘要 |
|------|------|
| `GET /api/law-search` | 查詢法條 |
| `POST /api/citation/query` | 查詢引用判決 |
| `POST /api/complaint/validate-text` | 驗證訴狀文本 |
| `POST /api/complaint/analyze-judge-match` | 分析訴狀與法官匹配度 |

---

## 🔍 查詢審計日誌範例

### 在 Firebase Console 查詢

**查詢特定用戶的法官查詢記錄**:
```
collection: auditLogs
where: userId == "abc123"
where: resource == "judges"
orderBy: timestamp desc
```

**查詢所有 AI 對話**:
```
collection: auditLogs
where: resource == "ai-agent"
orderBy: timestamp desc
```

**查詢失敗的請求**:
```
collection: auditLogs
where: statusCode >= 400
orderBy: timestamp desc
```

---

## 📝 日誌欄位說明

| 欄位 | 類型 | 說明 | 範例 |
|------|------|------|------|
| userId | string | 用戶 UID | "abc123" |
| method | string | HTTP 方法 | "GET", "POST" |
| path | string | 請求路徑 | "/api/judges/王婉如" |
| action | string | 動作類型 | "VIEW", "CREATE", "UPDATE", "DELETE" |
| resource | string | 資源類型 | "judges", "lawyers" |
| resourceLabel | string | 資源中文標籤 | "法官資料", "律師資料" |
| summary | string | 操作摘要 | "查詢法官分析 (王婉如)" |
| statusCode | number | HTTP 狀態碼 | 200, 404, 500 |
| durationMs | number | 請求耗時 (毫秒) | 1234 |
| ip | string | 用戶 IP | "1.2.3.4" |
| timestamp | Timestamp | 時間戳 | Firestore Timestamp |
| metadata | object | 請求參數 | { params: {...}, query: {...} } |

---

## 🚀 使用 API 查詢審計日誌

### 查詢特定用戶的操作記錄

```bash
GET /api/audit-logs?userId=abc123&limit=20
Authorization: Bearer <admin-token>
```

### 查詢特定 Email 的操作記錄

```bash
GET /api/audit-logs?email=user@example.com&limit=20
Authorization: Bearer <admin-token>
```

### 分頁查詢

```bash
GET /api/audit-logs?userId=abc123&limit=20&startAfter=2025-10-20T10:00:00Z
Authorization: Bearer <admin-token>
```

---

## 💡 實用查詢範例

### 1. 找出最活躍的用戶
```javascript
// 在 Firebase Console 或後端腳本中
const snapshot = await db.collection('auditLogs')
  .where('timestamp', '>', startDate)
  .get();

const userActivity = {};
snapshot.docs.forEach(doc => {
  const userId = doc.data().userId;
  userActivity[userId] = (userActivity[userId] || 0) + 1;
});

// 排序找出最活躍用戶
const topUsers = Object.entries(userActivity)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);
```

### 2. 統計各功能使用頻率
```javascript
const snapshot = await db.collection('auditLogs')
  .where('timestamp', '>', startDate)
  .get();

const resourceStats = {};
snapshot.docs.forEach(doc => {
  const resource = doc.data().resourceLabel;
  resourceStats[resource] = (resourceStats[resource] || 0) + 1;
});

console.log('功能使用統計:', resourceStats);
// 輸出: { "法官資料": 150, "律師資料": 80, "AI 對話": 200, ... }
```

### 3. 找出慢速請求
```javascript
const snapshot = await db.collection('auditLogs')
  .where('durationMs', '>', 5000) // 超過 5 秒
  .orderBy('durationMs', 'desc')
  .limit(20)
  .get();

snapshot.docs.forEach(doc => {
  const data = doc.data();
  console.log(`${data.summary}: ${data.durationMs}ms`);
});
```

### 4. 找出錯誤請求
```javascript
const snapshot = await db.collection('auditLogs')
  .where('statusCode', '>=', 400)
  .orderBy('statusCode', 'desc')
  .orderBy('timestamp', 'desc')
  .limit(50)
  .get();

snapshot.docs.forEach(doc => {
  const data = doc.data();
  console.log(`[${data.statusCode}] ${data.summary} - ${data.userId}`);
});
```

---

## 🔐 安全注意事項

1. **只有管理員可以查詢審計日誌** - 需要 `verifyAdmin` 中間件
2. **生產環境才記錄** - `NODE_ENV !== 'development'`
3. **只記錄已認證用戶** - 需要 `req.user.uid`
4. **敏感資料處理** - `metadata` 中的物件會被標記為 `[object]`

---

## 📈 監控建議

### 每日監控指標
- 總請求數
- 錯誤率 (4xx, 5xx)
- 平均響應時間
- 最慢的 10 個請求

### 每週監控指標
- 各功能使用頻率
- 最活躍用戶 Top 10
- 新用戶註冊數
- 付費轉換率

### 異常警報
- 單一用戶短時間內大量請求 (可能是爬蟲)
- 大量 5xx 錯誤 (系統問題)
- 特定功能突然無人使用 (可能故障)

---

## 🎯 總結

審計日誌現在提供：
- ✅ 完整的中文標籤
- ✅ 清楚的操作摘要
- ✅ 自動解碼 URL 編碼的名字
- ✅ 涵蓋所有主要功能
- ✅ 豐富的查詢能力

管理員可以輕鬆追蹤和分析用戶行為！🚀

