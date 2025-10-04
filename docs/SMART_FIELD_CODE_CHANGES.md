# 📝 方案 C: 智能欄位選擇 - 代碼修改詳細指南

> **目的**: 提供逐步的代碼修改指南，確保實施過程順利
>
> **相關文檔**:
> - [README_SMART_FIELD.md](./README_SMART_FIELD.md) - 文檔導航
> - [SMART_FIELD_THREE_LAYER_ARCHITECTURE.md](./SMART_FIELD_THREE_LAYER_ARCHITECTURE.md) - 三層架構設計
> - [SMART_FIELD_SELECTION_PLAN.md](./SMART_FIELD_SELECTION_PLAN.md) - 方案設計
> - [SMART_FIELD_TESTING_PLAN.md](./SMART_FIELD_TESTING_PLAN.md) - 測試計劃
> - [SMART_FIELD_OPTIMIZATION_PROPOSALS.md](./SMART_FIELD_OPTIMIZATION_PROPOSALS.md) - 優化建議

---

## 📁 文件修改清單

### 需要修改的文件

| # | 文件路徑 | 行數 | 修改類型 | 預計時間 |
|---|---------|------|---------|---------|
| 1 | `D:\esmcp\lawsowl_mcp.py` | ~1035 | 新增 + 修改 | 2-3 小時 |
| 2 | `utils/ai-agent-tools.js` | ~467 | 修改 | 1 小時 |
| 3 | `controllers/ai-agent-controller.js` | ~632 | 修改 | 30 分鐘 |

---

## 🔧 修改 1: MCP Server (`D:\esmcp\lawsowl_mcp.py`)

### 步驟 1.1: 添加欄位映射配置

**位置**: 第 60 行之後（在 Pydantic 模型定義之前）

**操作**: 插入以下代碼

```python
# ============================================================================
# 智能欄位選擇配置
# ============================================================================

# 欄位層級定義
FIELD_LAYERS = {
    # Level 0: 索引層 (最輕量) - ~50 tokens/案件
    "index": [
        "JID", "JDATE", "JTITLE", "judges", "verdict_type", "court"
    ],
    
    # Level 1: 摘要層 - ~200 tokens/案件
    "summary": [
        "JID", "JDATE", "JTITLE", "judges", "verdict_type", "court",
        "summary_ai"
    ],
    
    # Level 2: 分析層 - ~500 tokens/案件
    "analysis": [
        "JID", "JDATE", "JTITLE", "judges", "verdict_type", "court",
        "summary_ai", "main_reasons_ai", "legal_issues"
    ],
    
    # Level 3: 金額層 - ~60 tokens/案件
    "amount": [
        "JID", "JDATE", "JTITLE", "judges", "verdict_type", "court",
        "claim_amount", "granted_amount"
    ],
    
    # Level 4: 當事人層 - ~150 tokens/案件
    "party": [
        "JID", "JDATE", "JTITLE", "judges", "verdict_type", "court",
        "trial_party_lawyers", "appeal_party_lawyers"
    ],
    
    # Level 5: 法條層 - ~300 tokens/案件
    "citation": [
        "JID", "JDATE", "JTITLE", "judges", "verdict_type", "court",
        "citation_analysis"
    ],
    
    # Level 6: 完整層 - ~1000+ tokens/案件
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
    
    Examples:
        >>> get_fields_for_analysis("amount_analysis")
        ['JID', 'JDATE', 'JTITLE', 'judges', 'verdict_type', 'court', 'claim_amount', 'granted_amount']
        
        >>> get_fields_for_analysis("list")
        ['JID', 'JDATE', 'JTITLE', 'judges', 'verdict_type', 'court']
        
        >>> get_fields_for_analysis(None)
        ['JID', 'JDATE', 'JTITLE', 'judges', 'verdict_type', 'court', 'summary_ai']
    """
    if not intended_analysis:
        # 預設返回摘要層 (向後兼容)
        logger.info("未指定 intended_analysis, 使用預設摘要層欄位")
        return FIELD_LAYERS["summary"]
    
    # 查找對應的欄位層級
    field_layer = ANALYSIS_TO_FIELDS.get(intended_analysis)
    
    if not field_layer:
        logger.warning(f"未知的分析類型: {intended_analysis}, 使用預設摘要層欄位")
        return FIELD_LAYERS["summary"]
    
    fields = FIELD_LAYERS.get(field_layer, FIELD_LAYERS["summary"])
    logger.info(f"✅ 智能欄位選擇: {intended_analysis} → {field_layer} → {len(fields)} 個欄位")
    
    return fields
```

**驗證**:
```python
# 在 Python REPL 中測試
>>> get_fields_for_analysis("amount_analysis")
# 應該返回: ['JID', 'JDATE', 'JTITLE', 'judges', 'verdict_type', 'court', 'claim_amount', 'granted_amount']

>>> get_fields_for_analysis("list")
# 應該返回: ['JID', 'JDATE', 'JTITLE', 'judges', 'verdict_type', 'court']
```

---

### 步驟 1.2: 修改 `SearchParams` 參數模型

**位置**: 第 62-70 行

**操作**: 在 `party_name` 參數之後添加 `intended_analysis` 參數

**修改前**:
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
```

**修改後**:
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
    intended_analysis: Optional[str] = Field(default=None, description="預期分析類型,用於智能選擇返回欄位 (可選)")  # 🆕 新增
```

---

### 步驟 1.3: 修改 `SemanticSearchParams` 參數模型

**位置**: 第 99-106 行

**操作**: 在 `vector_field` 參數之後添加 `intended_analysis` 參數

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
    intended_analysis: Optional[str] = Field(default=None, description="預期分析類型,用於智能選擇返回欄位 (可選)")  # 🆕 新增
```

---

### 步驟 1.4: 修改 `search_judgments` 工具

**位置**: 第 363-367 行

**操作**: 將固定的 `_source` 欄位替換為智能選擇函數

**修改前**:
```python
"_source": [
    "JID", "JDATE", "JTITLE", "judges", "verdict_type", "court",
    "summary_ai", "trial_party_lawyers", "appeal_party_lawyers",
    "claim_amount", "granted_amount"
],
```

**修改後**:
```python
"_source": get_fields_for_analysis(params.intended_analysis),  # 🆕 智能欄位選擇
```

**完整上下文** (第 360-369 行):
```python
query = {
    "size": params.limit,
    "query": {"bool": {"must": must_clauses}},
    "_source": get_fields_for_analysis(params.intended_analysis),  # 🆕 智能欄位選擇
    "sort": [{"_score": {"order": "desc"}}, {"JDATE": {"order": "desc"}}]
}
```

---

### 步驟 1.5: 修改 `semantic_search_judgments` 工具

**位置**: 第 932-936 行

**操作**: 將固定的 `_source` 欄位替換為智能選擇函數

**修改前**:
```python
"_source": [
    "JID", "JDATE", "JTITLE", "judges", "verdict_type",
    "court", "summary_ai", "main_reasons_ai", "trial_party_lawyers", "appeal_party_lawyers",
    "claim_amount", "granted_amount"
],
```

**修改後**:
```python
"_source": get_fields_for_analysis(params.intended_analysis),  # 🆕 智能欄位選擇
```

**完整上下文** (第 923-940 行):
```python
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
```

---

### 步驟 1.6: 更新工具的 docstring

**位置**: 第 858-870 行 (`semantic_search_judgments`)

**操作**: 更新函數說明

**修改後**:
```python
@mcp.tool()
async def semantic_search_judgments(params: SemanticSearchParams) -> str:
    """
    語意搜尋判決書 (🆕 支持智能欄位選擇)

    使用 OpenAI Embeddings 將查詢向量化,然後在 Elasticsearch 中執行 kNN 搜尋。
    適合處理同義詞、口語化查詢、模糊匹配。
    
    🆕 智能欄位選擇:
    根據 intended_analysis 參數自動選擇最優欄位組合,可節省 50-80% Token 消耗。
    
    Examples:
        - intended_analysis="list" → 只返回索引欄位 (~50 tokens/案件)
        - intended_analysis="amount_analysis" → 返回索引 + 金額 (~60 tokens/案件)
        - intended_analysis="summary" → 返回索引 + 摘要 (~200 tokens/案件)
        - intended_analysis=None → 預設返回摘要層 (向後兼容)

    Args:
        params: 語意搜尋參數

    Returns:
        JSON 格式的搜尋結果
    """
```

---

## 🔧 修改 2: 後端工具定義 (`utils/ai-agent-tools.js`)

### 步驟 2.1: 更新 `semantic_search_judgments` 工具定義

**位置**: 第 54-93 行

**操作**: 在 `vector_field` 參數之後添加 `intended_analysis` 參數

**添加以下代碼**:
```javascript
intended_analysis: {
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
    description: `🆕 預期分析類型,用於智能選擇返回欄位,減少 Token 消耗 (可節省 50-80%)。

根據用戶問題選擇:
• 列表/計數: "list" 或 "count"
  例: "列出黃麟捷法官的案件" → intended_analysis: "list"
  
• 統計分析: "verdict_rate" 或 "case_type_distribution"
  例: "黃麟捷法官的勝訴率?" → intended_analysis: "verdict_rate"
  
• 金額分析: "amount_analysis", "amount_stats", "amount_trend"
  例: "牽涉金額最大的案件?" → intended_analysis: "amount_analysis"
  
• 法條分析: "citation_analysis" 或 "legal_analysis"
  例: "常引用哪些法條?" → intended_analysis: "citation_analysis"
  
• 當事人分析: "party_analysis" 或 "lawyer_analysis"
  例: "這些案件的當事人?" → intended_analysis: "party_analysis"
  
• 摘要查詢: "summary" 或 "overview"
  例: "這些案件的主要內容?" → intended_analysis: "summary"
  
• 深度分析: "deep_analysis" 或 "legal_reasoning"
  例: "詳細分析法律推理" → intended_analysis: "deep_analysis"
  
• 完整詳情: "full_details" 或 "comprehensive"
  例: "提供完整資訊" → intended_analysis: "full_details"

如果不確定,可以不指定 (預設返回摘要層欄位)`
}
```

**完整修改後的工具定義**:
```javascript
{
    type: "function",
    function: {
        name: "semantic_search_judgments",
        description: "語意搜尋判決書。🆕 支持智能欄位選擇,根據 intended_analysis 自動優化返回欄位,可節省 50-80% Token。適合模糊查詢、同義詞匹配、自然語言問題。數據範圍: 2025年6-7月。",
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
                intended_analysis: {
                    // ... (上面的完整定義)
                }
            },
            required: ["query"]
        }
    }
}
```

---

### 步驟 2.2: 同樣更新 `search_judgments` 工具定義

**位置**: 第 12-53 行

**操作**: 添加相同的 `intended_analysis` 參數

---

## 🔧 修改 3: System Prompt (`utils/ai-agent-tools.js`)

### 步驟 3.1: 找到 SYSTEM_PROMPT 定義

**位置**: 需要在文件中搜尋 `export const SYSTEM_PROMPT`

### 步驟 3.2: 添加智能欄位選擇指南

**操作**: 在 SYSTEM_PROMPT 中添加以下段落

```javascript
export const SYSTEM_PROMPT = `你是 LawSowl 的 AI 法律助手...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🆕 **智能欄位選擇** (重要 - 可節省 50-80% Token)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

當調用 search_judgments 或 semantic_search_judgments 時,**必須**根據用戶問題選擇合適的 intended_analysis 參數:

**決策樹**:
1. 用戶問「列出」、「有哪些」、「多少筆」?
   → intended_analysis: "list"
   
2. 用戶問「勝訴率」、「判決結果分布」、「統計」?
   → intended_analysis: "verdict_rate"
   
3. 用戶問「金額」、「最大金額」、「平均金額」、「金額趨勢」?
   → intended_analysis: "amount_analysis"
   
4. 用戶問「引用法條」、「法律依據」、「常用法條」?
   → intended_analysis: "citation_analysis"
   
5. 用戶問「當事人」、「律師」、「原告」、「被告」?
   → intended_analysis: "party_analysis"
   
6. 用戶問「摘要」、「概述」、「主要內容」?
   → intended_analysis: "summary"
   
7. 用戶問「詳細分析」、「法律推理」、「判決理由」?
   → intended_analysis: "deep_analysis"
   
8. 用戶問「完整資訊」、「所有細節」?
   → intended_analysis: "full_details"

**重要原則**:
✅ 優先使用最輕量的 intended_analysis (list > verdict_rate > amount_analysis > summary > deep_analysis > full_details)
✅ 如果不確定,使用 "summary" (預設)
❌ 避免過度使用 "full_details" (除非用戶明確要求完整資訊)

**範例**:
用戶: "黃麟捷法官的案件中，牽涉金額最大的案件是?"
正確: semantic_search_judgments(query="*", judge_name="黃麟捷", intended_analysis="amount_analysis")
錯誤: semantic_search_judgments(query="*", judge_name="黃麟捷") // 浪費 Token

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

...
`;
```

---

## ✅ 驗證清單

### MCP Server 驗證
- [ ] `get_fields_for_analysis()` 函數正常運作
- [ ] `SearchParams` 包含 `intended_analysis` 參數
- [ ] `SemanticSearchParams` 包含 `intended_analysis` 參數
- [ ] `search_judgments` 使用智能欄位選擇
- [ ] `semantic_search_judgments` 使用智能欄位選擇
- [ ] 向後兼容測試 (不指定 `intended_analysis`)

### 後端驗證
- [ ] 工具定義包含 `intended_analysis` 參數
- [ ] System Prompt 包含智能欄位選擇指南
- [ ] GPT 能正確理解並使用 `intended_analysis`

### 端到端驗證
- [ ] 列表查詢測試
- [ ] 金額分析測試
- [ ] 勝訴率分析測試
- [ ] Token 消耗驗證
- [ ] 向後兼容驗證

---

**文檔版本**: 1.0  
**最後更新**: 2025-10-04  
**維護者**: Harry + AI Assistant (Augment)

