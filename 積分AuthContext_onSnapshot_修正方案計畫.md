# 🔍 積分 AuthContext onSnapshot 修正方案計畫

## 📋 問題描述

**現象**：領取積分後，側邊欄的積分數字不會立即更新，需要重新整理瀏覽器才能看到變化。

**根本原因**：**AuthContext 使用的是一次性讀取（`getDoc`），而不是實時監聽（`onSnapshot`）**

---

## 📊 當前積分系統全景圖

### 🎯 積分消耗場景（共 16 個）

| 功能 | 積分消耗 | 路由 | 中間件 |
|------|---------|------|--------|
| **搜尋判決書** | 1 點 | `GET /api/search` | `checkAndDeductCredits` |
| **查看判決詳情** | 1 點 | `GET /api/judgments/:id` | `checkAndDeductCredits` |
| **語意搜尋** | 3 點 | `POST /api/semantic-search/legal-issues` | `checkAndDeductCredits` |
| **法官 AI 分析** | 3 點 | `GET /api/judges/:judgeName` | `checkAndDeductCredits` |
| **律師基本資料** | 1 點 | `GET /api/lawyers/:lawyerName` | `checkAndDeductCredits` |
| **律師案件分布** | 1 點 | `GET /api/lawyers/:lawyerName/cases-distribution` | `checkAndDeductCredits` |
| **律師 AI 分析** | 2 點 | `GET /api/lawyers/:lawyerName/ai-analysis` | `checkAndDeductCredits` |
| **AI 勝訴分析** | 5 點 | `POST /api/ai/analyze-success-factors` | `checkAndDeductCredits` |
| **AI 歸納共同點** | 4 點 | `POST /api/ai/summarize-common-points` | `checkAndDeductCredits` |
| **案例判決傾向** | 4 點 | `POST /api/ai/case-precedent-analysis` | `checkAndDeductCredits` |
| **AI 訴狀生成** | 6 點 | `POST /api/ai/pleading-generation` | `checkAndDeductCredits` |
| **AI 潤飾描述** | 1 點 | `POST /api/ai/beautify-description` | `checkAndDeductCredits` |
| **法條基礎搜索** | 1 點 | `GET /api/law-search/articles` | `checkAndDeductCredits` |
| **法條語意搜索** | 3 點 | `POST /api/law-search/semantic` | `checkAndDeductCredits` |
| **訴狀驗證** | 1 點 | `POST /api/complaint/validate-text` | `checkAndDeductCredits` |
| **法官匹配分析** | 2 點 | `POST /api/complaint/analyze-judge-match` | `checkAndDeductCredits` |

**總計**：16 個積分消耗功能

---

### 💰 積分增加場景（共 7+ 個）

| 場景 | 積分增加 | 觸發時機 | 實作位置 |
|------|---------|---------|---------|
| **註冊獎勵** | 300 點 | 新用戶註冊時 | `AuthContext.js` → `grantSignupBonus` |
| **新手任務獎勵** | 100 點 | 完成 5 個新手任務 | `GiftBox.js` → `grantOnboardingTasksCompletionReward` |
| **訂閱月付贈送（基本）** | 250 點 | 訂閱基本方案（月付） | `updateUserSubscriptionInTransaction` |
| **訂閱年付贈送（基本）** | 3000 點 | 訂閱基本方案（年付） | `updateUserSubscriptionInTransaction` |
| **訂閱月付贈送（進階）** | 2500 點 | 訂閱進階方案（月付） | `updateUserSubscriptionInTransaction` |
| **訂閱升級獎勵** | 變動 | 從低方案升級到高方案 | `updateUserSubscriptionInTransaction` |
| **購買積分包** | 20-3000 點 | 購買積分包 | `handleMpgNotifyController` |
| **管理員調整** | 變動 | 管理員手動調整 | `addUserCreditsAndLog` |

**總計**：8+ 個積分增加場景

---

### 📱 前端顯示積分的組件（共 3 個）

| 組件 | 顯示位置 | 數據來源 | 更新方式 |
|------|---------|---------|---------|
| **Sidebar.js** | 側邊欄底部 | `currentUser.credits` | ❌ 靜態（不自動更新） |
| **AccountSettings.js** | 帳號設定頁 | `currentUser.credits` + API 查詢歷史 | ❌ 靜態（不自動更新） |
| **GiftBox.js** | 禮物盒組件 | Firebase `onSnapshot` | ✅ 實時監聽 |

---

## 🔄 當前數據流分析

### ❌ 問題流程（積分消耗）

```
1. 用戶點擊「搜尋判決書」
   ↓
2. 前端調用 API: GET /api/search
   ↓
3. 後端中間件 checkAndDeductCredits
   ├─ 檢查積分是否足夠
   ├─ 扣除 1 點積分
   ├─ 更新 Firestore: users/{uid}/credits (-1)
   └─ 創建 creditTransactions 記錄
   ↓
4. API 返回搜尋結果
   ↓
❌ Sidebar 積分數字 **不變**（因為 AuthContext 沒有監聽）
   ↓
5. 用戶重新整理頁面
   ↓
6. onAuthStateChanged 觸發 → getDoc() 讀取新數據
   ↓
✅ Sidebar 積分數字更新
```

### ❌ 問題流程（積分增加）

```
1. 用戶點擊「領取積分」
   ↓
2. 前端調用 API: POST /api/users/claim-onboarding-reward
   ↓
3. 後端 grantOnboardingTasksCompletionReward
   ├─ 增加 100 點積分
   ├─ 更新 Firestore: users/{uid}/credits (+100)
   └─ 創建 creditTransactions 記錄
   ↓
4. API 返回成功
   ↓
❌ Sidebar 積分數字 **不變**（因為 AuthContext 沒有監聽）
   ↓
5. 用戶重新整理頁面
   ↓
✅ Sidebar 積分數字更新
```

### ✅ 正常流程（GiftBox 任務狀態）

```
1. 用戶完成任務
   ↓
2. taskService 更新 Firestore: users/{uid}/onboardingTasks
   ↓
✅ GiftBox 的 onSnapshot 監聽器 **立即觸發**（< 1 秒）
   ↓
✅ 圓環立即變綠
```

---

## 🎯 解決方案：AuthContext 使用 onSnapshot

### 📝 需要修改的文件

**只需修改 1 個文件**：
- `src/AuthContext.js`（第 137-187 行）

---

### 🔍 修改點詳細分析

#### **當前代碼**（第 137-187 行）

```javascript
useEffect(() => {
  const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    if (user) {
      const userRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(userRef); // ❌ 一次性讀取
      
      if (docSnap.exists()) {
        const firestoreData = docSnap.data();
        setCurrentUser({ ...user, ...firestoreData }); // ❌ 只設置一次
      }
    } else {
      setCurrentUser(null);
    }
    setLoading(false);
  });

  return () => unsubscribeAuth();
}, []);
```

**問題**：
1. ❌ `getDoc()` 是一次性讀取，不會監聽變化
2. ❌ `setCurrentUser()` 只在登入時執行一次
3. ❌ 積分變化後，`currentUser.credits` 不會更新

---

#### **修改後代碼**

```javascript
useEffect(() => {
  let unsubscribeFirestore = null; // 🔧 新增：Firestore 監聽器清理函數

  const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    if (user) {
      const userRef = doc(db, "users", user.uid);
      
      // 🔥 改為實時監聽
      unsubscribeFirestore = onSnapshot(
        userRef,
        (docSnap) => {
          if (docSnap.exists()) {
            const firestoreData = docSnap.data();
            setCurrentUser(prevUser => ({
              ...user, // Firebase Auth 數據
              ...firestoreData, // Firestore 數據（包含 credits）
            }));
            console.log('[AuthContext] 🔥 實時更新用戶數據:', {
              uid: user.uid,
              credits: firestoreData.credits
            });
          }
          setLoading(false);
        },
        (error) => {
          console.error('[AuthContext] Firestore 監聽錯誤:', error);
          setLoading(false);
        }
      );
    } else {
      // 用戶登出
      if (unsubscribeFirestore) {
        unsubscribeFirestore(); // 清理 Firestore 監聽器
        unsubscribeFirestore = null;
      }
      setCurrentUser(null);
      setLoading(false);
    }
  });

  return () => {
    unsubscribeAuth();
    if (unsubscribeFirestore) {
      unsubscribeFirestore(); // 清理 Firestore 監聽器
    }
  };
}, []);
```

**改進**：
1. ✅ 使用 `onSnapshot()` 實時監聽
2. ✅ 任何 Firestore 變化都會觸發 `setCurrentUser`
3. ✅ 積分變化後，`currentUser.credits` **立即更新**
4. ✅ 登出時正確清理監聽器

---

### 🌊 修改後的數據流

#### **積分消耗流程**

```
1. 用戶點擊「搜尋判決書」
   ↓
2. 前端調用 API: GET /api/search
   ↓
3. 後端扣除 1 點積分
   ├─ 更新 Firestore: users/{uid}/credits (-1)
   └─ 創建 creditTransactions 記錄
   ↓
✅ AuthContext 的 onSnapshot 監聽器 **立即觸發**（< 1 秒）
   ↓
✅ setCurrentUser 更新 credits
   ↓
✅ Sidebar 自動重新渲染
   ↓
✅ 積分數字立即更新！🎉
```

#### **積分增加流程**

```
1. 用戶點擊「領取積分」
   ↓
2. 後端增加 100 點積分
   ├─ 更新 Firestore: users/{uid}/credits (+100)
   └─ 創建 creditTransactions 記錄
   ↓
✅ AuthContext 的 onSnapshot 監聽器 **立即觸發**（< 1 秒）
   ↓
✅ setCurrentUser 更新 credits
   ↓
✅ Sidebar 自動重新渲染
   ↓
✅ 積分數字立即更新！🎉
```

---

## 🔒 安全性和一致性檢查

### ✅ 不會影響的功能

1. **註冊獎勵**（`loginWithGoogle`）
   - ✅ 仍然正常工作
   - ✅ 新用戶註冊後，`onSnapshot` 會監聽到積分變化

2. **手動刷新**（`refreshUser`）
   - ✅ 仍然可用（作為備用方案）
   - ✅ 但不再需要手動調用

3. **所有積分消耗功能**（16 個）
   - ✅ 後端邏輯不變
   - ✅ 前端自動更新

4. **所有積分增加功能**（8+ 個）
   - ✅ 後端邏輯不變
   - ✅ 前端自動更新

---

### ⚠️ 需要注意的邊緣情況

#### **1. 首次登入時的 `setLoading(false)` 時機**

**當前代碼**：
```javascript
const docSnap = await getDoc(userRef);
// ... 處理數據 ...
setLoading(false); // ❌ 在 async 函數中設置
```

**修改後**：
```javascript
unsubscribeFirestore = onSnapshot(userRef, (docSnap) => {
  // ... 處理數據 ...
  setLoading(false); // ✅ 在 onSnapshot 回調中設置
});
```

**影響**：
- ✅ 首次登入時，`setLoading(false)` 會在 `onSnapshot` 第一次觸發時執行
- ✅ 時機與當前代碼幾乎相同（都是在獲取到 Firestore 數據後）

---

#### **2. 用戶登出時的清理**

**當前代碼**：
```javascript
} else {
  setCurrentUser(null);
}
setLoading(false);
```

**修改後**：
```javascript
} else {
  if (unsubscribeFirestore) {
    unsubscribeFirestore(); // ✅ 清理 Firestore 監聽器
    unsubscribeFirestore = null;
  }
  setCurrentUser(null);
  setLoading(false);
}
```

**影響**：
- ✅ 登出時正確清理監聽器，避免內存洩漏
- ✅ 不會影響登出流程

---

#### **3. 多個瀏覽器視窗同步**

**當前代碼**：
- ❌ 多個視窗不會同步（因為是一次性讀取）

**修改後**：
- ✅ 多個視窗會自動同步（因為都監聽同一個 Firestore 文檔）

**場景**：
```
視窗 A: 用戶點擊「搜尋判決書」
   ↓
Firestore: users/{uid}/credits 更新
   ↓
視窗 A: onSnapshot 觸發 → 積分更新 ✅
視窗 B: onSnapshot 觸發 → 積分更新 ✅
```

---

#### **4. 性能影響**

**當前代碼**：
- 0 個 Firestore 監聽器（只有一次性讀取）

**修改後**：
- 1 個 Firestore 監聽器（監聽 `users/{uid}`）

**影響分析**：
- ✅ **極小**：只增加 1 個監聽器
- ✅ **可接受**：GiftBox 已經在使用 `onSnapshot`，證明這種方式可行
- ✅ **優化**：避免了多次手動調用 `refreshUser`

**Firestore 計費**：
- 每次文檔變化 = 1 次讀取
- 用戶登入時 = 1 次讀取
- 積分變化時 = 1 次讀取
- **總計**：與當前方案相比，只是將「手動讀取」改為「自動監聽」

---

### 🎯 與 GiftBox 的架構一致性

| 特性 | GiftBox | AuthContext（當前） | AuthContext（修改後） |
|------|---------|-------------------|---------------------|
| **數據源** | Firestore | Firestore | Firestore |
| **讀取方式** | `onSnapshot` | `getDoc` | `onSnapshot` ✅ |
| **更新方式** | 自動 | 手動 | 自動 ✅ |
| **實時性** | < 1 秒 | 需重新整理 | < 1 秒 ✅ |
| **多視窗同步** | ✅ 支持 | ❌ 不支持 | ✅ 支持 |

**結論**：修改後的 AuthContext 與 GiftBox 完全一致！✅

---

## 🚀 實作計劃

### 📋 實作步驟

#### **階段 1：修改 AuthContext.js**

1. **備份當前代碼**
   - 複製 `src/AuthContext.js` 為 `src/AuthContext.js.backup`

2. **修改 useEffect（第 137-187 行）**
   - 添加 `unsubscribeFirestore` 變量
   - 將 `getDoc` 改為 `onSnapshot`
   - 添加 Firestore 監聽器清理邏輯

3. **添加必要的 import**
   - 確保已導入 `onSnapshot` from `firebase/firestore`

---

#### **階段 2：測試登入/登出流程**

1. **測試新用戶註冊**
   - 註冊新帳號
   - 檢查是否正常獲得 300 點註冊獎勵
   - 檢查側邊欄積分顯示

2. **測試用戶登入**
   - 登出後重新登入
   - 檢查積分是否正確顯示
   - 檢查 loading 狀態是否正常

3. **測試用戶登出**
   - 登出
   - 檢查控制台是否有清理監聽器的日誌
   - 檢查是否有內存洩漏警告

---

#### **階段 3：測試所有積分消耗場景**

1. **搜尋判決書**（1 點）
   - 執行搜尋
   - 觀察側邊欄積分是否立即減少
   - 預期：< 1 秒內更新

2. **法官 AI 分析**（3 點）
   - 查詢法官
   - 觀察積分變化
   - 預期：< 1 秒內更新

3. **AI 勝訴分析**（5 點）
   - 執行 AI 分析
   - 觀察積分變化
   - 預期：< 1 秒內更新

4. **其他功能**
   - 隨機測試 3-5 個其他積分消耗功能
   - 確保都能立即更新

---

#### **階段 4：測試所有積分增加場景**

1. **新手任務獎勵**（100 點）
   - 完成所有 5 個新手任務
   - 點擊「領取積分」
   - 觀察側邊欄積分是否立即增加
   - 預期：< 1 秒內更新

2. **訂閱升級**（變動）
   - 測試訂閱升級流程
   - 觀察積分變化
   - 預期：< 1 秒內更新

3. **購買積分包**（20-3000 點）
   - 測試購買積分包流程
   - 觀察積分變化
   - 預期：< 1 秒內更新

---

#### **階段 5：測試多視窗同步**

1. **打開兩個瀏覽器視窗**
   - 視窗 A 和視窗 B 都登入同一帳號

2. **在視窗 A 執行操作**
   - 搜尋判決書（扣除 1 點）
   - 觀察視窗 B 的積分是否同步更新
   - 預期：< 1 秒內同步

3. **在視窗 B 執行操作**
   - 領取新手任務獎勵（增加 100 點）
   - 觀察視窗 A 的積分是否同步更新
   - 預期：< 1 秒內同步

---

### ⚠️ 潛在風險和緩解措施

| 風險 | 影響 | 緩解措施 |
|------|------|---------|
| **首次登入 loading 狀態異常** | 用戶看到長時間 loading | 在 `onSnapshot` 回調中正確設置 `setLoading(false)` |
| **Firestore 監聽器未清理** | 內存洩漏 | 在 `useEffect` 清理函數中正確清理 |
| **多次觸發 setCurrentUser** | 不必要的重新渲染 | React 會自動批處理更新，影響極小 |
| **onSnapshot 錯誤未處理** | 用戶無法登入 | 添加錯誤處理回調，記錄錯誤並設置 loading 為 false |

---

## 🎉 預期效果

### ✅ 用戶體驗提升

| 場景 | 當前體驗 | 修改後體驗 | 改善 |
|------|---------|-----------|------|
| **搜尋判決書** | 積分不變，需重新整理 | 積分立即減少 | ⚡ 快 5+ 秒 |
| **領取獎勵** | 積分不變，需重新整理 | 積分立即增加 | ⚡ 快 5+ 秒 |
| **訂閱升級** | 積分不變，需重新整理 | 積分立即增加 | ⚡ 快 5+ 秒 |
| **購買積分包** | 積分不變，需重新整理 | 積分立即增加 | ⚡ 快 5+ 秒 |
| **多視窗使用** | 不同步 | 自動同步 | ✅ 新功能 |

---

## 📊 總結

### ✅ 優勢

1. **完全自動化** - 任何積分變化都會立即反映
2. **架構一致** - 與 GiftBox 使用相同的 `onSnapshot` 模式
3. **一次修改，全局受益** - 所有使用 `currentUser.credits` 的地方都會自動更新
4. **支持多視窗同步** - 用戶在多個標籤頁都能看到實時變化
5. **未來擴展性好** - 任何新的積分功能都會自動支持實時更新
6. **性能影響極小** - 只增加 1 個 Firestore 監聽器

### ⚠️ 注意事項

1. **需要仔細測試登入/登出流程**
2. **需要確保 Firestore 監聽器正確清理**
3. **需要測試所有積分消耗和增加場景**（共 24+ 個場景）
4. **需要測試多視窗同步功能**

### 🎯 推薦

**強烈推薦實作此方案！**

這是最符合現代化應用標準的解決方案，與 GiftBox 架構完全一致，一勞永逸地解決積分實時更新問題。

---

## 📅 實作時間表

| 階段 | 預估時間 | 負責人 |
|------|---------|--------|
| **階段 1：修改代碼** | 30 分鐘 | 開發者 |
| **階段 2：測試登入/登出** | 15 分鐘 | 開發者 |
| **階段 3：測試積分消耗** | 30 分鐘 | 開發者 + QA |
| **階段 4：測試積分增加** | 30 分鐘 | 開發者 + QA |
| **階段 5：測試多視窗同步** | 15 分鐘 | QA |
| **總計** | **2 小時** | - |

---

## 🚀 準備開始實作！

**下一步**：開始修改 `src/AuthContext.js`

---

**文檔版本**：v1.0  
**創建日期**：2025-01-23  
**最後更新**：2025-01-23  
**狀態**：待實作

