// utils/ai-agent-tools.js
/**
 * AI Agent 工具定義
 * 定義所有可用的 MCP 工具和本地函數,供 OpenAI Function Calling 使用
 */

/**
 * MCP 工具定義
 * 這些工具會調用 MCP Server 獲取數據
 */
export const MCP_TOOLS = [
    {
        type: "function",
        function: {
            name: "search_judgments",
            description: "關鍵詞搜尋判決書。適合精確查詢,當用戶提供明確的案由名稱時使用。數據範圍: 2025年6-7月。",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "搜尋關鍵字,可以是案由關鍵字、法條等。如果要搜尋所有判決,使用 '*'。如果指定了 judge_name,這個參數可以是案由關鍵字。"
                    },
                    judge_name: {
                        type: "string",
                        description: "法官姓名 (精確匹配),可選。如果指定,將只搜尋該法官的判決書。"
                    },
                    limit: {
                        type: "number",
                        description: "返回結果數量,預設10,最大100",
                        default: 10
                    },
                    from_date: {
                        type: "string",
                        description: "起始日期 (YYYY-MM-DD),可選"
                    },
                    to_date: {
                        type: "string",
                        description: "結束日期 (YYYY-MM-DD),可選"
                    },
                    verdict_type: {
                        type: "string",
                        description: "判決結果類型 (可選),如: 原告勝訴、原告敗訴、部分勝訴部分敗訴"
                    }
                },
                required: ["query"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "semantic_search_judgments",
            description: "語意搜尋判決書。使用 AI 向量相似度匹配,適合模糊查詢、同義詞匹配、自然語言問題。當用戶使用口語化描述或關鍵詞搜尋失敗時使用。數據範圍: 2025年6-7月。",
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
                    }
                },
                required: ["query"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_citation_analysis",
            description: "獲取法官引用法條分析,識別最常引用的法律條文。可以按案由和判決結果過濾。",
            parameters: {
                type: "object",
                properties: {
                    judge_name: {
                        type: "string",
                        description: "法官姓名"
                    },
                    case_type: {
                        type: "string",
                        description: "案由關鍵字 (可選)"
                    },
                    verdict_type: {
                        type: "string",
                        description: "判決結果類型 (可選)"
                    },
                    limit: {
                        type: "number",
                        description: "分析的判決書數量,預設50",
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
            name: "get_case_details",
            description: "獲取單一案件的詳細資訊,包括 AI 摘要、主要理由、法律爭點、引用法條等。",
            parameters: {
                type: "object",
                properties: {
                    case_id: {
                        type: "string",
                        description: "判決字號 (JID)"
                    }
                },
                required: ["case_id"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_perspective_analysis",
            description: "獲取法官判決的立場分析,分析法官在不同立場 (原告/被告/機關/人民) 下的判決傾向。",
            parameters: {
                type: "object",
                properties: {
                    judge_name: {
                        type: "string",
                        description: "法官姓名"
                    },
                    case_type: {
                        type: "string",
                        description: "案由關鍵字 (可選)"
                    },
                    limit: {
                        type: "number",
                        description: "分析的判決書數量,預設30",
                        default: 30
                    }
                },
                required: ["judge_name"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "analyze_judge",
            description: "分析特定法官的判決傾向,包括判決結果分布、常見案由、案件類型等統計數據。",
            parameters: {
                type: "object",
                properties: {
                    judge_name: {
                        type: "string",
                        description: "法官姓名"
                    },
                    limit: {
                        type: "number",
                        description: "分析的判決書數量,預設50",
                        default: 50
                    }
                },
                required: ["judge_name"]
            }
        }
    }
];

/**
 * 本地函數工具定義
 * 這些工具在後端執行,用於處理數據
 */
export const LOCAL_FUNCTION_TOOLS = [
    {
        type: "function",
        function: {
            name: "calculate_verdict_statistics",
            description: "計算判決結果統計,包括勝訴率、案由分布、金額統計等。需要先調用 search_judgments_by_judge 獲取判決書數據。",
            parameters: {
                type: "object",
                properties: {
                    judgments: {
                        type: "array",
                        description: "判決書陣列 (來自 search_judgments_by_judge 的結果)",
                        items: {
                            type: "object"
                        }
                    },
                    analysis_type: {
                        type: "string",
                        enum: ["verdict_rate", "case_type_rate", "amount_stats"],
                        description: "分析類型: verdict_rate (判決結果分布), case_type_rate (案由分布), amount_stats (金額統計)"
                    },
                    verdict_type: {
                        type: "string",
                        description: "要分析的特定判決結果類型 (可選)"
                    }
                },
                required: ["judgments", "analysis_type"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "extract_top_citations",
            description: "從引用法條分析中提取 TOP N 引用法條。需要先調用 get_citation_analysis。",
            parameters: {
                type: "object",
                properties: {
                    citation_analysis: {
                        type: "object",
                        description: "引用法條分析結果 (來自 get_citation_analysis)"
                    },
                    top_n: {
                        type: "number",
                        description: "取前 N 個,預設10",
                        default: 10
                    }
                },
                required: ["citation_analysis"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "analyze_amount_trends",
            description: "分析金額趨勢,按月或季度統計請求金額和判賠金額。需要先調用 search_judgments_by_judge。",
            parameters: {
                type: "object",
                properties: {
                    judgments: {
                        type: "array",
                        description: "判決書陣列 (需包含日期和金額數據)",
                        items: {
                            type: "object"
                        }
                    },
                    trend_type: {
                        type: "string",
                        enum: ["monthly", "quarterly"],
                        description: "趨勢類型: monthly (按月), quarterly (按季)",
                        default: "monthly"
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
            description: "比較多位法官的判決傾向。需要先對每位法官調用 analyze_judge。",
            parameters: {
                type: "object",
                properties: {
                    judges_data: {
                        type: "array",
                        description: "多位法官的分析數據陣列 (來自 analyze_judge)",
                        items: {
                            type: "object"
                        }
                    }
                },
                required: ["judges_data"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "calculate_case_type_distribution",
            description: "計算案件類型分布,可按案由、法院、判決結果分組。需要先調用 search_judgments 獲取判決書數據。",
            parameters: {
                type: "object",
                properties: {
                    judgments: {
                        type: "array",
                        description: "判決書陣列",
                        items: {
                            type: "object"
                        }
                    },
                    group_by: {
                        type: "string",
                        enum: ["case_type", "court", "verdict_type"],
                        description: "分組依據: case_type (案由), court (法院), verdict_type (判決結果)",
                        default: "case_type"
                    }
                },
                required: ["judgments"]
            }
        }
    }
];

/**
 * 所有工具的組合列表
 */
export const ALL_TOOLS = [...MCP_TOOLS, ...LOCAL_FUNCTION_TOOLS];

/**
 * 系統提示詞
 */
export const SYSTEM_PROMPT = `你是 LawSowl 法官知識通 AI 助手,專門協助律師和法律專業人士分析法官的判決傾向。

**重要限制**:
- 數據範圍: 僅包含 2025年6月至7月 的判決書數據 (約7000+筆)
- 在所有回答中必須明確說明數據範圍限制
- 不要承諾長期趨勢預測或歷史數據分析

**你的能力**:
1. 搜尋和分析特定法官的判決書
2. 計算勝訴率、判決結果分布
3. 分析法官常引用的法條
4. 提供立場分析 (原告/被告視角)
5. 比較多位法官的判決傾向
6. 分析金額趨勢

**工作流程**:
1. 理解用戶問題
2. ⚠️ **檢查上下文** - 如果用戶問題中包含「當前查詢的法官」資訊,務必使用該法官名稱
3. 決定需要調用哪些工具 (可以組合多個工具)
4. 先調用 MCP 工具獲取數據
5. 再調用本地函數處理數據
6. 生成自然語言回答

**重要提醒 - 上下文感知**:
- 如果用戶問題開頭有「⚠️ 重要上下文：用戶正在查詢特定法官」,表示用戶在特定法官的頁面
- 此時用戶問題中的「法官」、「這位法官」、「該法官」都是指上下文中提到的法官
- 務必在所有工具調用中使用 judge_name 參數指定該法官
- 範例: 上下文說「當前查詢的法官：王婉如」,用戶問「法官的勝訴率?」→ 調用工具時使用 judge_name="王婉如"

**回答格式**:
- 使用繁體中文
- 語氣專業但易懂
- 提供具體數據支持
- 明確說明數據範圍 (2025年6-7月)
- 適當使用 Markdown 格式 (標題、列表、粗體)

**範例問題處理**:

範例 1: "王婉如法官在返還不當得利中的勝訴率?" ⭐ 重要範例
步驟:
1. 調用 semantic_search_judgments (query="返還不當得利", judge_name="王婉如", limit=50) - ⚠️ 不要加 verdict_type 過濾!
2. 調用 calculate_verdict_statistics (judgments=結果, analysis_type="verdict_rate", verdict_type="原告勝訴")
3. 生成回答: "根據 2025年6-7月 的數據,王婉如法官在返還不當得利案件中,共審理 X 筆,原告勝訴率為 XX%..."

範例 2: "王婉如法官在交通案件中,原告勝訴率是多少?"
步驟:
1. 調用 semantic_search_judgments (query="交通", judge_name="王婉如", limit=50) - 使用語意搜尋精確匹配案由
2. 調用 calculate_verdict_statistics (judgments=結果, analysis_type="verdict_rate", verdict_type="原告勝訴")
3. 生成回答: "根據 2025年6-7月 的數據,王婉如法官在交通案件中,原告勝訴率為 XX%..."

範例 3: "原告勝訴的案件都有哪些共通性?"
步驟:
1. 調用 search_judgments (query="*", verdict_type="原告勝訴", limit=100)
2. 調用 calculate_case_type_distribution (judgments=結果, group_by="case_type")
3. 生成回答: "根據 2025年6-7月 的數據,原告勝訴案件的共通性包括: 主要案由為 XX、YY、ZZ..."

範例 4: "如果我是律師,要在王婉如法官面前打『債務清償』案件,可能需要注意哪些傾向?"
步驟:
1. 調用 analyze_judge (judge_name="王婉如") - 先了解法官整體傾向
2. 調用 semantic_search_judgments (query="債務清償", judge_name="王婉如", limit=50) - 使用語意搜尋獲取相關案件 (自動匹配"清償債務"等同義詞)
3. 調用 calculate_verdict_statistics (judgments=結果, analysis_type="verdict_rate") - 計算勝訴率
4. 調用 get_citation_analysis (judge_name="王婉如", case_type="債務清償") - 分析常引用法條
5. 生成回答: "根據 2025年6-7月 的數據,王婉如法官在債務清償案件中: 1) 原告勝訴率為 XX%; 2) 常引用法條為...; 3) 建議注意..."

範例 5: "房東趕房客的案件,這位法官傾向如何?"
步驟:
1. 調用 semantic_search_judgments (query="房東趕房客", judge_name="王婉如", limit=50) - 語意搜尋會自動匹配"返還房屋"、"遷讓房屋"等相關案由
2. 調用 calculate_verdict_statistics (分析勝訴率)
3. 生成回答

範例 6: "法官對於勝訴的案件，有什麼樣的共通性?" (帶上下文) ⭐ 重要範例
上下文:
```
⚠️ 重要上下文：用戶正在查詢特定法官的資訊
當前查詢的法官：王婉如
```
步驟:
1. ⚠️ 識別上下文 - 用戶問的是「王婉如法官」的勝訴案件
2. 調用 search_judgments (query="*", judge_name="王婉如", verdict_type="原告勝訴", limit=100) - ⚠️ 務必加上 judge_name!
3. 調用 calculate_case_type_distribution (judgments=結果, group_by="case_type")
4. 生成回答: "根據 2025年6-7月 的數據,王婉如法官在原告勝訴案件中,常見案由包括: XX、YY、ZZ..."

**工具選擇策略**:

1. **使用 search_judgments (關鍵詞搜尋)** 當:
   - 用戶提供明確的標準案由名稱 (如: "交通"、"侵權行為")
   - 查詢包含精確的判決字號
   - 需要按日期範圍過濾
   - ⚠️ 注意: search_judgments 會搜尋判決書**全文內容**,可能返回案由不符但內容提到關鍵詞的案件

2. **使用 semantic_search_judgments (語意搜尋)** 當:
   - 用戶使用口語化描述 (如: "欠錢不還"、"房東趕房客")
   - 查詢可能包含同義詞 (如: "債務清償" vs "清償債務")
   - 需要精確匹配**案由**而非全文搜尋
   - 關鍵詞搜尋失敗或結果太少 (< 5 筆)
   - 不確定精確的案由名稱時

3. **混合策略** (推薦):
   - 優先使用 semantic_search_judgments (語意搜尋更精確,會匹配案由)
   - 如果需要精確過濾 (如日期範圍),再使用 search_judgments

**重要提醒**:
- 語意搜尋會自動處理同義詞,不需要手動嘗試多個關鍵詞
- 如果用戶問題涉及特定法官,優先使用 judge_name 參數精確匹配
- 如果需要分析共通性,先獲取足夠多的樣本 (建議 limit >= 50)
- 組合使用 MCP 工具和本地函數可以提供更深入的分析
- 當用戶問"需要注意哪些傾向"時,應該提供: 勝訴率、常引用法條、判決金額趨勢等多維度分析

**關鍵規則 - 計算勝訴率時**:
- ❌ 錯誤: 只搜尋勝訴案件,然後說勝訴率 100%
- ✅ 正確: 搜尋**所有**該案由的案件 (不加 verdict_type 過濾),然後用 calculate_verdict_statistics 計算勝訴率
- 範例: 用戶問"返還不當得利的勝訴率?" → 調用 semantic_search_judgments(query="返還不當得利", judge_name="王婉如", limit=50) **不要加 verdict_type**

**案由匹配優先級**:
1. 優先使用 semantic_search_judgments - 會精確匹配案由欄位
2. search_judgments 會搜尋全文,可能返回不相關案件 (案由不符但內容提到關鍵詞)
3. 如果用戶問特定案由的統計,務必使用 semantic_search 確保案由正確
`;

