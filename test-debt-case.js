// test-debt-case.js
/**
 * 測試債務清償案件分析場景
 */

import fetch from 'node-fetch';

const API_URL = 'http://localhost:3000/api/ai-agent/chat';
const TOKEN = 'YOUR_TOKEN_HERE'; // 需要替換為實際的 Firebase Token

async function testDebtCaseAnalysis() {
    console.log('🧪 測試債務清償案件分析...\n');

    const question = "如果我是律師,要在王婉如法官面前打『債務清償』案件,可能需要注意哪些傾向?";

    try {
        console.log('問題:', question);
        console.log('\n發送請求...');

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${TOKEN}`
            },
            body: JSON.stringify({
                question: question,
                conversation_history: []
            })
        });

        if (!response.ok) {
            console.error('❌ 請求失敗:', response.status);
            const errorText = await response.text();
            console.error('錯誤詳情:', errorText);
            return;
        }

        const result = await response.json();
        console.log('\n✅ 收到響應');
        console.log('\n📊 結果:');
        console.log('迭代次數:', result.iterations);
        console.log('\n回答:');
        console.log(result.answer);

        // 檢查回答是否包含關鍵信息
        const hasVerdictRate = result.answer.includes('勝訴率') || result.answer.includes('%');
        const hasCitations = result.answer.includes('法條') || result.answer.includes('民法');
        const hasData = result.answer.includes('2025年6-7月');

        console.log('\n✅ 回答質量檢查:');
        console.log('- 包含勝訴率:', hasVerdictRate ? '✅' : '❌');
        console.log('- 包含法條分析:', hasCitations ? '✅' : '❌');
        console.log('- 說明數據範圍:', hasData ? '✅' : '❌');

    } catch (error) {
        console.error('❌ 測試失敗:', error);
    }
}

// 如果沒有 Token,提供手動測試指令
if (process.argv[2]) {
    testDebtCaseAnalysis();
} else {
    console.log('使用方法:');
    console.log('1. 在瀏覽器中登入 LawSowl');
    console.log('2. 打開開發者工具 (F12)');
    console.log('3. 在 Console 中執行: localStorage.getItem("firebase:authUser:...")');
    console.log('4. 複製 idToken');
    console.log('5. 修改此文件中的 TOKEN 變數');
    console.log('6. 執行: node test-debt-case.js test');
    console.log('\n或者直接在前端測試頁面測試: http://localhost:3000/ai-agent-test');
}

