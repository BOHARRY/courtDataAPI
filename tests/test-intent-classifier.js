// tests/test-intent-classifier.js
/**
 * 意圖識別測試腳本
 * 測試各種問題的分類準確性和 Token 消耗
 */

import { classifyIntent, generateOutOfScopeResponse } from '../services/intentClassifier.js';

// 測試案例
const testCases = [
    // 法律分析相關 (應該通過)
    {
        question: "王婉如法官在交通案件中的勝訴率是多少?",
        expectedIntent: "legal_analysis",
        description: "典型的勝訴率查詢"
    },
    {
        question: "損害賠償案件有哪些?",
        expectedIntent: "legal_analysis",
        description: "案件列表查詢"
    },
    {
        question: "法官常引用哪些法條?",
        expectedIntent: "legal_analysis",
        description: "法條分析查詢"
    },
    {
        question: "黃麟捷法官在損害賠償中的勝訴率?",
        expectedIntent: "legal_analysis",
        description: "特定法官勝訴率"
    },
    {
        question: "這位法官對原告的判決傾向如何?",
        expectedIntent: "legal_analysis",
        description: "判決傾向分析"
    },

    // 打招呼 (應該被過濾)
    {
        question: "你好",
        expectedIntent: "greeting",
        description: "簡單問候"
    },
    {
        question: "嗨,你是誰?",
        expectedIntent: "greeting",
        description: "自我介紹請求"
    },

    // 超出範圍 (應該被過濾)
    {
        question: "法官單身嗎?",
        expectedIntent: "out_of_scope",
        description: "法官個人生活"
    },
    {
        question: "今天天氣如何?",
        expectedIntent: "out_of_scope",
        description: "天氣查詢"
    },
    {
        question: "股票會漲嗎?",
        expectedIntent: "out_of_scope",
        description: "股票查詢"
    },
    {
        question: "法官喜歡吃什麼?",
        expectedIntent: "out_of_scope",
        description: "法官個人喜好"
    },

    // 不清楚 (應該被過濾)
    {
        question: "asdfgh",
        expectedIntent: "unclear",
        description: "無意義字串"
    },
    {
        question: "???",
        expectedIntent: "unclear",
        description: "問號"
    }
];

/**
 * 執行測試
 */
async function runTests() {
    console.log('========================================');
    console.log('意圖識別測試開始');
    console.log('========================================\n');

    let totalTests = 0;
    let passedTests = 0;
    let totalTokens = 0;
    let totalCost = 0;
    let totalDuration = 0;

    for (const testCase of testCases) {
        totalTests++;
        console.log(`\n[測試 ${totalTests}] ${testCase.description}`);
        console.log(`問題: "${testCase.question}"`);
        console.log(`預期意圖: ${testCase.expectedIntent}`);

        try {
            const result = await classifyIntent(testCase.question);
            
            const passed = result.intent === testCase.expectedIntent;
            if (passed) {
                passedTests++;
                console.log(`✅ 通過 - 實際意圖: ${result.intent}`);
            } else {
                console.log(`❌ 失敗 - 實際意圖: ${result.intent}`);
            }

            // 累計統計
            totalTokens += result.tokenUsage.total;
            totalCost += result.tokenUsage.estimatedCost;
            totalDuration += result.duration;

            console.log(`Token 使用: ${result.tokenUsage.total} (成本: $${result.tokenUsage.estimatedCost.toFixed(6)})`);
            console.log(`耗時: ${result.duration}ms`);

            // 如果是超出範圍的問題,顯示回應
            if (!result.isLegalRelated) {
                const response = generateOutOfScopeResponse(result.intent, testCase.question);
                console.log(`回應預覽: ${response.substring(0, 100)}...`);
            }

        } catch (error) {
            console.log(`❌ 錯誤: ${error.message}`);
        }
    }

    // 顯示總結
    console.log('\n========================================');
    console.log('測試總結');
    console.log('========================================');
    console.log(`總測試數: ${totalTests}`);
    console.log(`通過: ${passedTests}`);
    console.log(`失敗: ${totalTests - passedTests}`);
    console.log(`準確率: ${(passedTests / totalTests * 100).toFixed(1)}%`);
    console.log(`\n平均 Token 使用: ${(totalTokens / totalTests).toFixed(0)}`);
    console.log(`總 Token 使用: ${totalTokens}`);
    console.log(`總成本: $${totalCost.toFixed(6)}`);
    console.log(`平均耗時: ${(totalDuration / totalTests).toFixed(0)}ms`);
    console.log(`總耗時: ${totalDuration}ms`);

    // 成本對比
    console.log('\n========================================');
    console.log('成本對比 (vs 直接使用 GPT-4o)');
    console.log('========================================');
    const outOfScopeCount = testCases.filter(tc => 
        tc.expectedIntent !== 'legal_analysis'
    ).length;
    const savedTokens = outOfScopeCount * 4500;  // 每個超出範圍問題節省約 4500 tokens
    const savedCost = savedTokens / 1000000 * 2.5;  // GPT-4o input cost
    console.log(`超出範圍問題數: ${outOfScopeCount}`);
    console.log(`節省 Token: ${savedTokens}`);
    console.log(`節省成本: $${savedCost.toFixed(6)}`);
    console.log(`淨節省: $${(savedCost - totalCost).toFixed(6)}`);
}

// 執行測試
runTests().catch(console.error);

