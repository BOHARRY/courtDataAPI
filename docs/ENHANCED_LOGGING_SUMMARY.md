# 🎨 增強型日誌系統總結

## 📊 優化概覽

我們整合了兩種最佳實踐：
1. **結構化數據**（機器可查詢）
2. **人類可讀的 Message**（一眼就懂）

---

## ✨ 核心改進

### **1. Message 豐富化**

**Before（無信息量）：**
```
開始執行判決書關鍵字搜尋
判決書關鍵字搜尋完成
```

**After（有信息量 + Emoji）：**
```
🔍 判決搜尋: "契約糾紛" | 民事 | 台北地方法院
✅ 判決搜尋完成: 42筆 (292ms)
⚠️ 判決搜尋較慢: 3500ms (42筆)
❌ 判決搜尋失敗: Connection timeout
```

---

### **2. 頂層化關鍵欄位**

所有重要欄位都在頂層，方便查詢：

```javascript
{
  event: 'judgment_search',           // 事件類型
  operation: 'judgment_keyword_search', // 操作類型
  status: 'completed',                // 狀態
  userId: 'user-123',                 // 用戶 ID
  keyword: '契約糾紛',                 // 關鍵字（原始值）
  resultCount: 42,                    // 結果數量
  duration: 292                       // 執行時間
}
```

---

### **3. 狀態追蹤**

使用 `status` 欄位追蹤流程：

- `started` - 開始
- `completed` - 完成
- `failed` - 失敗
- `slow_query` - 慢查詢
- `cache_hit` - 快取命中
- `rejected` - 被拒絕（非法律案由）

---

## 🎯 各功能的日誌範例

### **1. 關鍵字搜尋**

#### **搜尋開始：**
```
🔍 判決搜尋: "契約糾紛" | 民事 | 台北地方法院
```

**Metadata：**
```javascript
{
  event: 'judgment_search',
  operation: 'judgment_keyword_search',
  status: 'started',
  userId: 'user-123',
  keyword: '契約糾紛',
  filter_keyword: '契約糾紛',
  filter_caseTypes: '民事',
  filter_court: '台北地方法院',
  filter_verdict: '全部',
  filter_dateRange: '2020-01-01 ~ 2023-12-31',
  page: 1,
  pageSize: 10
}
```

#### **搜尋完成：**
```
✅ 判決搜尋完成: 42筆 (292ms)
```

**Metadata：**
```javascript
{
  event: 'judgment_search',
  operation: 'judgment_keyword_search',
  status: 'completed',
  userId: 'user-123',
  keyword: '契約糾紛',
  filter_keyword: '契約糾紛',
  filter_caseTypes: '民事',
  resultCount: 42,
  duration: 292,
  page: 1,
  pageSize: 10,
  hasResults: true
}
```

#### **慢查詢：**
```
⚠️ 判決搜尋較慢: 3500ms (42筆)
```

**Metadata：**
```javascript
{
  event: 'judgment_search',
  operation: 'judgment_keyword_search',
  status: 'slow_query',
  userId: 'user-123',
  keyword: '契約糾紛',
  duration: 3500,
  resultCount: 42,
  threshold: 3000
}
```

#### **搜尋失敗：**
```
❌ 判決搜尋失敗: Connection timeout
```

---

### **2. 語意搜尋**

#### **GPT 優化開始：**
```
🤖 GPT 優化查詢: "房東不修漏水，我可以不付租金嗎？"
```

#### **GPT 優化完成：**
```
✨ GPT 優化完成: 3個關鍵字
```

**Metadata：**
```javascript
{
  event: 'semantic_query_enhancement',
  operation: 'semantic_query_enhancement',
  status: 'completed',
  userId: 'user-123',
  userQuery: '房東不修漏水，我可以不付租金嗎？',
  enhanced: '承租人因出租人未履行修繕義務而主張租金減免之民事糾紛',
  keywordCount: 3,
  lawCount: 2,
  keywordsJson: '["修繕義務","租金減免","租賃契約"]',
  lawsJson: '["民法第429條","民法第423條"]',
  duration: 1200
}
```

#### **語意搜尋開始：**
```
🎯 語意搜尋: "房東不修漏水，我可以不付租金嗎？"
```

#### **語意搜尋完成：**
```
✅ 語意搜尋完成: 15筆, 3個爭點 (4500ms)
```

**Metadata：**
```javascript
{
  event: 'judgment_search',
  operation: 'judgment_semantic_search',
  status: 'completed',
  userId: 'user-123',
  userQuery: '房東不修漏水，我可以不付租金嗎？',
  caseType: '民事',
  resultCount: 15,
  clusterCount: 3,
  duration: 4500,
  searchMode: 'semantic_clustered'
}
```

---

### **3. 案由搜尋**

#### **正規化開始：**
```
📝 正規化案情: "我是房客，房東一直不修漏水的天花板..."
```

#### **正規化完成：**
```
✅ 正規化完成: 8個關鍵詞
```

**Metadata：**
```javascript
{
  event: 'case_description_normalization',
  operation: 'case_description_normalization',
  status: 'completed',
  userId: 'user-123',
  normalizedSummary: '本件為承租人因出租人未履行修繕義務而主張租金減免之民事糾紛',
  totalTerms: 8,
  termCount_parties: 2,
  termCount_technical: 3,
  termCount_legalAction: 2,
  termCount_statute: 1,
  partiesTermsJson: '["承租人","出租人"]',
  technicalTermsJson: '["漏水","天花板","押金"]',
  legalActionTermsJson: '["修繕義務","租金減免"]',
  statuteTermsJson: '["民法第429條"]',
  duration: 1500
}
```

#### **案情被拒絕：**
```
🚫 案情被拒絕: 您的輸入似乎是關於美食推薦，而非法律案由
```

**Metadata：**
```javascript
{
  event: 'case_description_normalization',
  operation: 'case_description_normalization',
  status: 'rejected',
  userId: 'user-123',
  descriptionLength: 50,
  rejectionReason: '您的輸入似乎是關於美食推薦，而非法律案由',
  duration: 800
}
```

#### **快取命中：**
```
⚡ 案由搜尋快取命中: 25筆
```

#### **案由搜尋開始：**
```
🔍 案由搜尋: 民事 | plaintiff
```

#### **案由搜尋完成：**
```
✅ 案由搜尋完成: 25筆 (檢索, 7500ms)
```

或

```
✅ 案由搜尋完成: 25筆 (快取, 2500ms)
```

**Metadata：**
```javascript
{
  event: 'judgment_search',
  operation: 'case_description_search',
  status: 'completed',
  userId: 'user-123',
  descriptionLength: 150,
  lawDomain: '民事',
  partySide: 'plaintiff',
  resultCount: 25,
  cached: false,
  duration: 7500,
  page: 1,
  pageSize: 10
}
```

---

## 🔍 Logz.io 查詢範例

### **查詢特定用戶的所有操作**

```
event:judgment_search AND userId:"user-123"
```

### **查詢所有搜尋（不分類型）**

```
event:judgment_search
```

### **查詢特定類型的搜尋**

```
event:judgment_search AND operation:judgment_keyword_search
event:judgment_search AND operation:judgment_semantic_search
event:judgment_search AND operation:case_description_search
```

### **查詢特定狀態**

```
# 所有開始的搜尋
event:judgment_search AND status:started

# 所有完成的搜尋
event:judgment_search AND status:completed

# 所有失敗的搜尋
event:judgment_search AND status:failed

# 所有慢查詢
status:slow_query

# 所有快取命中
status:cache_hit
```

### **查詢特定關鍵字**

```
event:judgment_search AND keyword:"契約糾紛"
```

### **查詢特定法院**

```
event:judgment_search AND filter_court:"台北地方法院"
```

### **查詢無結果的搜尋**

```
event:judgment_search AND resultCount:0
```

### **查詢慢查詢**

```
event:judgment_search AND duration:>3000
```

### **查詢 GPT 優化**

```
event:semantic_query_enhancement
```

### **查詢被拒絕的案由**

```
event:case_description_normalization AND status:rejected
```

---

## 📊 Logz.io 列表頁面效果

**Before（無信息量）：**
```
11:25:32  [info]  開始執行判決書關鍵字搜尋
11:25:33  [info]  判決書關鍵字搜尋完成
11:25:35  [info]  開始執行判決書語意搜尋
11:25:40  [info]  判決書語意搜尋完成
```

**After（豐富信息 + Emoji）：**
```
11:25:32  [info]  🔍 判決搜尋: "契約糾紛" | 民事 | 台北地方法院
11:25:33  [info]  ✅ 判決搜尋完成: 42筆 (292ms)
11:25:35  [info]  🤖 GPT 優化查詢: "房東不修漏水，我可以不付租金嗎？"
11:25:36  [info]  ✨ GPT 優化完成: 3個關鍵字
11:25:37  [info]  🎯 語意搜尋: "房東不修漏水，我可以不付租金嗎？"
11:25:42  [info]  ✅ 語意搜尋完成: 15筆, 3個爭點 (4500ms)
11:25:45  [info]  📝 正規化案情: "我是房客，房東一直不修漏水..."
11:25:47  [info]  ✅ 正規化完成: 8個關鍵詞
11:25:48  [info]  ⚡ 案由搜尋快取命中: 25筆
11:25:50  [info]  ✅ 案由搜尋完成: 25筆 (快取, 2500ms)
```

✅ **一眼掃過就知道發生了什麼！**

---

## 🎨 Emoji 使用規範

| Emoji | 用途 | 範例 |
|-------|------|------|
| 🔍 | 搜尋開始 | `🔍 判決搜尋: "契約糾紛"` |
| ✅ | 操作成功 | `✅ 判決搜尋完成: 42筆` |
| ❌ | 操作失敗 | `❌ 判決搜尋失敗: Connection timeout` |
| ⚠️ | 警告/慢查詢 | `⚠️ 判決搜尋較慢: 3500ms` |
| 🤖 | GPT 處理 | `🤖 GPT 優化查詢: "..."` |
| ✨ | GPT 完成 | `✨ GPT 優化完成: 3個關鍵字` |
| 🎯 | 語意搜尋 | `🎯 語意搜尋: "..."` |
| 📝 | 正規化處理 | `📝 正規化案情: "..."` |
| 🚫 | 被拒絕 | `🚫 案情被拒絕: 非法律案由` |
| ⚡ | 快取命中 | `⚡ 案由搜尋快取命中: 25筆` |

---

## 🎯 優勢總結

### **1. 可讀性 ✨**
- Message 有信息量，一眼就懂
- Emoji 視覺化，快速識別事件類型
- 列表頁面不需要展開就能看到關鍵信息

### **2. 可查詢性 🔍**
- 所有關鍵欄位都在頂層
- 支援精確查詢（`keyword:"契約糾紛"`）
- 支援範圍查詢（`duration:>3000`）
- 支援狀態追蹤（`status:slow_query`）

### **3. 統計分析 📊**
- 熱門搜尋關鍵字
- 用戶活躍度
- 搜尋成功率
- 平均響應時間
- 快取命中率

### **4. 階段追蹤 🔄**
- 追蹤完整流程（started → completed/failed）
- 識別異常中斷（started 但沒 completed）
- 分析慢查詢比例
- 評估快取效率

---

**文檔版本**: 1.0  
**最後更新**: 2025-11-05  
**作者**: LawSowl 開發團隊

