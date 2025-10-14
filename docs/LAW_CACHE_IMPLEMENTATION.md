# 法條 AI 解析 Firebase 快取層實作文檔

## 📋 概述

為了減少 OpenAI API 調用成本和提高響應速度，我們為 `aiExplainLaw` 函數添加了 Firebase Firestore 快取層。

## 🔧 最近更新

**2025-10-14**：修復緩存 Bug，確保只有有效的查詢結果才會被存入 Firebase。

**修復內容**：
- ✅ 添加結果驗證邏輯
- ✅ 只有當 `法條原文`、`出處來源` 都有效時才存入快取
- ✅ 防止錯誤結果（如 "查詢失敗"）被存入快取

## 🎯 核心功能

### 1. 快取查詢流程

```
用戶請求法條解析
    ↓
檢查 Firebase 快取
    ↓
├─ 快取命中 ────→ 返回快取結果 + 更新統計
│                  (hitCount++, lastAccessedAt)
│
└─ 快取未命中 ───→ 調用 GPT-5-mini AI 查詢
                      ↓
                  存入 Firebase 快取
                      ↓
                  返回 AI 結果
```

### 2. Firestore 集合結構

**集合名稱**: `lawArticleCache`

**文檔 ID**: 法條名稱（例如：`民法第184條`）

**文檔結構**:
```javascript
{
  "法條原文": "因故意或過失，不法侵害他人之權利者，負損害賠償責任...",
  "出處來源": "https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=B0000001&flno=184",
  "白話解析": "如果故意或過失侵害他人權利，需要賠償損失...",
  "查詢時間": "2025-10-08T05:38:41.293Z",
  "createdAt": Timestamp,      // 首次創建時間
  "updatedAt": Timestamp,      // 最後更新時間
  "hitCount": 15,              // 快取命中次數
  "lastAccessedAt": Timestamp  // 最後訪問時間
}
```

## 🔧 實作細節

### 核心函數

#### 1. `getLawFromCache(lawName)`

**功能**: 從 Firebase 快取中查詢法條

**參數**:
- `lawName` (string): 法條名稱，例如 "民法第184條"

**返回值**:
- 成功: 包含法條資料的物件 + `_cached: true` 標記
- 失敗/未命中: `null`

**特性**:
- 自動更新 `hitCount` (命中次數 +1)
- 自動更新 `lastAccessedAt` (最後訪問時間)
- 錯誤處理：快取查詢失敗不影響主流程

**代碼示例**:
```javascript
const cachedResult = await getLawFromCache("民法第184條");
if (cachedResult) {
  console.log(`快取命中，命中次數: ${cachedResult._hitCount}`);
  return cachedResult;
}
```

#### 2. `saveLawToCache(lawName, lawData)`

**功能**: 將 AI 查詢結果存入 Firebase 快取

**參數**:
- `lawName` (string): 法條名稱
- `lawData` (object): 包含法條原文、出處來源、白話解析、查詢時間的物件

**特性**:
- 異步執行，不阻塞主流程
- 自動設定 `createdAt`, `updatedAt`, `hitCount`, `lastAccessedAt`
- 錯誤處理：存入失敗不影響返回結果

**代碼示例**:
```javascript
// 異步存入，不等待完成
saveLawToCache(lawName, result).catch(err => {
  console.error('背景存入快取失敗:', err);
});
```

#### 3. `aiExplainLaw(lawName)` (已修改)

**新增流程**:
1. **先檢查快取**: 調用 `getLawFromCache()`
2. **快取命中**: 直接返回快取結果
3. **快取未命中**:
   - 調用 GPT-5-mini AI 查詢
   - **🆕 驗證結果有效性**（2025-10-14 新增）
   - 只有有效結果才異步存入快取
   - 返回 AI 結果

**🆕 結果驗證邏輯** (2025-10-14 新增，已加強):

只有當以下條件**全部滿足**時，才會將結果存入快取：

```javascript
const isValidResult = (
    result.法條原文 &&
    result.法條原文.trim() !== "" &&
    result.法條原文 !== "抱歉，目前無法獲取法條原文，請稍後再試。" &&
    !result.法條原文.includes("無法獲取") &&
    !result.法條原文.includes("查詢失敗") &&
    result.出處來源 &&
    result.出處來源.trim() !== "" &&
    result.出處來源 !== "查詢失敗" &&
    result.出處來源.startsWith('http') && // 確保是有效的 URL
    !result.出處來源.includes("錯誤") && // 排除包含「錯誤」的 URL
    !result.出處來源.includes("失敗") && // 排除包含「失敗」的 URL
    !result.出處來源.includes("無法") && // 排除包含「無法」的 URL
    !result.出處來源.includes("（") && // 排除包含括號說明的 URL
    !result.出處來源.includes("(") // 排除包含括號說明的 URL
);
```

**驗證條件**:

**法條原文驗證**:
- ✅ `法條原文` 存在且不為空
- ✅ `法條原文` 不是錯誤訊息（"抱歉，目前無法獲取法條原文，請稍後再試。"）
- ✅ `法條原文` 不包含 "無法獲取"
- ✅ `法條原文` 不包含 "查詢失敗"

**出處來源驗證**:
- ✅ `出處來源` 存在且不為空
- ✅ `出處來源` 不是 "查詢失敗"
- ✅ `出處來源` 是有效的 HTTP/HTTPS URL
- ✅ `出處來源` 不包含 "錯誤"
- ✅ `出處來源` 不包含 "失敗"
- ✅ `出處來源` 不包含 "無法"
- ✅ `出處來源` 不包含括號說明（中文或英文）

**不會被存入快取的情況**:
- ❌ AI 查詢失敗（catch 區塊的降級結果）
- ❌ `出處來源` 為 "查詢失敗"
- ❌ `法條原文` 為錯誤訊息
- ❌ `出處來源` 不是有效的 URL
- ❌ `出處來源` 包含錯誤訊息（例如：`https://law.moj.gov.tw/（嘗試存取全國法規資料庫時發生連線或擷取錯誤）`）

## 📊 效能優化

### 1. 成本節省

**假設**:
- GPT-5-mini 每次調用成本: ~$0.001
- 熱門法條（如民法第184條）每月查詢: 1000 次

**快取效果**:
- 第一次查詢: 調用 AI ($0.001)
- 後續 999 次: 使用快取 ($0)
- **節省成本**: $0.999 (99.9%)

### 2. 響應速度

| 查詢方式 | 平均響應時間 | 說明 |
|---------|------------|------|
| AI 查詢 | 3-5 秒 | 需要網路搜尋 + AI 處理 |
| 快取查詢 | 50-200 ms | 直接從 Firestore 讀取 |
| **提升** | **15-100 倍** | 顯著改善用戶體驗 |

### 3. 統計數據

通過 `hitCount` 和 `lastAccessedAt` 可以分析：
- 最熱門的法條（高 hitCount）
- 冷門法條（低 hitCount 或舊 lastAccessedAt）
- 可用於優化快取策略或預載熱門法條

## 🔍 監控與日誌

### 日誌輸出示例

**快取命中**:
```
[LawCache] 快取命中: 民法第184條, 命中次數: 15
[LawSearch] 使用快取結果: 民法第184條
```

**快取未命中**:
```
[LawCache] 快取未命中: 民法第217條
[LawSearch] AI 解析法條 (使用 GPT-5-mini Responses API): 民法第217條
[LawSearch] AI 解析成功 (GPT-5-mini): { lawName: '民法第217條', ... }
[LawCache] 已存入快取: 民法第217條
```

**快取錯誤**:
```
[LawCache] 查詢快取失敗: Error: ...
[LawSearch] AI 解析法條 (使用 GPT-5-mini Responses API): 民法第184條
```

## 🛠️ 維護與管理

### 查詢快取統計

使用 Firebase Console 或 Admin SDK 查詢：

```javascript
const db = admin.firestore();
const snapshot = await db.collection('lawArticleCache')
  .orderBy('hitCount', 'desc')
  .limit(10)
  .get();

snapshot.forEach(doc => {
  console.log(`${doc.id}: ${doc.data().hitCount} 次命中`);
});
```

### 清理舊快取（可選）

如果需要定期更新法條內容：

```javascript
const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

const snapshot = await db.collection('lawArticleCache')
  .where('updatedAt', '<', thirtyDaysAgo)
  .get();

const batch = db.batch();
snapshot.docs.forEach(doc => {
  batch.delete(doc.ref);
});
await batch.commit();
```

## 🚀 未來優化方向

### 1. 快取預熱
- 預先載入常用法條（民法、刑法重要條文）
- 減少首次查詢的等待時間

### 2. 快取更新策略
- 定期檢查法規資料庫更新
- 自動更新已變更的法條

### 3. 分層快取
- 第一層：記憶體快取（Node.js Map）
- 第二層：Firestore 快取
- 第三層：AI 查詢

### 4. 快取預測
- 根據用戶查詢歷史預測可能查詢的法條
- 提前載入相關法條到快取

## ⚠️ 注意事項

1. **快取一致性**: 法條內容變更時需要手動更新或清除快取
2. **存儲成本**: Firestore 按讀寫次數和存儲量計費，需監控成本
3. **錯誤處理**: 快取層失敗不應影響主功能，已實作降級機制
4. **並發控制**: Firestore 自動處理並發寫入，無需額外處理

## 📈 預期效果

### 短期效果（1 週內）
- ✅ 減少 50-70% 的 AI API 調用
- ✅ 平均響應時間降低 60-80%
- ✅ 用戶體驗顯著提升

### 長期效果（1 個月後）
- ✅ 減少 80-90% 的 AI API 調用（熱門法條完全快取）
- ✅ 成本節省 80-90%
- ✅ 可擴展性提升（支援更高並發）

## 🎉 總結

通過添加 Firebase 快取層，我們實現了：
1. **成本優化**: 大幅減少 OpenAI API 調用
2. **性能提升**: 響應速度提升 15-100 倍
3. **用戶體驗**: 即時返回常用法條
4. **可維護性**: 完整的日誌和統計數據
5. **可擴展性**: 為未來優化奠定基礎

