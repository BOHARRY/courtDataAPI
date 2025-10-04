# 🚀 Smart Field Selection 部署檢查清單

## ✅ 已完成的修改

### 1. MCP Server (lawsowl_mcp.py) ✅
- [x] 添加欄位映射配置 (FIELD_LAYERS, ANALYSIS_TO_FIELDS)
- [x] 添加 `get_fields_for_analysis()` 函數
- [x] 修改 `SearchParams` 添加 `intended_analysis` 參數
- [x] 修改 `SemanticSearchParams` 添加 `intended_analysis` 參數
- [x] 修改 `search_judgments` 工具使用智能欄位選擇
- [x] 修改 `semantic_search_judgments` 工具使用智能欄位選擇
- [x] 動態構建判決書物件 (只包含實際返回的欄位)

### 2. 後端工具定義 (ai-agent-tools.js) ✅
- [x] 添加 `intended_analysis` 參數到 `search_judgments` 工具定義
- [x] 添加 `intended_analysis` 參數到 `semantic_search_judgments` 工具定義
- [x] 更新 System Prompt 添加智能欄位選擇指導
- [x] 更新範例展示如何使用 `intended_analysis` 參數

### 3. 測試 ✅
- [x] 創建測試腳本 (test_smart_fields.py)
- [x] 驗證欄位層級定義
- [x] 驗證分析類型映射
- [x] 驗證 `get_fields_for_analysis()` 函數
- [x] 估算 Token 節省效果
- [x] 所有測試通過 (10/10)

---

## 📋 部署前檢查

### 1. 代碼檢查
- [ ] 檢查 `lawsowl_mcp.py` 沒有語法錯誤
- [ ] 檢查 `ai-agent-tools.js` 沒有語法錯誤
- [ ] 確認所有修改都已提交到 Git

### 2. 環境變數檢查
- [ ] 確認 `.env` 文件包含所有必要的環境變數
  - [ ] `ES_URL`
  - [ ] `ES_API_KEY`
  - [ ] `ES_INDEX`
  - [ ] `OPENAI_API_KEY`

### 3. 依賴檢查
- [ ] 確認 MCP Server 的依賴已安裝 (`pip install -r requirements.txt`)
- [ ] 確認後端的依賴已安裝 (`npm install`)

---

## 🚀 部署步驟

### 步驟 1: 部署 MCP Server 到 Render.com

1. **推送代碼到 GitHub**
   ```bash
   cd d:\esmcp
   git add .
   git commit -m "feat: 實施智能欄位選擇 (Smart Field Selection)"
   git push origin main
   ```

2. **觸發 Render.com 自動部署**
   - Render.com 會自動檢測到 GitHub 更新
   - 等待部署完成 (約 2-3 分鐘)
   - 檢查部署日誌確認沒有錯誤

3. **驗證 MCP Server 健康狀態**
   ```bash
   curl https://your-mcp-server.onrender.com/ping
   ```
   預期返回:
   ```json
   {
     "status": "healthy",
     "service": "LawSowl MCP Server",
     "timestamp": "2025-10-04T..."
   }
   ```

### 步驟 2: 部署後端到 Vercel

1. **推送代碼到 GitHub**
   ```bash
   cd d:\court_data\courtDataAPI
   git add .
   git commit -m "feat: 添加智能欄位選擇參數到工具定義"
   git push origin main
   ```

2. **觸發 Vercel 自動部署**
   - Vercel 會自動檢測到 GitHub 更新
   - 等待部署完成 (約 1-2 分鐘)
   - 檢查部署日誌確認沒有錯誤

3. **驗證後端健康狀態**
   ```bash
   curl https://your-backend.vercel.app/api/ai-agent/health
   ```

### 步驟 3: 端到端測試

1. **測試場景 1: 列表查詢 (預期節省 75% Token)**
   - 問題: "列出王婉如法官的判決書"
   - 預期: GPT 使用 `intended_analysis="list"`
   - 驗證: 返回的判決書只包含基本欄位 (JID, JDATE, JTITLE, judges, verdict_type, court)

2. **測試場景 2: 勝訴率分析 (預期節省 75% Token)**
   - 問題: "王婉如法官在返還不當得利中的勝訴率?"
   - 預期: GPT 使用 `intended_analysis="verdict_rate"`
   - 驗證: 返回的判決書只包含基本欄位

3. **測試場景 3: 金額分析 (預期節省 70% Token)**
   - 問題: "金額最大的案件是哪一個?"
   - 預期: GPT 使用 `intended_analysis="amount_analysis"`
   - 驗證: 返回的判決書包含金額欄位 (claim_amount, granted_amount)

4. **測試場景 4: 向後兼容性**
   - 問題: "王婉如法官的判決傾向?"
   - 預期: GPT 可能不指定 `intended_analysis`，系統預設返回 summary 層
   - 驗證: 功能正常運作，沒有錯誤

---

## 📊 監控指標

### 1. Token 消耗監控
- [ ] 記錄部署前的平均 Token 消耗
- [ ] 記錄部署後的平均 Token 消耗
- [ ] 計算實際節省百分比
- [ ] 目標: **節省 55-70% Token**

### 2. 成本監控
- [ ] 記錄部署前的每日 OpenAI API 成本
- [ ] 記錄部署後的每日 OpenAI API 成本
- [ ] 計算實際成本節省
- [ ] 目標: **節省 65-75% 成本**

### 3. 準確率監控
- [ ] 記錄部署前的數值計算準確率
- [ ] 記錄部署後的數值計算準確率
- [ ] 目標: **維持或提升準確率**

### 4. 用戶體驗監控
- [ ] 記錄部署前的平均響應時間
- [ ] 記錄部署後的平均響應時間
- [ ] 目標: **響應時間不增加**

---

## 🐛 回滾計畫

如果部署後發現問題，可以快速回滾：

### MCP Server 回滾
```bash
cd d:\esmcp
git revert HEAD
git push origin main
```

### 後端回滾
```bash
cd d:\court_data\courtDataAPI
git revert HEAD
git push origin main
```

---

## 📝 部署後任務

### 1. 文檔更新
- [ ] 更新 API 文檔說明新的 `intended_analysis` 參數
- [ ] 更新用戶指南說明新功能
- [ ] 更新開發者文檔

### 2. 團隊通知
- [ ] 通知團隊成員新功能已上線
- [ ] 分享 Token 節省效果報告
- [ ] 收集團隊反饋

### 3. 持續優化
- [ ] 根據實際使用情況調整欄位映射
- [ ] 考慮實施優化建議 1 (Router + Intent Classifier 融合)
- [ ] 考慮實施優化建議 2 (數據驗證層)

---

## ✅ 部署完成確認

- [ ] MCP Server 部署成功
- [ ] 後端部署成功
- [ ] 所有測試場景通過
- [ ] Token 消耗監控已設置
- [ ] 成本監控已設置
- [ ] 團隊已通知
- [ ] 文檔已更新

---

## 📞 聯絡資訊

如有問題，請聯絡：
- 開發團隊: [your-email@example.com]
- 緊急聯絡: [emergency-contact]

---

**部署日期**: _______________
**部署人員**: _______________
**驗證人員**: _______________

