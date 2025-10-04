# 🎯 方案 C: 智能欄位預測 - 完整開發文檔

> **方案名稱**: Smart Field Selection (智能欄位選擇)
> **核心理念**: 讓 GPT 根據用戶問題自動決定需要哪些欄位，實現 Token 消耗最優化
> **預期效果**: Token 節省 50-80%，API 調用次數減少 30-50%
>
> **相關文檔**:
> - [README_SMART_FIELD.md](./README_SMART_FIELD.md) - 文檔導航
> - [SMART_FIELD_THREE_LAYER_ARCHITECTURE.md](./SMART_FIELD_THREE_LAYER_ARCHITECTURE.md) - 三層架構設計
> - [SMART_FIELD_CODE_CHANGES.md](./SMART_FIELD_CODE_CHANGES.md) - 代碼修改指南
> - [SMART_FIELD_TESTING_PLAN.md](./SMART_FIELD_TESTING_PLAN.md) - 測試計劃
> - [SMART_FIELD_OPTIMIZATION_PROPOSALS.md](./SMART_FIELD_OPTIMIZATION_PROPOSALS.md) - 優化建議

---

## 📊 方案概述

### 核心概念

**當前問題**:
```
用戶問題: "黃麟捷法官的案件中，牽涉金額最大的案件是?"
  ↓
第1輪: semantic_search_judgments()
  └─ 返回: 18 筆判決書 × 200 tokens/筆 = 3600 tokens
  └─ 包含: JID, JDATE, JTITLE, judges, verdict_type, court, summary_ai,
           main_reasons_ai, trial_party_lawyers, appeal_party_lawyers,
           claim_amount, granted_amount
  └─ 實際需要: JID, claim_amount, granted_amount (只需 ~60 tokens/筆)
  ↓
浪費: ~2500 tokens (70%)
```

**方案 C 解決方案 (三層架構)**:
```
用戶問題: "黃麟捷法官的案件中，牽涉金額最大的案件是?"
  ↓
🔴 第0層: Intent Classifier (GPT-4o-mini)
  └─ 判斷: legal_analysis (法律分析)
  └─ 提取: question_type="金額", case_type=null
  └─ 過濾: 如果是 "法官單身嗎?" → 直接返回 out_of_scope
  └─ Token: ~300 tokens (極低成本)
  ↓
🟡 第1層: Router (GPT-4o)
  └─ 分析: 這是「金額分析」問題
  └─ 決定: intended_analysis="amount_analysis"
  └─ 決定: 需要調用 MCP 工具 + 本地計算函數
  ↓
🟢 第2層: MCP Server (智能欄位選擇)
  └─ semantic_search_judgments(intended_analysis="amount_analysis")
  └─ 自動選擇欄位: index + amount 欄位
  └─ 返回: 18 筆 × 60 tokens/筆 = 1080 tokens
  ↓
🔵 第3層: Local Function (數值計算)
  └─ calculate_verdict_statistics(analysis_type="amount_stats")
  └─ 本地計算: 最大金額、平均金額、總金額
  └─ 避免 GPT 算錯數字
  ↓
節省: ~2500 tokens (70%) + 過濾無效問題
```

---

## 🎯 設計目標

### 1. **三層架構防護** 🆕
- ✅ **第0層 (Intent Classifier)**: 使用 GPT-4o-mini 過濾無效問題
  - 過濾: "法官單身嗎?"、"法官喜歡吃臭豆腐嗎?" 等無關問題
  - 提取: question_type, case_type, verdict_type
  - 成本: ~$0.00003/次 (極低)
- ✅ **第1層 (Router)**: GPT-4o 分析問題類型並決定 `intended_analysis`
  - 判斷: 列表查詢、金額分析、勝訴率分析等
  - 決定: 調用哪些工具、使用哪些參數
- ✅ **第2層 (Smart Fields)**: MCP Server 智能選擇欄位
  - 根據 `intended_analysis` 返回最優欄位組合
- ✅ **第3層 (Local Calculation)**: 本地函數處理數值計算
  - 避免 GPT 算錯 SUM/AVG/MAX
  - 確保數值正確性

### 2. **自動化欄位選擇**
- ✅ GPT 根據用戶問題自動判斷 `intended_analysis` 類型
- ✅ MCP Server 根據 `intended_analysis` 自動選擇最優欄位組合
- ✅ 無需硬編碼意圖識別邏輯

### 3. **Token 最優化**
- ✅ 只返回必要的欄位
- ✅ 減少 50-80% 的 Token 消耗
- ✅ 降低 API 費用
- ✅ Intent Classifier 提前過濾，節省更多 Token

### 4. **數值計算正確性** 🆕
- ✅ 本地函數處理所有數值計算 (SUM, AVG, MAX, MIN)
- ✅ 避免 GPT "151 × 47 算錯" 的問題
- ✅ 確保金額、統計數據的準確性

### 5. **靈活性與擴展性**
- ✅ 新增分析類型只需添加欄位映射
- ✅ 向後兼容（不指定 `intended_analysis` 時使用預設欄位）
- ✅ 支持自定義欄位組合

### 6. **減少多輪調用**
- ✅ 一次調用返回所需數據
- ✅ 減少 30-50% 的 API 調用次數

---

## 📁 需要修改的文件

### 文件清單

| 文件路徑 | 修改原因 | 優先級 |
|---------|---------|--------|
| `D:\esmcp\lawsowl_mcp.py` | 添加智能欄位選擇邏輯 | 🔴 高 |
| `utils/ai-agent-tools.js` | 更新工具定義，添加 `intended_analysis` 參數 | 🔴 高 |
| `controllers/ai-agent-controller.js` | 更新 System Prompt，引導 GPT 使用新參數 | 🟡 中 |
| `utils/ai-agent-local-functions.js` | 無需修改（向後兼容） | 🟢 低 |

---

## 🔧 詳細修改方案

### 修改 1: MCP Server (`D:\esmcp\lawsowl_mcp.py`)

#### 1.1 添加欄位映射配置

**位置**: 文件開頭，第 60 行之後

**新增代碼**:
```python
# ============================================================================
# 智能欄位選擇配置
# ============================================================================

# 欄位層級定義
FIELD_LAYERS = {
    # Level 0: 索引層 (最輕量)
    "index": [
        "JID", "JDATE", "JTITLE", "judges", "verdict_type", "court"
    ],
    
    # Level 1: 摘要層
    "summary": [
        "JID", "JDATE", "JTITLE", "judges", "verdict_type", "court",
        "summary_ai"
    ],
    
    # Level 2: 分析層
    "analysis": [
        "JID", "JDATE", "JTITLE", "judges", "verdict_type", "court",
        "summary_ai", "main_reasons_ai", "legal_issues"
    ],
    
    # Level 3: 金額層
    "amount": [
        "JID", "JDATE", "JTITLE", "judges", "verdict_type", "court",
        "claim_amount", "granted_amount"
    ],
    
    # Level 4: 當事人層
    "party": [
        "JID", "JDATE", "JTITLE", "judges", "verdict_type", "court",
        "trial_party_lawyers", "appeal_party_lawyers"
    ],
    
    # Level 5: 法條層
    "citation": [
        "JID", "JDATE", "JTITLE", "judges", "verdict_type", "court",
        "citation_analysis"
    ],
    
    # Level 6: 完整層
    "full": [
        "JID", "JDATE", "JTITLE", "judges", "verdict_type", "court",
        "summary_ai", "main_reasons_ai", "legal_issues",
        "citation_analysis", "claim_amount", "granted_amount",
        "trial_party_lawyers", "appeal_party_lawyers"
    ]
}

# 分析類型到欄位層級的映射
ANALYSIS_TO_FIELDS = {
    # 列表類查詢 - 只需索引
    "list": "index",
    "count": "index",
    
    # 統計類查詢 - 索引 + 特定欄位
    "verdict_rate": "index",
    "case_type_distribution": "index",
    
    # 金額類查詢 - 索引 + 金額
    "amount_analysis": "amount",
    "amount_stats": "amount",
    "amount_trend": "amount",
    
    # 法條類查詢 - 索引 + 法條
    "citation_analysis": "citation",
    "legal_analysis": "citation",
    
    # 當事人類查詢 - 索引 + 當事人
    "party_analysis": "party",
    "lawyer_analysis": "party",
    
    # 內容類查詢 - 摘要層
    "summary": "summary",
    "overview": "summary",
    
    # 深度分析 - 分析層
    "deep_analysis": "analysis",
    "legal_reasoning": "analysis",
    
    # 完整詳情 - 完整層
    "full_details": "full",
    "comprehensive": "full"
}

def get_fields_for_analysis(intended_analysis: Optional[str] = None) -> List[str]:
    """
    根據預期分析類型返回最優欄位組合
    
    Args:
        intended_analysis: 預期分析類型
    
    Returns:
        欄位列表
    """
    if not intended_analysis:
        # 預設返回摘要層 (向後兼容)
        return FIELD_LAYERS["summary"]
    
    # 查找對應的欄位層級
    field_layer = ANALYSIS_TO_FIELDS.get(intended_analysis)
    
    if not field_layer:
        logger.warning(f"未知的分析類型: {intended_analysis}, 使用預設欄位")
        return FIELD_LAYERS["summary"]
    
    fields = FIELD_LAYERS.get(field_layer, FIELD_LAYERS["summary"])
    logger.info(f"分析類型: {intended_analysis} → 欄位層級: {field_layer} → 欄位數: {len(fields)}")
    
    return fields
```

**修改原因**:
- 定義清晰的欄位層級結構
- 建立分析類型到欄位的映射關係
- 提供智能欄位選擇函數

---

#### 1.2 修改 `SemanticSearchParams` 參數模型

**位置**: 第 99-106 行

**修改前**:
```python
class SemanticSearchParams(BaseModel):
    """語意搜尋參數"""
    query: str = Field(description="自然語言查詢,可以是口語化描述。例如: '欠錢不還'、'房東趕房客'、'車禍賠償'")
    judge_name: Optional[str] = Field(default=None, description="法官姓名 (可選),用於過濾特定法官的判決")
    party_name: Optional[str] = Field(default=None, description="當事人名稱 (可選)。可以是原告、被告、上訴人或被上訴人的名稱,支持部分匹配")
    verdict_type: Optional[str] = Field(default=None, description="判決結果類型 (可選)")
    limit: int = Field(default=50, ge=1, le=100, description="返回結果數量")
    vector_field: str = Field(default="summary_ai_vector", description="向量欄位選擇: summary_ai_vector (預設,通用搜尋), text_embedding (深度內容), legal_issues_embedding (爭點搜尋)")
```

**修改後**:
```python
class SemanticSearchParams(BaseModel):
    """語意搜尋參數"""
    query: str = Field(description="自然語言查詢,可以是口語化描述。例如: '欠錢不還'、'房東趕房客'、'車禍賠償'")
    judge_name: Optional[str] = Field(default=None, description="法官姓名 (可選),用於過濾特定法官的判決")
    party_name: Optional[str] = Field(default=None, description="當事人名稱 (可選)。可以是原告、被告、上訴人或被上訴人的名稱,支持部分匹配")
    verdict_type: Optional[str] = Field(default=None, description="判決結果類型 (可選)")
    limit: int = Field(default=50, ge=1, le=100, description="返回結果數量")
    vector_field: str = Field(default="summary_ai_vector", description="向量欄位選擇: summary_ai_vector (預設,通用搜尋), text_embedding (深度內容), legal_issues_embedding (爭點搜尋)")
    intended_analysis: Optional[str] = Field(
        default=None, 
        description="""預期分析類型,用於智能選擇返回欄位。可選值:
        - list/count: 列表或計數 (只返回索引欄位)
        - verdict_rate/case_type_distribution: 統計分析 (索引欄位)
        - amount_analysis/amount_stats/amount_trend: 金額分析 (索引 + 金額欄位)
        - citation_analysis/legal_analysis: 法條分析 (索引 + 法條欄位)
        - party_analysis/lawyer_analysis: 當事人分析 (索引 + 當事人欄位)
        - summary/overview: 摘要查詢 (索引 + 摘要欄位)
        - deep_analysis/legal_reasoning: 深度分析 (索引 + 摘要 + 理由 + 爭點)
        - full_details/comprehensive: 完整詳情 (所有欄位)
        如果不指定,預設返回摘要層欄位 (向後兼容)"""
    )
```

**修改原因**:
- 添加 `intended_analysis` 參數
- 提供詳細的參數說明，幫助 GPT 理解如何使用
- 保持向後兼容（可選參數）

---

#### 1.3 修改 `semantic_search_judgments` 工具

**位置**: 第 858-970 行

**修改前** (第 932-936 行):
```python
"_source": [
    "JID", "JDATE", "JTITLE", "judges", "verdict_type",
    "court", "summary_ai", "main_reasons_ai", "trial_party_lawyers", "appeal_party_lawyers",
    "claim_amount", "granted_amount"
],
```

**修改後**:
```python
# 🆕 智能欄位選擇
"_source": get_fields_for_analysis(params.intended_analysis),
```

**完整修改後的函數** (關鍵部分):
```python
@mcp.tool()
async def semantic_search_judgments(params: SemanticSearchParams) -> str:
    """
    語意搜尋判決書 (支持智能欄位選擇)
    
    使用 OpenAI Embeddings 將查詢向量化,然後在 Elasticsearch 中執行 kNN 搜尋。
    適合處理同義詞、口語化查詢、模糊匹配。
    
    🆕 智能欄位選擇:
    根據 intended_analysis 參數自動選擇最優欄位組合,減少 Token 消耗。
    
    Args:
        params: 語意搜尋參數
    
    Returns:
        JSON 格式的搜尋結果
    """
    try:
        logger.info(f"語意搜尋: query='{params.query}', judge_name={params.judge_name}, intended_analysis={params.intended_analysis}")
        
        # ... (前面的代碼保持不變)
        
        # 步驟 3: 執行 kNN 搜尋
        query = {
            "size": params.limit,
            "knn": {
                "field": params.vector_field,
                "query_vector": query_vector,
                "k": params.limit,
                "num_candidates": params.limit * 2,
                "filter": filter_clauses if filter_clauses else None
            },
            "_source": get_fields_for_analysis(params.intended_analysis),  # 🆕 智能欄位選擇
            "sort": [
                "_score"
            ]
        }
        
        # ... (後面的代碼保持不變)
```

**修改原因**:
- 使用智能欄位選擇函數
- 根據 `intended_analysis` 動態調整返回欄位
- 減少不必要的數據傳輸

---

#### 1.4 同樣修改 `search_judgments` 工具

**位置**: 第 260-395 行

**修改 `SearchParams` 參數模型** (第 62-70 行):
```python
class SearchParams(BaseModel):
    """搜尋參數"""
    query: str = Field(description="搜尋關鍵字")
    limit: int = Field(default=10, ge=1, le=100, description="返回結果數量")
    from_date: Optional[str] = Field(default=None, description="起始日期 (YYYY-MM-DD)")
    to_date: Optional[str] = Field(default=None, description="結束日期 (YYYY-MM-DD)")
    verdict_type: Optional[str] = Field(default=None, description="判決結果類型 (如: 原告勝訴、原告敗訴、部分勝訴部分敗訴)")
    judge_name: Optional[str] = Field(default=None, description="法官姓名 (精確匹配)")
    party_name: Optional[str] = Field(default=None, description="當事人名稱 (可選)。可以是原告、被告、上訴人或被上訴人的名稱,支持部分匹配")
    intended_analysis: Optional[str] = Field(default=None, description="預期分析類型 (同 SemanticSearchParams)")  # 🆕 添加
```

**修改 `_source` 欄位** (第 363-367 行):
```python
"_source": get_fields_for_analysis(params.intended_analysis),  # 🆕 智能欄位選擇
```

**修改原因**:
- 保持 `search_judgments` 和 `semantic_search_judgments` 的一致性
- 兩個工具都支持智能欄位選擇

---

### 修改 2: 後端工具定義 (`utils/ai-agent-tools.js`)

#### 2.1 更新 `semantic_search_judgments` 工具定義

**位置**: 第 54-93 行

**修改後**:
```javascript
{
    type: "function",
    function: {
        name: "semantic_search_judgments",
        description: "語意搜尋判決書。使用 AI 向量相似度匹配,適合模糊查詢、同義詞匹配、自然語言問題。🆕 支持智能欄位選擇,根據 intended_analysis 自動優化返回欄位,減少 Token 消耗。數據範圍: 2025年6-7月。",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "自然語言查詢,可以是口語化描述。例如: '欠錢不還'、'房東趕房客'、'車禍賠償'、'債務清償'"
                },
                judge_name: {
                    type: "string",
                    description: "法官姓名 (可選),用於過濾特定法官的判決"
                },
                party_name: {
                    type: "string",
                    description: "當事人名稱 (可選)。可以是原告、被告、上訴人或被上訴人的名稱。支持公司名稱或個人姓名,支持部分匹配。"
                },
                verdict_type: {
                    type: "string",
                    description: "判決結果類型 (可選),如: 原告勝訴、原告敗訴、部分勝訴部分敗訴"
                },
                limit: {
                    type: "number",
                    description: "返回結果數量,預設50,最大100",
                    default: 50
                },
                vector_field: {
                    type: "string",
                    enum: ["summary_ai_vector", "text_embedding", "legal_issues_embedding"],
                    description: "向量欄位選擇。summary_ai_vector (預設,通用搜尋), text_embedding (深度內容), legal_issues_embedding (爭點搜尋)",
                    default: "summary_ai_vector"
                },
                intended_analysis: {  // 🆕 新增參數
                    type: "string",
                    enum: [
                        "list", "count",
                        "verdict_rate", "case_type_distribution",
                        "amount_analysis", "amount_stats", "amount_trend",
                        "citation_analysis", "legal_analysis",
                        "party_analysis", "lawyer_analysis",
                        "summary", "overview",
                        "deep_analysis", "legal_reasoning",
                        "full_details", "comprehensive"
                    ],
                    description: `🆕 預期分析類型,用於智能選擇返回欄位,減少 Token 消耗。根據用戶問題選擇:
                    - 如果用戶問「列出」、「有哪些」→ 使用 "list"
                    - 如果用戶問「勝訴率」、「判決結果分布」→ 使用 "verdict_rate"
                    - 如果用戶問「金額」、「最大金額」、「平均金額」→ 使用 "amount_analysis"
                    - 如果用戶問「引用法條」、「法律依據」→ 使用 "citation_analysis"
                    - 如果用戶問「當事人」、「律師」→ 使用 "party_analysis"
                    - 如果用戶問「摘要」、「概述」→ 使用 "summary"
                    - 如果用戶問「詳細分析」、「法律推理」→ 使用 "deep_analysis"
                    - 如果用戶問「完整資訊」→ 使用 "full_details"
                    如果不確定,可以不指定此參數 (預設返回摘要層欄位)`
                }
            },
            required: ["query"]
        }
    }
}
```

**修改原因**:
- 添加 `intended_analysis` 參數定義
- 提供詳細的使用指南，幫助 GPT 正確選擇
- 使用 enum 限制可選值

---

#### 2.2 同樣更新 `search_judgments` 工具定義

**位置**: 第 12-53 行

**添加 `intended_analysis` 參數** (與 `semantic_search_judgments` 相同)

---

### 修改 3: AI Agent Controller (`controllers/ai-agent-controller.js`)

#### 3.1 更新 System Prompt

**位置**: 需要在 `utils/ai-agent-tools.js` 中找到 `SYSTEM_PROMPT` 定義

**添加智能欄位選擇指南**:
```javascript
export const SYSTEM_PROMPT = `你是 LawSowl 的 AI 法律助手...

🆕 **智能欄位選擇** (重要 - 可節省 50-80% Token):
當調用 search_judgments 或 semantic_search_judgments 時,請根據用戶問題選擇合適的 intended_analysis 參數:

1. **列表/計數類問題** → intended_analysis: "list"
   - 例: "列出黃麟捷法官的案件"
   - 只返回索引欄位 (JID, 日期, 案由, 法官, 裁判結果, 法院)

2. **統計類問題** → intended_analysis: "verdict_rate"
   - 例: "黃麟捷法官的勝訴率是多少?"
   - 只返回索引欄位

3. **金額類問題** → intended_analysis: "amount_analysis"
   - 例: "牽涉金額最大的案件是?"
   - 返回索引 + 金額欄位

4. **法條類問題** → intended_analysis: "citation_analysis"
   - 例: "常引用哪些法條?"
   - 返回索引 + 法條欄位

5. **當事人類問題** → intended_analysis: "party_analysis"
   - 例: "這些案件的當事人是誰?"
   - 返回索引 + 當事人欄位

6. **摘要類問題** → intended_analysis: "summary"
   - 例: "這些案件的主要內容是什麼?"
   - 返回索引 + 摘要欄位

7. **深度分析** → intended_analysis: "deep_analysis"
   - 例: "詳細分析這些案件的法律推理"
   - 返回索引 + 摘要 + 理由 + 爭點

8. **完整詳情** → intended_analysis: "full_details"
   - 例: "提供完整的案件資訊"
   - 返回所有欄位

**重要**: 
- 優先使用最輕量的 intended_analysis
- 如果不確定,可以不指定 (預設返回摘要層)
- 避免過度使用 "full_details"

...
`;
```

**修改原因**:
- 引導 GPT 正確使用 `intended_analysis` 參數
- 提供清晰的使用場景和示例
- 強調 Token 優化的重要性

---

## 📊 預期效果分析

### Token 消耗對比

| 場景 | 當前方案 | 方案 C | 節省 |
|------|---------|--------|------|
| **列表查詢** (50筆) | 10,000 tokens | 2,500 tokens | 75% |
| **勝訴率分析** (50筆) | 10,000 tokens | 2,500 tokens | 75% |
| **金額分析** (50筆) | 10,000 tokens | 3,000 tokens | 70% |
| **法條分析** (50筆) | 10,000 tokens | 4,000 tokens | 60% |
| **深度分析** (10筆) | 5,000 tokens | 5,000 tokens | 0% |
| **完整詳情** (1筆) | 1,000 tokens | 1,000 tokens | 0% |

### API 調用次數對比

| 場景 | 當前方案 | 方案 C | 節省 |
|------|---------|--------|------|
| **金額分析** | 3輪 | 2輪 | 33% |
| **勝訴率分析** | 2輪 | 2輪 | 0% |
| **法條分析** | 2輪 | 2輪 | 0% |

---

## ✅ 測試計劃

### 測試場景

1. **列表查詢**
   - 問題: "列出黃麟捷法官的所有案件"
   - 預期: `intended_analysis="list"`, 只返回索引欄位

2. **金額分析**
   - 問題: "黃麟捷法官的案件中，牽涉金額最大的案件是?"
   - 預期: `intended_analysis="amount_analysis"`, 返回索引 + 金額

3. **勝訴率分析**
   - 問題: "黃麟捷法官在債務清償案件的勝訴率?"
   - 預期: `intended_analysis="verdict_rate"`, 只返回索引欄位

4. **向後兼容**
   - 問題: 不指定 `intended_analysis`
   - 預期: 返回預設摘要層欄位

---

## 🚀 實施步驟

### Phase 1: MCP Server 修改 (1-2 天)
1. ✅ 添加欄位映射配置
2. ✅ 修改參數模型
3. ✅ 修改工具函數
4. ✅ 本地測試

### Phase 2: 後端修改 (1 天)
1. ✅ 更新工具定義
2. ✅ 更新 System Prompt
3. ✅ 測試工具調用

### Phase 3: 端到端測試 (1 天)
1. ✅ 測試各種場景
2. ✅ 驗證 Token 節省效果
3. ✅ 驗證向後兼容性

### Phase 4: 部署 (0.5 天)
1. ✅ 部署 MCP Server 到 Render.com
2. ✅ 部署後端到 Render.com
3. ✅ 生產環境測試

---

## 📝 注意事項

### 1. 向後兼容性
- ✅ `intended_analysis` 是可選參數
- ✅ 不指定時使用預設欄位（摘要層）
- ✅ 現有代碼無需修改

### 2. GPT 理解能力
- ⚠️ 需要清晰的 Prompt 引導
- ⚠️ 可能需要多次調整 Prompt
- ⚠️ 監控 GPT 的參數選擇準確率

### 3. 擴展性
- ✅ 新增分析類型只需添加映射
- ✅ 新增欄位層級只需添加配置
- ✅ 無需修改核心邏輯

---

## 🎯 成功指標

1. **Token 節省**: 平均節省 50% 以上
2. **API 調用減少**: 減少 30% 以上
3. **響應時間**: 不增加（或略微減少）
4. **準確率**: GPT 正確選擇 `intended_analysis` 的比例 > 90%
5. **向後兼容**: 現有功能 100% 正常運作

---

**文檔版本**: 1.0  
**最後更新**: 2025-10-04  
**維護者**: Harry + AI Assistant (Augment)

