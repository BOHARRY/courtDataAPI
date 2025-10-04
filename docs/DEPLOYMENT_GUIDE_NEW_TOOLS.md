# 新工具部署指南

## 📋 **部署檢查清單**

### **✅ 已完成的修改**

#### **Backend (courtDataAPI)**
- [x] `utils/ai-agent-tools.js` - 添加工具定義
- [x] `utils/ai-agent-local-functions.js` - 實現 `analyze_citations`
- [x] `controllers/ai-agent-controller.js` - 註冊 MCP 工具和本地函數

#### **MCP Server (esmcp)**
- [x] `lawsowl_mcp.py` - 實現兩個新的 MCP 工具

---

## 🚀 **部署步驟**

### **Step 1: 部署 MCP Server (Render.com)**

#### **1.1 推送代碼到 GitHub**
```bash
cd d:\esmcp
git add lawsowl_mcp.py
git commit -m "feat: 添加法律爭點分析和相似爭點查詢工具"
git push origin main
```

#### **1.2 Render.com 自動部署**
- Render.com 會自動檢測到新的 commit
- 等待部署完成（約 2-3 分鐘）
- 檢查部署日誌，確保沒有錯誤

#### **1.3 驗證 MCP Server**
```bash
# 測試健康檢查
curl https://esmcp.onrender.com/health

# 預期返回
{
  "status": "healthy",
  "service": "LawSowl MCP Server",
  "timestamp": "2025-10-04T..."
}
```

---

### **Step 2: 部署 Backend (Vercel)**

#### **2.1 推送代碼到 GitHub**
```bash
cd d:\court_data\courtDataAPI
git add .
git commit -m "feat: 添加法律爭點分析和引用分析工具"
git push origin main
```

#### **2.2 Vercel 自動部署**
- Vercel 會自動檢測到新的 commit
- 等待部署完成（約 1-2 分鐘）
- 檢查部署日誌，確保沒有錯誤

#### **2.3 驗證 Backend**
```bash
# 測試健康檢查
curl https://your-backend.vercel.app/api/health

# 預期返回
{
  "status": "ok",
  "timestamp": "2025-10-04T..."
}
```

---

### **Step 3: 端到端測試**

#### **3.1 測試 `analyze_legal_issues`**

**測試查詢**：
```
王婉如法官在契約成立爭點上的裁決傾向如何？
```

**預期流程**：
1. Intent Classifier 識別為 `legal_analysis`, `question_type="判決傾向"`
2. GPT 調用 `analyze_legal_issues` (MCP Tool)
3. MCP Server 查詢 Elasticsearch
4. 返回爭點統計和詳細列表
5. GPT 生成回答

**預期回答**：
```
根據 2025年6-7月 的數據，王婉如法官在契約成立爭點上：

**爭點統計**：
- 出現次數：5 筆
- 有利原告：60% (3 筆)
- 有利被告：20% (1 筆)
- 中立：20% (1 筆)

**判決傾向**：
法官在契約成立爭點上，傾向於支持原告，特別是當原告能提供：
1. 完整的合約文件
2. 金流證明（匯款單、銀行對帳單）
3. 雙方通訊記錄

**參考案件**：
- PCDV,114,訴,1434,20250714,1 (原告勝訴)
  - 原告立場：主張契約已成立且已履行
  - 法院裁決：認定契約成立，原告主張有據
```

---

#### **3.2 測試 `find_similar_issues`**

**測試查詢**：
```
找出與「原告主張被告違約，但被告抗辯契約未成立」相似的案例
```

**預期流程**：
1. Intent Classifier 識別為 `legal_analysis`, `question_type="列表"`
2. GPT 調用 `find_similar_issues` (MCP Tool)
3. MCP Server 使用 OpenAI Embedding 向量化查詢
4. 執行 kNN 語意搜尋
5. 返回相似案例
6. GPT 生成回答

**預期回答**：
```
找到 3 筆相似案例：

**最相似案例** (相似度: 87.65%)：
- 案號：PCDV,114,訴,1434,20250714,1
- 判決結果：原告勝訴
- 爭點：契約成立與履行
- 法院裁決：認定契約成立，原告主張有據

**關鍵理由**：
「原告依投資合約請求返還125萬元本金及利息有據...」

**可引用段落**：
[P1] 按解散之公司除因合併、分割或破產而解散外,應行清算...
```

---

#### **3.3 測試 `analyze_citations`**

**測試查詢**：
```
王婉如法官在返還不當得利案件中，最常引用哪些判例？
```

**預期流程**：
1. Intent Classifier 識別為 `legal_analysis`, `question_type="法條"`
2. GPT 先調用 `search_judgments` 獲取判決書
3. GPT 調用 `analyze_citations` (Local Function)
4. Local Function 分析引用判例
5. GPT 生成回答

**預期回答**：
```
根據 2025年6-7月 的數據，王婉如法官在返還不當得利案件中：

**引用統計**：
- 總案件數：5 筆
- 有引用判例：5 筆 (100%)
- 平均每案引用：2.6 個判例

**最常引用判例**：
1. 最高法院96年度台上字第1063號判決 (60%)
   - 關於新債清償的認定

2. 最高法院85年度台上字第2388號判決 (40%)
   - 關於債務承擔與新債清償的區別

3. 民法第179條 (40%)
   - 不當得利的法律依據
```

---

## 🐛 **常見問題排查**

### **問題 1: MCP Server 返回 500 錯誤**

**可能原因**：
- Elasticsearch 連接失敗
- 查詢語法錯誤
- 欄位不存在

**排查步驟**：
1. 檢查 Render.com 部署日誌
2. 檢查 Elasticsearch 連接狀態
3. 驗證查詢語法

---

### **問題 2: Backend 返回「未知的本地函數」**

**可能原因**：
- 工具未正確註冊到 MCP 工具列表
- 函數名稱拼寫錯誤

**排查步驟**：
1. 檢查 `ai-agent-controller.js` 中的 `mcpTools` 列表
2. 確認工具名稱與定義一致

---

### **問題 3: GPT 不調用新工具**

**可能原因**：
- System Prompt 沒有提到新工具
- 工具描述不夠清晰
- 用戶查詢與工具功能不匹配

**排查步驟**：
1. 檢查 `ai-agent-tools.js` 中的工具描述
2. 更新 System Prompt，添加新工具的使用說明
3. 測試不同的查詢方式

---

## 📊 **部署後驗證**

### **驗證清單**

- [ ] MCP Server 健康檢查通過
- [ ] Backend 健康檢查通過
- [ ] `analyze_legal_issues` 工具正常工作
- [ ] `find_similar_issues` 工具正常工作
- [ ] `analyze_citations` 工具正常工作
- [ ] 所有測試查詢都返回正確結果
- [ ] 沒有錯誤日誌

---

## 🎯 **成功標準**

1. **功能性**
   - 所有新工具都能正常調用
   - 返回的數據格式正確
   - 數據內容準確

2. **性能**
   - 查詢響應時間 < 5 秒
   - 沒有超時錯誤

3. **用戶體驗**
   - GPT 能正確理解用戶意圖
   - 回答清晰、有條理
   - 提供可驗證的數據（案號、判決理由）

---

## 📝 **部署記錄**

### **部署時間**
- MCP Server: ___________
- Backend: ___________

### **部署版本**
- MCP Server: ___________
- Backend: ___________

### **測試結果**
- [ ] `analyze_legal_issues`: ✅ / ❌
- [ ] `find_similar_issues`: ✅ / ❌
- [ ] `analyze_citations`: ✅ / ❌

### **問題記錄**
- 問題 1: ___________
- 解決方案: ___________

---

**準備好部署了！** 🚀

