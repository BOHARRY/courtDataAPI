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

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

// MCP Server URL
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'https://esmcp.onrender.com/mcp';

// 最大工具調用輪數
const MAX_ITERATIONS = 10;

// MCP Session 管理
let mcpSessionId = null;

/**
 * 初始化 MCP Session
 */
async function initializeMCPSession() {
    if (mcpSessionId) {
        return mcpSessionId; // 已經初始化
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
        mcpSessionId = null; // 重置以便下次重試
        throw error;
    }
}

/**
 * 調用 MCP 工具
 */
async function callMCPTool(toolName, params) {
    try {
        console.log(`[AI Agent] 調用 MCP 工具: ${toolName}`, params);

        // 確保 MCP Session 已初始化
        const sessionId = await initializeMCPSession();

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
            throw new Error(`MCP Server 錯誤: ${response.status}`);
        }

        const text = await response.text();
        console.log('[AI Agent] MCP 原始響應:', text.substring(0, 500));

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
            console.error('[AI Agent] 未找到 data 行,完整響應:', text);
            throw new Error('MCP Server 未返回數據');
        }

        const result = JSON.parse(data);
        console.log('[AI Agent] 解析後的結果:', JSON.stringify(result, null, 2));

        // 提取工具返回的內容
        if (result.result && result.result.content && result.result.content[0]) {
            const content = result.result.content[0].text;
            console.log('[AI Agent] 工具返回內容:', content.substring(0, 200));
            return JSON.parse(content);
        }

        // 檢查是否有錯誤
        if (result.error) {
            console.error('[AI Agent] MCP 工具返回錯誤:', result.error);
            throw new Error(`MCP 工具錯誤: ${result.error.message || JSON.stringify(result.error)}`);
        }

        console.error('[AI Agent] 未預期的響應格式:', result);
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
    console.log(`[AI Agent] 調用本地函數: ${functionName}`, args);

    switch (functionName) {
        case 'calculate_verdict_statistics':
            return calculate_verdict_statistics(args.judgments, {
                analysis_type: args.analysis_type,
                verdict_type: args.verdict_type
            });
        
        case 'extract_top_citations':
            return extract_top_citations(args.citation_analysis, args.top_n);
        
        case 'analyze_amount_trends':
            return analyze_amount_trends(args.judgments, args.trend_type);
        
        case 'compare_judges':
            return compare_judges(args.judges_data);
        
        case 'calculate_case_type_distribution':
            return calculate_case_type_distribution(args.judgments, args.group_by);
        
        default:
            throw new Error(`未知的本地函數: ${functionName}`);
    }
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
        const { question, conversation_history = [] } = req.body;

        if (!question) {
            return res.status(400).json({
                error: '缺少問題內容'
            });
        }

        console.log('[AI Agent] 收到問題:', question);

        // 構建對話歷史
        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...conversation_history,
            { role: 'user', content: question }
        ];

        let iteration = 0;
        let finalResponse = null;

        // 循環調用工具,直到 GPT 生成最終回答
        while (iteration < MAX_ITERATIONS) {
            iteration++;
            console.log(`[AI Agent] 第 ${iteration} 輪`);

            // 調用 OpenAI
            const completion = await openai.chat.completions.create({
                model: 'gpt-4o',
                messages: messages,
                tools: ALL_TOOLS,
                tool_choice: 'auto',
                temperature: 0.3
            });

            const assistantMessage = completion.choices[0].message;
            messages.push(assistantMessage);

            // 檢查是否有工具調用
            if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
                // 沒有工具調用,表示 GPT 已生成最終回答
                finalResponse = assistantMessage.content;
                break;
            }

            // 執行所有工具調用
            for (const toolCall of assistantMessage.tool_calls) {
                try {
                    const result = await executeToolCall(toolCall);
                    
                    // 將工具結果添加到對話歷史
                    messages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: JSON.stringify(result, null, 2)
                    });
                } catch (error) {
                    console.error('[AI Agent] 工具調用失敗:', error);
                    
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

