// test-e2e-workflow.js
/**
 * 端到端測試: 模擬完整的對話流程
 * 測試 Intent Classifier + AI Agent + 自動數據提取
 */

import { calculate_verdict_statistics } from './utils/ai-agent-local-functions.js';

async function testE2EWorkflow() {
    console.log('========================================');
    console.log('端到端測試: 勝訴率計算工作流程');
    console.log('========================================\n');

    // 模擬對話歷史
    const conversationHistory = [
        {
            role: 'user',
            content: '黃麟捷法官在損害賠償中的勝訴率?'
        },
        {
            role: 'assistant',
            content: '',
            tool_calls: [
                {
                    id: 'call_1',
                    type: 'function',
                    function: {
                        name: 'semantic_search_judgments',
                        arguments: JSON.stringify({
                            query: '損害賠償',
                            judge_name: '黃麟捷',
                            limit: 50
                        })
                    }
                }
            ]
        },
        {
            role: 'tool',
            tool_call_id: 'call_1',
            content: JSON.stringify({
                "總數": 18,
                "判決書": [
                    {
                        "案號": "CLEV,114,壢保險小,342,20250708,1",
                        "案由": "損害賠償",
                        "法官": "黃麟捷",
                        "裁判結果": "原告勝訴"
                    },
                    {
                        "案號": "CLEV,114,壢保險小,343,20250708,1",
                        "案由": "損害賠償",
                        "法官": "黃麟捷",
                        "裁判結果": "原告敗訴"
                    },
                    {
                        "案號": "CLEV,114,壢保險小,344,20250708,1",
                        "案由": "損害賠償",
                        "法官": "黃麟捷",
                        "裁判結果": "原告勝訴"
                    },
                    {
                        "案號": "CLEV,114,壢保險小,345,20250708,1",
                        "案由": "損害賠償",
                        "法官": "黃麟捷",
                        "裁判結果": "部分勝訴部分敗訴"
                    },
                    {
                        "案號": "CLEV,114,壢保險小,346,20250708,1",
                        "案由": "損害賠償",
                        "法官": "黃麟捷",
                        "裁判結果": "原告勝訴"
                    }
                ]
            }, null, 2)
        }
    ];

    console.log('步驟 1: 模擬第1輪工具調用 (semantic_search_judgments)');
    console.log('  - 返回 5 筆判決書數據');
    console.log('  - 數據已添加到對話歷史\n');

    console.log('步驟 2: 模擬第2輪工具調用 (calculate_verdict_statistics)');
    console.log('  - 不傳遞 judgments 參數');
    console.log('  - 函數應該自動從對話歷史中提取數據\n');

    // 測試 1: 不傳遞 judgments 參數
    console.log('測試 1: 不傳遞 judgments 參數 (應該自動提取)');
    const result1 = calculate_verdict_statistics(
        undefined,  // 不傳遞 judgments
        {
            analysis_type: 'verdict_rate',
            verdict_type: '原告勝訴'
        },
        conversationHistory  // 傳遞對話歷史
    );

    console.log('結果:');
    console.log(JSON.stringify(result1, null, 2));
    console.log('');

    if (result1.error) {
        console.log('❌ 測試 1 失敗: 應該能從對話歷史中提取數據');
    } else {
        console.log('✅ 測試 1 通過: 成功從對話歷史中提取數據');
        console.log(`  - 總案件數: ${result1.總案件數}`);
        console.log(`  - 原告勝訴: ${result1.原告勝訴}`);
        console.log(`  - 勝訴率: ${result1.勝訴率}`);
    }

    console.log('\n----------------------------------------\n');

    // 測試 2: 傳遞空陣列 (應該自動提取)
    console.log('測試 2: 傳遞空陣列 (應該自動提取)');
    const result2 = calculate_verdict_statistics(
        [],  // 空陣列
        {
            analysis_type: 'verdict_rate',
            verdict_type: '原告勝訴'
        },
        conversationHistory
    );

    console.log('結果:');
    console.log(JSON.stringify(result2, null, 2));
    console.log('');

    if (result2.error) {
        console.log('❌ 測試 2 失敗: 應該能從對話歷史中提取數據');
    } else {
        console.log('✅ 測試 2 通過: 成功從對話歷史中提取數據');
    }

    console.log('\n----------------------------------------\n');

    // 測試 3: 沒有對話歷史 (應該返回錯誤)
    console.log('測試 3: 沒有對話歷史 (應該返回錯誤)');
    const result3 = calculate_verdict_statistics(
        undefined,
        {
            analysis_type: 'verdict_rate',
            verdict_type: '原告勝訴'
        },
        []  // 空的對話歷史
    );

    console.log('結果:');
    console.log(JSON.stringify(result3, null, 2));
    console.log('');

    if (result3.error) {
        console.log('✅ 測試 3 通過: 正確返回錯誤');
    } else {
        console.log('❌ 測試 3 失敗: 應該返回錯誤');
    }

    console.log('\n----------------------------------------\n');

    // 測試 4: 使用 judge_name 過濾
    console.log('測試 4: 使用 judge_name 過濾 (應該只保留黃麟捷的判決)');
    
    // 添加其他法官的數據到對話歷史
    const conversationHistoryWithMultipleJudges = [
        ...conversationHistory,
        {
            role: 'tool',
            tool_call_id: 'call_2',
            content: JSON.stringify({
                "總數": 3,
                "判決書": [
                    {
                        "案號": "CLEV,114,壢保險小,999,20250708,1",
                        "案由": "損害賠償",
                        "法官": "王婉如",
                        "裁判結果": "原告勝訴"
                    }
                ]
            }, null, 2)
        }
    ];

    const result4 = calculate_verdict_statistics(
        undefined,
        {
            analysis_type: 'verdict_rate',
            verdict_type: '原告勝訴',
            judge_name: '黃麟捷'  // 過濾法官
        },
        conversationHistoryWithMultipleJudges
    );

    console.log('結果:');
    console.log(JSON.stringify(result4, null, 2));
    console.log('');

    if (result4.error) {
        console.log('❌ 測試 4 失敗: 應該能過濾法官');
    } else {
        console.log('✅ 測試 4 通過: 成功過濾法官');
        console.log(`  - 總案件數: ${result4.總案件數} (應該是 5,不包含王婉如的 1 筆)`);
    }

    console.log('\n========================================');
    console.log('測試完成');
    console.log('========================================');
}

// 執行測試
testE2EWorkflow().catch(console.error);

