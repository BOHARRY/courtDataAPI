// test-intent-edge-cases.js
/**
 * 測試 Intent Classifier 的邊緣案例
 * 特別是"法官有沒有經手XX案件"這類問題
 */

import { classifyIntent } from './services/intentClassifier.js';

async function testEdgeCases() {
    console.log('========================================');
    console.log('測試 Intent Classifier 邊緣案例');
    console.log('========================================\n');

    const testCases = [
        {
            name: '測試 1: 詢問是否經手刑事案件',
            question: '請問黃麟捷法官有沒有經手刑事案件?',
            context: '當前查詢的法官: 黃麟捷',
            expected: {
                intent: 'legal_analysis',
                question_type: '列表',
                case_type: '刑事'
            }
        },
        {
            name: '測試 2: 詢問是否審理民事案件',
            question: '法官審理過民事案件嗎?',
            context: '當前查詢的法官: 黃麟捷',
            expected: {
                intent: 'legal_analysis',
                question_type: '列表',
                case_type: '民事'
            }
        },
        {
            name: '測試 3: 詢問是否處理交通事故',
            question: '法官有處理過交通事故的案子嗎?',
            context: '當前查詢的法官: 黃麟捷',
            expected: {
                intent: 'legal_analysis',
                question_type: '列表',
                case_type: '交通'
            }
        },
        {
            name: '測試 4: 詢問法官年齡 (應該是 out_of_scope)',
            question: '法官幾歲?',
            context: '當前查詢的法官: 黃麟捷',
            expected: {
                intent: 'out_of_scope',
                question_type: null,
                case_type: null
            }
        },
        {
            name: '測試 5: 詢問法官婚姻狀況 (應該是 out_of_scope)',
            question: '法官單身嗎?',
            context: '當前查詢的法官: 黃麟捷',
            expected: {
                intent: 'out_of_scope',
                question_type: null,
                case_type: null
            }
        },
        {
            name: '測試 6: 詢問是否有某案由的案件',
            question: '法官有沒有損害賠償的案件?',
            context: '當前查詢的法官: 黃麟捷',
            expected: {
                intent: 'legal_analysis',
                question_type: '列表',
                case_type: '損害賠償'
            }
        },
        {
            name: '測試 7: 詢問審理過哪些案件',
            question: '法官審理過哪些案件?',
            context: '當前查詢的法官: 黃麟捷',
            expected: {
                intent: 'legal_analysis',
                question_type: '列表',
                case_type: null
            }
        }
    ];

    let passedCount = 0;
    let failedCount = 0;

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
            console.log('  - Token 使用:', result.tokenUsage.total);

            // 驗證結果
            const intentMatch = result.intent === testCase.expected.intent;
            const questionTypeMatch = result.extractedInfo?.question_type === testCase.expected.question_type;
            const caseTypeMatch = result.extractedInfo?.case_type === testCase.expected.case_type;

            const passed = intentMatch && questionTypeMatch && caseTypeMatch;

            if (passed) {
                console.log('  - 測試: ✅ 通過');
                passedCount++;
            } else {
                console.log('  - 測試: ❌ 失敗');
                console.log('  - 預期:');
                console.log('    - Intent:', testCase.expected.intent);
                console.log('    - 問題類型:', testCase.expected.question_type);
                console.log('    - 案由:', testCase.expected.case_type);
                failedCount++;
            }

        } catch (error) {
            console.error('  - 錯誤:', error.message);
            failedCount++;
        }
    }

    console.log('\n========================================');
    console.log('測試完成');
    console.log('========================================');
    console.log(`總測試數: ${testCases.length}`);
    console.log(`✅ 通過: ${passedCount}`);
    console.log(`❌ 失敗: ${failedCount}`);
    console.log(`通過率: ${((passedCount / testCases.length) * 100).toFixed(1)}%`);
    console.log('========================================');
}

// 執行測試
testEdgeCases().catch(console.error);

