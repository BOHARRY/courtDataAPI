# MCP Session 管理修復

## 🐛 問題描述

**症狀**:
- 第一次查詢成功 (如: "分析王婉如法官的判決傾向")
- 第二次查詢失敗 (如: "王婉如法官在債務清償案件的判決有什麼共通性?")
- 錯誤訊息: "Bad Request: No valid session ID provided"

**根本原因**:
MCP Session 在第一次使用後可能過期或失效,但代碼沒有檢測和重新初始化機制。

---

## ✅ 修復方案

### 1. Session 有效性檢查

添加 Session 過期檢測:
```javascript
let mcpSessionId = null;
let sessionInitTime = null;
const SESSION_TIMEOUT = 5 * 60 * 1000; // 5 分鐘過期

function isSessionValid() {
    if (!mcpSessionId || !sessionInitTime) {
        return false;
    }
    
    const now = Date.now();
    const elapsed = now - sessionInitTime;
    
    if (elapsed > SESSION_TIMEOUT) {
        console.log('[AI Agent] Session 已過期,需要重新初始化');
        mcpSessionId = null;
        sessionInitTime = null;
        return false;
    }
    
    return true;
}
```

### 2. 強制重新初始化

允許強制重新初始化 Session:
```javascript
async function initializeMCPSession(forceReinit = false) {
    // 如果強制重新初始化或 Session 無效,則重新初始化
    if (!forceReinit && isSessionValid()) {
        console.log('[AI Agent] 使用現有 Session:', mcpSessionId);
        return mcpSessionId;
    }
    
    // ... 初始化邏輯
    sessionInitTime = Date.now(); // 記錄初始化時間
}
```

### 3. 自動重試機制

當遇到 Session 錯誤時自動重試:
```javascript
async function callMCPTool(toolName, params, retryCount = 0) {
    const MAX_RETRIES = 2;
    
    try {
        // ... 調用邏輯
        
        if (!response.ok) {
            const errorText = await response.text();
            
            // 如果是 Session 相關錯誤且還有重試次數,重新初始化並重試
            if ((errorText.includes('session') || errorText.includes('Session')) 
                && retryCount < MAX_RETRIES) {
                console.log(`[AI Agent] Session 錯誤,重新初始化並重試 (${retryCount + 1}/${MAX_RETRIES})...`);
                await initializeMCPSession(true); // 強制重新初始化
                return await callMCPTool(toolName, params, retryCount + 1);
            }
            
            throw new Error(`MCP Server 錯誤: ${response.status}`);
        }
    } catch (error) {
        // ... 錯誤處理
    }
}
```

---

## 🎯 預期效果

### 修復前

```
第 1 次查詢: "分析王婉如法官的判決傾向"
→ ✅ 成功 (Session 初始化)

第 2 次查詢: "王婉如法官在債務清償案件的判決有什麼共通性?"
→ ❌ 失敗 (Session 過期,無重試機制)
→ 錯誤: "No valid session ID provided"
```

### 修復後

```
第 1 次查詢: "分析王婉如法官的判決傾向"
→ ✅ 成功 (Session 初始化)

第 2 次查詢: "王婉如法官在債務清償案件的判決有什麼共通性?"
→ 檢測到 Session 錯誤
→ 自動重新初始化 Session
→ 重試調用
→ ✅ 成功
```

---

## 📝 修改文件

- `d:\court_data\courtDataAPI\controllers\ai-agent-controller.js`
  - 添加 `isSessionValid()` 函數
  - 更新 `initializeMCPSession()` 支持強制重新初始化
  - 更新 `callMCPTool()` 添加自動重試機制

---

## 🚀 部署步驟

```bash
cd d:\court_data\courtDataAPI

git add controllers/ai-agent-controller.js SESSION_FIX.md
git commit -m "fix: MCP Session 管理優化

- 添加 Session 有效性檢查 (5 分鐘過期)
- 支持強制重新初始化 Session
- 添加自動重試機制 (最多 2 次)
- 修復連續查詢時 Session 失效問題

修復問題:
- 第一次查詢成功,第二次失敗
- 錯誤: 'No valid session ID provided'"

git push origin main
```

---

## 🧪 測試計畫

### 測試案例 1: 連續查詢

```
1. "分析王婉如法官的判決傾向"
   → 預期: ✅ 成功

2. "王婉如法官在債務清償案件的判決有什麼共通性?"
   → 預期: ✅ 成功 (自動重試)

3. "原告勝訴的案件都有哪些共通性?"
   → 預期: ✅ 成功
```

### 測試案例 2: Session 過期

```
1. 查詢後等待 6 分鐘
2. 再次查詢
   → 預期: ✅ 成功 (自動重新初始化)
```

---

## 📊 監控指標

- Session 重新初始化次數
- 重試成功率
- 平均 Session 生命週期

---

## 🔧 後續優化

1. **Session 池管理**: 維護多個 Session,輪流使用
2. **心跳機制**: 定期發送心跳保持 Session 活躍
3. **更智能的過期時間**: 根據實際使用情況動態調整

---

## ✅ 驗收標準

- [ ] 連續查詢不再出現 Session 錯誤
- [ ] 自動重試機制正常工作
- [ ] 日誌清晰顯示 Session 狀態
- [ ] 語意搜尋功能正常使用

