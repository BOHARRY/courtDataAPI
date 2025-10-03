# 語意搜尋功能部署指南

## 🚀 快速部署 (5 分鐘)

### 前置檢查

- [ ] 確認 OpenAI API Key 已設置
- [ ] 確認 Elasticsearch 向量索引正常
- [ ] 確認 Git 倉庫狀態正常

---

## 步驟 1: 部署 MCP Server (2 分鐘)

### 1.1 設置環境變數

登入 Render.com → 選擇 MCP Server → Environment

添加環境變數:
```
OPENAI_API_KEY=sk-proj-...
```

### 1.2 部署代碼

```bash
cd d:\esmcp

# 檢查修改
git status

# 提交更改
git add lawsowl_mcp.py requirements.txt test_semantic_search.py
git commit -m "feat: 添加語意搜尋功能

- 新增 call_openai_embedding() 函數
- 新增 semantic_search_judgments 工具
- 支持 3 種向量欄位選擇
- 添加測試腳本"

# 推送到遠端
git push origin main
```

### 1.3 驗證部署

1. 訪問 Render Dashboard
2. 等待部署完成 (約 1-2 分鐘)
3. 檢查日誌無錯誤

---

## 步驟 2: 部署 AI Agent (2 分鐘)

### 2.1 部署代碼

```bash
cd d:\court_data\courtDataAPI

# 檢查修改
git status

# 提交更改
git add utils/ai-agent-tools.js controllers/ai-agent-controller.js SEMANTIC_SEARCH_IMPLEMENTATION.md DEPLOY_SEMANTIC_SEARCH.md
git commit -m "feat: 整合語意搜尋到 AI Agent

- 添加 semantic_search_judgments 工具定義
- 更新系統提示詞 (工具選擇策略)
- 註冊新工具到 MCP 工具列表
- 添加實施文檔"

# 推送到遠端
git push origin main
```

### 2.2 驗證部署

1. 訪問 Render Dashboard
2. 等待部署完成 (約 1-2 分鐘)
3. 檢查日誌無錯誤

---

## 步驟 3: 部署前端 (1 分鐘)

### 3.1 部署代碼

```bash
cd d:\court_data\frontend-court-search-web\lawsowl

# 檢查修改
git status

# 提交更改
git add src/pages/AIAgentTestPage.js
git commit -m "feat: 添加語意搜尋測試案例

- 新增語意搜尋測試分類
- 添加 5 個測試問題
- 更新功能特點說明"

# 推送到遠端
git push origin main
```

### 3.2 驗證部署

1. Vercel 自動部署
2. 等待部署完成 (約 30 秒)
3. 訪問測試頁面

---

## 步驟 4: 端到端測試 (5 分鐘)

### 4.1 測試 MCP Server (本地)

```bash
cd d:\esmcp

# 運行測試腳本
python test_semantic_search.py
```

**預期輸出**:
```
🧪 測試語意搜尋功能
================================================================================

測試 1: 同義詞匹配 - '債務清償' vs '清償債務'
--------------------------------------------------------------------------------
查詢: 債務清償
搜尋方式: 語意搜尋 (向量相似度)
找到結果: X 筆

前 3 筆結果:
  1. 清償債務
     相似度分數: 0.96XX
  ...
```

### 4.2 測試 AI Agent (前端)

訪問: `https://frontend-court-search-web.vercel.app/ai-agent-test`

測試問題:
1. ✅ "如果我是律師,要在王婉如法官面前打『債務清償』案件,可能需要注意哪些傾向?"
2. ✅ "王婉如法官對欠錢不還的案件怎麼判?"
3. ✅ "房東趕房客的案件,這位法官傾向如何?"

**預期結果**:
- AI 自動選擇 `semantic_search_judgments` 工具
- 成功匹配同義詞案由
- 返回相關案件分析

### 4.3 檢查日誌

#### MCP Server 日誌
```
✅ 成功獲取向量 (維度: 1536)
✅ 語意搜尋完成,找到 X 筆結果
```

#### AI Agent 日誌
```
✅ 調用 MCP 工具: semantic_search_judgments
✅ 工具調用成功
✅ AI Agent 回答生成完成
```

---

## 🎯 驗收標準

### 功能驗收

- [ ] 同義詞查詢成功 ("債務清償" → "清償債務")
- [ ] 口語化查詢成功 ("欠錢不還" → 債務案件)
- [ ] 複雜語意查詢成功 ("房東趕房客" → "返還房屋")
- [ ] 相似度分數正常 (0-1 之間)
- [ ] 過濾條件生效 (judge_name, verdict_type)

### 性能驗收

- [ ] 響應時間 < 2 秒
- [ ] OpenAI API 調用成功率 > 99%
- [ ] kNN 搜尋成功率 100%

### 成本驗收

- [ ] 單次查詢成本 < $0.003
- [ ] 預估月成本 < $10

---

## 🔍 故障排除

### 問題 1: MCP Server 部署失敗

**檢查**:
```bash
# 查看 Render 日誌
# 常見錯誤: OPENAI_API_KEY 未設置
```

**解決**:
1. 確認環境變數已設置
2. 重新部署

### 問題 2: AI Agent 無法調用語意搜尋

**檢查**:
```javascript
// 確認工具已註冊
const mcpTools = [
    'search_judgments',
    'semantic_search_judgments',  // ← 確認存在
    ...
];
```

**解決**:
1. 檢查 `ai-agent-controller.js` 中的 mcpTools 列表
2. 重新部署

### 問題 3: 語意搜尋無結果

**檢查**:
```python
# 確認向量欄位存在
# 確認向量維度匹配 (1536)
```

**解決**:
1. 檢查 Elasticsearch mapping
2. 確認 `summary_ai_vector` 欄位已向量化

---

## 📊 監控設置

### Render.com 監控

1. 設置 Alert: 部署失敗通知
2. 設置 Alert: 錯誤率 > 5%
3. 設置 Alert: 響應時間 > 3s

### OpenAI 成本監控

1. 訪問 OpenAI Dashboard
2. 設置每日預算上限: $1
3. 設置郵件通知

---

## ✅ 部署完成檢查清單

- [ ] MCP Server 部署成功
- [ ] AI Agent 部署成功
- [ ] 前端部署成功
- [ ] 端到端測試通過
- [ ] 日誌無錯誤
- [ ] 性能符合預期
- [ ] 成本在預算內
- [ ] 監控已設置

---

## 🎉 部署成功!

恭喜!語意搜尋功能已成功部署到生產環境。

**下一步**:
1. 監控用戶使用情況
2. 收集反饋
3. 持續優化

**文檔**:
- 實施總結: `SEMANTIC_SEARCH_IMPLEMENTATION.md`
- 部署指南: `DEPLOY_SEMANTIC_SEARCH.md` (本文檔)

**支持**:
如有問題,請查看故障排除章節或聯繫開發團隊。

