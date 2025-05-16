# Boooook 后端API架构文档

## 1. 系统概览

Boooook是一个司法信息检索与分析平台，后端采用模块化Node.js架构，核心功能包括判决书检索、律师表现分析、积分机制以及用户数据管理。

**技术栈:**
- **核心框架**: Node.js + Express
- **数据存储**: Firebase Firestore (用户数据、积分、搜索历史)
- **搜索引擎**: Elasticsearch (判决书索引)
- **认证系统**: Firebase Authentication (用户认证与授权)

**项目结构:**
```
.
├── config/               # 配置文件目录
│ ├── firebase.js         # Firebase 初始化与配置
│ ├── elasticsearch.js    # Elasticsearch 客户端配置
│ ├── environment.js      # 环境变量管理
│ └── express.js          # Express应用实例配置
│
├── middleware/           # Express中间件
│ ├── auth.js             # 身份验证中间件
│ └── credit.js           # 积分检查中间件
│
├── services/             # 业务逻辑服务层
│ ├── search.js           # 判决书搜索服务
│ ├── lawyer.js           # 律师相关服务
│ ├── credit.js           # 积分管理服务
│ ├── judgment.js         # 判决书详情服务
│ └── user.js             # 用户相关服务
│
├── utils/                # 通用工具函数
│ ├── query-builder.js    # ES查询构建工具
│ ├── response-formatter.js # 响应格式化工具
│ ├── case-analyzer.js    # 案件分析工具
│ ├── win-rate-calculator.js # 胜诉率计算工具
│ └── constants.js        # 常量定义
│
├── routes/               # API路由定义
│ ├── index.js            # 主路由文件
│ ├── search.js           # 搜索相关路由
│ ├── judgment.js         # 判决书详情路由
│ ├── lawyer.js           # 律师相关路由
│ └── user.js             # 用户相关路由
│
├── controllers/          # 请求处理控制器
│ ├── search-controller.js # 搜索控制器
│ ├── judgment-controller.js # 判决书控制器
│ ├── lawyer-controller.js # 律师控制器
│ └── user-controller.js   # 用户控制器
│
├── index.js              # 应用入口文件
└── .env                  # 环境变量
```

## 2. 核心功能与工作流程

### 2.1 用户认证与积分机制

1. **身份验证流程**:
   - 前端通过Firebase Authentication获取ID Token
   - 后端使用`verifyToken`中间件验证Token
   - 成功后将用户信息附加到`req.user`对象

2. **积分机制**:
   - 各API操作定义不同积分成本(常量定义，如`SEARCH_COST=1`, `LAWYER_ANALYSIS_COST=2`)
   - 使用Firestore Transaction确保积分操作原子性
   - 步骤:
     1. 检查用户积分余额
     2. 不足时返回402状态码
     3. 足够时扣除积分并进行后续操作

### 2.2 判决书搜索

1. **搜索流程**:
   - 路由: `GET /api/search`
   - 控制器: `searchJudgmentsController`
   - 积分成本: `SEARCH_COST=1`
   - 步骤:
     1. 验证用户并在Transaction中扣除积分
     2. 调用`searchService.performSearch`构建和执行ES查询
     3. 返回格式化的搜索结果

2. **筛选器机制**:
   - 路由: `GET /api/search/filters`
   - 控制器: `getFiltersController`
   - 无积分成本(公开接口)
   - 通过ES聚合获取可用筛选选项(案件类型、法院、结果等)

### 2.3 律师分析

1. **律师搜索流程**:
   - 路由: `GET /api/lawyers/:name`
   - 控制器: `searchLawyerByNameController`
   - 积分成本: `LAWYER_SEARCH_COST=1`
   - 步骤:
     1. 验证用户并在Transaction中扣除积分
     2. 调用`lawyerService.searchLawyerData`查询并分析律师案件
     3. 异步记录搜索历史
     4. 返回律师数据和分析结果

2. **案件分布分析**:
   - 路由: `GET /api/lawyers/:name/cases-distribution`
   - 控制器: `getLawyerCasesDistributionController`
   - 积分成本: `LAWYER_CASES_DISTRIBUTION_COST=1`
   - 返回案件类型分布数据

3. **律师优劣势分析**:
   - 路由: `GET /api/lawyers/:name/analysis`
   - 控制器: `getLawyerAnalysisController`
   - 积分成本: `LAWYER_ANALYSIS_COST=2`
   - 返回律师优势、注意事项和免责声明

### 2.4 用户历史记录

- 路由: `GET /api/users/lawyer-search-history`
- 控制器: `getLawyerSearchHistoryController`
- 无积分成本(已登录用户可访问自己的数据)
- 从Firestore子集合获取用户的律师搜索历史

## 3. 积分系统设计

积分系统通过`services/credit.js`统一管理，核心函数是`checkAndDeductUserCreditsInTransaction`。

```javascript
// 在Transaction中检查并扣除积分
async function checkAndDeductUserCreditsInTransaction(
  transaction,  // Firestore Transaction实例
  userDocRef,   // 用户文档引用
  userId,       // 用户ID
  cost,         // 操作成本
  logDetails    // 日志详情
) {
  // 1. 获取用户文档
  const userDoc = await transaction.get(userDocRef);
  if (!userDoc.exists) throw new Error('User data not found.');
  
  // 2. 检查积分余额
  const userData = userDoc.data();
  const currentCredits = userData.credits || 0;
  if (currentCredits < cost) {
    return { sufficient: false, currentCredits };
  }
  
  // 3. 扣除积分
  transaction.update(userDocRef, {
    credits: admin.firestore.FieldValue.increment(-cost),
    lastActivityAt: admin.firestore.FieldValue.serverTimestamp()
  });
  
  // 4. 返回结果
  return { sufficient: true, currentCredits, newCredits: currentCredits - cost };
}
```

### 添加新积分规则示例

如果要添加判断搜索功能并扣除3点积分，步骤如下:

1. **定义积分成本常量**:
   ```javascript
   // controllers/judge-controller.js
   const JUDGE_SEARCH_COST = 3;
   ```

2. **创建控制器函数**:
   ```javascript
   // controllers/judge-controller.js
   export async function searchJudgeByNameController(req, res, next) {
     const userId = req.user.uid;
     const judgeName = req.params.name;
     const userDocRef = admin.firestore().collection('users').doc(userId);
     
     try {
       let judgeData = null;
       
       await admin.firestore().runTransaction(async (transaction) => {
         // 1. 检查并扣除积分
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
         
         // 2. 执行搜索 (调用searchService或新建judgeService)
         judgeData = await searchService.performJudgeSearch(judgeName);
       });
       
       // 3. 处理结果
       if (judgeData) {
         res.status(200).json(judgeData);
       } else {
         const err = new Error('Internal server error after judge search.');
         err.statusCode = 500;
         next(err);
       }
     } catch (error) {
       // 4. 错误处理
       if (error.message === 'Insufficient credits' && error.statusCode === 402) {
         return res.status(402).json({
           error: '您的积分不足，请购买积分或升级方案。',
           required: error.details?.required || JUDGE_SEARCH_COST,
           current: error.details?.current || 0
         });
       }
       next(error);
     }
   }
   ```

3. **添加路由**:
   ```javascript
   // routes/judge.js
   import express from 'express';
   import { searchJudgeByNameController } from '../controllers/judge-controller.js';
   import { verifyToken } from '../middleware/auth.js';
   
   const router = express.Router();
   
   router.get('/:name', verifyToken, searchJudgeByNameController);
   
   export default router;
   ```

4. **注册路由**:
   ```javascript
   // routes/index.js
   import judgeRoutes from './judge.js';
   
   // 在router对象上添加
   router.use('/judges', judgeRoutes);
   ```

5. **实现搜索服务**:
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
       
       // 处理结果并返回
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

## 4. 核心数据结构

### 4.1 案件分析与结果代码

项目使用标准化的结果代码系统来分析判决结果。主要结构在`utils/constants.js`中定义:

```javascript
export const NEUTRAL_OUTCOME_CODES = {
  PROCEDURAL_NEUTRAL: 'PROCEDURAL_NEUTRAL',           // 程序性裁定
  SETTLEMENT_NEUTRAL: 'SETTLEMENT_NEUTRAL',           // 和解/调解
  WITHDRAWAL_NEUTRAL: 'WITHDRAWAL_NEUTRAL',           // 撤诉
  NOT_APPLICABLE_OR_UNKNOWN_NEUTRAL: 'NOT_APPLICABLE_OR_UNKNOWN_NEUTRAL',
  UNKNOWN_NEUTRAL: 'UNKNOWN_NEUTRAL',
  
  // 民事原告结果
  CIVIL_P_WIN_FULL: 'CIVIL_P_WIN_FULL',               // 原告完全胜诉
  CIVIL_P_WIN_MAJOR: 'CIVIL_P_WIN_MAJOR',             // 原告大部分胜诉
  CIVIL_P_WIN_PARTIAL: 'CIVIL_P_WIN_PARTIAL',         // 原告部分胜诉
  CIVIL_P_WIN_MINOR: 'CIVIL_P_WIN_MINOR',             // 原告小部分胜诉
  CIVIL_P_LOSE_FULL: 'CIVIL_P_LOSE_FULL',             // 原告完全败诉
  
  // 民事被告结果
  CIVIL_D_WIN_FULL: 'CIVIL_D_WIN_FULL',               // 被告完全胜诉
  CIVIL_D_MITIGATE_MAJOR: 'CIVIL_D_MITIGATE_MAJOR',   // 被告大部分减免
  CIVIL_D_MITIGATE_PARTIAL: 'CIVIL_D_MITIGATE_PARTIAL', // 被告部分减免
  CIVIL_D_MITIGATE_MINOR: 'CIVIL_D_MITIGATE_MINOR',   // 被告小部分减免
  CIVIL_D_LOSE_FULL: 'CIVIL_D_LOSE_FULL',             // 被告完全败诉
  
  // 刑事案件结果
  CRIMINAL_ACQUITTED: 'CRIMINAL_ACQUITTED',           // 无罪
  CRIMINAL_GUILTY_SIG_REDUCED: 'CRIMINAL_GUILTY_SIG_REDUCED', // 有罪但显著减轻
  CRIMINAL_GUILTY_PROBATION: 'CRIMINAL_GUILTY_PROBATION',    // 缓刑
  // 更多刑事结果...
  
  // 行政案件结果
  ADMIN_WIN_REVOKE_FULL: 'ADMIN_WIN_REVOKE_FULL',     // 撤销原处分
  ADMIN_WIN_REVOKE_PARTIAL: 'ADMIN_WIN_REVOKE_PARTIAL', // 部分撤销原处分
  ADMIN_LOSE_DISMISSED: 'ADMIN_LOSE_DISMISSED',       // 驳回诉讼
  // 更多行政结果...
};

// 统计键名
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

然后通过`utils/case-analyzer.js`中的`getDetailedResult`函数将判决文本映射为标准化的结果代码:

```javascript
export function getDetailedResult(perfVerdictText, mainType, sourceForContext = {}, lawyerPerfObject = null) {
  let neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.UNKNOWN_NEUTRAL;
  let description = perfVerdictText || sourceForContext.verdict || sourceForContext.verdict_type || '结果信息不足';
  const pv = (perfVerdictText || "").toLowerCase();

  // 判断是否为裁定案件
  const isRulingCase = sourceForContext.is_ruling === "是" || 
                       (sourceForContext.JCASE || '').toLowerCase().includes("裁") ||
                       (sourceForContext.JTITLE || '').toLowerCase().includes("裁定");
                       
  // 判断是否为程序性
  if (pv.includes("程序性裁定") || pv.includes("procedural")) {
    neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.PROCEDURAL_NEUTRAL;
  } 
  // 判断是否为和解
  else if (pv.includes("和解") || pv.includes("调解成立")) {
    neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.SETTLEMENT_NEUTRAL;
  }
  // 根据案件类型和文本进行详细判断
  else if (perfVerdictText) {
    if (mainType === 'civil') {
      // 民事案件判断逻辑
      if (pv.includes("原告: 完全胜诉")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CIVIL_P_WIN_FULL;
      else if (pv.includes("原告: 大部分胜诉")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CIVIL_P_WIN_MAJOR;
      // 更多民事判断...
    } 
    else if (mainType === 'criminal') {
      // 刑事案件判断逻辑
      if (pv.includes("无罪")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CRIMINAL_ACQUITTED;
      else if (pv.includes("有罪但显著减轻")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_SIG_REDUCED;
      // 更多刑事判断...
    }
    else if (mainType === 'administrative') {
      // 行政案件判断逻辑
      if (pv.includes("撤销原处分") && !(pv.includes("部分") || pv.includes("一部"))) {
        neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.ADMIN_WIN_REVOKE_FULL;
      }
      // 更多行政判断...
    }
  }
  
  // 返回标准化结果
  return { neutralOutcomeCode, description };
}
```

### 4.2 胜诉率计算

通过`utils/win-rate-calculator.js`中的`calculateDetailedWinRates`函数计算律师在不同案件类型、不同立场下的胜诉率:

```javascript
export function calculateDetailedWinRates(processedCases = [], initialDetailedWinRatesStats) {
  const detailedWinRatesStats = JSON.parse(JSON.stringify(initialDetailedWinRatesStats));

  // 遍历案件并统计
  processedCases.forEach(caseInfo => {
    const { mainType, sideFromPerf, neutralOutcomeCode } = caseInfo;
    
    // 验证必要字段是否存在
    if (!neutralOutcomeCode || !mainType || mainType === 'unknown' || !sideFromPerf || sideFromPerf === 'unknown') {
      // 处理无效案件
      return;
    }

    // 获取目标统计桶
    let targetRoleBucket;
    if (['plaintiff', 'appellant', 'claimant'].includes(sideFromPerf)) {
      targetRoleBucket = detailedWinRatesStats[mainType].plaintiff;
    } else if (['defendant', 'appellee', 'respondent'].includes(sideFromPerf)) {
      targetRoleBucket = detailedWinRatesStats[mainType].defendant;
    } else {
      // 处理未知角色
      return;
    }

    // 案件总数加1
    targetRoleBucket[FINAL_STAT_KEYS.TOTAL]++;
    
    // 根据不同结果代码更新对应统计
    let finalStatKeyToIncrement = FINAL_STAT_KEYS.OTHER_UNKNOWN;
    
    // 处理程序性/中性结果
    if ([NEUTRAL_OUTCOME_CODES.PROCEDURAL_NEUTRAL, 
         NEUTRAL_OUTCOME_CODES.CRIMINAL_CHARGE_DISMISSED_NO_PROSECUTION].includes(neutralOutcomeCode)) {
      finalStatKeyToIncrement = FINAL_STAT_KEYS.PROCEDURAL;
    } 
    else if ([NEUTRAL_OUTCOME_CODES.SETTLEMENT_NEUTRAL, 
              NEUTRAL_OUTCOME_CODES.WITHDRAWAL_NEUTRAL].includes(neutralOutcomeCode)) {
      finalStatKeyToIncrement = FINAL_STAT_KEYS.NEUTRAL_SETTLEMENT;
    }
    // 处理不同案件类型的具体结果
    else if (mainType === 'civil') {
      if (sideFromPerf === 'plaintiff') {
        // 原告角度判断
        if ([NEUTRAL_OUTCOME_CODES.CIVIL_P_WIN_FULL, 
             NEUTRAL_OUTCOME_CODES.CIVIL_P_WIN_MAJOR].includes(neutralOutcomeCode)) {
          finalStatKeyToIncrement = FINAL_STAT_KEYS.FAVORABLE_FULL;
        }
        // 更多判断...
      } 
      else if (sideFromPerf === 'defendant') {
        // 被告角度判断
        // ...
      }
    }
    // 更多案件类型处理...
    
    // 更新计数
    targetRoleBucket[finalStatKeyToIncrement]++;
  });

  // 计算整体胜诉率
  ['civil', 'criminal', 'administrative'].forEach(mainType => {
    const stats = detailedWinRatesStats[mainType];
    if (!stats) return;
    
    let totalFavorable = 0;
    let totalConsideredForRate = 0;
    
    ['plaintiff', 'defendant'].forEach(role => {
      const roleStats = stats[role];
      if (roleStats) {
        // 计算有利结果总数
        totalFavorable += (roleStats[FINAL_STAT_KEYS.FAVORABLE_FULL] || 0) + 
                           (roleStats[FINAL_STAT_KEYS.FAVORABLE_PARTIAL] || 0);
        
        // 计算纳入统计的总案件数
        totalConsideredForRate += (roleStats[FINAL_STAT_KEYS.FAVORABLE_FULL] || 0) +
                                 (roleStats[FINAL_STAT_KEYS.FAVORABLE_PARTIAL] || 0) +
                                 (roleStats[FINAL_STAT_KEYS.UNFAVORABLE_FULL] || 0);
      }
    });
    
    // 计算百分比
    stats.overall = totalConsideredForRate > 0 ? 
      Math.round((totalFavorable / totalConsideredForRate) * 100) : 0;
  });
  
  return detailedWinRatesStats;
}
```

## 5. 安全与性能考量

### 5.1 安全最佳实践

1. **身份认证与授权**:
   - 使用Firebase Auth验证ID Token
   - 所有需要授权的API端点使用`verifyToken`中间件
   - 保护用户数据，确保用户仅能访问自己的数据

2. **输入验证**:
   - 对所有用户输入进行验证
   - 使用参数预设值和类型检查增强健壮性
   - 在控制器层进行初步验证，服务层进行深度验证

3. **错误处理**:
   - 统一错误处理机制
   - 避免在生产环境暴露敏感错误信息
   - 使用标准错误代码和消息格式

### 5.2 性能优化

1. **Elasticsearch查询优化**:
   - 使用filter context减少算分开销
   - 适当使用字段提升(field boosting)提高相关性
   - 限制返回字段(_source过滤)减少数据传输

2. **Firebase优化**:
   - 使用Transaction确保数据一致性
   - 使用批量操作减少请求数
   - 优化数据结构和索引

3. **缓存策略**:
   - 考虑实现Redis缓存常用筛选器数据
   - 实现客户端缓存策略(ETag, Cache-Control)
   - 对静态分析结果进行缓存

## 6. 扩展指南

### 6.1 添加新API端点

1. **创建控制器函数**:
   ```javascript
   // controllers/new-feature-controller.js
   export async function newFeatureController(req, res, next) {
     try {
       // 实现逻辑...
       res.status(200).json(result);
     } catch (error) {
       next(error);
     }
   }
   ```

2. **添加服务函数**:
   ```javascript
   // services/relevant-service.js
   export async function performNewFeature(params) {
     try {
       // 实现业务逻辑...
       return result;
     } catch (error) {
       throw new Error('Failed to perform new feature');
     }
   }
   ```

3. **创建路由**:
   ```javascript
   // routes/new-feature.js
   import express from 'express';
   import { newFeatureController } from '../controllers/new-feature-controller.js';
   import { verifyToken } from '../middleware/auth.js';
   
   const router = express.Router();
   router.get('/', verifyToken, newFeatureController);
   export default router;
   ```

4. **注册路由**:
   ```javascript
   // routes/index.js
   import newFeatureRoutes from './new-feature.js';
   router.use('/new-feature', newFeatureRoutes);
   ```

### 6.2 修改积分规则

若要修改现有功能的积分成本:

1. **更新积分常量**:
   ```javascript
   // controllers/relevant-controller.js
   // 修改常量值
   const FEATURE_COST = 5; // 原来是2
   ```

2. **说明文档更新**:
   更新API文档，告知用户积分规则变更

对于添加新的积分相关功能，如积分充值、奖励等，需要扩展`services/credit.js`:

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

## 7. 故障排除与日志

### 7.1 常见问题

1. **身份验证失败**:
   - 检查Firebase配置
   - 验证Token格式和有效期
   - 查看日志中的具体错误代码

2. **积分交易问题**:
   - 检查Transaction执行是否完整
   - 验证用户文档是否存在
   - 查看积分余额记录

3. **Elasticsearch查询问题**:
   - 验证ES连接状态
   - 检查查询语法是否正确
   - 查看原始响应以获取错误详情

### 7.2 日志策略

项目使用分层日志策略:

1. **请求日志**: 记录HTTP请求基本信息
   ```javascript
   console.log(`[Request] ${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
   ```

2. **服务层日志**: 记录业务操作
   ```javascript
   console.log(`[Search Service] Performing search with filters: ${JSON.stringify(searchFilters)}`);
   ```

3. **错误日志**: 记录详细错误信息
   ```javascript
   console.error(`[Credit Service] Error for user ${userId}:`, error);
   ```

4. **交易日志**: 记录关键业务交易
   ```javascript
   console.log(`[Transaction] Deducting ${cost} credit(s) from user ${userId}. New balance: ${newCredits}`);
   ```

## 8. 开发工作流程

### 8.1 本地开发

1. **环境设置**:
   ```bash
   # 克隆存储库
   git clone <repository-url>
   cd boooook-backend
   
   # 安装依赖
   npm install
   
   # 创建.env文件
   cp .env.example .env
   # 编辑.env添加必要的环境变量
   ```

2. **启动开发服务器**:
   ```bash
   npm run dev
   ```

3. **测试API**:
   使用Postman或类似工具测试API端点

### 8.2 部署

1. **准备工作**:
   - 确认所有环境变量已配置
   - 执行测试确保功能正常

2. **构建**:
   ```bash
   npm run build
   ```

3. **部署选项**:
   - **Docker容器**:
     ```bash
     docker build -t boooook-backend .
     docker run -p 3000:3000 boooook-backend
     ```
   - **云服务**:
     - 支持Google Cloud Run, AWS Lambda, Azure Functions等

---

本文档提供了Boooook后端API的全面概述。开发人员应结合代码和注释理解完整实现细节。对于特定功能修改，请参考相应模块并遵循现有模式。
