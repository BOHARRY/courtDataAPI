// test-ai-agent.js
/**
 * 測試 AI Agent 的 MCP 工具調用
 */

import fetch from 'node-fetch';

const MCP_SERVER_URL = 'https://esmcp.onrender.com/mcp';

async function testMCPConnection() {
    console.log('🧪 測試 MCP Server 連接...\n');

    try {
        // 步驟 1: 初始化 Session
        console.log('步驟 1: 初始化 MCP Session');
        const initRequest = {
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
                protocolVersion: "2024-11-05",
                capabilities: {},
                clientInfo: {
                    name: "test-client",
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

        const sessionId = initResponse.headers.get('Mcp-Session-Id');
        console.log('✅ Session ID:', sessionId);

        // 步驟 2: 發送 initialized 通知
        console.log('\n步驟 2: 發送 initialized 通知');
        const notifyRequest = {
            jsonrpc: "2.0",
            method: "notifications/initialized"
        };

        await fetch(MCP_SERVER_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream',
                'Mcp-Session-Id': sessionId
            },
            body: JSON.stringify(notifyRequest)
        });
        console.log('✅ 通知發送成功');

        // 步驟 3: 調用 analyze_judge 工具
        console.log('\n步驟 3: 調用 analyze_judge 工具');
        const toolRequest = {
            jsonrpc: "2.0",
            id: Date.now(),
            method: "tools/call",
            params: {
                name: "analyze_judge",
                arguments: {
                    params: {
                        judge_name: "王婉如",
                        limit: 50
                    }
                }
            }
        };

        const toolResponse = await fetch(MCP_SERVER_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream',
                'Mcp-Session-Id': sessionId
            },
            body: JSON.stringify(toolRequest)
        });

        if (!toolResponse.ok) {
            console.error('❌ 工具調用失敗:', toolResponse.status);
            const errorText = await toolResponse.text();
            console.error('錯誤詳情:', errorText);
            return;
        }

        const text = await toolResponse.text();
        console.log('✅ 收到響應');

        // 解析 SSE 格式
        const lines = text.trim().split('\n');
        let data = null;
        
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                data = line.substring(6).trim();
                break;
            }
        }

        if (data) {
            const result = JSON.parse(data);
            console.log('\n📊 結果:');
            console.log(JSON.stringify(result, null, 2));

            if (result.result && result.result.content) {
                const content = result.result.content[0].text;
                const parsed = JSON.parse(content);
                console.log('\n✅ 解析後的數據:');
                console.log(`法官姓名: ${parsed['法官姓名']}`);
                console.log(`分析判決書數量: ${parsed['分析判決書數量']}`);
                console.log(`裁判結果分布: ${parsed['裁判結果分布'].length} 種`);
            }
        }

        console.log('\n✅ 測試完成!');

    } catch (error) {
        console.error('❌ 測試失敗:', error);
    }
}

testMCPConnection();

