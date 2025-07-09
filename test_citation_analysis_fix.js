// test_citation_analysis_fix.js
// 測試援引分析修復效果的腳本

import { 
    extractCitationContext, 
    generateNumberVariants,
    buildContextResult 
} from './services/citationAnalysisService.js';

/**
 * 🧪 測試文本匹配功能
 */
function testTextMatching() {
    console.log('🧪 開始測試文本匹配功能...\n');
    
    const testCases = [
        {
            name: '阿拉伯數字格式',
            citation: '最高法院51年度台上字第223號判決',
            jfull: '根據最高法院51年度台上字第223號判決之見解...',
            expected: true
        },
        {
            name: '中文數字格式',
            citation: '最高法院51年度台上字第223號判決',
            jfull: '根據最高法院五一年度台上字第二二三號判決之見解...',
            expected: true
        },
        {
            name: '帶空格格式',
            citation: '最高法院51年度台上字第223號判決',
            jfull: '根據最高法院 51 年度台上字第 223 號判決之見解...',
            expected: true
        },
        {
            name: '🆕 後綴差異測試 - 帶(一)',
            citation: '最高法院77年度第9次民事庭會議決議(一)',
            jfull: '根據最高法院77年度第9次民事庭會議決議之見解...',
            expected: true
        },
        {
            name: '🆕 後綴差異測試 - 帶㈠',
            citation: '最高法院77年度第9次民事庭會議決議㈠',
            jfull: '根據最高法院77年度第9次民事庭會議決議之見解...',
            expected: true
        },
        {
            name: '🆕 後綴差異測試 - 帶(1)',
            citation: '最高法院77年度第9次民事庭會議決議(1)',
            jfull: '根據最高法院77年度第9次民事庭會議決議之見解...',
            expected: true
        },
        {
            name: '完全不匹配',
            citation: '最高法院51年度台上字第223號判決',
            jfull: '這是一個完全不相關的文本內容...',
            expected: false
        }
    ];
    
    let passedTests = 0;
    
    for (const testCase of testCases) {
        console.log(`測試案例: ${testCase.name}`);
        console.log(`判例: ${testCase.citation}`);
        console.log(`文本: ${testCase.jfull.substring(0, 50)}...`);
        
        const result = extractCitationContext(
            testCase.citation,
            testCase.jfull,
            '',
            ''
        );
        
        const passed = result.found === testCase.expected;
        console.log(`結果: ${result.found ? '✅ 找到匹配' : '❌ 未找到匹配'}`);
        console.log(`預期: ${testCase.expected ? '應該找到' : '應該找不到'}`);
        console.log(`測試: ${passed ? '✅ 通過' : '❌ 失敗'}\n`);
        
        if (passed) passedTests++;
    }
    
    console.log(`📊 測試結果: ${passedTests}/${testCases.length} 通過\n`);
    return passedTests === testCases.length;
}

/**
 * 🧪 測試數字格式變體生成
 */
function testNumberVariants() {
    console.log('🧪 開始測試數字格式變體生成...\n');
    
    const testCitations = [
        '最高法院51年度台上字第223號判決',
        '最高法院77年度第9次民事庭會議決議(一)',
        '司法院釋字第548號',
        '民事訴訟法第449條第1項'
    ];
    
    for (const citation of testCitations) {
        console.log(`原始判例: ${citation}`);
        const variants = generateNumberVariants(citation);
        console.log(`生成變體數量: ${variants.length}`);
        console.log('變體列表:');
        variants.forEach((variant, index) => {
            console.log(`  ${index + 1}. ${variant}`);
        });
        console.log('');
    }
    
    return true;
}

/**
 * 🧪 測試實際案例
 */
async function testRealCase() {
    console.log('🧪 開始測試實際案例...\n');
    
    // 這裡需要實際的案例數據
    const mockCaseData = {
        id: 'test-case-1',
        citations: [
            '最高法院51年度台上字第223號判決',
            '最高法院65年度台上字第2908號判決'
        ],
        JFULL: `
            本案經審理結果，參考最高法院51年度台上字第223號判決之見解，
            認為當事人之主張有理由。另外，最高法院65年度台上字第2908號判決
            亦支持此一見解...
        `,
        CourtInsightsStart: '法院見解：',
        CourtInsightsEND: '綜上所述'
    };
    
    console.log('測試案例數據:');
    console.log(`案例ID: ${mockCaseData.id}`);
    console.log(`援引數量: ${mockCaseData.citations.length}`);
    console.log(`JFULL長度: ${mockCaseData.JFULL.length}`);
    console.log('');
    
    let successCount = 0;
    
    for (const citation of mockCaseData.citations) {
        console.log(`測試援引: ${citation}`);
        
        const result = extractCitationContext(
            citation,
            mockCaseData.JFULL,
            mockCaseData.CourtInsightsStart,
            mockCaseData.CourtInsightsEND
        );
        
        console.log(`匹配結果: ${result.found ? '✅ 成功' : '❌ 失敗'}`);
        if (result.found) {
            console.log(`上下文長度: ${result.context?.fullContext?.length || 0}`);
            console.log(`在法院見解內: ${result.inCourtInsight ? '是' : '否'}`);
            successCount++;
        } else {
            console.log(`失敗原因: ${result.error || '未知'}`);
        }
        console.log('');
    }
    
    const successRate = (successCount / mockCaseData.citations.length) * 100;
    console.log(`📊 成功率: ${successRate.toFixed(1)}% (${successCount}/${mockCaseData.citations.length})\n`);
    
    return successRate >= 80; // 期望成功率 >= 80%
}

/**
 * 🧪 主測試函數
 */
async function runAllTests() {
    console.log('🚀 開始援引分析修復效果測試\n');
    console.log('=' * 50);
    
    const results = {
        textMatching: false,
        numberVariants: false,
        realCase: false
    };
    
    try {
        // 測試1: 文本匹配
        results.textMatching = testTextMatching();
        
        // 測試2: 數字格式變體
        results.numberVariants = testNumberVariants();
        
        // 測試3: 實際案例
        results.realCase = await testRealCase();
        
    } catch (error) {
        console.error('❌ 測試過程中發生錯誤:', error);
        return false;
    }
    
    // 輸出總結
    console.log('=' * 50);
    console.log('📋 測試總結:');
    console.log(`文本匹配測試: ${results.textMatching ? '✅ 通過' : '❌ 失敗'}`);
    console.log(`數字變體測試: ${results.numberVariants ? '✅ 通過' : '❌ 失敗'}`);
    console.log(`實際案例測試: ${results.realCase ? '✅ 通過' : '❌ 失敗'}`);
    
    const allPassed = Object.values(results).every(result => result);
    console.log(`\n🎯 總體結果: ${allPassed ? '✅ 所有測試通過' : '❌ 部分測試失敗'}`);
    
    if (allPassed) {
        console.log('\n🎉 修復效果良好，可以部署到生產環境！');
    } else {
        console.log('\n⚠️  需要進一步調試和優化。');
    }
    
    return allPassed;
}

// 如果直接運行此腳本
if (import.meta.url === `file://${process.argv[1]}`) {
    runAllTests().then(success => {
        process.exit(success ? 0 : 1);
    });
}

export { runAllTests, testTextMatching, testNumberVariants, testRealCase };
