# 🦉 LawSowl 後端 Logz.io 日誌系統整合指南

## 📋 目錄

- [概述](#概述)
- [環境配置](#環境配置)
- [使用方式](#使用方式)
- [日誌級別](#日誌級別)
- [最佳實踐](#最佳實踐)
- [測試驗證](#測試驗證)
- [Kibana Dashboard](#kibana-dashboard)
- [故障排除](#故障排除)

---

## 概述

我們已經成功整合 **Logz.io** 作為統一的日誌管理平台。所有日誌會：

- **開發環境**：輸出到 Console
- **生產環境**：同時輸出到 Console 和 Logz.io

### 已遷移的模組

✅ **核心中間件**：
- `config/express.js` - 全局錯誤處理、HTTP 請求日誌、CORS 錯誤
- `middleware/auth.js` - 認證失敗、Token 驗證、管理員權限檢查
- `middleware/credit.js` - 積分扣除、餘額不足、恢復模式

### 技術架構

```
應用程式
    ↓
utils/logger.js (統一日誌工具)
    ↓
    ├─→ Console Transport (所有環境)
    └─→ Logz.io Transport (僅生產環境)
    ↓
Logz.io Cloud
    ↓
Kibana Dashboard
```

---

## 環境配置

### 必要的環境變數

在 Render.com 的環境變數中已設置：

```bash
# Logz.io 配置
LOGZIO_TOKEN=your-logzio-token  # ✅ 已設置

# 可選配置（使用預設值）
LOGZIO_HOST=listener.logz.io    # 預設值
LOGZIO_TYPE=courtDataAPI        # 預設值
LOG_LEVEL=info                  # 預設值（生產環境）
```

### 本地開發配置

在本地 `.env` 文件中（可選）：

```bash
NODE_ENV=development
LOG_LEVEL=debug
# LOGZIO_TOKEN=  # 本地開發不需要
```

---

## 使用方式

### 基本用法

```javascript
import logger from '../utils/logger.js';

// Info 級別
logger.info('User logged in', {
  userId: '123',
  email: 'user@example.com'
});

// Warning 級別
logger.warn('High memory usage detected', {
  usage: '85%',
  threshold: '80%'
});

// Error 級別
logger.error('Database connection failed', {
  error: err.message,
  stack: err.stack
});

// 或直接傳入 Error 物件
logger.error('Database connection failed', err);
```

### 專用日誌方法

#### 1. HTTP 請求日誌

```javascript
logger.http('Incoming request', {
  method: req.method,
  url: req.originalUrl,
  ip: req.ip,
  userAgent: req.get('user-agent')
});
```

#### 2. 業務事件日誌

```javascript
logger.business('Credits deducted successfully', {
  userId: 'user-123',
  purpose: 'SEARCH_JUDGEMENT',
  deducted: 5,
  remaining: 95
});
```

#### 3. 安全事件日誌

```javascript
logger.security('Suspicious login attempt', {
  userId: 'user-456',
  ip: '192.168.1.100',
  reason: 'multiple_failed_attempts'
});
```

#### 4. 性能日誌

```javascript
logger.performance('API response time', {
  endpoint: '/api/search',
  duration: 1234,
  statusCode: 200
});
```

---

## 日誌級別

### 級別說明

| 級別 | 用途 | 生產環境 | 開發環境 |
|------|------|----------|----------|
| `debug` | 調試信息 | ❌ 不記錄 | ✅ 記錄 |
| `info` | 一般信息 | ✅ 記錄 | ✅ 記錄 |
| `warn` | 警告信息 | ✅ 記錄 | ✅ 記錄 |
| `error` | 錯誤信息 | ✅ 記錄 | ✅ 記錄 |

### 使用建議

- **Debug**：僅用於開發調試，不會發送到 Logz.io
- **Info**：記錄正常的業務流程
- **Warn**：記錄需要注意但不影響功能的問題
- **Error**：記錄所有錯誤和異常

---

## 最佳實踐

### ✅ 好的做法

```javascript
// 1. 結構化日誌
logger.info('User performed search', {
  userId: 'user-123',
  query: 'contract dispute',
  resultCount: 42,
  duration: 234
});

// 2. 包含上下文信息
logger.error('Payment processing failed', {
  userId: req.user?.uid,
  orderId: order.id,
  amount: order.amount,
  error: err.message,
  stack: err.stack
});

// 3. 使用專用方法
logger.business('Subscription upgraded', {
  userId: 'user-123',
  fromPlan: 'free',
  toPlan: 'pro'
});
```

### ❌ 避免的做法

```javascript
// 1. 不要使用純文本日誌
logger.info(`User ${userId} searched for ${query}`);  // ❌

// 2. 不要記錄敏感信息
logger.info('User login', {
  password: 'secret123',  // ❌ 絕對不要記錄密碼
  creditCard: '1234-5678-9012-3456'  // ❌
});

// 3. 不要在循環中記錄
cases.forEach(c => {
  logger.debug('Processing case', c);  // ❌ 會產生大量日誌
});

// 應該改為：
logger.info('Processed cases', { count: cases.length });  // ✅
```

### 敏感信息處理

```javascript
// 脫敏處理
logger.info('User login', {
  userId: user.id,
  email: user.email.replace(/(.{3}).*(@.*)/, '$1***$2'),  // u***@example.com
  ip: req.ip
});
```

---

## 測試驗證

### 本地測試

```bash
# 運行測試腳本
node test-logger.js
```

測試腳本會：
1. 測試所有日誌級別
2. 測試專用日誌方法
3. 驗證錯誤處理

### 生產環境驗證

1. **部署到 Render.com**
2. **觸發一些 API 請求**
3. **登入 Logz.io Dashboard**：https://app.logz.io
4. **查看日誌**：
   - 進入 "Logs" 頁面
   - 搜尋 `service:courtDataAPI`
   - 確認日誌正常顯示

---

## Kibana Dashboard

### 常用查詢

#### 1. 查看所有錯誤

```
level:error AND service:courtDataAPI
```

#### 2. 查看特定用戶的日誌

```
userId:"user-123" AND service:courtDataAPI
```

#### 3. 查看積分相關日誌

```
type:business_event AND purpose:SEARCH_JUDGEMENT
```

#### 4. 查看安全事件

```
type:security_event AND service:courtDataAPI
```

#### 5. 查看慢請求（>2秒）

```
type:performance AND duration:>2000
```

### 建議的 Dashboard

1. **錯誤監控**
   - 錯誤數量趨勢
   - 錯誤類型分布
   - Top 10 錯誤訊息

2. **業務指標**
   - 積分消耗趨勢
   - 用戶活躍度
   - 功能使用率

3. **性能監控**
   - API 響應時間
   - 慢請求列表
   - 請求量趨勢

4. **安全監控**
   - 認證失敗次數
   - 異常 IP 訪問
   - 權限違規嘗試

---

## 故障排除

### 問題 1: 日誌沒有出現在 Logz.io

**可能原因**：
- `LOGZIO_TOKEN` 未設置或錯誤
- 網路連接問題
- Logz.io 服務異常

**解決方案**：
1. 檢查環境變數：
   ```bash
   echo $LOGZIO_TOKEN
   ```
2. 查看 Console 輸出，確認是否有錯誤訊息
3. 檢查 Render.com 日誌

### 問題 2: 日誌量過大

**解決方案**：
1. 調整日誌級別：
   ```bash
   LOG_LEVEL=warn  # 只記錄 warn 和 error
   ```
2. 移除不必要的 debug 日誌
3. 使用採樣（未來可實現）

### 問題 3: 找不到特定日誌

**解決方案**：
1. 確認時間範圍正確
2. 檢查查詢語法
3. 確認日誌已包含必要的欄位

---

## 下一步計劃

### 短期（1-2 週）

- [ ] 遷移所有 Service 層的日誌
- [ ] 設置 Kibana Dashboard
- [ ] 配置告警規則

### 中期（1 個月）

- [ ] 整合 APM（Application Performance Monitoring）
- [ ] 建立日誌分析報表
- [ ] 優化日誌存儲策略

### 長期（3 個月）

- [ ] 機器學習異常檢測
- [ ] 自動化告警和響應
- [ ] 日誌驅動的業務分析

---

## 相關資源

- **Logz.io 官方文檔**：https://docs.logz.io
- **Winston 文檔**：https://github.com/winstonjs/winston
- **Logz.io Dashboard**：https://app.logz.io
- **內部文檔**：`docs/ARCHITECTURE_ANALYSIS.md`

---

## 聯絡支援

如有問題，請聯繫：
- **技術支援**：開發團隊
- **Logz.io 支援**：support@logz.io

---

**最後更新**：2025-01-04
**版本**：1.0
**作者**：LawSowl 開發團隊

