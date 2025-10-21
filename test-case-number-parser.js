// test-case-number-parser.js
/**
 * 案號智能解析功能測試
 * 測試各種案號格式的解析能力
 */

import dotenv from 'dotenv';
dotenv.config();

import { 
    mightBeCaseNumber, 
    parseCaseNumber, 
    buildCaseNumberQuery,
    processCaseNumberQuery 
} from './services/caseNumberParser.js';

// 測試用例
const testCases = [
    // 完整 JID 格式
    {
        name: '完整 JID 格式',
        input: 'STEV,113,店簡,120,20250528,2',
        expectedFormat: 'jid',
        shouldMatch: true
    },
    // 標準格式
    {
        name: '標準格式（含年度）',
        input: '113年度店簡字第120號',
        expectedFormat: 'standard',
        shouldMatch: true
    },
    {
        name: '標準格式（不含年度）',
        input: '113年店簡字第120號',
        expectedFormat: 'standard',
        shouldMatch: true
    },
    // 簡化格式
    {
        name: '簡化格式（含年度）',
        input: '114台上123字號',
        expectedFormat: 'simplified',
        shouldMatch: true
    },
    {
        name: '簡化格式（不含年度）',
        input: '台上123號',
        expectedFormat: 'simplified',
        shouldMatch: true
    },
    // 完整描述格式
    {
        name: '完整描述格式',
        input: '最高法院109年台上字第2908號判決',
        expectedFormat: 'standard',
        shouldMatch: true
    },
    // 帶空格的格式
    {
        name: '帶空格的標準格式',
        input: '113 年度 店簡 字第 120 號',
        expectedFormat: 'standard',
        shouldMatch: true
    },
    // 全形數字
    {
        name: '全形數字格式',
        input: '１１３年度店簡字第１２０號',
        expectedFormat: 'standard',
        shouldMatch: true
    },
    // 非案號（應該不匹配）
    {
        name: '普通法律查詢',
        input: '民法第184條',
        expectedFormat: 'unknown',
        shouldMatch: false
    },
    {
        name: '普通關鍵字查詢',
        input: '不當得利',
        expectedFormat: 'unknown',
        shouldMatch: false
    },
    {
        name: '律師姓名',
        input: '王小明律師',
        expectedFormat: 'unknown',
        shouldMatch: false
    }
];

/**
 * 執行測試
 */
async function runTests() {
    console.log('='.repeat(80));
    console.log('🧪 案號智能解析功能測試');
    console.log('='.repeat(80));
    console.log('');

    let passedTests = 0;
    let failedTests = 0;

    for (const testCase of testCases) {
        console.log(`\n📝 測試: ${testCase.name}`);
        console.log(`   輸入: "${testCase.input}"`);
        console.log('-'.repeat(80));

        try {
            // 步驟 1: 前端預檢
            const preCheckResult = mightBeCaseNumber(testCase.input);
            console.log(`   ✓ 預檢結果: ${preCheckResult ? '✅ 可能是案號' : '❌ 不是案號'}`);

            if (testCase.shouldMatch && !preCheckResult) {
                console.log(`   ⚠️  警告: 預檢應該通過但未通過`);
            }

            // 步驟 2: AI 解析（只有預檢通過才執行）
            if (preCheckResult) {
                const parseResult = await parseCaseNumber(testCase.input);
                console.log(`   ✓ AI 解析結果:`);
                console.log(`      - 是否為案號: ${parseResult.isCaseNumber ? '✅ 是' : '❌ 否'}`);
                console.log(`      - 信心度: ${(parseResult.confidence * 100).toFixed(1)}%`);
                console.log(`      - 格式: ${parseResult.format}`);
                
                if (parseResult.normalized) {
                    console.log(`      - 標準化數據:`);
                    if (parseResult.normalized.jid) {
                        console.log(`         • JID: ${parseResult.normalized.jid}`);
                    }
                    if (parseResult.normalized.year) {
                        console.log(`         • 年度: ${parseResult.normalized.year}`);
                    }
                    if (parseResult.normalized.caseType) {
                        console.log(`         • 案件類型: ${parseResult.normalized.caseType}`);
                    }
                    if (parseResult.normalized.number) {
                        console.log(`         • 案號: ${parseResult.normalized.number}`);
                    }
                    if (parseResult.normalized.court) {
                        console.log(`         • 法院: ${parseResult.normalized.court}`);
                    }
                }

                // 步驟 3: 構建查詢
                const esQuery = buildCaseNumberQuery(parseResult);
                if (esQuery) {
                    console.log(`   ✓ ES 查詢已生成:`);
                    console.log(`      ${JSON.stringify(esQuery, null, 6).replace(/\n/g, '\n      ')}`);
                } else {
                    console.log(`   ⚠️  未生成 ES 查詢（信心度不足或不是案號）`);
                }

                // 驗證結果
                const isCorrect = parseResult.isCaseNumber === testCase.shouldMatch;
                if (isCorrect) {
                    console.log(`   ✅ 測試通過`);
                    passedTests++;
                } else {
                    console.log(`   ❌ 測試失敗: 預期 ${testCase.shouldMatch ? '是案號' : '不是案號'}，實際 ${parseResult.isCaseNumber ? '是案號' : '不是案號'}`);
                    failedTests++;
                }
            } else {
                // 預檢未通過
                if (!testCase.shouldMatch) {
                    console.log(`   ✅ 測試通過（正確識別為非案號）`);
                    passedTests++;
                } else {
                    console.log(`   ❌ 測試失敗: 預檢應該通過但未通過`);
                    failedTests++;
                }
            }

        } catch (error) {
            console.error(`   ❌ 測試失敗: ${error.message}`);
            failedTests++;
        }
    }

    // 測試完整流程
    console.log('\n' + '='.repeat(80));
    console.log('🔄 測試完整流程（processCaseNumberQuery）');
    console.log('='.repeat(80));

    const fullTestCase = 'STEV,113,店簡,120,20250528,2';
    console.log(`\n輸入: "${fullTestCase}"`);
    
    try {
        const result = await processCaseNumberQuery(fullTestCase);
        if (result) {
            console.log('✅ 完整流程測試通過');
            console.log('生成的查詢:');
            console.log(JSON.stringify(result, null, 2));
        } else {
            console.log('❌ 完整流程測試失敗: 未生成查詢');
        }
    } catch (error) {
        console.error('❌ 完整流程測試失敗:', error.message);
    }

    // 總結
    console.log('\n' + '='.repeat(80));
    console.log('📊 測試總結');
    console.log('='.repeat(80));
    console.log(`總測試數: ${testCases.length}`);
    console.log(`✅ 通過: ${passedTests}`);
    console.log(`❌ 失敗: ${failedTests}`);
    console.log(`成功率: ${((passedTests / testCases.length) * 100).toFixed(1)}%`);
    console.log('='.repeat(80));
}

// 執行測試
runTests().catch(error => {
    console.error('測試執行失敗:', error);
    process.exit(1);
});

