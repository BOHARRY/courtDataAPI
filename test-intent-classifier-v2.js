// test-intent-classifier-v2.js
/**
 * 測試 Intent Classifier 的輕量級預處理功能
 */

import { classifyIntent } from './services/intentClassifier.js';

async function testIntentClassifier() {
    console.log('========================================');
    console.log('測試 Intent Classifier V2 (輕量級預處理)');
    console.log('========================================\n');

    const testCases = [
        {
            name: '測試 1: 勝訴率問題',
            question: '法官在損害賠償中的勝訴率?',
            context: '當前查詢的法官: 黃麟捷',
            expected: {
                intent: 'legal_analysis',
                question_type: '勝訴率',
                case_type: '損害賠償',
                verdict_type: '原告勝訴'
            }
        },
        {
            name: '測試 2: 列表問題',
            question: '損害賠償案件有哪些?',
            context: '當前查詢的法官: 王婉如',
            expected: {
                intent: 'legal_analysis',
                question_type: '列表',
                case_type: '損害賠償',
                verdict_type: null
            }
        },
        {
            name: '測試 3: 法條問題',
            question: '法官常引用哪些法條?',
            context: '當前查詢的法官: 黃麟捷',
            expected: {
                intent: 'legal_analysis',
                question_type: '法條',
                case_type: null,
                verdict_type: null
            }
        },
        {
            name: '測試 4: 打招呼',
            question: '你好',
            context: '',
            expected: {
                intent: 'greeting',
                question_type: null,
                case_type: null,
                verdict_type: null
            }
        },
        {
            name: '測試 5: 無關問題',
            question: '法官單身嗎?',
            context: '當前查詢的法官: 黃麟捷',
            expected: {
                intent: 'out_of_scope',
                question_type: null,
                case_type: null,
                verdict_type: null
            }
        }
    ];

    for (const testCase of testCases) {
        console.log(`\n${testCase.name}`);
        console.log('問題:', testCase.question);
        console.log('上下文:', testCase.context || '(無)');
        
        try {
            const result = await classifyIntent(testCase.question, {
                context: testCase.context
            });

            console.log('結果:');
            console.log('  - Intent:', result.intent);
            console.log('  - 問題類型:', result.extractedInfo?.question_type || '(無)');
            console.log('  - 案由:', result.extractedInfo?.case_type || '(無)');
            console.log('  - 判決類型:', result.extractedInfo?.verdict_type || '(無)');
            console.log('  - Token 使用:', result.tokenUsage.total);
            console.log('  - 耗時:', result.duration, 'ms');

            // 驗證結果
            const passed = 
                result.intent === testCase.expected.intent &&
                result.extractedInfo?.question_type === testCase.expected.question_type &&
                result.extractedInfo?.case_type === testCase.expected.case_type &&
                result.extractedInfo?.verdict_type === testCase.expected.verdict_type;

            console.log('  - 測試:', passed ? '✅ 通過' : '❌ 失敗');

        } catch (error) {
            console.error('  - 錯誤:', error.message);
        }
    }

    console.log('\n========================================');
    console.log('測試完成');
    console.log('========================================');
}

// 執行測試
testIntentClassifier().catch(console.error);

