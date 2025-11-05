# 律師和法官搜索日誌整合報告

## 📋 概述

為律師搜索和法官搜索功能添加了完整的 Logz.io 日誌記錄，與判決書搜索保持一致的日誌格式和標準。

---

## 🎯 實現功能

### **1. 律師搜索日誌**

#### **日誌事件**

| 狀態 | Message | 說明 |
|------|---------|------|
| `started` | `👨‍⚖️ 律師搜尋: "王小明"` | 搜索開始 |
| `completed` | `✅ 律師搜尋完成: 42 筆案件 (328ms)` | 搜索成功 |
| `failed` | `❌ 律師搜尋失敗: Connection timeout (328ms)` | 搜索失敗 |

#### **日誌結構**

```json
{
  "message": "👨‍⚖️ 律師搜尋: \"王小明\"",
  "event": "lawyer_search",
  "operation": "lawyer_data_search",
  "status": "started",
  "userId": "user-123",
  "lawyerName": "王小明",
  "timestamp": "2025-11-05 14:30:00"
}
```

```json
{
  "message": "✅ 律師搜尋完成: 42 筆案件 (328ms)",
  "event": "lawyer_search",
  "operation": "lawyer_data_search",
  "status": "completed",
  "userId": "user-123",
  "lawyerName": "王小明",
  "caseCount": 42,
  "duration": 328,
  "hasResults": true,
  "timestamp": "2025-11-05 14:30:00"
}
```

---

### **2. 法官搜索日誌**

#### **日誌事件**

| 狀態 | Message | 說明 |
|------|---------|------|
| `started` | `⚖️ 法官搜尋: "王婉如"` | 搜索開始 |
| `cache_hit` | `⚡ 法官搜尋快取命中: 156 筆案件 (15ms)` | 完整快取命中 |
| `partial_cache_hit` | `⚡ 法官搜尋部分快取命中 (15ms)` | 部分快取命中 |
| `completed` | `✅ 法官搜尋完成: 156 筆案件 (2850ms)` | 搜索成功 |
| `failed` | `❌ 法官搜尋失敗: ES query failed (2850ms)` | 搜索失敗 |

#### **日誌結構**

**搜索開始：**
```json
{
  "message": "⚖️ 法官搜尋: \"王婉如\"",
  "event": "judge_search",
  "operation": "judge_analytics_search",
  "status": "started",
  "userId": "user-123",
  "judgeName": "王婉如",
  "timestamp": "2025-11-05 14:30:00"
}
```

**快取命中：**
```json
{
  "message": "⚡ 法官搜尋快取命中: 156 筆案件 (15ms)",
  "event": "judge_search",
  "operation": "judge_analytics_search",
  "status": "cache_hit",
  "userId": "user-123",
  "judgeName": "王婉如",
  "caseCount": 156,
  "duration": 15,
  "cacheAge": "2.50 小時",
  "timestamp": "2025-11-05 14:30:00"
}
```

**搜索完成：**
```json
{
  "message": "✅ 法官搜尋完成: 156 筆案件 (2850ms)",
  "event": "judge_search",
  "operation": "judge_analytics_search",
  "status": "completed",
  "userId": "user-123",
  "judgeName": "王婉如",
  "caseCount": 156,
  "duration": 2850,
  "hasResults": true,
  "timestamp": "2025-11-05 14:30:00"
}
```

---

## 📊 Logz.io 查詢範例

### **律師搜索**

```
# 查詢所有律師搜索
event:lawyer_search

# 查詢特定律師
event:lawyer_search AND lawyerName:"王小明"

# 查詢成功的搜索
event:lawyer_search AND status:completed

# 查詢失敗的搜索
event:lawyer_search AND status:failed

# 查詢無結果的搜索
event:lawyer_search AND caseCount:0

# 查詢慢查詢（超過 1 秒）
event:lawyer_search AND duration:>1000
```

### **法官搜索**

```
# 查詢所有法官搜索
event:judge_search

# 查詢特定法官
event:judge_search AND judgeName:"王婉如"

# 查詢快取命中
event:judge_search AND status:cache_hit

# 查詢部分快取命中
event:judge_search AND status:partial_cache_hit

# 查詢成功的搜索
event:judge_search AND status:completed

# 查詢失敗的搜索
event:judge_search AND status:failed

# 查詢慢查詢（超過 3 秒）
event:judge_search AND duration:>3000
```

---

## 🎨 Emoji 使用規範

| Emoji | 用途 | 功能 |
|-------|------|------|
| 👨‍⚖️ | 律師搜索開始 | `lawyer_search` |
| ⚖️ | 法官搜索開始 | `judge_search` |
| ⚡ | 快取命中 | `cache_hit`, `partial_cache_hit` |
| ✅ | 操作成功 | `completed` |
| ❌ | 操作失敗 | `failed` |

---

## 🔧 代碼修改

### **1. 律師搜索**

**文件：** `services/lawyer.js`

**修改：**
- 添加 `logger` import
- `searchLawyerData` 函數添加 `userId` 參數
- 記錄搜索開始、完成、失敗

**文件：** `controllers/lawyer-controller.js`

**修改：**
- 傳遞 `userId` 給 Service 層

---

### **2. 法官搜索**

**文件：** `services/judgeService.js`

**修改：**
- 添加 `logger` import
- `getJudgeAnalytics` 函數添加 `userId` 參數
- 記錄搜索開始、快取命中、完成、失敗

**文件：** `controllers/judgeController.js`

**修改：**
- 傳遞 `userId` 給 Service 層

---

## 📈 預期效果

### **Logz.io 列表頁面**

```
14:30:00  [info]  👨‍⚖️ 律師搜尋: "王小明"
14:30:00  [info]  ✅ 律師搜尋完成: 42 筆案件 (328ms)
14:30:05  [info]  ⚖️ 法官搜尋: "王婉如"
14:30:05  [info]  ⚡ 法官搜尋快取命中: 156 筆案件 (15ms)
14:30:10  [info]  ⚖️ 法官搜尋: "李大華"
14:30:13  [info]  ✅ 法官搜尋完成: 89 筆案件 (2850ms)
```

---

## 🎯 與判決書搜索的一致性

| 特性 | 判決書搜索 | 律師搜索 | 法官搜索 |
|------|-----------|---------|---------|
| **頂層欄位** | `event`, `operation`, `status`, `userId` | ✅ | ✅ |
| **Emoji** | ✅ | ✅ | ✅ |
| **台灣正體中文** | ✅ | ✅ | ✅ |
| **數字格式** | `42 筆結果` | `42 筆案件` | `156 筆案件` |
| **耗時記錄** | `(292ms)` | `(328ms)` | `(2850ms)` |
| **狀態追蹤** | `started`, `completed`, `failed` | ✅ | ✅ + `cache_hit` |

---

## 🚀 測試步驟

### **1. 等待部署**

等待 Render.com 部署完成（約 2-5 分鐘）

### **2. 測試律師搜索**

1. 在前端搜索律師「王小明」
2. 在 Logz.io 搜索：`event:lawyer_search AND lawyerName:"王小明"`
3. 檢查日誌是否包含：
   - ✅ `👨‍⚖️ 律師搜尋: "王小明"`
   - ✅ `✅ 律師搜尋完成: X 筆案件 (Xms)`
   - ✅ `userId` 欄位
   - ✅ `caseCount` 欄位
   - ✅ `duration` 欄位

### **3. 測試法官搜索**

1. 在前端搜索法官「王婉如」
2. 在 Logz.io 搜索：`event:judge_search AND judgeName:"王婉如"`
3. 檢查日誌是否包含：
   - ✅ `⚖️ 法官搜尋: "王婉如"`
   - ✅ `⚡ 法官搜尋快取命中` 或 `✅ 法官搜尋完成`
   - ✅ `userId` 欄位
   - ✅ `caseCount` 欄位
   - ✅ `duration` 欄位

### **4. 測試快取機制**

1. 第一次搜索法官「王婉如」
   - 應該看到：`✅ 法官搜尋完成: X 筆案件 (Xms)`
2. 立即再次搜索同一法官
   - 應該看到：`⚡ 法官搜尋快取命中: X 筆案件 (Xms)`
   - 耗時應該明顯減少

---

## 📝 相關文檔

- **判決書搜索日誌：** `docs/ENHANCED_LOGGING_SUMMARY.md`
- **參數一致性檢查：** `docs/PARAMETER_CONSISTENCY_AUDIT.md`
- **關鍵字參數修正：** `docs/KEYWORD_PARAMETER_FIX.md`

---

**實現日期：** 2025-11-05  
**實現者：** LawSowl 開發團隊  
**版本：** 1.0

