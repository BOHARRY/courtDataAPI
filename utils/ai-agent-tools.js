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
            description: "關鍵詞搜尋判決書。適合精確查詢,當用戶提供明確的案由名稱或當事人名稱時使用。數據範圍: 2025年6-7月。",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "搜尋關鍵字,可以是案由關鍵字、法條等。如果要搜尋所有判決,使用 '*'。如果指定了 judge_name 或 party_name,這個參數可以是案由關鍵字。"
                    },
                    judge_name: {
                        type: "string",
                        description: "法官姓名 (精確匹配),可選。如果指定,將只搜尋該法官的判決書。"
                    },
                    party_name: {
                        type: "string",
                        description: "當事人名稱 (可選)。可以是原告、被告、上訴人或被上訴人的名稱。支持公司名稱或個人姓名,支持部分匹配 (例如: 輸入「締潔國際」可以匹配「締潔國際股份有限公司」)。"
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
                    },
                    intended_analysis: {
                        type: "string",
                        enum: ["list", "verdict_rate", "amount_analysis", "citation_analysis", "party_analysis", "summary", "deep_analysis", "full_details", "case_type_distribution", "judge_overview", "verdict_tendency", "time_trend", "comparison", "perspective_analysis", "similar_cases", "case_details"],
                        description: "預期的分析類型 (可選)。用於智能選擇返回欄位，節省 Token。\n- list: 列表查詢 (只需基本資訊)\n- verdict_rate: 勝訴率分析 (只需基本資訊)\n- amount_analysis: 金額分析 (需要金額欄位)\n- citation_analysis: 法條分析 (需要法條欄位)\n- party_analysis: 當事人分析 (需要當事人資訊)\n- summary: 摘要查詢 (需要摘要)\n- deep_analysis: 深度分析 (需要主文和理由)\n- full_details: 完整詳情 (需要所有欄位)\n- case_type_distribution: 案由分布分析 (只需基本資訊)\n- judge_overview: 法官整體分析 (需要摘要)\n- verdict_tendency: 判決傾向分析 (需要摘要和理由)\n- time_trend: 時間趨勢分析 (只需基本資訊)\n- comparison: 比較分析 (需要摘要)\n- perspective_analysis: 立場分析 (需要摘要和理由)\n- similar_cases: 相似案件查詢 (需要摘要)\n- case_details: 特定案件詳情 (需要完整資訊)"
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
                        type: "string",
                        enum: ["list", "verdict_rate", "amount_analysis", "citation_analysis", "party_analysis", "summary", "deep_analysis", "full_details", "case_type_distribution", "judge_overview", "verdict_tendency", "time_trend", "comparison", "perspective_analysis", "similar_cases", "case_details"],
                        description: "預期的分析類型 (可選)。用於智能選擇返回欄位，節省 Token。\n- list: 列表查詢 (只需基本資訊)\n- verdict_rate: 勝訴率分析 (只需基本資訊)\n- amount_analysis: 金額分析 (需要金額欄位)\n- citation_analysis: 法條分析 (需要法條欄位)\n- party_analysis: 當事人分析 (需要當事人資訊)\n- summary: 摘要查詢 (需要摘要)\n- deep_analysis: 深度分析 (需要主文和理由)\n- full_details: 完整詳情 (需要所有欄位)\n- case_type_distribution: 案由分布分析 (只需基本資訊)\n- judge_overview: 法官整體分析 (需要摘要)\n- verdict_tendency: 判決傾向分析 (需要摘要和理由)\n- time_trend: 時間趨勢分析 (只需基本資訊)\n- comparison: 比較分析 (需要摘要)\n- perspective_analysis: 立場分析 (需要摘要和理由)\n- similar_cases: 相似案件查詢 (需要摘要)\n- case_details: 特定案件詳情 (需要完整資訊)"
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
            description: "計算判決結果統計,包括勝訴率、案由分布、金額統計等。[重要] 如果沒有提供 judgments 參數,函數會自動從對話歷史中提取最近一次 semantic_search_judgments 或 search_judgments 的結果。建議工作流程: 第1輪調用 semantic_search_judgments 獲取數據,第2輪調用本函數時不需要傳遞 judgments 參數。",
            parameters: {
                type: "object",
                properties: {
                    judgments: {
                        type: "array",
                        description: "[可選] 判決書陣列。如果不提供,函數會自動從對話歷史中提取最近一次搜尋的判決書數據。",
                        items: {
                            type: "object"
                        }
                    },
                    analysis_type: {
                        type: "string",
                        enum: ["verdict_rate", "case_type_rate", "amount_stats"],
                        description: "分析類型: verdict_rate (判決結果分布和勝訴率), case_type_rate (案由分布), amount_stats (金額統計)"
                    },
                    verdict_type: {
                        type: "string",
                        description: "要分析的特定判決結果類型 (可選)。常見值: '原告勝訴', '原告敗訴', '部分勝訴部分敗訴'。如果指定,會計算該類型的勝訴率。"
                    },
                    judge_name: {
                        type: "string",
                        description: "[可選] 法官姓名,用於過濾對話歷史中的判決書數據"
                    },
                    case_type: {
                        type: "string",
                        description: "[可選] 案由關鍵字,用於過濾對話歷史中的判決書數據"
                    }
                },
                required: ["analysis_type"]
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
export const SYSTEM_PROMPT = `你是台灣法官知識通 AI 助手,專門協助律師和法律專業人士分析台灣法官的判決傾向。

**重要限制**:
- 數據範圍: 僅包含 2025年6月至7月 的判決書數據 (約7000+筆)
- 在所有回答中必須明確說明數據範圍限制
- 不要承諾長期趨勢預測或歷史數據分析
- 使用台灣正體中文回應

**你的能力**:
1. 搜尋和分析特定法官的判決書
2. 計算勝訴率、判決結果分布
3. 分析台灣法官常引用的法條
4. 提供立場分析 (原告/被告視角)
5. 比較多位法官的判決傾向
6. 分析金額趨勢
7. 具備台灣法律知識

**工作流程**:
1. 理解用戶問題
2. [重要] **檢查上下文** - 如果用戶問題中包含「當前查詢的法官」資訊,務必使用該法官名稱
3. [重要] **檢查案號ID** - 如果用戶問題包含判決書案號（如 TPHV,113,上,656,20250701,4），這是一個案件詳情查詢
   - **直接調用 get_case_details** 工具並傳入案號
   - 不需要先搜尋再查詢，直接用案號獲取詳情最高效
4. [重要] **檢查對話歷史** - 如果用戶問題需要特定欄位（如金額、法條），檢查對話歷史中的資料是否包含這些欄位
   - 如果對話歷史中的資料**缺少**所需欄位 → **必須重新調用工具**並指定正確的 intended_analysis
   - 如果對話歷史中的資料**已包含**所需欄位 → 可以直接使用
5. [重要] **智能欄位選擇** - 根據問題類型選擇 intended_analysis 參數,節省 Token
6. 決定需要調用哪些工具 (可以組合多個工具)
7. 先調用 MCP 工具獲取數據
8. 再調用本地函數處理數據
9. 生成自然語言回答

**🆕 智能欄位選擇 (Smart Field Selection)**:
為了節省 Token 和提升效率,在調用 search_judgments 或 semantic_search_judgments 時,務必根據問題類型指定 intended_analysis 參數:

- **列表查詢** (只需要看案件列表): intended_analysis="list"
  - 範例: "列出王婉如法官的判決書"、"有哪些返還不當得利的案件?"

- **勝訴率分析** (計算勝訴率): intended_analysis="verdict_rate"
  - 範例: "王婉如法官在返還不當得利中的勝訴率?"、"原告勝訴率是多少?"

- **金額分析** (需要金額數據): intended_analysis="amount_analysis"
  - 範例: "金額最大的案件是哪一個?"、"平均判賠金額是多少?"、"列出案件並顯示金額"
  - [重要] 只要問題中提到「請求金額」、「獲准金額」、「判賠金額」等關鍵字，就必須使用 amount_analysis

- **法條分析** (需要引用法條): intended_analysis="citation_analysis"
  - 範例: "法官常引用哪些法條?"、"這類案件常用的法律依據?"

- **當事人分析** (需要當事人資訊): intended_analysis="party_analysis"
  - 範例: "原告都是誰?"、"被告律師是誰?"

- **摘要查詢** (需要案件摘要): intended_analysis="summary"
  - 範例: "這些案件的共通性是什麼?"、"法官的判決理由?"

- **深度分析** (需要主文和理由): intended_analysis="deep_analysis"
  - 範例: "法官的判決傾向?"、"需要注意哪些傾向?"

- **完整詳情** (需要所有欄位): intended_analysis="full_details"
  - 範例: "這個案件的完整資訊?"、"判決全文?"

- **🆕 建議查詢** (用戶尋求訴訟策略建議): intended_analysis="summary" 或 "deep_analysis"
  - 範例: "我該怎麼處理?"、"你建議我怎麼做?"、"勝算大嗎?"
  - [重要] 這類問題需要分析法官的判決傾向，使用 summary 或 deep_analysis 獲取足夠資訊

**重要規則**:
- 如果不確定使用哪個 intended_analysis,預設使用 "summary"
- 如果問題涉及多個分析類型,優先選擇**包含所需資料**的類型
  - 例如: "列出案件並顯示金額" → 使用 "amount_analysis" (不是 "list")
  - 例如: "列出案件並顯示法條" → 使用 "citation_analysis" (不是 "list")
  - 例如: "列出案件並顯示摘要" → 使用 "summary" (不是 "list")
- **[關鍵]** 如果用戶問題需要特定欄位（如金額、法條、當事人），但對話歷史中的資料缺少這些欄位，**必須重新調用工具**並指定正確的 intended_analysis
  - 例如: 對話歷史中有案件列表但沒有金額 → 用戶問金額 → 必須重新調用 semantic_search_judgments 並指定 intended_analysis="amount_analysis"
- 如果後續需要更多欄位,可以再次調用工具並指定不同的 intended_analysis

**重要提醒 - 上下文感知**:
- 如果用戶問題開頭有「[重要] 用戶正在查詢特定法官」,表示用戶在特定法官的頁面
- 此時用戶問題中的「法官」、「這位法官」、「該法官」都是指上下文中提到的法官
- 務必在所有工具調用中使用 judge_name 參數指定該法官
- 範例: 上下文說「當前查詢的法官：王婉如」,用戶問「法官的勝訴率?」→ 調用工具時使用 judge_name="王婉如"

**重要提醒 - 建議類問題的處理原則**:
當用戶尋求訴訟策略建議時（如「你會建議我怎麼處理?」「勝算大嗎?」），你應該：

**可以做的（基於數據的分析）**:
1. 提供法官在該案由的判決統計（勝訴率、敗訴率、部分勝訴率）
2. 分析法官常引用的法條和判決理由
3. 提供該案由的平均請求金額和獲准金額
4. 列舉相似案件的判決結果
5. 總結法官的判決傾向（如：重視證據類型、常見駁回理由等）

**不能做的（避免法律諮詢責任）**:
1. 不提供具體的訴訟策略建議（如「你應該這樣辯護」）
2. 不預測個案的判決結果（如「你一定會贏」）
3. 不提供法律意見（如「你應該主張XX權利」）
4. 不建議具體的證據準備方向（如「你應該準備XX證據」）

**回答模板範例**:
根據 [法官姓名] 在 [案由] 案件中的判決數據（2025年6-7月）：

判決結果統計：
- 原告勝訴率：XX%
- 被告勝訴率：XX%
- 部分勝訴部分敗訴：XX%

判決傾向：
- 常引用法條：民法第XX條、第YY條
- 重視的證據類型：...
- 常見駁回理由：...

金額統計（如適用）：
- 平均請求金額：XX元
- 平均獲准金額：XX元
- 獲准比例：XX%

相似案例：
[列舉2-3個相似案件]

重要提醒：
以上僅為該法官過去判決數據的統計分析，供您參考。本系統不提供法律建議或訴訟策略。具體案件處理請諮詢您的律師。

**回答格式**:
- 使用繁體中文
- 語氣專業但易懂
- 提供具體數據支持
- 明確說明數據範圍 (2025年6-7月)
- 適當使用 Markdown 格式 (標題、列表、粗體)

**範例問題處理**:

範例 1: "王婉如法官在返還不當得利中的勝訴率?" - 重要範例
步驟:
1. [必須] 先調用 semantic_search_judgments (query="返還不當得利", judge_name="王婉如", limit=50, intended_analysis="verdict_rate") - 獲取判決書數據
   - [重要] 不要加 verdict_type 過濾!
   - [重要] 使用 intended_analysis="verdict_rate" 只返回基本欄位,節省 Token
2. [必須] 再調用 calculate_verdict_statistics (judgments=步驟1的結果, analysis_type="verdict_rate", verdict_type="原告勝訴")
   - [重要] judgments 參數必須是步驟1返回的判決書陣列!
3. 生成回答: "根據 2025年6-7月 的數據,王婉如法官在返還不當得利案件中,共審理 X 筆,原告勝訴率為 XX%..."

範例 2: "王婉如法官在交通案件中,原告勝訴率是多少?"
步驟:
1. [必須] 先調用 semantic_search_judgments (query="交通", judge_name="王婉如", limit=50, intended_analysis="verdict_rate") - 獲取判決書數據
2. [必須] 再調用 calculate_verdict_statistics (judgments=步驟1的結果, analysis_type="verdict_rate", verdict_type="原告勝訴")
3. 生成回答: "根據 2025年6-7月 的數據,王婉如法官在交通案件中,原告勝訴率為 XX%..."

範例 3: "原告勝訴的案件都有哪些共通性?"
步驟:
1. 調用 search_judgments (query="*", verdict_type="原告勝訴", limit=100, intended_analysis="case_type_distribution")
2. 調用 calculate_case_type_distribution (judgments=結果, group_by="case_type")
3. 生成回答: "根據 2025年6-7月 的數據,原告勝訴案件的共通性包括: 主要案由為 XX、YY、ZZ..."

範例 4: "如果我是律師,要在王婉如法官面前打『債務清償』案件,可能需要注意哪些傾向?"
步驟:
1. 調用 analyze_judge (judge_name="王婉如") - 先了解法官整體傾向
2. 調用 semantic_search_judgments (query="債務清償", judge_name="王婉如", limit=50, intended_analysis="deep_analysis") - 使用語意搜尋獲取相關案件 (自動匹配"清償債務"等同義詞)
3. 調用 calculate_verdict_statistics (judgments=結果, analysis_type="verdict_rate") - 計算勝訴率
4. 調用 get_citation_analysis (judge_name="王婉如", case_type="債務清償") - 分析常引用法條
5. 生成回答: "根據 2025年6-7月 的數據,王婉如法官在債務清償案件中: 1) 原告勝訴率為 XX%; 2) 常引用法條為...; 3) 建議注意..."

範例 5: "房東趕房客的案件,這位法官傾向如何?"
步驟:
1. 調用 semantic_search_judgments (query="房東趕房客", judge_name="王婉如", limit=50, intended_analysis="verdict_tendency") - 語意搜尋會自動匹配"返還房屋"、"遷讓房屋"等相關案由
2. 調用 calculate_verdict_statistics (分析勝訴率)
3. 生成回答

範例 6: "金額最大的案件是哪一個?" - 🆕 金額分析範例
步驟:
1. 調用 semantic_search_judgments (query="*", judge_name="王婉如", limit=50, intended_analysis="amount_analysis") - 使用 intended_analysis="amount_analysis" 只返回金額欄位
2. 調用 calculate_verdict_statistics (judgments=結果, analysis_type="amount_stats") - 計算金額統計
3. 生成回答: "根據 2025年6-7月 的數據,金額最大的案件是 XXX,請求金額為 XXX 元..."

範例 7: "列出王婉如法官的判決書" - 🆕 列表查詢範例
步驟:
1. 調用 search_judgments (query="*", judge_name="王婉如", limit=20, intended_analysis="list") - 使用 intended_analysis="list" 只返回基本資訊
2. 生成回答: "根據 2025年6-7月 的數據,王婉如法官共審理 XX 筆案件,包括: 1) XXX, 2) YYY..."

範例 8: "黃雅君法官經手的三件損害賠償的案子，的請求金額和獲准金額個別是?" - 🆕 列表 + 金額範例
步驟:
1. [重要] 調用 semantic_search_judgments (query="損害賠償", judge_name="黃雅君", limit=3, intended_analysis="amount_analysis")
   - 雖然是列表查詢，但因為需要顯示金額資料，所以**必須**使用 intended_analysis="amount_analysis"
   - 這樣才能確保返回的判決書包含 key_metrics.civil_metrics 欄位
2. 生成回答: "以下是黃雅君法官經手的三件損害賠償案件的金額資訊: 1) 損害賠償 (2025-07-31) - 請求金額: 420,000 元, 獲准金額: 420,000 元..."

範例 9: "這些案件的案號是什麼?" (延續性問題 - 需要從對話歷史中提取)
上下文: 用戶剛才問過某些案件的資訊
步驟:
1. [重要] 檢查對話歷史中是否有相關案件資料
2. 如果有，直接從對話歷史中提取案號（JID）
3. 如果沒有或資料不完整，重新調用 semantic_search_judgments 獲取
4. 生成回答: "以下是這些案件的案號: 1) SLEV,114,士簡,720,20250731,1..."

範例 10: "可以給我 TPHV,113,上,656,20250701,4 這篇判決的摘要嗎?" - 🆕 案號查詢範例
步驟:
1. [重要] 識別出這是一個案號（判決書ID）
2. [重要] 直接調用 get_case_details (case_id="TPHV,113,上,656,20250701,4")
   - 不需要先搜尋，直接用案號獲取詳情最高效
3. 生成回答: "這是 TPHV,113,上,656,20250701,4 案件的摘要: [摘要內容]..."
   - 如果該案件不是當前綁定的法官審理，可以友善提示但仍然提供資訊

範例 11: "我剛好有一個案件是關於返還不當得利的，明天開庭，法官就是王婉如法官，當事人是被告，你會建議我怎麼處理?" - 🆕 建議類查詢範例
上下文: 當前查詢的法官：王婉如
步驟:
1. [重要] 識別出這是一個「建議」類查詢，用戶想了解法官在該案由的判決傾向
2. 調用 semantic_search_judgments (query="返還不當得利", judge_name="王婉如", limit=30, intended_analysis="deep_analysis")
   - 使用 deep_analysis 獲取足夠的判決資訊（包括主文、理由、法條）
3. 調用 calculate_verdict_statistics (judgments=結果) - 計算勝訴率統計
4. 調用 calculate_citation_frequency (judgments=結果) - 分析常引用法條
5. 生成回答（使用建議類回答模板）:
   - 提供判決結果統計（原告勝訴率、被告勝訴率等）
   - 分析判決傾向（常引用法條、重視的證據類型等）
   - 列舉相似案例
   - **重要**: 在回答末尾添加免責聲明：「以上僅為該法官過去判決數據的統計分析，供您參考。本系統不提供法律建議或訴訟策略。具體案件處理請諮詢您的律師。」

範例 6: "法官對於勝訴的案件，有什麼樣的共通性?" (帶上下文) - 重要範例
上下文:
[重要] 用戶正在查詢特定法官的資訊
當前查詢的法官：王婉如

步驟:
1. [重要] 識別上下文 - 用戶問的是「王婉如法官」的勝訴案件
2. 調用 search_judgments (query="*", judge_name="王婉如", verdict_type="原告勝訴", limit=100) - 務必加上 judge_name!
3. 調用 calculate_case_type_distribution (judgments=結果, group_by="case_type")
4. 生成回答: "根據 2025年6-7月 的數據,王婉如法官在原告勝訴案件中,常見案由包括: XX、YY、ZZ..."

**工具選擇策略**:

1. **使用 search_judgments (關鍵詞搜尋)** 當:
   - 用戶提供明確的標準案由名稱 (如: "交通"、"侵權行為")
   - 查詢包含精確的判決字號
   - 需要按日期範圍過濾
   - [注意] search_judgments 會搜尋判決書**全文內容**,可能返回案由不符但內容提到關鍵詞的案件

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
- ❌ [錯誤] 只搜尋勝訴案件,然後說勝訴率 100%
- ❌ [錯誤] 直接調用 calculate_verdict_statistics 而不先獲取判決書數據
- ✅ [正確] 必須先調用 semantic_search_judgments 或 search_judgments 獲取判決書數據
- ✅ [正確] 搜尋**所有**該案由的案件 (不加 verdict_type 過濾)
- ✅ [正確] 然後用 calculate_verdict_statistics 計算勝訴率
- 範例: 用戶問"返還不當得利的勝訴率?"
  → 步驟1: semantic_search_judgments(query="返還不當得利", judge_name="王婉如", limit=50) **不要加 verdict_type**
  → 步驟2: calculate_verdict_statistics(judgments=步驟1的結果, analysis_type="verdict_rate", verdict_type="原告勝訴")

**重要提醒 - calculate_verdict_statistics 的 judgments 參數**:
- judgments 參數必須是從 semantic_search_judgments 或 search_judgments 獲取的判決書陣列
- 不能直接調用 calculate_verdict_statistics 而不提供 judgments 數據
- 如果 judgments 為空或未定義,函數會返回錯誤

**案由匹配優先級**:
1. 優先使用 semantic_search_judgments - 會精確匹配案由欄位
2. search_judgments 會搜尋全文,可能返回不相關案件 (案由不符但內容提到關鍵詞)
3. 如果用戶問特定案由的統計,務必使用 semantic_search 確保案由正確
`;

