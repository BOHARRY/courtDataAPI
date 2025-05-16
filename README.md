# Boooook 後端API架構文件

## 1. 系統概覽

Boooook是一個司法資訊檢索與分析平台，後端採用模組化Node.js架構，核心功能包括判決書檢索、律師表現分析、點數機制以及使用者資料管理。

**技術棧:**
- **核心框架**: Node.js + Express
- **資料儲存**: Firebase Firestore (使用者資料、點數、搜尋歷史)
- **搜尋引擎**: Elasticsearch (判決書索引)
- **認證系統**: Firebase Authentication (使用者認證與授權)

**專案結構:**
```
.
├── config/               # 設定檔目錄
│ ├── firebase.js         # Firebase 初始化與設定
│ ├── elasticsearch.js    # Elasticsearch 客戶端設定
│ ├── environment.js      # 環境變數管理
│ └── express.js          # Express應用程式設定
│
├── middleware/           # Express中介軟體
│ ├── auth.js             # 身分驗證中介軟體
│ └── credit.js           # 點數檢查中介軟體
│
├── services/             # 商業邏輯服務層
│ ├── search.js           # 判決書搜尋服務
│ ├── lawyer.js           # 律師相關服務
│ ├── credit.js           # 點數管理服務
│ ├── judgment.js         # 判決書詳情服務
│ └── user.js             # 使用者相關服務
│
├── utils/                # 通用工具函式
│ ├── query-builder.js    # ES查詢建構工具
│ ├── response-formatter.js # 回應格式化工具
│ ├── case-analyzer.js    # 案件分析工具
│ ├── win-rate-calculator.js # 勝訴率計算工具
│ └── constants.js        # 常數定義
│
├── routes/               # API路由定義
│ ├── index.js            # 主路由檔案
│ ├── search.js           # 搜尋相關路由
│ ├── judgment.js         # 判決書詳情路由
│ ├── lawyer.js           # 律師相關路由
│ └── user.js             # 使用者相關路由
│
├── controllers/          # 請求處理控制器
│ ├── search-controller.js # 搜尋控制器
│ ├── judgment-controller.js # 判決書控制器
│ ├── lawyer-controller.js # 律師控制器
│ └── user-controller.js   # 使用者控制器
│
├── index.js              # 應用程式進入點
└── .env                  # 環境變數
```

## 2. 核心功能與工作流程

### 2.1 使用者認證與點數機制

1. **身分驗證流程**:
   - 前端透過Firebase Authentication取得ID Token
   - 後端使用`verifyToken`中介軟體驗證Token
   - 驗證成功後將使用者資訊附加到`req.user`物件

2. **點數機制**:
   - 各API操作定義不同點數成本(常數定義，如`SEARCH_COST=1`, `LAWYER_ANALYSIS_COST=2`)
   - 使用Firestore Transaction確保點數操作原子性
   - 步驟:
     1. 檢查使用者點數餘額
     2. 不足時回傳402狀態碼
     3. 足夠時扣除點數並進行後續操作

### 2.2 判決書搜尋

1. **搜尋流程**:
   - 路由: `GET /api/search`
   - 控制器: `searchJudgmentsController`
   - 點數成本: `SEARCH_COST=1`
   - 步驟:
     1. 驗證使用者並於Transaction中扣除點數
     2. 呼叫`searchService.performSearch`建構並執行ES查詢
     3. 回傳格式化的搜尋結果

2. **篩選器機制**:
   - 路由: `GET /api/search/filters`
   - 控制器: `getFiltersController`
   - 無點數成本(公開介面)
   - 透過ES聚合取得可用篩選選項(案件類型、法院、結果等)

### 2.3 律師分析

1. **律師搜尋流程**:
   - 路由: `GET /api/lawyers/:name`
   - 控制器: `searchLawyerByNameController`
   - 點數成本: `LAWYER_SEARCH_COST=1`
   - 步驟:
     1. 驗證使用者並於Transaction中扣除點數
     2. 呼叫`lawyerService.searchLawyerData`查詢並分析律師案件
     3. 非同步紀錄搜尋歷史
     4. 回傳律師資料與分析結果

2. **案件分布分析**:
   - 路由: `GET /api/lawyers/:name/cases-distribution`
   - 控制器: `getLawyerCasesDistributionController`
   - 點數成本: `LAWYER_CASES_DISTRIBUTION_COST=1`
   - 回傳案件類型分布資料

3. **律師優劣勢分析**:
   - 路由: `GET /api/lawyers/:name/analysis`
   - 控制器: `getLawyerAnalysisController`
   - 點數成本: `LAWYER_ANALYSIS_COST=2`
   - 回傳律師優勢、注意事項與免責聲明

### 2.4 使用者歷史紀錄

- 路由: `GET /api/users/lawyer-search-history`
- 控制器: `getLawyerSearchHistoryController`
- 無點數成本(已登入使用者可存取自己的資料)
- 從Firestore子集合取得使用者的律師搜尋歷史

## 3. 點數系統設計

點數系統由`services/credit.js`統一管理，核心函式為`checkAndDeductUserCreditsInTransaction`。

```javascript
// 在Transaction中檢查並扣除點數
async function checkAndDeductUserCreditsInTransaction(
  transaction,  // Firestore Transaction實例
  userDocRef,   // 使用者文件參考
  userId,       // 使用者ID
  cost,         // 操作成本
  logDetails    // 紀錄細節
) {
  // 1. 取得使用者文件
  const userDoc = await transaction.get(userDocRef);
  if (!userDoc.exists) throw new Error('User data not found.');
  
  // 2. 檢查點數餘額
  const userData = userDoc.data();
  const currentCredits = userData.credits || 0;
  if (currentCredits < cost) {
    return { sufficient: false, currentCredits };
  }
  
  // 3. 扣除點數
  transaction.update(userDocRef, {
    credits: admin.firestore.FieldValue.increment(-cost),
    lastActivityAt: admin.firestore.FieldValue.serverTimestamp()
  });
  
  // 4. 回傳結果
  return { sufficient: true, currentCredits, newCredits: currentCredits - cost };
}
```

### 新增點數規則範例

若要新增法官搜尋功能並扣除3點點數，步驟如下:

1. **定義點數成本常數**:
   ```javascript
   // controllers/judge-controller.js
   const JUDGE_SEARCH_COST = 3;
   ```
2. **建立控制器函式**:
   ```javascript
   // controllers/judge-controller.js
   export async function searchJudgeByNameController(req, res, next) {
     const userId = req.user.uid;
     const judgeName = req.params.name;
     const userDocRef = admin.firestore().collection('users').doc(userId);
     
     try {
       let judgeData = null;
       
       await admin.firestore().runTransaction(async (transaction) => {
         // 1. 檢查並扣除點數
         const { sufficient, currentCredits } = await creditService.checkAndDeductUserCreditsInTransaction(
           transaction,
           userDocRef,
           userId,
           JUDGE_SEARCH_COST,
           { action: 'judge_search', details: { judgeName } }
         );
         
         if (!sufficient) {
           const error = new Error('Insufficient credits');
           error.statusCode = 402;
           error.details = { required: JUDGE_SEARCH_COST, current: currentCredits };
           throw error;
         }
         
         // 2. 執行搜尋 (呼叫searchService或新建judgeService)
         judgeData = await searchService.performJudgeSearch(judgeName);
       });
       
       // 3. 處理結果
       if (judgeData) {
         res.status(200).json(judgeData);
       } else {
         const err = new Error('Internal server error after judge search.');
         err.statusCode = 500;
         next(err);
       }
     } catch (error) {
       // 4. 錯誤處理
       if (error.message === 'Insufficient credits' && error.statusCode === 402) {
         return res.status(402).json({
           error: '您的點數不足，請購買點數或升級方案。',
           required: error.details?.required || JUDGE_SEARCH_COST,
           current: error.details?.current || 0
         });
       }
       next(error);
     }
   }
   ```
3. **新增路由**:
   ```javascript
   // routes/judge.js
   import express from 'express';
   import { searchJudgeByNameController } from '../controllers/judge-controller.js';
   import { verifyToken } from '../middleware/auth.js';
   
   const router = express.Router();
   
   router.get('/:name', verifyToken, searchJudgeByNameController);
   
   export default router;
   ```
4. **註冊路由**:
   ```javascript
   // routes/index.js
   import judgeRoutes from './judge.js';
   
   // 在router物件上新增
   router.use('/judges', judgeRoutes);
   ```
5. **實作搜尋服務**:
   ```javascript
   // services/search.js 或 新建 services/judge.js
   export async function performJudgeSearch(judgeName) {
     try {
       const esResult = await esClient.search({
         index: ES_INDEX_NAME,
         size: 100,
         query: {
           bool: {
             must: [{
               bool: {
                 should: [
                   { match_phrase: { "judges": judgeName } },
                   { match_phrase: { "judges.raw": judgeName } }
                 ],
                 minimum_should_match: 1
               }
             }]
           }
         },
         _source: [
           "JID", "court", "JTITLE", "JDATE", "case_type", "verdict", 
           "judges", "JCASE"
         ]
       });
       
       // 處理結果並回傳
       return {
         name: judgeName,
         totalCases: esResult.hits.total.value,
         cases: esResult.hits.hits.map(hit => ({
           id: hit._id,
           title: hit._source.JTITLE,
           court: hit._source.court,
           date: hit._source.JDATE,
           caseType: hit._source.case_type,
           verdict: hit._source.verdict
         }))
       };
     } catch (error) {
       console.error(`Error searching for judge ${judgeName}:`, error);
       throw new Error(`Failed to search data for judge ${judgeName}.`);
     }
   }
   ```

## 4. 核心資料結構

### 4.1 案件分析與結果代碼

專案使用標準化的結果代碼系統來分析判決結果。主要結構於`utils/constants.js`中定義:

```javascript
export const NEUTRAL_OUTCOME_CODES = {
  PROCEDURAL_NEUTRAL: 'PROCEDURAL_NEUTRAL',           // 程序性裁定
  SETTLEMENT_NEUTRAL: 'SETTLEMENT_NEUTRAL',           // 和解/調解
  WITHDRAWAL_NEUTRAL: 'WITHDRAWAL_NEUTRAL',           // 撤回訴訟
  NOT_APPLICABLE_OR_UNKNOWN_NEUTRAL: 'NOT_APPLICABLE_OR_UNKNOWN_NEUTRAL',
  UNKNOWN_NEUTRAL: 'UNKNOWN_NEUTRAL',
  
  // 民事原告結果
  CIVIL_P_WIN_FULL: 'CIVIL_P_WIN_FULL',               // 原告完全勝訴
  CIVIL_P_WIN_MAJOR: 'CIVIL_P_WIN_MAJOR',             // 原告大部分勝訴
  CIVIL_P_WIN_PARTIAL: 'CIVIL_P_WIN_PARTIAL',         // 原告部分勝訴
  CIVIL_P_WIN_MINOR: 'CIVIL_P_WIN_MINOR',             // 原告小部分勝訴
  CIVIL_P_LOSE_FULL: 'CIVIL_P_LOSE_FULL',             // 原告完全敗訴
  
  // 民事被告結果
  CIVIL_D_WIN_FULL: 'CIVIL_D_WIN_FULL',               // 被告完全勝訴
  CIVIL_D_MITIGATE_MAJOR: 'CIVIL_D_MITIGATE_MAJOR',   // 被告大部分減免
  CIVIL_D_MITIGATE_PARTIAL: 'CIVIL_D_MITIGATE_PARTIAL', // 被告部分減免
  CIVIL_D_MITIGATE_MINOR: 'CIVIL_D_MITIGATE_MINOR',   // 被告小部分減免
  CIVIL_D_LOSE_FULL: 'CIVIL_D_LOSE_FULL',             // 被告完全敗訴
  
  // 刑事案件結果
  CRIMINAL_ACQUITTED: 'CRIMINAL_ACQUITTED',           // 無罪
  CRIMINAL_GUILTY_SIG_REDUCED: 'CRIMINAL_GUILTY_SIG_REDUCED', // 有罪但顯著減輕
  CRIMINAL_GUILTY_PROBATION: 'CRIMINAL_GUILTY_PROBATION',    // 緩刑
  // 更多刑事結果...
  
  // 行政案件結果
  ADMIN_WIN_REVOKE_FULL: 'ADMIN_WIN_REVOKE_FULL',     // 撤銷原處分
  ADMIN_WIN_REVOKE_PARTIAL: 'ADMIN_WIN_REVOKE_PARTIAL', // 部分撤銷原處分
  ADMIN_LOSE_DISMISSED: 'ADMIN_LOSE_DISMISSED',       // 駁回訴訟
  // 更多行政結果...
};

// 統計鍵名
export const FINAL_STAT_KEYS = {
  TOTAL: 'total',
  FAVORABLE_FULL: 'FAVORABLE_FULL_COUNT',
  FAVORABLE_PARTIAL: 'FAVORABLE_PARTIAL_COUNT',
  UNFAVORABLE_FULL: 'UNFAVORABLE_FULL_COUNT',
  NEUTRAL_SETTLEMENT: 'NEUTRAL_SETTLEMENT_COUNT',
  PROCEDURAL: 'PROCEDURAL_COUNT',
  OTHER_UNKNOWN: 'OTHER_UNKNOWN_COUNT',
};
```

然後透過`utils/case-analyzer.js`中的`getDetailedResult`函式將判決文本對應為標準化的結果代碼:

```javascript
export function getDetailedResult(perfVerdictText, mainType, sourceForContext = {}, lawyerPerfObject = null) {
  let neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.UNKNOWN_NEUTRAL;
  let description = perfVerdictText || sourceForContext.verdict || sourceForContext.verdict_type || '結果資訊不足';
  const pv = (perfVerdictText || "").toLowerCase();

  // 判斷是否為裁定案件
  const isRulingCase = sourceForContext.is_ruling === "是" || 
                       (sourceForContext.JCASE || '').toLowerCase().includes("裁") ||
                       (sourceForContext.JTITLE || '').toLowerCase().includes("裁定");
                       
  // 判斷是否為程序性
  if (pv.includes("程序性裁定") || pv.includes("procedural")) {
    neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.PROCEDURAL_NEUTRAL;
  } 
  // 判斷是否為和解
  else if (pv.includes("和解") || pv.includes("調解成立")) {
    neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.SETTLEMENT_NEUTRAL;
  }
  // 根據案件類型與文本進行詳細判斷
  else if (perfVerdictText) {
    if (mainType === 'civil') {
      // 民事案件判斷邏輯
      if (pv.includes("原告: 完全勝訴")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CIVIL_P_WIN_FULL;
      else if (pv.includes("原告: 大部分勝訴")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CIVIL_P_WIN_MAJOR;
      // 更多民事判斷...
    } 
    else if (mainType === 'criminal') {
      // 刑事案件判斷邏輯
      if (pv.includes("無罪")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CRIMINAL_ACQUITTED;
      else if (pv.includes("有罪但顯著減輕")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_SIG_REDUCED;
      // 更多刑事判斷...
    }
    else if (mainType === 'administrative') {
      // 行政案件判斷邏輯
      if (pv.includes("撤銷原處分") && !(pv.includes("部分") || pv.includes("一部"))) {
        neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.ADMIN_WIN_REVOKE_FULL;
      }
      // 更多行政判斷...
    }
  }
  
  // 回傳標準化結果
  return { neutralOutcomeCode, description };
}
```

### 4.2 勝訴率計算

透過`utils/win-rate-calculator.js`中的`calculateDetailedWinRates`函式計算律師於不同案件類型、不同立場下的勝訴率:

```javascript
export function calculateDetailedWinRates(processedCases = [], initialDetailedWinRatesStats) {
  const detailedWinRatesStats = JSON.parse(JSON.stringify(initialDetailedWinRatesStats));

  // 遍歷案件並統計
  processedCases.forEach(caseInfo => {
    const { mainType, sideFromPerf, neutralOutcomeCode } = caseInfo;
    
    // 驗證必要欄位是否存在
    if (!neutralOutcomeCode || !mainType || mainType === 'unknown' || !sideFromPerf || sideFromPerf === 'unknown') {
      // 處理無效案件
      return;
    }

    // 取得目標統計桶
    let targetRoleBucket;
    if (['plaintiff', 'appellant', 'claimant'].includes(sideFromPerf)) {
      targetRoleBucket = detailedWinRatesStats[mainType].plaintiff;
    } else if (['defendant', 'appellee', 'respondent'].includes(sideFromPerf)) {
      targetRoleBucket = detailedWinRatesStats[mainType].defendant;
    } else {
      // 處理未知角色
      return;
    }

    // 案件總數加1
    targetRoleBucket[FINAL_STAT_KEYS.TOTAL]++;
    
    // 根據不同結果代碼更新對應統計
    let finalStatKeyToIncrement = FINAL_STAT_KEYS.OTHER_UNKNOWN;
    
    // 處理程序性/中性結果
    if ([NEUTRAL_OUTCOME_CODES.PROCEDURAL_NEUTRAL, 
         NEUTRAL_OUTCOME_CODES.CRIMINAL_CHARGE_DISMISSED_NO_PROSECUTION].includes(neutralOutcomeCode)) {
      finalStatKeyToIncrement = FINAL_STAT_KEYS.PROCEDURAL;
    } 
    else if ([NEUTRAL_OUTCOME_CODES.SETTLEMENT_NEUTRAL, 
              NEUTRAL_OUTCOME_CODES.WITHDRAWAL_NEUTRAL].includes(neutralOutcomeCode)) {
      finalStatKeyToIncrement = FINAL_STAT_KEYS.NEUTRAL_SETTLEMENT;
    }
    // 處理不同案件類型的具體結果
    else if (mainType === 'civil') {
      if (sideFromPerf === 'plaintiff') {
        // 原告角度判斷
        if ([NEUTRAL_OUTCOME_CODES.CIVIL_P_WIN_FULL, 
             NEUTRAL_OUTCOME_CODES.CIVIL_P_WIN_MAJOR].includes(neutralOutcomeCode)) {
          finalStatKeyToIncrement = FINAL_STAT_KEYS.FAVORABLE_FULL;
        }
        // 更多判斷...
      } 
      else if (sideFromPerf === 'defendant') {
        // 被告角度判斷
        // ...
      }
    }
    // 更多案件類型處理...
    
    // 更新計數
    targetRoleBucket[finalStatKeyToIncrement]++;
  });

  // 計算整體勝訴率
  ['civil', 'criminal', 'administrative'].forEach(mainType => {
    const stats = detailedWinRatesStats[mainType];
    if (!stats) return;
    
    let totalFavorable = 0;
    let totalConsideredForRate = 0;
    
    ['plaintiff', 'defendant'].forEach(role => {
      const roleStats = stats[role];
      if (roleStats) {
        // 計算有利結果總數
        totalFavorable += (roleStats[FINAL_STAT_KEYS.FAVORABLE_FULL] || 0) + 
                           (roleStats[FINAL_STAT_KEYS.FAVORABLE_PARTIAL] || 0);
        
        // 計算納入統計的總案件數
        totalConsideredForRate += (roleStats[FINAL_STAT_KEYS.FAVORABLE_FULL] || 0) +
                                 (roleStats[FINAL_STAT_KEYS.FAVORABLE_PARTIAL] || 0) +
                                 (roleStats[FINAL_STAT_KEYS.UNFAVORABLE_FULL] || 0);
      }
    });
    
    // 計算百分比
    stats.overall = totalConsideredForRate > 0 ? 
      Math.round((totalFavorable / totalConsideredForRate) * 100) : 0;
  });
  
  return detailedWinRatesStats;
}
```

## 5. 安全與效能考量

### 5.1 安全最佳實踐

1. **身分認證與授權**:
   - 使用Firebase Auth驗證ID Token
   - 所有需授權的API端點使用`verifyToken`中介軟體
   - 保護使用者資料，確保使用者僅能存取自己的資料

2. **輸入驗證**:
   - 對所有使用者輸入進行驗證
   - 使用參數預設值與型別檢查增強健壯性
   - 在控制器層進行初步驗證，服務層進行深度驗證

3. **錯誤處理**:
   - 統一錯誤處理機制
   - 避免於生產環境暴露敏感錯誤資訊
   - 使用標準錯誤代碼與訊息格式

### 5.2 效能優化

1. **Elasticsearch查詢優化**:
   - 使用filter context減少計算負擔
   - 適當使用欄位加權(field boosting)提升相關性
   - 限制回傳欄位(_source過濾)減少資料傳輸

2. **Firebase優化**:
   - 使用Transaction確保資料一致性
   - 使用批次操作減少請求數
   - 優化資料結構與索引

3. **快取策略**:
   - 考慮實作Redis快取常用篩選器資料
   - 實作用戶端快取策略(ETag, Cache-Control)
   - 對靜態分析結果進行快取

## 6. 擴充指南

### 6.1 新增API端點

1. **建立控制器函式**:
   ```javascript
   // controllers/new-feature-controller.js
   export async function newFeatureController(req, res, next) {
     try {
       // 實作邏輯...
       res.status(200).json(result);
     } catch (error) {
       next(error);
     }
   }
   ```
2. **新增服務函式**:
   ```javascript
   // services/relevant-service.js
   export async function performNewFeature(params) {
     try {
       // 實作商業邏輯...
       return result;
     } catch (error) {
       throw new Error('Failed to perform new feature');
     }
   }
   ```
3. **建立路由**:
   ```javascript
   // routes/new-feature.js
   import express from 'express';
   import { newFeatureController } from '../controllers/new-feature-controller.js';
   import { verifyToken } from '../middleware/auth.js';
   
   const router = express.Router();
   router.get('/', verifyToken, newFeatureController);
   export default router;
   ```
4. **註冊路由**:
   ```javascript
   // routes/index.js
   import newFeatureRoutes from './new-feature.js';
   router.use('/new-feature', newFeatureRoutes);
   ```

### 6.2 修改點數規則

若要修改現有功能的點數成本:

1. **更新點數常數**:
   ```javascript
   // controllers/relevant-controller.js
   // 修改常數值
   const FEATURE_COST = 5; // 原本是2
   ```
2. **說明文件更新**:
   更新API文件，告知使用者點數規則變更

若要新增點數相關功能，如點數儲值、獎勵等，需擴充`services/credit.js`:

```javascript
// services/credit.js
export async function addUserCredits(userId, amount, reason) {
  const userDocRef = admin.firestore().collection('users').doc(userId);
  
  try {
    await userDocRef.update({
      credits: admin.firestore.FieldValue.increment(amount),
      lastCreditAddedAt: admin.firestore.FieldValue.serverTimestamp(),
      [`creditHistory.${Date.now()}`]: {
        amount,
        type: 'add',
        reason,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      }
    });
    
    return { success: true, amount };
  } catch (error) {
    console.error(`Error adding credits to user ${userId}:`, error);
    throw new Error('Failed to add credits');
  }
}
```

## 7. 故障排除與紀錄

### 7.1 常見問題

1. **身分驗證失敗**:
   - 檢查Firebase設定
   - 驗證Token格式與有效期
   - 查看紀錄中的具體錯誤代碼

2. **點數交易問題**:
   - 檢查Transaction執行是否完整
   - 驗證使用者文件是否存在
   - 查看點數餘額紀錄

3. **Elasticsearch查詢問題**:
   - 驗證ES連線狀態
   - 檢查查詢語法是否正確
   - 查看原始回應以取得錯誤細節

### 7.2 紀錄策略

專案採用分層紀錄策略:

1. **請求紀錄**: 紀錄HTTP請求基本資訊
   ```javascript
   console.log(`[Request] ${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
   ```
2. **服務層紀錄**: 紀錄商業操作
   ```javascript
   console.log(`[Search Service] Performing search with filters: ${JSON.stringify(searchFilters)}`);
   ```
3. **錯誤紀錄**: 紀錄詳細錯誤資訊
   ```javascript
   console.error(`[Credit Service] Error for user ${userId}:`, error);
   ```
4. **交易紀錄**: 紀錄關鍵商業交易
   ```javascript
   console.log(`[Transaction] Deducting ${cost} credit(s) from user ${userId}. New balance: ${newCredits}`);
   ```

## 8. 開發工作流程

### 8.1 本地開發

1. **環境設定**:
   ```bash
   # 複製儲存庫
   git clone <repository-url>
   cd boooook-backend

   # 安裝相依套件
   npm install

   # 建立.env檔案
   cp .env.example .env
   # 編輯.env新增必要的環境變數
   ```
2. **啟動開發伺服器**:
   ```bash
   npm run dev
   ```
3. **測試API**:
   使用Postman或類似工具測試API端點

### 8.2 部署

1. **準備工作**:
   - 確認所有環境變數已設定
   - 執行測試確保功能正常

2. **建置**:
   ```bash
   npm run build
   ```
3. **部署選項**:
   - **Docker容器**:
     ```bash
     docker build -t boooook-backend .
     docker run -p 3000:3000 boooook-backend
     ```
   - **雲端服務**:
     - 支援Google Cloud Run、AWS Lambda、Azure Functions等

---

本文檔提供Boooook後端API的完整概覽。開發人員應結合程式碼與註解理解完整實作細節。針對特定功能修改，請參考對應模組並遵循現有模式。
