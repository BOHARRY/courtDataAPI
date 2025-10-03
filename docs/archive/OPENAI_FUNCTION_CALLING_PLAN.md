# 🎯 OpenAI Function Calling 實施計畫
## **目標: 打造生產級法官知識通 AI Agent**

---

## **📊 現狀分析**

### **一、資料庫現狀 (Elasticsearch)**

#### **判決書數量限制**
- ⚠️ **只有 2 個月的判決書數據** (約 7000+ 筆)
- ⚠️ 時間範圍: 2025-06 ~ 2025-07
- ⚠️ 無法進行長期趨勢分析

#### **可用的豐富欄位** ✅

**基礎欄位**:
- `JID` (判決字號), `JDATE` (判決日期), `JTITLE` (案由)
- `judges` (法官), `verdict_type` (判決結果), `court` (法院)
- `case_type` (案件類型: civil, criminal, administrative)

**AI 分析欄位** (非常豐富!):
- `summary_ai` (AI 摘要)
- `main_reasons_ai` (主要理由)
- `legal_issues` (法律爭議點, nested)
- `citation_analysis` (引用法條分析, nested)
- `citations` (引用法條列表)

**當事人欄位**:
- `plaintiff` (原告), `defendant` (被告)
- `lawyers` (原告律師), `lawyersdef` (被告律師)
- `appellant` (上訴人), `appellee` (被上訴人)

**金額欄位** (民事案件):
- `key_metrics.civil_metrics.claim_amount` (請求金額)
- `key_metrics.civil_metrics.granted_amount` (判賠金額)

**立場分析欄位** (超級豐富!):
- `position_based_analysis.plaintiff_perspective` (原告視角)
- `position_based_analysis.defendant_perspective` (被告視角)
- `position_based_analysis.agency_perspective` (機關視角)
- `position_based_analysis.citizen_perspective` (人民視角)

**向量欄位** (支持語意搜尋):
- `text_embedding` (全文向量)
- `legal_issues_embedding` (法律爭議向量)
- `main_reasons_ai_vector` (主要理由向量)

---

### **二、現有 MCP Server 工具**

**當前工具** (3 個):
1. ✅ `search_judgments` - 搜尋判決書
2. ✅ `analyze_judge` - 分析法官
3. ✅ `get_lawyer_history` - 律師歷史案件 (前端未整合)

**工具限制**:
- ❌ 無法組合調用
- ❌ 無法進行統計計算
- ❌ 無法進行比較分析
- ❌ 無法提取特定欄位

---

### **三、現有後端 API 路由**

**已有路由**:
- `/api/mcp/parse-intent` - 意圖識別 (固定模版)
- `/api/mcp/judge-insights` - 法官建議生成
- `/api/judges/:judgeName` - 法官分析 (扣積分)
- `/api/search` - 判決書搜尋 (扣積分)

**問題**:
- ❌ 硬編碼的意圖識別
- ❌ 無法動態組合工具
- ❌ 每個功能都是獨立的 API

---

## **🎯 實施計畫**

### **階段 1: 基礎架構改造 (Week 1-2)**

#### **1.1 新增 AI Agent 路由**

**文件**: `routes/ai-agent.js` (新建)

**端點**:
```
POST /api/ai-agent/chat
```

**功能**:
- 接收用戶問題
- 使用 OpenAI Function Calling 決策
- 調用 MCP 工具或本地函數
- 返回自然語言回答

**積分消耗**:
- 每次對話消耗 **5 積分** (包含多輪 GPT-4 調用)

---

#### **1.2 擴展 MCP Server 工具**

**新增工具** (優先級排序):

**🔴 P0 - 核心工具 (必須)**:
1. `calculate_statistics` - 統計計算
   - 勝訴率、敗訴率
   - 案由分布
   - 判決結果分布

2. `get_citation_analysis` - 引用法條分析
   - 最常引用的法條
   - 法條引用頻率
   - 法條引用上下文

3. `get_case_details` - 獲取案件詳情
   - 返回完整的判決書欄位
   - 支持批量查詢

**🟡 P1 - 重要工具 (第二週)**:
4. `compare_judges` - 比較法官
   - 多位法官的判決傾向對比
   - 勝訴率對比
   - 案由偏好對比

5. `analyze_amount_trends` - 金額分析
   - 請求金額 vs 判賠金額
   - 勝訴金額統計
   - 金額範圍分布

6. `get_perspective_analysis` - 立場分析
   - 原告/被告視角
   - 成功策略提取
   - 失敗策略警示

**🟢 P2 - 增強工具 (第三週)**:
7. `semantic_search` - 語意搜尋
   - 使用向量欄位進行相似案件搜尋
   - 支持法律爭議點相似度搜尋

8. `get_lawyer_performance` - 律師表現分析
   - 律師勝訴率
   - 律師擅長案由
   - 律師 vs 法官配對分析

---

#### **1.3 本地計算函數**

**不需要調用 MCP 的函數**:

1. `calculate_verdict_rate` - 計算勝訴率
   ```javascript
   function calculateVerdictRate(judgments, verdictType) {
     const total = judgments.length;
     const matches = judgments.filter(j => j.verdict_type === verdictType).length;
     return {
       total,
       matches,
       rate: (matches / total * 100).toFixed(1) + "%"
     };
   }
   ```

2. `extract_top_citations` - 提取 TOP 法條
   ```javascript
   function extractTopCitations(judgments, topN = 10) {
     const citationCounts = {};
     judgments.forEach(j => {
       (j.citations || []).forEach(citation => {
         citationCounts[citation] = (citationCounts[citation] || 0) + 1;
       });
     });
     return Object.entries(citationCounts)
       .sort((a, b) => b[1] - a[1])
       .slice(0, topN);
   }
   ```

3. `compare_verdict_distributions` - 比較判決分布
   ```javascript
   function compareVerdictDistributions(judge1Data, judge2Data) {
     // 比較兩位法官的判決結果分布
   }
   ```

---

### **階段 2: OpenAI Function Calling 實作 (Week 2-3)**

#### **2.1 工具定義**

**文件**: `utils/ai-agent-tools.js` (新建)

**範例**:
```javascript
export const AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "search_judgments_by_judge",
      description: "搜尋特定法官的判決書,支持按案由、判決結果、時間範圍篩選",
      parameters: {
        type: "object",
        properties: {
          judge_name: {
            type: "string",
            description: "法官姓名,必填"
          },
          case_type: {
            type: "string",
            description: "案由關鍵字,如: 交通、侵權、債務、詐欺"
          },
          verdict_type: {
            type: "string",
            description: "判決結果,如: 原告勝訴、原告敗訴、部分勝訴部分敗訴",
            enum: ["原告勝訴", "原告敗訴", "部分勝訴部分敗訴", "上訴駁回", "原判決廢棄改判"]
          },
          limit: {
            type: "number",
            description: "返回數量,預設 50,最大 100",
            default: 50
          }
        },
        required: ["judge_name"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "calculate_verdict_statistics",
      description: "計算判決統計數據,包括勝訴率、案由分布、判決結果分布",
      parameters: {
        type: "object",
        properties: {
          judgments: {
            type: "array",
            description: "判決書列表 (從 search_judgments_by_judge 獲取)"
          },
          analysis_type: {
            type: "string",
            description: "分析類型",
            enum: ["verdict_rate", "case_distribution", "verdict_distribution", "all"]
          },
          verdict_type: {
            type: "string",
            description: "要計算的判決結果類型 (僅當 analysis_type 為 verdict_rate 時需要)"
          }
        },
        required: ["judgments", "analysis_type"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_citation_statistics",
      description: "分析判決書中引用的法條,返回最常引用的法條及其頻率",
      parameters: {
        type: "object",
        properties: {
          judgments: {
            type: "array",
            description: "判決書列表"
          },
          top_n: {
            type: "number",
            description: "返回 TOP N 法條,預設 10",
            default: 10
          }
        },
        required: ["judgments"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "compare_judges",
      description: "比較多位法官的判決傾向,包括勝訴率、案由偏好等",
      parameters: {
        type: "object",
        properties: {
          judge_names: {
            type: "array",
            items: { type: "string" },
            description: "法官姓名列表,最多 5 位"
          },
          comparison_metrics: {
            type: "array",
            items: { 
              type: "string",
              enum: ["verdict_rate", "case_distribution", "citation_preference"]
            },
            description: "比較指標"
          }
        },
        required: ["judge_names"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "analyze_amount_trends",
      description: "分析民事案件的金額趨勢,包括請求金額 vs 判賠金額",
      parameters: {
        type: "object",
        properties: {
          judge_name: {
            type: "string",
            description: "法官姓名"
          },
          case_type: {
            type: "string",
            description: "案由,如: 損害賠償、債務"
          }
        },
        required: ["judge_name"]
      }
    }
  }
];
```

---

#### **2.2 AI Agent 核心邏輯**

**文件**: `controllers/ai-agent-controller.js` (新建)

**核心流程**:
```javascript
export async function chatWithAgent(req, res) {
  const { question, conversationHistory = [] } = req.body;
  const userId = req.user.id;
  
  // 步驟 1: 構建對話歷史
  const messages = [
    {
      role: "system",
      content: SYSTEM_PROMPT
    },
    ...conversationHistory,
    {
      role: "user",
      content: question
    }
  ];
  
  // 步驟 2: 第一次調用 OpenAI
  let response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: messages,
    tools: AGENT_TOOLS,
    tool_choice: "auto"
  });
  
  // 步驟 3: 循環處理工具調用
  let iterationCount = 0;
  const MAX_ITERATIONS = 10; // 防止無限循環
  
  while (response.choices[0].finish_reason === "tool_calls" && iterationCount < MAX_ITERATIONS) {
    const toolCalls = response.choices[0].message.tool_calls;
    messages.push(response.choices[0].message);
    
    // 執行每個工具調用
    for (const toolCall of toolCalls) {
      const functionName = toolCall.function.name;
      const functionArgs = JSON.parse(toolCall.function.arguments);
      
      // 執行函數
      const result = await executeFunction(functionName, functionArgs);
      
      // 將結果返回給 GPT
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result)
      });
    }
    
    // 再次調用 OpenAI
    response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messages,
      tools: AGENT_TOOLS,
      tool_choice: "auto"
    });
    
    iterationCount++;
  }
  
  // 步驟 4: 返回最終回答
  const finalAnswer = response.choices[0].message.content;
  
  res.json({
    answer: finalAnswer,
    conversationHistory: messages,
    toolCallsCount: iterationCount
  });
}
```

---

### **階段 3: 前端整合 (Week 3-4)**

#### **3.1 新增 AI Agent Hook**

**文件**: `src/hooks/useAIAgent.js` (新建)

**功能**:
- 管理對話歷史
- 調用 AI Agent API
- 處理流式回應 (可選)

---

#### **3.2 更新對話組件**

**文件**: `src/components/mcp/JudgeMCPChat.js`

**改動**:
- 移除硬編碼的意圖識別
- 直接調用 AI Agent API
- 顯示工具調用過程 (可選)

---

### **階段 4: 測試與優化 (Week 4-5)**

#### **4.1 測試用例**

**簡單查詢**:
- "王婉如法官有多少筆判決?"
- "列出原告勝訴的案件"

**統計分析**:
- "王婉如法官的原告勝訴率是多少?"
- "交通案件的勝訴率如何?"

**比較分析**:
- "比較王婉如和陳玟珍兩位法官的判決傾向"

**深度分析**:
- "王婉如法官在原告勝訴的案件中,最常引用哪些法條?"
- "侵權案件的平均判賠金額是多少?"

**複雜組合**:
- "王婉如法官在交通案件中,原告勝訴的案件有哪些共同特徵?"

---

#### **4.2 性能優化**

1. **緩存策略**:
   - 緩存常見法官的基礎數據
   - 緩存 MCP 查詢結果 (5 分鐘)

2. **並行調用**:
   - 多個 MCP 工具並行調用
   - 減少總響應時間

3. **成本控制**:
   - 限制每次對話的最大工具調用次數
   - 使用 GPT-4o-mini 進行簡單查詢

---

## **📊 預期效果**

### **用戶體驗提升**

**當前**:
- 🔴 只能問固定的問題
- 🔴 無法進行複雜分析
- 🔴 需要多次查詢才能得到答案

**改造後**:
- ✅ 可以問任何問題
- ✅ AI 自動組合工具完成複雜分析
- ✅ 一次對話得到完整答案

---

### **功能覆蓋範圍**

| 功能類型 | 當前 | 改造後 |
|---------|------|--------|
| 簡單查詢 | ✅ | ✅ |
| 統計分析 | ❌ | ✅ |
| 比較分析 | ❌ | ✅ |
| 深度分析 | ❌ | ✅ |
| 組合查詢 | ❌ | ✅ |

---

## **💰 成本估算**

### **OpenAI API 成本**

**GPT-4o 定價**:
- Input: $2.50 / 1M tokens
- Output: $10.00 / 1M tokens

**預估單次對話**:
- 平均 3 輪工具調用
- 每輪約 2000 tokens (input + output)
- 總計約 6000 tokens
- **成本**: ~$0.05 / 次對話

**月度成本** (1000 次對話):
- $50 / 月

---

## **🚀 部署計畫**

### **Week 1-2**: 基礎架構
- ✅ 新增 MCP 工具
- ✅ 實作本地計算函數
- ✅ 定義工具列表

### **Week 2-3**: AI Agent 實作
- ✅ 實作 AI Agent 控制器
- ✅ 整合 OpenAI Function Calling
- ✅ 測試工具調用流程

### **Week 3-4**: 前端整合
- ✅ 新增 AI Agent Hook
- ✅ 更新對話組件
- ✅ UI/UX 優化

### **Week 4-5**: 測試與上線
- ✅ 功能測試
- ✅ 性能優化
- ✅ 生產環境部署

---

## **⚠️ 風險與限制**

### **數據限制**
- ⚠️ 只有 2 個月的判決書
- ⚠️ 無法進行長期趨勢分析
- ⚠️ 統計結果可能不具代表性

**應對策略**:
- 在回答中明確說明數據範圍
- 提醒用戶結果僅供參考
- 持續擴充判決書數據

### **成本控制**
- ⚠️ GPT-4 調用成本較高
- ⚠️ 複雜查詢可能需要多輪調用

**應對策略**:
- 限制每次對話的最大工具調用次數
- 簡單查詢使用 GPT-4o-mini
- 實施積分消耗機制

---

## **📝 總結**

這個計畫將把您的法官知識通從 **20% 彈性的硬編碼系統** 升級為 **90% 彈性的 AI Agent 系統**!

**核心優勢**:
- ✅ AI 自主決策,無需預定義所有場景
- ✅ 支持複雜的多步驟推理
- ✅ 可以處理未預見的需求組合
- ✅ 保留 MCP 架構,職責分離清晰

**下一步**: 開始實作! 🚀

