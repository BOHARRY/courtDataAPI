# 法官語意AI助手 - 完整技術交接文檔

> **文檔版本**: 1.0  
> **最後更新**: 2025-10-02  
> **作者**: Augment AI Agent  
> **狀態**: 前端已完成,後端待開發

---

## 📋 目錄

1. [功能概述](#1-功能概述)
2. [前端實作總結 (已完成)](#2-前端實作總結-已完成)
3. [後端實作方案 (待開發)](#3-後端實作方案-待開發)
4. [數據邊界控制 (重要!)](#4-數據邊界控制-重要)
5. [安全性與限制](#5-安全性與限制)
6. [開發注意事項](#6-開發注意事項)
7. [測試策略](#7-測試策略)
8. [部署檢查清單](#8-部署檢查清單)
9. [未來擴展方向](#9-未來擴展方向)

---

## 1. 功能概述

### 1.1 核心功能

**法官語意AI助手**是一個基於 GPT-4 的智能對話系統,允許律師透過自然語言與法官判決數據進行深度互動。

**核心價值**:
- ✅ **突破傳統統計介面的限制**: 從「被動查看數據」升級為「主動探索洞察」
- ✅ **提供可操作的訴訟建議**: 不只是統計數字,而是具體的證據準備和策略建議
- ✅ **支援連續追問**: 符合律師的思考流程,可以逐步深入探索
- ✅ **嚴格的數據邊界控制**: 只回答基於判決書的問題,拒絕法官個人資訊查詢

### 1.2 與現有法官搜索頁面的整合

**整合方式**:
- 隱藏原有的「裁判傾向分析 (AI)」和「常用法律依據」兩個區塊
- 新增「智能法官分析助手」對話面板
- 保留「法官基本介紹」和「案件分布資訊」

**布局結構**:
```
┌─────────────────────────────────────────────────────────┐
│  左側固定面板 (300px)  │  主內容區域                    │
│  ├─ 返回按鈕           │  ┌───────────────────────────┐│
│  └─ 法官基本介紹       │  │ 案件類型切換按鈕           ││
│                        │  └───────────────────────────┘│
│                        │  ┌──────────┬──────────────────┐│
│                        │  │ 案件分布 │ 智能對話面板     ││
│                        │  │ 統計     │                  ││
│                        │  │          │ • 對話歷史       ││
│                        │  │ • 案件   │ • 建議問題       ││
│                        │  │   類型   │ • 輸入框         ││
│                        │  │   統計   │ • 警告提示       ││
│                        │  │          │                  ││
│                        │  │ • 代表性 │                  ││
│                        │  │   案例   │                  ││
│                        │  └──────────┴──────────────────┘│
└─────────────────────────────────────────────────────────┘
```

### 1.3 用戶使用場景

**場景 1: 案件類型探索**
```
律師: 「這位法官處理過哪些類型的離婚案件?」
AI: 「呂安樂法官共處理 15 件離婚案件,分類如下:
     1. 協議離婚 (6件, 40%)
     2. 裁判離婚 (9件, 60%)
        - 涉及子女監護權: 8件
        - 涉及財產分配: 7件
     您想深入了解哪一類案件?」
```

**場景 2: 判決傾向分析**
```
律師: 「在子女監護權爭議中,法官通常如何判決?」
AI: 「根據 8 件相關案例:
     • 共同監護: 62.5%
     • 單獨監護 (母親): 25%
     • 單獨監護 (父親): 12.5%
     
     法官重視的證據:
     1. 子女意願陳述 (100%)
     2. 雙方經濟能力 (87.5%)
     3. 家庭訪視報告 (75%)」
```

**場景 3: 證據策略建議**
```
律師: 「我應該準備哪些證據?」
AI: 「建議準備:
     ✅ 必備證據:
        - 子女照顧紀錄
        - 經濟能力證明
        - 居住環境說明
     
     ✅ 加分證據:
        - 子女意願陳述
        - 家庭訪視報告
     
     ❌ 避免錯誤:
        - 過度強調對方缺點
        - 提供過時證據 (>1年)」
```

---

## 2. 前端實作總結 (已完成)

### 2.1 已修改的文件清單

#### ✅ 新增文件

1. **`lawsowl/src/components/judge/JudgeConversationPanel.js`**
   - 智能對話面板主組件
   - 對話消息列表顯示
   - 用戶輸入處理
   - 建議問題快速選擇
   - 加載狀態動畫

2. **`lawsowl/src/components/judge/JudgeConversationPanel.css`**
   - 對話面板完整樣式
   - 漸變色標題設計
   - 消息氣泡樣式 (AI/用戶區分)
   - 滑入動畫效果
   - 響應式布局

#### ✅ 修改文件

1. **`lawsowl/src/components/SearchJudgeResults.js`**
   - 隱藏 `JudgeTendencyAnalysis` 組件 (第 11 行註解)
   - 隱藏 `JudgeLegalAnalysisCharts` 組件 (第 10 行註解)
   - 新增 `JudgeConversationPanel` 組件導入 (第 13 行)
   - 調整布局為兩欄結構 (第 573-621 行)

2. **`lawsowl/src/JudgeAnalysis.css`**
   - 新增 `.unified-content-three-column` 樣式 (第 394-396 行)
   - 新增 `.case-stats-pane-unified` 樣式 (第 399-404 行)
   - 新增 `.conversation-pane-unified` 樣式 (第 407-412 行)
   - 更新響應式設計 (第 779-800 行)

### 2.2 新增組件說明

#### JudgeConversationPanel 組件

**Props**:
```javascript
{
  judgeName: string,    // 法官姓名
  judgeData: object     // 法官完整數據 (用於未來擴展)
}
```

**State**:
```javascript
{
  messages: Array,      // 對話消息列表
  inputValue: string,   // 當前輸入值
  isLoading: boolean    // 加載狀態
}
```

**關鍵功能**:
1. **消息管理**: 維護對話歷史,支援用戶和 AI 消息
2. **建議問題**: 初次進入時顯示 4 個建議問題
3. **自動滾動**: 新消息自動滾動到底部
4. **Enter 發送**: 支援 Enter 鍵快速發送 (Shift+Enter 換行)
5. **數據邊界警告**: 顯示黃色警告框,提醒用戶查詢限制

**目前狀態**:
- ✅ UI 完整實作
- ✅ 本地狀態管理
- ⏳ API 調用邏輯 (佔位實作,待後端完成後整合)

### 2.3 布局調整說明

**隱藏的組件** (保留代碼,未來可恢復):
```javascript
// 第 598-618 行已註解
/*
<div className="detailed-analysis-pane-unified">
  <JudgeTendencyAnalysis ... />
  <JudgeLegalAnalysisCharts ... />
</div>
*/
```

**新增的對話面板**:
```javascript
// 第 593-597 行
<div className="conversation-pane-unified">
  <JudgeConversationPanel 
    judgeName={displayJudgeData.name}
    judgeData={displayJudgeData}
  />
</div>
```

### 2.4 前端代碼片段

#### 消息發送邏輯 (目前為佔位實作)

```javascript
// JudgeConversationPanel.js 第 48-70 行
const handleSendMessage = async () => {
  if (!inputValue.trim() || isLoading) return;

  const userMessage = {
    id: Date.now(),
    type: 'user',
    content: inputValue.trim(),
    timestamp: new Date()
  };

  setMessages(prev => [...prev, userMessage]);
  setInputValue('');
  setIsLoading(true);

  // TODO: 實際 API 調用將在後續實作
  setTimeout(() => {
    const aiMessage = {
      id: Date.now() + 1,
      type: 'ai',
      content: '此功能正在開發中,即將為您提供詳細的法官分析...',
      timestamp: new Date()
    };
    setMessages(prev => [...prev, aiMessage]);
    setIsLoading(false);
  }, 1000);
};
```

#### 建議問題點擊處理

```javascript
// JudgeConversationPanel.js 第 73-76 行
const handleSuggestedQuestionClick = (question) => {
  setInputValue(question);
  inputRef.current?.focus();
};
```

---

## 3. 後端實作方案 (待開發)

### 3.1 技術架構設計

#### 整體架構圖

```
┌─────────────────────────────────────────────────────────┐
│                    前端 (React)                          │
│  JudgeConversationPanel.js                              │
│  ├─ 用戶輸入                                            │
│  ├─ 對話歷史                                            │
│  └─ 建議問題                                            │
└────────────────┬────────────────────────────────────────┘
                 │ POST /api/judges/:judgeName/chat
                 ↓
┌─────────────────────────────────────────────────────────┐
│              後端 API 層 (Express)                       │
│  routes/judges.js                                       │
│  ├─ 身份驗證 (Firebase Auth)                           │
│  ├─ Rate Limiting                                       │
│  └─ 輸入驗證                                            │
└────────────────┬────────────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────────────┐
│           服務層 (Business Logic)                        │
│  services/judgeConversationService.js                   │
│  ├─ 1. 分析用戶意圖 (GPT-4)                            │
│  ├─ 2. 驗證數據邊界                                     │
│  ├─ 3. 檢索相關數據 (Elasticsearch)                    │
│  ├─ 4. 生成 AI 回答 (GPT-4)                            │
│  └─ 5. 格式化回應                                       │
└────────────────┬────────────────────────────────────────┘
                 │
      ┌──────────┴──────────┐
      ↓                     ↓
┌──────────────┐    ┌──────────────────┐
│ OpenAI API   │    │ Elasticsearch    │
│ (GPT-4)      │    │ (judgement index)│
│              │    │                  │
│ • 意圖分析   │    │ • 案件統計       │
│ • 回答生成   │    │ • 案例檢索       │
└──────────────┘    │ • 聚合分析       │
                    └──────────────────┘
```

#### 檔案結構

```
courtDataAPI/
├── routes/
│   └── judges.js                     (修改: 新增 /chat 端點)
├── services/
│   └── judgeConversationService.js   (新增: 核心對話服務)
├── utils/
│   ├── judgeQueryAnalyzer.js         (新增: 意圖分析)
│   ├── judgeDataRetriever.js         (新增: 數據檢索)
│   └── responseFormatter.js          (新增: 回應格式化)
├── middleware/
│   └── chatRateLimiter.js            (新增: 速率限制)
└── tests/
    └── judgeConversation.test.js     (新增: 單元測試)
```

### 3.2 API 端點規格

#### POST /api/judges/:judgeName/chat

**請求格式**:
```json
{
  "message": "這位法官在離婚案件中如何處理子女監護權?",
  "conversationHistory": [
    {
      "role": "user",
      "content": "這位法官處理過哪些類型的案件?"
    },
    {
      "role": "assistant",
      "content": "根據數據庫記錄,呂安樂法官共處理過..."
    }
  ]
}
```

**成功回應** (200 OK):
```json
{
  "success": true,
  "data": {
    "message": "根據分析 8 件相關案例,呂安樂法官在子女監護權爭議中...",
    "sources": [
      {
        "type": "case",
        "caseId": "TPHV,111,家上,123",
        "relevance": "high",
        "summary": "判決共同監護,強調雙方協商"
      },
      {
        "type": "statistics",
        "metric": "custody_decision_rate",
        "value": 0.625,
        "sampleSize": 8,
        "description": "共同監護比例"
      }
    ],
    "dataRange": {
      "startDate": "2020-01-01",
      "endDate": "2024-12-31",
      "totalCases": 8
    },
    "confidence": "high"
  }
}
```

**數據邊界警告** (200 OK):
```json
{
  "success": true,
  "data": {
    "message": "抱歉,我無法回答關於法官個人資訊的問題...",
    "type": "boundary_warning",
    "suggestedQuestions": [
      "這位法官處理過哪些類型的案件?",
      "在民事案件中,法官的判決傾向如何?"
    ]
  }
}
```

**錯誤回應** (400 Bad Request):
```json
{
  "success": false,
  "error": "Invalid message format",
  "code": "INVALID_INPUT"
}
```

**錯誤回應** (429 Too Many Requests):
```json
{
  "success": false,
  "error": "請求過於頻繁,請稍後再試",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 900
}
```

**錯誤回應** (500 Internal Server Error):
```json
{
  "success": false,
  "error": "處理您的問題時發生錯誤,請稍後再試",
  "code": "INTERNAL_ERROR"
}
```

### 3.3 核心服務類別完整代碼

#### 3.3.1 judgeConversationService.js (核心對話服務)

```javascript
// services/judgeConversationService.js

const { OpenAI } = require('openai');
const judgeDataRetriever = require('../utils/judgeDataRetriever');
const responseFormatter = require('../utils/responseFormatter');

class JudgeConversationService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  /**
   * 處理法官對話請求
   * @param {string} judgeName - 法官姓名
   * @param {string} userMessage - 用戶問題
   * @param {Array} conversationHistory - 對話歷史
   * @returns {Promise<Object>} 格式化的回應
   */
  async handleConversation(judgeName, userMessage, conversationHistory = []) {
    try {
      console.log(`[JudgeConversation] 處理法官 ${judgeName} 的問題: ${userMessage}`);

      // 1. 分析用戶意圖
      const intent = await this.analyzeUserIntent(userMessage, conversationHistory);
      console.log('[JudgeConversation] 意圖分析結果:', JSON.stringify(intent, null, 2));

      // 2. 驗證問題是否在數據邊界內
      const validation = this.validateQuery(intent, userMessage);
      if (!validation.isValid) {
        console.log(`[JudgeConversation] 數據邊界警告: ${validation.reason}`);
        return this.createBoundaryResponse(validation.reason);
      }

      // 3. 從 Elasticsearch 檢索相關數據
      const data = await judgeDataRetriever.retrieveData(judgeName, intent);
      console.log(`[JudgeConversation] 檢索到 ${data.totalCases || 0} 件相關案例`);

      // 4. 檢查數據充分性
      if (data.totalCases === 0) {
        return {
          message: `抱歉,在資料庫中找不到 ${judgeName} 法官符合您查詢條件的案件。請嘗試調整查詢條件或詢問其他問題。`,
          type: 'no_data',
          suggestedQuestions: [
            '這位法官處理過哪些類型的案件?',
            '法官最近三年的案件數量?'
          ]
        };
      }

      // 5. 使用 GPT-4 生成回答
      const response = await this.generateResponse(
        userMessage,
        data,
        conversationHistory,
        judgeName
      );

      // 6. 格式化回應
      return responseFormatter.format(response, data, intent);

    } catch (error) {
      console.error('[JudgeConversation] 錯誤:', error);
      throw error;
    }
  }

  /**
   * 分析用戶意圖
   * @param {string} userMessage - 用戶問題
   * @param {Array} conversationHistory - 對話歷史
   * @returns {Promise<Object>} 意圖分析結果
   */
  async analyzeUserIntent(userMessage, conversationHistory) {
    const systemPrompt = `你是一個法官數據查詢意圖分析器。
分析用戶問題,提取以下資訊:

1. queryType (問題類型):
   - "case_statistics": 案件統計 (數量、類型分布等)
   - "case_examples": 案例檢索 (要求具體案例)
   - "verdict_analysis": 判決結果分析 (勝訴率、判決傾向)
   - "amount_analysis": 金額分析 (民事案件的請求金額、判准金額)
   - "evidence_preference": 證據偏好 (法官重視的證據類型)
   - "legal_basis": 法律依據分析 (常用法條)
   - "time_trend": 時間趨勢 (判決傾向隨時間變化)
   - "general_overview": 一般概覽

2. caseType (案件類型):
   - "civil": 民事
   - "criminal": 刑事
   - "labor": 勞動
   - "administrative": 行政
   - "all": 全部

3. specificTopic (具體主題):
   - 例如: "離婚", "子女監護權", "財產分配", "侵權", "契約"等
   - 如果無法判斷,設為 null

4. timeRange (時間範圍):
   - 如果用戶提及時間,提取 { start: "YYYY-MM-DD", end: "YYYY-MM-DD" }
   - 如果無提及,設為 null

5. filters (其他篩選條件):
   - 例如: { "hasLawyer": true, "verdictType": "原告勝訴" }
   - 如果無,設為 {}

**重要**: 只返回 JSON 格式,不要其他文字。

範例輸出:
{
  "queryType": "verdict_analysis",
  "caseType": "civil",
  "specificTopic": "離婚",
  "timeRange": null,
  "filters": {}
}`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        ...conversationHistory.slice(-3), // 只保留最近3輪對話
        { role: 'user', content: userMessage }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });

    return JSON.parse(response.choices[0].message.content);
  }

  /**
   * 驗證問題是否在數據邊界內
   * @param {Object} intent - 意圖分析結果
   * @param {string} userMessage - 原始用戶問題
   * @returns {Object} 驗證結果
   */
  validateQuery(intent, userMessage) {
    // 檢查是否詢問法官個人資訊
    const personalInfoKeywords = [
      '年齡', '婚姻', '學歷', '家庭', '單身', '結婚', '配偶',
      '子女', '出生', '畢業', '學校', '住址', '電話', '信箱'
    ];

    const lowerMessage = userMessage.toLowerCase();
    if (personalInfoKeywords.some(kw => lowerMessage.includes(kw))) {
      return {
        isValid: false,
        reason: 'personal_info'
      };
    }

    // 檢查時間範圍是否超出數據庫範圍
    if (intent.timeRange) {
      const startYear = new Date(intent.timeRange.start).getFullYear();
      const endYear = new Date(intent.timeRange.end).getFullYear();

      // 假設數據庫只有 2020 年後的數據
      if (startYear < 2020 || endYear < 2020) {
        return {
          isValid: false,
          reason: 'out_of_range'
        };
      }
    }

    // 檢查是否詢問未來預測
    const futureKeywords = ['未來', '將會', '會不會', '預測', '預計'];
    if (futureKeywords.some(kw => lowerMessage.includes(kw))) {
      return {
        isValid: false,
        reason: 'future_prediction'
      };
    }

    return { isValid: true };
  }

  /**
   * 創建邊界警告回應
   * @param {string} reason - 警告原因
   * @returns {Object} 警告回應
   */
  createBoundaryResponse(reason) {
    const responses = {
      personal_info: {
        message: '抱歉,我無法回答關於法官個人資訊的問題。\n\n我只能提供基於公開判決書的案件分析數據,例如:\n\n• 法官處理過的案件類型和數量\n• 判決結果統計\n• 代表性案例分析\n• 法律依據使用情況\n• 民事案件金額統計\n\n請問您想了解哪方面的判決數據?',
        type: 'boundary_warning',
        suggestedQuestions: [
          '這位法官處理過哪些類型的案件?',
          '在民事案件中,法官的判決傾向如何?',
          '法官最重視哪些證據?',
          '有沒有代表性的判決案例?'
        ]
      },
      out_of_range: {
        message: '抱歉,我們的數據庫目前只包含 2020 年至今的判決數據。\n\n如果您想了解這位法官近年的判決傾向,我可以為您分析 2020 年後的案件。',
        type: 'boundary_warning',
        suggestedQuestions: [
          '這位法官 2020 年後處理過哪些案件?',
          '最近三年的判決傾向如何?'
        ]
      },
      future_prediction: {
        message: '抱歉,我無法預測法官未來的判決結果。\n\n我只能基於歷史判決數據提供趨勢分析和統計資訊,幫助您了解法官過去的判決傾向。',
        type: 'boundary_warning',
        suggestedQuestions: [
          '這位法官過去的判決傾向如何?',
          '在類似案件中,法官通常如何判決?'
        ]
      }
    };

    return responses[reason] || {
      message: '抱歉,這個問題超出了我能回答的範圍。請嘗試詢問與判決數據相關的問題。',
      type: 'boundary_warning',
      suggestedQuestions: [
        '這位法官處理過哪些類型的案件?',
        '法官的判決傾向如何?'
      ]
    };
  }

  /**
   * 使用 GPT-4 生成回答
   * @param {string} userMessage - 用戶問題
   * @param {Object} data - 檢索到的數據
   * @param {Array} conversationHistory - 對話歷史
   * @param {string} judgeName - 法官姓名
   * @returns {Promise<string>} AI 生成的回答
   */
  async generateResponse(userMessage, data, conversationHistory, judgeName) {
    const systemPrompt = `你是一個專業的法官判決數據分析助手。

**重要規則**:
1. ✅ 只能基於提供的數據回答問題,絕對不可以編造數據
2. ✅ 每個統計數字都必須標註樣本數量
3. ✅ 如果數據不足 (樣本數 < 5),必須警告用戶「數據量較少,僅供參考」
4. ✅ 引用具體案例時,必須提供案件 ID
5. ✅ 使用專業但易懂的語言
6. ✅ 提供可操作的洞察,而非單純的數據羅列
7. ✅ 如果數據中沒有相關資訊,明確告知用戶

**回答格式**:
1. **直接回答** (1-2 句話總結)
2. **詳細數據分析** (分點列出,使用 Markdown 格式)
3. **代表性案例** (如果相關且數據中有提供)
4. **實務建議** (如果適用)

**數據來源**:
${JSON.stringify(data, null, 2)}

**法官姓名**: ${judgeName}`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        ...conversationHistory.slice(-5), // 保留最近5輪對話
        { role: 'user', content: userMessage }
      ],
      temperature: 0.7,
      max_tokens: 1500
    });

    return response.choices[0].message.content;
  }
}

module.exports = new JudgeConversationService();
```

#### 3.3.2 judgeDataRetriever.js (Elasticsearch 數據檢索)

```javascript
// utils/judgeDataRetriever.js

const { esClient } = require('../config/elasticsearch');

class JudgeDataRetriever {
  /**
   * 根據意圖檢索相關數據
   * @param {string} judgeName - 法官姓名
   * @param {Object} intent - 意圖分析結果
   * @returns {Promise<Object>} 檢索到的數據
   */
  async retrieveData(judgeName, intent) {
    const { queryType, caseType, specificTopic, timeRange, filters } = intent;

    console.log(`[DataRetriever] 檢索類型: ${queryType}, 案件類型: ${caseType}`);

    switch (queryType) {
      case 'case_statistics':
        return await this.getCaseStatistics(judgeName, caseType, timeRange);

      case 'case_examples':
        return await this.getCaseExamples(judgeName, caseType, specificTopic, filters);

      case 'verdict_analysis':
        return await this.getVerdictAnalysis(judgeName, caseType, specificTopic, timeRange);

      case 'amount_analysis':
        return await this.getAmountAnalysis(judgeName, timeRange);

      case 'evidence_preference':
        return await this.getEvidencePreference(judgeName, caseType, specificTopic);

      case 'legal_basis':
        return await this.getLegalBasisAnalysis(judgeName, caseType);

      case 'time_trend':
        return await this.getTimeTrend(judgeName, caseType, specificTopic);

      default:
        return await this.getGeneralOverview(judgeName);
    }
  }

  /**
   * 獲取案件統計數據
   * @param {string} judgeName - 法官姓名
   * @param {string} caseType - 案件類型
   * @param {Object} timeRange - 時間範圍
   * @returns {Promise<Object>} 統計數據
   */
  async getCaseStatistics(judgeName, caseType = 'all', timeRange = null) {
    const query = {
      bool: {
        must: [
          { match: { 'judges.keyword': judgeName } }
        ]
      }
    };

    // 添加案件類型篩選
    if (caseType !== 'all') {
      query.bool.must.push({ match: { 'stage0_case_type': caseType } });
    }

    // 添加時間範圍篩選
    if (timeRange) {
      query.bool.must.push({
        range: {
          JDATE: {
            gte: timeRange.start,
            lte: timeRange.end
          }
        }
      });
    }

    try {
      const response = await esClient.search({
        index: 'judgement',
        body: {
          query,
          size: 0, // 只要聚合結果
          aggs: {
            // 案件類型分布
            case_type_distribution: {
              terms: {
                field: 'stage0_case_type.keyword',
                size: 10
              }
            },
            // 判決結果分布
            verdict_distribution: {
              terms: {
                field: 'verdict_type.keyword',
                size: 20
              }
            },
            // 年度趨勢
            yearly_trend: {
              date_histogram: {
                field: 'JDATE',
                calendar_interval: 'year'
              }
            },
            // 民事案件金額統計
            civil_amount_stats: {
              filter: { term: { 'stage0_case_type': 'civil' } },
              aggs: {
                avg_claim: {
                  avg: { field: 'key_metrics.civil_metrics.claim_amount' }
                },
                avg_granted: {
                  avg: { field: 'key_metrics.civil_metrics.granted_amount' }
                },
                total_with_amount: {
                  value_count: { field: 'key_metrics.civil_metrics.claim_amount' }
                }
              }
            }
          }
        }
      });

      return {
        totalCases: response.hits.total.value,
        caseTypeDistribution: response.aggregations.case_type_distribution.buckets,
        verdictDistribution: response.aggregations.verdict_distribution.buckets,
        yearlyTrend: response.aggregations.yearly_trend.buckets,
        civilAmountStats: response.aggregations.civil_amount_stats,
        queryType: 'case_statistics'
      };
    } catch (error) {
      console.error('[DataRetriever] getCaseStatistics 錯誤:', error);
      throw error;
    }
  }

  /**
   * 獲取代表性案例
   * @param {string} judgeName - 法官姓名
   * @param {string} caseType - 案件類型
   * @param {string} specificTopic - 具體主題
   * @param {Object} filters - 其他篩選條件
   * @param {number} limit - 返回數量限制
   * @returns {Promise<Object>} 案例數據
   */
  async getCaseExamples(judgeName, caseType, specificTopic, filters, limit = 5) {
    const query = {
      bool: {
        must: [
          { match: { 'judges.keyword': judgeName } }
        ]
      }
    };

    if (caseType !== 'all') {
      query.bool.must.push({ match: { 'stage0_case_type': caseType } });
    }

    // 如果有具體主題,使用語意搜索
    if (specificTopic) {
      query.bool.must.push({
        multi_match: {
          query: specificTopic,
          fields: ['JTITLE^3', 'summary_ai^2', 'main_reasons_ai'],
          fuzziness: 'AUTO'
        }
      });
    }

    try {
      const response = await esClient.search({
        index: 'judgement',
        body: {
          query,
          size: limit,
          _source: [
            'JID', 'JYEAR', 'JCASE', 'JNO', 'JDATE', 'JTITLE',
            'verdict_type', 'summary_ai', 'main_reasons_ai',
            'key_metrics', 'SCORE', 'stage0_case_type'
          ],
          sort: [
            { SCORE: { order: 'desc' } }, // 優先顯示高分案件
            { 'JDATE': { order: 'desc' } } // 其次按時間排序
          ]
        }
      });

      return {
        totalCases: response.hits.total.value,
        cases: response.hits.hits.map(hit => hit._source),
        queryType: 'case_examples'
      };
    } catch (error) {
      console.error('[DataRetriever] getCaseExamples 錯誤:', error);
      throw error;
    }
  }

  /**
   * 獲取判決結果分析
   * @param {string} judgeName - 法官姓名
   * @param {string} caseType - 案件類型
   * @param {string} specificTopic - 具體主題
   * @param {Object} timeRange - 時間範圍
   * @returns {Promise<Object>} 判決分析數據
   */
  async getVerdictAnalysis(judgeName, caseType, specificTopic, timeRange) {
    const query = {
      bool: {
        must: [
          { match: { 'judges.keyword': judgeName } }
        ]
      }
    };

    if (caseType !== 'all') {
      query.bool.must.push({ match: { 'stage0_case_type': caseType } });
    }

    if (specificTopic) {
      query.bool.must.push({
        multi_match: {
          query: specificTopic,
          fields: ['JTITLE', 'summary_ai'],
          fuzziness: 'AUTO'
        }
      });
    }

    if (timeRange) {
      query.bool.must.push({
        range: {
          JDATE: {
            gte: timeRange.start,
            lte: timeRange.end
          }
        }
      });
    }

    try {
      const response = await esClient.search({
        index: 'judgement',
        body: {
          query,
          size: 0,
          aggs: {
            verdict_types: {
              terms: {
                field: 'verdict_type.keyword',
                size: 20
              }
            },
            disposition_class: {
              terms: {
                field: 'disposition.class.keyword',
                size: 10
              }
            }
          }
        }
      });

      return {
        totalCases: response.hits.total.value,
        verdictTypes: response.aggregations.verdict_types.buckets,
        dispositionClass: response.aggregations.disposition_class.buckets,
        queryType: 'verdict_analysis'
      };
    } catch (error) {
      console.error('[DataRetriever] getVerdictAnalysis 錯誤:', error);
      throw error;
    }
  }

  /**
   * 獲取民事案件金額分析
   * @param {string} judgeName - 法官姓名
   * @param {Object} timeRange - 時間範圍
   * @returns {Promise<Object>} 金額分析數據
   */
  async getAmountAnalysis(judgeName, timeRange) {
    const query = {
      bool: {
        must: [
          { match: { 'judges.keyword': judgeName } },
          { term: { 'stage0_case_type': 'civil' } },
          { exists: { field: 'key_metrics.civil_metrics.claim_amount' } }
        ]
      }
    };

    if (timeRange) {
      query.bool.must.push({
        range: {
          JDATE: {
            gte: timeRange.start,
            lte: timeRange.end
          }
        }
      });
    }

    try {
      const response = await esClient.search({
        index: 'judgement',
        body: {
          query,
          size: 0,
          aggs: {
            claim_amount_stats: {
              stats: { field: 'key_metrics.civil_metrics.claim_amount' }
            },
            granted_amount_stats: {
              stats: { field: 'key_metrics.civil_metrics.granted_amount' }
            },
            amount_ranges: {
              range: {
                field: 'key_metrics.civil_metrics.claim_amount',
                ranges: [
                  { to: 100000, key: '10萬以下' },
                  { from: 100000, to: 500000, key: '10-50萬' },
                  { from: 500000, to: 1000000, key: '50-100萬' },
                  { from: 1000000, to: 5000000, key: '100-500萬' },
                  { from: 5000000, key: '500萬以上' }
                ]
              }
            }
          }
        }
      });

      return {
        totalCases: response.hits.total.value,
        claimAmountStats: response.aggregations.claim_amount_stats,
        grantedAmountStats: response.aggregations.granted_amount_stats,
        amountRanges: response.aggregations.amount_ranges.buckets,
        queryType: 'amount_analysis'
      };
    } catch (error) {
      console.error('[DataRetriever] getAmountAnalysis 錯誤:', error);
      throw error;
    }
  }

  /**
   * 獲取法律依據分析
   * @param {string} judgeName - 法官姓名
   * @param {string} caseType - 案件類型
   * @returns {Promise<Object>} 法律依據數據
   */
  async getLegalBasisAnalysis(judgeName, caseType) {
    const query = {
      bool: {
        must: [
          { match: { 'judges.keyword': judgeName } },
          { exists: { field: 'legal_claim_basis' } }
        ]
      }
    };

    if (caseType !== 'all') {
      query.bool.must.push({ match: { 'stage0_case_type': caseType } });
    }

    try {
      const response = await esClient.search({
        index: 'judgement',
        body: {
          query,
          size: 100,
          _source: ['JID', 'legal_claim_basis', 'JTITLE']
        }
      });

      // 統計法律依據出現頻率
      const legalBasisFrequency = {};
      response.hits.hits.forEach(hit => {
        const legalBasis = hit._source.legal_claim_basis;
        if (Array.isArray(legalBasis)) {
          legalBasis.forEach(law => {
            legalBasisFrequency[law] = (legalBasisFrequency[law] || 0) + 1;
          });
        }
      });

      // 轉換為陣列並排序
      const sortedLegalBasis = Object.entries(legalBasisFrequency)
        .map(([law, count]) => ({ law, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);

      return {
        totalCases: response.hits.total.value,
        legalBasisFrequency: sortedLegalBasis,
        queryType: 'legal_basis'
      };
    } catch (error) {
      console.error('[DataRetriever] getLegalBasisAnalysis 錯誤:', error);
      throw error;
    }
  }

  /**
   * 獲取一般概覽
   * @param {string} judgeName - 法官姓名
   * @returns {Promise<Object>} 概覽數據
   */
  async getGeneralOverview(judgeName) {
    return await this.getCaseStatistics(judgeName, 'all', null);
  }
}

module.exports = new JudgeDataRetriever();
```


