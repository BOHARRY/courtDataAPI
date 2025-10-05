// test_case_type_expansion.js
/**
 * 測試案由類別展開功能
 */

import { classifyIntent } from './services/intentClassifier.js';

async function testCaseTypeExpansion() {
    console.log('========================================');
    console.log('測試案由類別展開功能');
    console.log('========================================\n');

    const testCases = [
        {
            name: '測試 1: 婚姻家事',
            question: '幫我分析婚姻家事的案件',
            context: '當前查詢的法官: 紀文惠'
        },
        {
            name: '測試 2: 家事（別名）',
            question: '分析家事案件',
            context: '當前查詢的法官: 紀文惠'
        },
        {
            name: '測試 3: 勞動案件',
            question: '分析勞資案件',
            context: '當前查詢的法官: 王婉如'
        },
        {
            name: '測試 4: 智慧財產權',
            question: '智財案件的判決傾向',
            context: '當前查詢的法官: 王婉如'
        },
        {
            name: '測試 5: 交通事故',
            question: '車禍案件的勝訴率',
            context: '當前查詢的法官: 王婉如'
        },
        {
            name: '測試 6: 普通案由（不展開）',
            question: '返還不當得利案件',
            context: '當前查詢的法官: 王婉如'
        }
    ];

    for (const testCase of testCases) {
        console.log(`\n${testCase.name}`);
        console.log('─'.repeat(80));
        console.log(`問題: ${testCase.question}`);
        console.log(`上下文: ${testCase.context}\n`);

        try {
            const result = await classifyIntent(testCase.question, {
                context: testCase.context
            });

            console.log('Intent Classifier 結果:');
            console.log(`  intent: ${result.intent}`);
            console.log(`  question_type: ${result.extractedInfo.question_type}`);
            console.log(`  case_type: ${result.extractedInfo.case_type}`);
            
            if (result.extractedInfo.case_type_expanded) {
                console.log(`  case_type_expanded: [${result.extractedInfo.case_type_expanded.length} 個案由]`);
                console.log(`    ${result.extractedInfo.case_type_expanded.join('、')}`);
                console.log('  ✅ 案由已展開');
            } else {
                console.log('  case_type_expanded: null');
                console.log('  ℹ️  普通案由，不需要展開');
            }

            console.log(`\nToken 使用:`);
            console.log(`  input: ${result.tokenUsage.input}`);
            console.log(`  output: ${result.tokenUsage.output}`);
            console.log(`  total: ${result.tokenUsage.total}`);
            console.log(`  耗時: ${result.duration} ms`);

        } catch (error) {
            console.error('❌ 測試失敗:', error.message);
        }
    }

    console.log('\n========================================');
    console.log('測試完成');
    console.log('========================================');
}

// 執行測試
testCaseTypeExpansion().catch(console.error);

