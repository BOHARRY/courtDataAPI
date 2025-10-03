// controllers/ai-agent-controller.js
/**
 * AI Agent 控制器
 * 處理 AI Agent 對話,整合 OpenAI Function Calling 和 MCP 工具
 */

import OpenAI from 'openai';
import { OPENAI_API_KEY } from '../config/environment.js';
import { ALL_TOOLS, SYSTEM_PROMPT } from '../utils/ai-agent-tools.js';
import {
    calculate_verdict_statistics,
    extract_top_citations,
    analyze_amount_trends,
    compare_judges,
    calculate_case_type_distribution
} from '../utils/ai-agent-local-functions.js';
import {
    classifyIntent,
    generateOutOfScopeResponse,
    logIntentStats
} from '../services/intentClassifier.js';

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

// MCP Server URL
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'https://esmcp.onrender.com/mcp';

// 最大工具調用輪數
const MAX_ITERATIONS = 10;

// MCP Session 管理
let mcpSessionId = null;
let sessionInitTime = null;
const SESSION_TIMEOUT = 5 * 60 * 1000; // 5 分鐘過期

/**
 * 檢查 Session 是否有效
 */
function isSessionValid() {
    if (!mcpSessionId || !sessionInitTime) {
        return false;
    }

    const now = Date.now();
    const elapsed = now - sessionInitTime;

    if (elapsed > SESSION_TIMEOUT) {
        console.log('[AI Agent] Session 已過期,需要重新初始化');
        mcpSessionId = null;
        sessionInitTime = null;
        return false;
    }

    return true;
}

/**
 * 初始化 MCP Session
 */
async function initializeMCPSession(forceReinit = false) {
    // 如果強制重新初始化或 Session 無效,則重新初始化
    if (!forceReinit && isSessionValid()) {
        console.log('[AI Agent] 使用現有 Session:', mcpSessionId);
        return mcpSessionId;
    }

    try {
        console.log('[AI Agent] 初始化 MCP Session...');

        // 步驟 1: 發送 initialize 請求
        const initRequest = {
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
                protocolVersion: "2024-11-05",
                capabilities: {},
                clientInfo: {
                    name: "lawsowl-ai-agent",
                    version: "1.0.0"
                }
            }
        };

        const initResponse = await fetch(MCP_SERVER_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream'
            },
            body: JSON.stringify(initRequest)
        });

        if (!initResponse.ok) {
            throw new Error(`MCP 初始化失敗: ${initResponse.status}`);
        }

        // 獲取 Session ID
        mcpSessionId = initResponse.headers.get('Mcp-Session-Id');
        sessionInitTime = Date.now();
        console.log('[AI Agent] MCP Session 初始化成功:', mcpSessionId);

        // 步驟 2: 發送 initialized 通知 (必須!)
        console.log('[AI Agent] 發送 initialized 通知...');
        const notifyRequest = {
            jsonrpc: "2.0",
            method: "notifications/initialized"
        };

        await fetch(MCP_SERVER_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream',
                'Mcp-Session-Id': mcpSessionId
            },
            body: JSON.stringify(notifyRequest)
        });

        console.log('[AI Agent] initialized 通知發送成功');

        return mcpSessionId;
    } catch (error) {
        console.error('[AI Agent] MCP 初始化失敗:', error);
        mcpSessionId = null;
        sessionInitTime = null;
        throw error;
    }
}

/**
 * 調用 MCP 工具 (帶重試機制)
 */
async function callMCPTool(toolName, params, retryCount = 0) {
    const MAX_RETRIES = 2;

    try {
        console.log(`[AI Agent] ========== 調用 MCP 工具 ==========`);
        console.log(`[AI Agent] 工具名稱: ${toolName}`);
        console.log(`[AI Agent] 參數:`, JSON.stringify(params, null, 2));

        // 確保 MCP Session 已初始化
        const sessionId = await initializeMCPSession();
        console.log(`[AI Agent] Session ID: ${sessionId}`);

        // 構建 MCP 請求
        // 注意: FastMCP 要求參數包裝在 params 中
        const mcpRequest = {
            jsonrpc: "2.0",
            id: Date.now(),
            method: "tools/call",
            params: {
                name: toolName,
                arguments: {
                    params: params  // FastMCP 要求參數包裝在 params 中
                }
            }
        };

        console.log(`[AI Agent] MCP 請求:`, JSON.stringify(mcpRequest, null, 2));

        const response = await fetch(MCP_SERVER_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream',
                'Mcp-Session-Id': sessionId  // 添加 Session ID
            },
            body: JSON.stringify(mcpRequest)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[AI Agent] MCP Server 錯誤響應:', errorText);

            // 如果是 Session 相關錯誤且還有重試次數,重新初始化 Session 並重試
            if ((errorText.includes('session') || errorText.includes('Session')) && retryCount < MAX_RETRIES) {
                console.log(`[AI Agent] Session 錯誤,重新初始化並重試 (${retryCount + 1}/${MAX_RETRIES})...`);
                await initializeMCPSession(true); // 強制重新初始化
                return await callMCPTool(toolName, params, retryCount + 1);
            }

            throw new Error(`MCP Server 錯誤: ${response.status}`);
        }

        const text = await response.text();
        console.log('[AI Agent] MCP 原始響應 (前500字):', text.substring(0, 500));

        // 解析 SSE 格式
        const lines = text.trim().split('\n');
        let data = null;

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                data = line.substring(6).trim();
                break;
            }
        }

        if (!data) {
            console.error('[AI Agent] ❌ 未找到 data 行,完整響應:', text);
            throw new Error('MCP Server 未返回數據');
        }

        const result = JSON.parse(data);
        console.log('[AI Agent] 解析後的 JSON 結果 (前500字):', JSON.stringify(result, null, 2).substring(0, 500));

        // 提取工具返回的內容
        if (result.result && result.result.content && result.result.content[0]) {
            const content = result.result.content[0].text;
            console.log('[AI Agent] 工具返回內容 (前500字):', content.substring(0, 500));

            const parsedContent = JSON.parse(content);

            // 🆕 特別記錄判決書數據
            if (parsedContent['判決書']) {
                console.log(`[AI Agent] ✅ 返回 ${parsedContent['判決書'].length} 筆判決書`);
                console.log('[AI Agent] 判決書樣本 (第1筆):');
                console.log(JSON.stringify(parsedContent['判決書'][0], null, 2));
            }

            console.log('[AI Agent] =====================================');
            return parsedContent;
        }

        // 檢查是否有錯誤
        if (result.error) {
            console.error('[AI Agent] ❌ MCP 工具返回錯誤:', result.error);
            throw new Error(`MCP 工具錯誤: ${result.error.message || JSON.stringify(result.error)}`);
        }

        console.error('[AI Agent] ❌ 未預期的響應格式:', result);
        throw new Error('MCP 工具返回格式錯誤');
    } catch (error) {
        console.error(`[AI Agent] MCP 工具調用失敗:`, error);
        throw error;
    }
}

/**
 * 調用本地函數
 */
function callLocalFunction(functionName, args) {
    console.log(`[AI Agent] ========== 調用本地函數 ==========`);
    console.log(`[AI Agent] 函數名稱: ${functionName}`);
    console.log(`[AI Agent] 參數:`, JSON.stringify(args, null, 2).substring(0, 500) + '...');

    let result;

    switch (functionName) {
        case 'calculate_verdict_statistics':
            console.log(`[AI Agent] 判決書數量: ${args.judgments?.length || 0}`);
            console.log(`[AI Agent] 分析類型: ${args.analysis_type}`);
            console.log(`[AI Agent] 判決類型: ${args.verdict_type || '未指定'}`);

            result = calculate_verdict_statistics(args.judgments, {
                analysis_type: args.analysis_type,
                verdict_type: args.verdict_type
            });
            break;

        case 'extract_top_citations':
            result = extract_top_citations(args.citation_analysis, args.top_n);
            break;

        case 'analyze_amount_trends':
            result = analyze_amount_trends(args.judgments, args.trend_type);
            break;

        case 'compare_judges':
            result = compare_judges(args.judges_data);
            break;

        case 'calculate_case_type_distribution':
            result = calculate_case_type_distribution(args.judgments, args.group_by);
            break;

        default:
            throw new Error(`未知的本地函數: ${functionName}`);
    }

    console.log(`[AI Agent] 本地函數返回結果:`, JSON.stringify(result, null, 2).substring(0, 500) + '...');
    console.log(`[AI Agent] =====================================`);

    return result;
}

/**
 * 執行工具調用
 */
async function executeToolCall(toolCall) {
    const functionName = toolCall.function.name;
    const args = JSON.parse(toolCall.function.arguments);

    // MCP 工具列表
    const mcpTools = [
        'search_judgments',
        'semantic_search_judgments',  // 新增語意搜尋工具
        'get_citation_analysis',
        'get_case_details',
        'get_perspective_analysis',
        'analyze_judge'
    ];

    // 判斷是 MCP 工具還是本地函數
    if (mcpTools.includes(functionName)) {
        // 調用 MCP 工具
        const result = await callMCPTool(functionName, args);
        return result;
    } else {
        // 調用本地函數
        const result = callLocalFunction(functionName, args);
        return result;
    }
}

/**
 * AI Agent 對話處理
 */
export async function handleAIAgentChat(req, res) {
    try {
        const { question, judge_name = null, conversation_history = [] } = req.body;

        if (!question) {
            return res.status(400).json({
                error: '缺少問題內容'
            });
        }

        console.log('[AI Agent] 收到問題:', question);

        // 🆕 法官名稱 (從前端直接傳遞)
        const judgeName = judge_name;
        if (judgeName) {
            console.log('[AI Agent] 綁定法官:', judgeName);
            console.log('[AI Agent] 📌 此對話僅限於該法官的判決分析');
        }

        // 🆕 步驟 1: 意圖識別 (使用 GPT-4o-mini 快速分類)
        console.log('[AI Agent] ========== 意圖識別 ==========');

        // 如果有法官名稱,在意圖識別時也傳遞上下文
        const contextForIntent = judgeName
            ? `當前查詢的法官: ${judgeName}`
            : '';

        // 🆕 傳遞對話歷史,幫助理解延續性問題
        const intentResult = await classifyIntent(question, {
            context: contextForIntent,
            conversationHistory: conversation_history
        });
        logIntentStats(intentResult);

        // 如果不是法律相關問題,直接返回友好回應
        if (!intentResult.isLegalRelated) {
            console.log('[AI Agent] ❌ 問題超出範圍,意圖:', intentResult.intent);

            // 🆕 如果有法官名稱,強調只能回答該法官相關問題
            const outOfScopeResponse = judgeName
                ? `抱歉,這裡是 **${judgeName}法官** 的檢索頁面,目前只能回答和 **${judgeName}法官判決內容** 相關的分析唷! 😊

我可以幫您:
• 分析 ${judgeName}法官的判決傾向或判決結果比例
• 查找 ${judgeName}法官審理的特定案由判決案例
• 分析 ${judgeName}法官常引用的法條

歡迎重新提問!`
                : generateOutOfScopeResponse(intentResult.intent, question, judgeName);

            return res.json({
                success: true,
                answer: outOfScopeResponse,
                iterations: 0,
                intent: intentResult.intent,
                judge_name: judgeName,
                skipped_full_analysis: true,
                token_savings: {
                    saved_tokens: 4500,  // 估算節省的 Token 數量
                    cost_saved: 0.011    // 估算節省的成本 (USD)
                }
            });
        }

        console.log('[AI Agent] ✅ 問題相關,進入完整分析流程');
        console.log('[AI Agent] =====================================');

        // 🆕 動態構建 System Prompt (注入法官上下文)
        let systemPrompt = SYSTEM_PROMPT;

        if (judgeName) {
            console.log('[AI Agent] 🔴 動態注入法官上下文到 System Prompt');
            systemPrompt = `${SYSTEM_PROMPT}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 **重要上下文 - 當前查詢的法官**

**法官姓名**: ${judgeName}

**關鍵規則**:
- 用戶問題中提到「法官」、「這位法官」、「該法官」時,都是指「${judgeName}」法官
- 在**所有**工具調用中,必須使用 judge_name="${judgeName}" 參數
- 不要問用戶是哪位法官,直接使用 "${judgeName}"

**當前法官的範例**:

範例 A: 用戶問 "法官在損害賠償中的勝訴率?"
步驟:
1. [必須] 調用 semantic_search_judgments(query="損害賠償", judge_name="${judgeName}", limit=50)
   - 注意: judge_name="${judgeName}" 是必填的!
2. [必須] 調用 calculate_verdict_statistics(judgments=步驟1的結果, analysis_type="verdict_rate", verdict_type="原告勝訴")
3. 生成回答: "根據 2025年6-7月 的數據,${judgeName}法官在損害賠償案件中,原告勝訴率為 XX%..."

範例 B: 用戶問 "法官常引用哪些法條?"
步驟:
1. 調用 get_citation_analysis(judge_name="${judgeName}")
2. 生成回答: "根據 2025年6-7月 的數據,${judgeName}法官常引用的法條包括: ..."

範例 C: 用戶問 "法官的判決傾向如何?"
步驟:
1. 調用 analyze_judge(judge_name="${judgeName}")
2. 生成回答: "根據 2025年6-7月 的數據,${judgeName}法官的判決傾向: ..."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
        }

        // 構建對話歷史
        const messages = [
            { role: 'system', content: systemPrompt },
            ...conversation_history,
            { role: 'user', content: question }
        ];

        let iteration = 0;
        let finalResponse = null;

        // 循環調用工具,直到 GPT 生成最終回答
        while (iteration < MAX_ITERATIONS) {
            iteration++;
            console.log(`\n[AI Agent] ========================================`);
            console.log(`[AI Agent] 第 ${iteration} 輪`);
            console.log(`[AI Agent] ========================================`);

            // 調用 OpenAI
            const completion = await openai.chat.completions.create({
                model: 'gpt-4o',
                messages: messages,
                tools: ALL_TOOLS,
                tool_choice: 'auto',
                temperature: 0.3
            });

            const assistantMessage = completion.choices[0].message;

            // 🆕 記錄 GPT 的決策
            if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
                console.log(`[AI Agent] GPT 決定調用 ${assistantMessage.tool_calls.length} 個工具:`);
                assistantMessage.tool_calls.forEach((tc, idx) => {
                    console.log(`  [${idx + 1}] ${tc.function.name}`);
                    console.log(`      參數: ${tc.function.arguments.substring(0, 100)}...`);
                });
            } else {
                console.log(`[AI Agent] GPT 決定生成最終回答 (不調用工具)`);
                if (assistantMessage.content) {
                    console.log(`[AI Agent] 回答預覽: ${assistantMessage.content.substring(0, 200)}...`);
                }
            }

            messages.push(assistantMessage);

            // 檢查是否有工具調用
            if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
                // 沒有工具調用,表示 GPT 已生成最終回答
                finalResponse = assistantMessage.content;
                console.log(`[AI Agent] ✅ 完成! 共 ${iteration} 輪工具調用`);
                break;
            }

            // 執行所有工具調用
            for (const toolCall of assistantMessage.tool_calls) {
                try {
                    const result = await executeToolCall(toolCall);

                    console.log(`[AI Agent] 工具 ${toolCall.function.name} 執行成功`);
                    console.log(`[AI Agent] 返回數據大小: ${JSON.stringify(result).length} 字符`);

                    // 將工具結果添加到對話歷史
                    const toolMessage = {
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: JSON.stringify(result, null, 2)
                    };
                    messages.push(toolMessage);

                    console.log(`[AI Agent] 已將工具結果添加到對話歷史`);
                } catch (error) {
                    console.error(`[AI Agent] ❌ 工具調用失敗:`, error);

                    // 將錯誤信息添加到對話歷史
                    messages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: JSON.stringify({
                            error: error.message
                        })
                    });
                }
            }
        }

        if (!finalResponse) {
            finalResponse = '抱歉,處理您的問題時遇到了困難。請嘗試簡化您的問題或稍後再試。';
        }

        console.log('[AI Agent] 最終回答:', finalResponse);

        res.json({
            success: true,
            answer: finalResponse,
            iterations: iteration,
            conversation_history: messages.filter(m => m.role !== 'system')
        });

    } catch (error) {
        console.error('[AI Agent] 處理失敗:', error);
        res.status(500).json({
            error: 'AI Agent 處理失敗',
            details: error.message
        });
    }
}

/**
 * 檢查 AI Agent 健康狀態
 */
export async function checkAIAgentHealth(req, res) {
    try {
        // 測試 OpenAI 連接
        const testCompletion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: 'test' }],
            max_tokens: 5
        });

        // 測試 MCP Server 連接
        const mcpResponse = await fetch(`${MCP_SERVER_URL.replace('/mcp', '/ping')}`);
        const mcpHealthy = mcpResponse.ok;

        res.json({
            success: true,
            openai_status: 'healthy',
            mcp_server_status: mcpHealthy ? 'healthy' : 'unhealthy',
            tools_count: ALL_TOOLS.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

