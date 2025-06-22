# Elasticsearch Mapping 變更後端檢查清單

當 Elasticsearch 的索引 mapping（特別是欄位名稱、類型或分析器）發生變更時，必須同步更新後端程式碼以確保所有功能正常運作。以下是主要需要檢查和修改的檔案及項目：

### 1. 查詢建構器 (`utils/query-builder.js`)

這是**最優先且最重要**的檢查點，因為它直接決定了發送給 Elasticsearch 的查詢結構。

-   **[ ] 檢查 `buildSubQuery` 或類似的關鍵字查詢函式：**
    -   確認所有 `match`、`match_phrase`、`multi_match` 等查詢中的**欄位名稱**是否與新 mapping 一致。
    -   移除或替換所有舊的後綴（例如 `.cjk`, `.keyword`）。
    -   檢查權重 (`^`) 分配的欄位是否依然存在。

-   **[ ] 檢查 `buildEsQuery` 主函式中的篩選邏輯：**
    -   **`terms` 篩選**：檢查 `case_type`, `verdict_type`, `court.exact` 等欄位名稱是否正確。
    -   **`range` 篩選**：檢查日期 (`JDATE`)、金額 (`key_metrics.civil_metrics.claim_amount`)、分數 (`SCORE`) 等範圍查詢的欄位路徑是否正確。
    -   **`exists` 篩選**：確認 `exists: { field: '...' }` 中檢查的欄位依然存在。
    -   **`nested` 查詢**：如果使用了 `nested` 類型，確認 `path` 和內部查詢的欄位名是否正確。

### 2. 搜尋服務 (`services/search.js`)

這個檔案負責執行查詢並定義回傳的附加內容（如高亮和聚合）。

-   **[ ] 檢查 `highlight` 物件：**
    -   `fields`: 確認請求高亮的欄位名稱 (`JTITLE`, `JFULL`, `summary_ai` 等) 與新 mapping 完全一致，移除所有舊後綴。

-   **[ ] 檢查 `aggs` (聚合) 物件：**
    -   確認所有聚合（例如 `win_reasons`, `dynamic_case_types`）的 `field` 屬性都指向了新 mapping 中正確的（通常是 `keyword` 類型）欄位。

### 3. 回應格式化工具 (`utils/response-formatter.js`)

這個檔案是後端與前端之間的橋樑，負責將 ES 的原始回應整理成前端元件需要的格式。

-   **[ ] 檢查高亮欄位的解析：**
    -   確認程式碼是從 `hit.highlight` 物件中讀取**新的、不帶後綴的鍵**（例如 `hit.highlight['JTITLE']` 而不是 `hit.highlight['JTITLE.cjk']`）。

-   **[ ] 檢查原始資料的回退邏輯：**
    -   確保在 `highlight` 不存在時，能正確回退到 `hit._source` 中的對應欄位（例如 `source.JTITLE`）。

-   **[ ] 檢查聚合結果的傳遞：**
    -   確認 `esResult.aggregations` 物件被正確解析並傳遞給前端。

### 4. 前端資料接收端 (`src/contexts/SearchContext.js`)

雖然這是前端檔案，但它直接接收後端的 API 回應，也需要檢查。

-   **[ ] 檢查 API 回應的處理邏輯：**
    -   在 `_executeSearch` 或類似的 API 呼叫函式中，確認從後端 `response.json()` 接收到的資料結構是否被正確處理。
    -   最佳實踐是直接使用後端 `response-formatter.js` 格式化好的 `data.hits` 陣列，避免在前端重新組裝而遺漏欄位。

遵循以上清單，可以系統性地解決因 mapping 變更而引起的大部分後端問題。