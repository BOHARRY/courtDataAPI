# 🚀 Logz.io 部署檢查清單

## ✅ 部署前檢查

### 1. 環境變數確認

- [x] **LOGZIO_TOKEN** 已在 Render.com 設置
- [ ] **NODE_ENV** 設置為 `production`
- [ ] **LOG_LEVEL** 設置為 `info`（可選，預設值）

### 2. 代碼檢查

- [x] `utils/logger.js` 已創建
- [x] `config/express.js` 已更新
- [x] `middleware/auth.js` 已更新
- [x] `middleware/credit.js` 已更新
- [x] 所有文件無語法錯誤

### 3. 依賴安裝

```bash
npm install winston winston-logzio --save
```

- [x] 依賴已安裝
- [ ] `package.json` 已更新（自動）
- [ ] `package-lock.json` 已更新（自動）

---

## 🔄 部署步驟

### Step 1: 提交代碼

```bash
git add .
git commit -m "feat: integrate Logz.io logging system

- Add unified logger utility (utils/logger.js)
- Update express.js with structured logging
- Update auth middleware with security logging
- Update credit middleware with business logging
- Add test script and documentation"

git push origin main
```

### Step 2: 等待 Render.com 自動部署

1. 訪問 Render.com Dashboard
2. 查看部署狀態
3. 等待部署完成（約 2-5 分鐘）

### Step 3: 驗證部署

#### 3.1 檢查應用啟動日誌

在 Render.com 日誌中應該看到：

```
📋 Logger Configuration:
  - Environment: production
  - Log Level: info
  - Logz.io: ✅ Enabled
  - Transports: 2 (Console, winston_logzio)
✅ Logz.io transport initialized successfully
```

#### 3.2 觸發測試請求

```bash
# 測試 1: 健康檢查
curl https://your-api.onrender.com/health

# 測試 2: 認證失敗（應該記錄安全事件）
curl -X GET https://your-api.onrender.com/api/judgments \
  -H "Authorization: Bearer invalid-token"

# 測試 3: 正常請求（需要有效 token）
curl -X GET https://your-api.onrender.com/api/judgments \
  -H "Authorization: Bearer YOUR_VALID_TOKEN"
```

#### 3.3 檢查 Logz.io Dashboard

1. 登入 https://app.logz.io
2. 進入 "Logs" 頁面
3. 搜尋：`service:courtDataAPI`
4. 確認日誌出現（可能需要等待 1-2 分鐘）

---

## 🔍 驗證項目

### 基本功能

- [ ] 應用正常啟動
- [ ] Console 日誌正常輸出
- [ ] Logz.io 日誌正常發送
- [ ] 無錯誤訊息

### 日誌內容

- [ ] HTTP 請求日誌包含 method, url, ip
- [ ] 錯誤日誌包含 stack trace
- [ ] 安全日誌包含 userId, ip
- [ ] 業務日誌包含 purpose, amount

### Logz.io Dashboard

- [ ] 可以搜尋到日誌
- [ ] 日誌格式正確（JSON）
- [ ] 包含所有必要欄位
- [ ] 時間戳正確

---

## 🐛 常見問題排查

### 問題 1: Logz.io transport 初始化失敗

**症狀**：
```
❌ Failed to initialize Logz.io transport: ...
```

**解決方案**：
1. 檢查 `LOGZIO_TOKEN` 是否正確設置
2. 檢查網路連接
3. 查看完整錯誤訊息

### 問題 2: 日誌沒有出現在 Logz.io

**症狀**：
- Console 有日誌
- Logz.io Dashboard 沒有日誌

**解決方案**：
1. 等待 1-2 分鐘（日誌有延遲）
2. 檢查時間範圍設置
3. 確認搜尋條件正確
4. 檢查 Logz.io token 是否有效

### 問題 3: 應用啟動失敗

**症狀**：
```
Error: Cannot find module 'winston'
```

**解決方案**：
```bash
npm install winston winston-logzio --save
git add package.json package-lock.json
git commit -m "chore: add winston dependencies"
git push
```

---

## 📊 成功指標

部署成功後，你應該能夠：

✅ **在 Render.com 看到**：
- Logger 初始化成功訊息
- 結構化的日誌輸出
- 無錯誤訊息

✅ **在 Logz.io 看到**：
- 所有 API 請求日誌
- 錯誤和警告日誌
- 業務事件日誌
- 安全事件日誌

✅ **功能正常**：
- API 正常響應
- 認證正常工作
- 積分扣除正常
- 無性能下降

---

## 🎯 下一步行動

部署成功後：

### 立即執行

1. [ ] 設置 Kibana Dashboard
2. [ ] 配置基礎告警規則
3. [ ] 通知團隊新的日誌系統

### 本週內

4. [ ] 遷移更多模組到新 Logger
5. [ ] 建立日誌查詢文檔
6. [ ] 培訓團隊使用 Kibana

### 本月內

7. [ ] 優化日誌級別和內容
8. [ ] 建立自動化告警
9. [ ] 分析日誌數據，優化系統

---

## 📞 需要幫助？

如果遇到問題：

1. **查看文檔**：`docs/LOGZIO_INTEGRATION.md`
2. **檢查日誌**：Render.com Dashboard
3. **聯繫支援**：開發團隊

---

**部署日期**：_____________
**部署人員**：_____________
**驗證人員**：_____________
**狀態**：[ ] 成功 [ ] 失敗 [ ] 部分成功

---

## 📝 部署記錄

### 部署時間軸

- [ ] **T+0min**: 代碼提交
- [ ] **T+5min**: Render.com 部署完成
- [ ] **T+10min**: 應用啟動成功
- [ ] **T+15min**: Logz.io 日誌出現
- [ ] **T+30min**: 驗證完成

### 遇到的問題

_記錄部署過程中遇到的任何問題和解決方案_

---

### 備註

_其他需要記錄的信息_

---

**檢查清單版本**：1.0
**最後更新**：2025-01-04

