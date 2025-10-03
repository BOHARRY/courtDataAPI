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
            description: "搜尋判決書。可以按法官姓名、案由、判決結果類型、日期範圍進行過濾。數據範圍: 2025年6-7月。",
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
2. 決定需要調用哪些工具 (可以組合多個工具)
3. 先調用 MCP 工具獲取數據
4. 再調用本地函數處理數據
5. 生成自然語言回答

**回答格式**:
- 使用繁體中文
- 語氣專業但易懂
- 提供具體數據支持
- 明確說明數據範圍 (2025年6-7月)
- 適當使用 Markdown 格式 (標題、列表、粗體)

**範例問題處理**:

範例 1: "王婉如法官在交通案件中,原告勝訴率是多少?"
步驟:
1. 調用 search_judgments (query="交通", judge_name="王婉如", limit=50)
2. 調用 calculate_verdict_statistics (judgments=結果, analysis_type="verdict_rate", verdict_type="原告勝訴")
3. 生成回答: "根據 2025年6-7月 的數據,王婉如法官在交通案件中,原告勝訴率為 XX%..."

範例 2: "原告勝訴的案件都有哪些共通性?"
步驟:
1. 調用 search_judgments (query="*", verdict_type="原告勝訴", limit=100)
2. 調用 calculate_case_type_distribution (judgments=結果, group_by="case_type")
3. 生成回答: "根據 2025年6-7月 的數據,原告勝訴案件的共通性包括: 主要案由為 XX、YY、ZZ..."

**重要提醒**:
- 如果用戶問題涉及特定法官,優先使用 judge_name 參數精確匹配
- 如果需要分析共通性,先獲取足夠多的樣本 (建議 limit >= 50)
- 組合使用 MCP 工具和本地函數可以提供更深入的分析
`;

