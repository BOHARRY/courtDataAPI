# 🎯 AI Agent Prompt 優化記錄

## 📋 問題描述

### 發現的問題

**用戶問題**: 「王婉如在返還不當得利中的勝訴率？」

**錯誤行為**:
```javascript
調用: search_judgments
參數: { query: '返還不當得利', judge_name: '王婉如', limit: 50 }
結果: 17 筆案件
```

**問題分析**:
1. ❌ 使用了 `search_judgments`（關鍵詞搜尋）
2. ❌ 搜尋到 17 筆案件，但這些案件的**案由不一定是「返還不當得利」**
3. ❌ `search_judgments` 會搜尋判決書**全文內容**，只要內容中提到「返還不當得利」就會被搜到
4. ❌ 實際上王婉如法官只有 19 筆案件，其中「返還不當得利」案由只佔 15.8% ≈ 3 筆

**數據驗證**:
```
王婉如法官總案件數: 19 筆
常見案件類型:
- 返還不當得利: 15.8% (約 3 筆) ✅
- 借貸糾紛: 10.5% (約 2 筆)
- 侵權行為: 5.3% (約 1 筆)

search_judgments 返回: 17 筆 ❌ (包含所有提到「返還不當得利」的案件)
semantic_search 返回: 3 筆 ✅ (只包含案由為「返還不當得利」的案件)
```

---

## ✅ 正確行為（judge-mcp-demo）

**用戶問題**: 「王婉如在返還不當得利中的勝訴率？」

**正確行為**:
```javascript
調用: semantic_search_judgments
參數: { 
  query: '返還不當得利', 
  judge_name: '王婉如', 
  limit: 50 
  // ⚠️ 注意: 沒有加 verdict_type 過濾!
}
結果: 3 筆案件（案由為「返還不當得利」的案件）
```

**為什麼正確**:
1. ✅ 使用 `semantic_search_judgments`（語意搜尋）
2. ✅ 語意搜尋會精確匹配**案由欄位**，而非全文搜尋
3. ✅ 沒有加 `verdict_type` 過濾，獲取所有判決結果
4. ✅ 然後用 `calculate_verdict_statistics` 計算勝訴率

---

## 🛠️ 解決方案

### 修改文件
`d:/court_data/courtDataAPI/utils/ai-agent-tools.js`

### 優化內容

#### 1. 新增工具選擇策略說明

**原本**:
```
1. 使用 search_judgments 當:
   - 用戶提供明確的標準案由名稱
```

**優化後**:
```
1. 使用 search_judgments (關鍵詞搜尋) 當:
   - 用戶提供明確的標準案由名稱
   - ⚠️ 注意: search_judgments 會搜尋判決書**全文內容**,
     可能返回案由不符但內容提到關鍵詞的案件

2. 使用 semantic_search_judgments (語意搜尋) 當:
   - 需要精確匹配**案由**而非全文搜尋
   - 用戶使用口語化描述
```

#### 2. 新增關鍵規則

**新增**:
```
**關鍵規則 - 計算勝訴率時**:
- ❌ 錯誤: 只搜尋勝訴案件,然後說勝訴率 100%
- ✅ 正確: 搜尋**所有**該案由的案件 (不加 verdict_type 過濾),
          然後用 calculate_verdict_statistics 計算勝訴率
- 範例: 用戶問"返還不當得利的勝訴率?" 
  → 調用 semantic_search_judgments(
      query="返還不當得利", 
      judge_name="王婉如", 
      limit=50
    ) **不要加 verdict_type**
```

#### 3. 新增案由匹配優先級

**新增**:
```
**案由匹配優先級**:
1. 優先使用 semantic_search_judgments - 會精確匹配案由欄位
2. search_judgments 會搜尋全文,可能返回不相關案件
3. 如果用戶問特定案由的統計,務必使用 semantic_search 確保案由正確
```

#### 4. 優化範例問題

**新增範例 1**（最重要）:
```
範例 1: "王婉如法官在返還不當得利中的勝訴率?" ⭐ 重要範例
步驟:
1. 調用 semantic_search_judgments (
     query="返還不當得利", 
     judge_name="王婉如", 
     limit=50
   ) - ⚠️ 不要加 verdict_type 過濾!
2. 調用 calculate_verdict_statistics (
     judgments=結果, 
     analysis_type="verdict_rate", 
     verdict_type="原告勝訴"
   )
3. 生成回答: "根據 2025年6-7月 的數據,
   王婉如法官在返還不當得利案件中,
   共審理 X 筆,原告勝訴率為 XX%..."
```

---

## 📊 預期效果

### 修改前
```
用戶: 王婉如在返還不當得利中的勝訴率？

AI 調用:
1. search_judgments(query="返還不當得利", judge_name="王婉如")
   → 返回 17 筆（包含所有提到「返還不當得利」的案件）

AI 回答:
"根據數據,王婉如法官在返還不當得利案件中,共審理 17 筆..." ❌
```

### 修改後
```
用戶: 王婉如在返還不當得利中的勝訴率？

AI 調用:
1. semantic_search_judgments(query="返還不當得利", judge_name="王婉如")
   → 返回 3 筆（只包含案由為「返還不當得利」的案件）
2. calculate_verdict_statistics(judgments=結果)
   → 計算勝訴率

AI 回答:
"根據數據,王婉如法官在返還不當得利案件中,共審理 3 筆,
 原告勝訴 2 筆,勝訴率為 66.7%..." ✅
```

---

## 🧪 測試計劃

### 測試案例 1: 返還不當得利勝訴率
```
問題: 王婉如在返還不當得利中的勝訴率？

預期:
- 調用 semantic_search_judgments (不加 verdict_type)
- 返回 3 筆案件
- 計算勝訴率
```

### 測試案例 2: 借貸糾紛勝訴率
```
問題: 王婉如在借貸糾紛中的勝訴率？

預期:
- 調用 semantic_search_judgments
- 返回約 2 筆案件 (10.5% of 19)
- 計算勝訴率
```

### 測試案例 3: 侵權案件勝訴率
```
問題: 王婉如在侵權案件中的勝訴率？

預期:
- 調用 semantic_search_judgments
- 返回約 1 筆案件 (5.3% of 19)
- 計算勝訴率
```

---

## 🔍 技術細節

### search_judgments vs semantic_search_judgments

| 特性 | search_judgments | semantic_search_judgments |
|------|------------------|---------------------------|
| 搜尋範圍 | 判決書全文 | 案由欄位（向量相似度） |
| 精確度 | 低（會返回不相關案件） | 高（精確匹配案由） |
| 適用場景 | 查找特定判決字號 | 查找特定案由的案件 |
| 同義詞處理 | 不支持 | 自動處理 |
| 範例 | 搜尋「返還不當得利」會找到所有提到這個詞的案件 | 搜尋「返還不當得利」只找案由為此的案件 |

### 為什麼 semantic_search 更適合

1. **精確匹配案由**: 使用向量相似度匹配案由欄位
2. **自動處理同義詞**: 「債務清償」和「清償債務」會被視為相同
3. **避免誤判**: 不會因為判決書內容提到關鍵詞就返回

---

## ✅ 檢查清單

### 修改完成
- [x] 優化工具選擇策略說明
- [x] 新增關鍵規則（計算勝訴率）
- [x] 新增案由匹配優先級
- [x] 優化範例問題（新增範例 1）
- [x] 強調 semantic_search 優先級

### 待測試
- [ ] 測試案例 1: 返還不當得利勝訴率
- [ ] 測試案例 2: 借貸糾紛勝訴率
- [ ] 測試案例 3: 侵權案件勝訴率
- [ ] 驗證返回案件數符合預期
- [ ] 驗證勝訴率計算正確

### 待部署
- [ ] 重啟後端服務
- [ ] 清除 AI Agent 對話歷史
- [ ] 重新測試問題
- [ ] 驗證修改生效

---

## 🚀 部署步驟

### 1. 重啟後端服務
```bash
cd d:\court_data\courtDataAPI
# Ctrl+C 停止服務
npm start
```

### 2. 測試修改
```bash
# 訪問前端
http://localhost:3001

# 搜索法官: 王婉如
# 提問: 王婉如在返還不當得利中的勝訴率？

# 查看 Console 日誌
# 預期看到:
# [AI Agent] 調用 MCP 工具: semantic_search_judgments
# [AI Agent] 返回 3 筆案件
```

### 3. 驗證結果
- ✅ 使用 semantic_search_judgments
- ✅ 沒有加 verdict_type 過濾
- ✅ 返回案件數符合預期（約 3 筆）
- ✅ 勝訴率計算正確

---

## 📚 相關文檔

- **AI Agent 工具定義**: `utils/ai-agent-tools.js`
- **AI Agent 控制器**: `controllers/ai-agent-controller.js`
- **MCP 工具文檔**: `docs/mcp/MCP_INTEGRATION_JOURNEY.md`

---

**修改完成時間**: 2025-10-03  
**修改人員**: AI Assistant  
**狀態**: ✅ 完成，待測試

