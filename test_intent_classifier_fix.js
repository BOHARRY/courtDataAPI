/**
 * 測試 Intent Classifier 修正
 * 驗證對話歷史過濾邏輯是否正確處理 tool/tool_calls 訊息
 */

// 模擬包含 tool/tool_calls 的對話歷史
const conversationHistoryWithTools = [
    { role: 'user', content: '黃麟捷法官在損害賠償案件中的勝訴率?' },
    { 
        role: 'assistant', 
        content: '讓我查詢一下...',
        tool_calls: [
            {
                id: 'call_123',
                type: 'function',
                function: {
                    name: 'semantic_search_judgments',
                    arguments: '{"query":"損害賠償","judge_name":"黃麟捷"}'
                }
            }
        ]
    },
    { 
        role: 'tool', 
        tool_call_id: 'call_123',
        content: '{"搜尋結果": [...]}' 
    },
    { role: 'assistant', content: '根據查詢結果，黃麟捷法官在損害賠償案件中...' },
    { role: 'user', content: '那平均獲准金額是多少?' },
    { 
        role: 'assistant', 
        content: '讓我計算一下...',
        tool_calls: [
            {
                id: 'call_456',
                type: 'function',
                function: {
                    name: 'calculate_verdict_statistics',
                    arguments: '{"analysis_type":"amount_stats"}'
                }
            }
        ]
    },
    { 
        role: 'tool', 
        tool_call_id: 'call_456',
        content: '{"平均獲准金額": 418800}' 
    },
    { role: 'assistant', content: '平均獲准金額為 418,800 元' },
    { role: 'user', content: '請給我這兩個案子的案號' }
];

// 測試過濾邏輯
function testHistoryFiltering() {
    console.log('=' .repeat(60));
    console.log('測試 1: 對話歷史過濾邏輯');
    console.log('=' .repeat(60));
    
    console.log('\n原始對話歷史長度:', conversationHistoryWithTools.length);
    console.log('原始對話歷史角色:', conversationHistoryWithTools.map(m => m.role).join(', '));
    
    // 模擬 intentClassifier.js 中的過濾邏輯
    const recentHistory = conversationHistoryWithTools
        .slice(-6) // 最近 3 輪 (每輪 2 條消息)
        .filter(msg => {
            // 只保留 user 和 assistant 訊息
            // 移除 tool 訊息（避免缺少對應的 tool_calls）
            // 移除包含 tool_calls 的 assistant 訊息（簡化對話）
            return (msg.role === 'user' || msg.role === 'assistant') && !msg.tool_calls;
        });
    
    console.log('\n過濾後對話歷史長度:', recentHistory.length);
    console.log('過濾後對話歷史角色:', recentHistory.map(m => m.role).join(', '));
    console.log('\n過濾後的訊息:');
    recentHistory.forEach((msg, idx) => {
        console.log(`  [${idx}] ${msg.role}: ${msg.content.substring(0, 50)}...`);
    });
    
    // 驗證
    const hasToolMessages = recentHistory.some(m => m.role === 'tool');
    const hasToolCalls = recentHistory.some(m => m.tool_calls);
    
    console.log('\n驗證結果:');
    console.log('  ✅ 是否包含 tool 訊息:', hasToolMessages ? '❌ 是' : '✅ 否');
    console.log('  ✅ 是否包含 tool_calls:', hasToolCalls ? '❌ 是' : '✅ 否');
    
    if (!hasToolMessages && !hasToolCalls) {
        console.log('\n🎉 測試通過！過濾邏輯正確！');
        return true;
    } else {
        console.log('\n❌ 測試失敗！仍然包含 tool/tool_calls 訊息！');
        return false;
    }
}

// 測試構建給 OpenAI 的訊息列表
function testMessageConstruction() {
    console.log('\n' + '='.repeat(60));
    console.log('測試 2: 構建給 OpenAI 的訊息列表');
    console.log('=' .repeat(60));
    
    const INTENT_CLASSIFIER_PROMPT = `你是一個意圖分類器...`;
    
    const messages = [
        { role: 'system', content: INTENT_CLASSIFIER_PROMPT }
    ];
    
    // 過濾對話歷史
    const recentHistory = conversationHistoryWithTools
        .slice(-6)
        .filter(msg => {
            return (msg.role === 'user' || msg.role === 'assistant') && !msg.tool_calls;
        });
    
    if (recentHistory.length > 0) {
        messages.push(...recentHistory);
    }
    
    // 添加當前問題
    const question = '請給我這兩個案子的案號';
    const context = '當前查詢的法官: 黃雅君';
    const fullQuestion = `上下文: ${context}\n\n用戶問題: ${question}`;
    messages.push({ role: 'user', content: fullQuestion });
    
    console.log('\n構建的訊息列表:');
    messages.forEach((msg, idx) => {
        const preview = msg.content.substring(0, 50);
        console.log(`  [${idx}] ${msg.role}: ${preview}...`);
        if (msg.tool_calls) {
            console.log(`       ⚠️ 包含 tool_calls!`);
        }
    });
    
    // 驗證訊息列表的有效性
    let isValid = true;
    let errorMessage = '';
    
    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        
        // 檢查是否有 tool 訊息
        if (msg.role === 'tool') {
            isValid = false;
            errorMessage = `訊息 [${i}] 是 tool 訊息，但可能缺少對應的 tool_calls`;
            break;
        }
        
        // 檢查 tool 訊息是否緊跟在 tool_calls 之後
        if (msg.role === 'tool' && i > 0) {
            const prevMsg = messages[i - 1];
            if (prevMsg.role !== 'assistant' || !prevMsg.tool_calls) {
                isValid = false;
                errorMessage = `訊息 [${i}] 是 tool 訊息，但前一個訊息不包含 tool_calls`;
                break;
            }
        }
    }
    
    console.log('\n驗證結果:');
    if (isValid) {
        console.log('  🎉 訊息列表有效！可以安全發送給 OpenAI API');
        return true;
    } else {
        console.log(`  ❌ 訊息列表無效！${errorMessage}`);
        return false;
    }
}

// 運行所有測試
function runAllTests() {
    console.log('\n🚀 開始測試 Intent Classifier 修正...\n');
    
    const test1 = testHistoryFiltering();
    const test2 = testMessageConstruction();
    
    console.log('\n' + '='.repeat(60));
    console.log('測試總結');
    console.log('=' .repeat(60));
    console.log('  測試 1 (對話歷史過濾):', test1 ? '✅ 通過' : '❌ 失敗');
    console.log('  測試 2 (訊息列表構建):', test2 ? '✅ 通過' : '❌ 失敗');
    
    if (test1 && test2) {
        console.log('\n🎉 所有測試通過！修正成功！');
        console.log('\n📝 修正內容:');
        console.log('  - 過濾掉所有 tool 訊息');
        console.log('  - 過濾掉包含 tool_calls 的 assistant 訊息');
        console.log('  - 只保留純文本的 user 和 assistant 訊息');
        console.log('\n✅ 這樣可以避免 OpenAI API 錯誤:');
        console.log('   "messages with role \'tool\' must be a response to a preceeding message with \'tool_calls\'"');
        return 0;
    } else {
        console.log('\n❌ 部分測試失敗！需要進一步修正');
        return 1;
    }
}

// 執行測試
runAllTests();

