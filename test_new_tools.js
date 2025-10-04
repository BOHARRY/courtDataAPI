// test_new_tools.js
/**
 * 測試新增的法律爭點和引用分析工具
 */

import { analyze_citations } from './utils/ai-agent-local-functions.js';

console.log('========================================');
console.log('測試新增工具');
console.log('========================================\n');

// 模擬判決書數據
const mockJudgments = [
    {
        "案號": "TPHV,111,上,397,20250730,1",
        "案由": "分配表異議之訴",
        "法官": "張松鈞",
        "裁判結果": "原判決廢棄改判",
        "引用判例": [
            "最高法院71年度第8次民事庭會議決議(二)",
            "最高法院85年度台上字第2388號判決",
            "最高法院96年度台上字第1063號判決",
            "最高法院99年度台上字第1422號判決",
            "最高法院94年度台上字第112號判決"
        ]
    },
    {
        "案號": "PCDV,114,訴,1434,20250714,1",
        "案由": "返還不當得利",
        "法官": "王婉如",
        "裁判結果": "原告勝訴",
        "引用判例": [
            "最高法院85年度台上字第2388號判決",
            "最高法院96年度台上字第1063號判決",
            "民法第179條"
        ]
    },
    {
        "案號": "PCDV,113,訴,745,20250710,1",
        "案由": "返還不當得利",
        "法官": "王婉如",
        "裁判結果": "被告勝訴",
        "引用判例": [
            "最高法院96年度台上字第1063號判決",
            "民法第179條",
            "民法第320條"
        ]
    }
];

// 測試 1: analyze_citations - 所有引用
console.log('\n========================================');
console.log('測試 1: analyze_citations - 所有引用');
console.log('========================================');

const result1 = analyze_citations(mockJudgments, { citation_type: 'all', top_n: 5 });
console.log(JSON.stringify(result1, null, 2));

// 測試 2: analyze_citations - 只分析最高法院判決
console.log('\n========================================');
console.log('測試 2: analyze_citations - 只分析最高法院判決');
console.log('========================================');

const result2 = analyze_citations(mockJudgments, { citation_type: 'supreme_court', top_n: 5 });
console.log(JSON.stringify(result2, null, 2));

// 測試 3: analyze_citations - 過濾特定法官
console.log('\n========================================');
console.log('測試 3: analyze_citations - 過濾特定法官 (王婉如)');
console.log('========================================');

const result3 = analyze_citations(mockJudgments, { 
    citation_type: 'all', 
    judge_name: '王婉如',
    top_n: 5 
});
console.log(JSON.stringify(result3, null, 2));

// 測試 4: analyze_citations - 從對話歷史中提取
console.log('\n========================================');
console.log('測試 4: analyze_citations - 從對話歷史中提取');
console.log('========================================');

const mockConversationHistory = [
    {
        role: 'tool',
        content: JSON.stringify({
            "判決書": mockJudgments
        })
    }
];

const result4 = analyze_citations(null, { citation_type: 'all', top_n: 5 }, mockConversationHistory);
console.log(JSON.stringify(result4, null, 2));

console.log('\n========================================');
console.log('所有測試完成！');
console.log('========================================');

