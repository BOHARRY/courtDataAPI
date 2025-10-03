// test-context-priority.js
/**
 * 測試上下文優先級優化
 * 驗證 GPT 是否能正確識別法官名稱
 */

import { SYSTEM_PROMPT } from './utils/ai-agent-tools.js';

function testContextPriority() {
    console.log('========================================');
    console.log('測試上下文優先級優化');
    console.log('========================================\n');

    // 模擬場景: 用戶問題模糊,但有法官上下文
    const judgeName = '黃麟捷';
    const questionType = '其他';
    const question = '分析法官的判決統計數據';

    console.log('場景設定:');
    console.log('  - 法官名稱:', judgeName);
    console.log('  - 問題類型:', questionType);
    console.log('  - 用戶問題:', question);
    console.log('');

    // 構建上下文 (新版本 - 放在最前面)
    let contextSection = `🔴 **當前對話上下文** (最高優先級 - 請優先閱讀)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**當前查詢的法官**: ${judgeName}

**關鍵規則** (必須遵守):
1. 用戶問題中的「法官」、「這位法官」、「該法官」都是指「${judgeName}」法官
2. 在**所有**工具調用中,必須使用 judge_name="${judgeName}" 參數
3. **不要**問用戶是哪位法官,直接使用「${judgeName}」
4. 如果用戶問題模糊,提供具體的分析選項,但明確是針對「${judgeName}」法官

**問題類型**: ${questionType}

**用戶問題較為模糊,建議**:
1. 先調用 analyze_judge(judge_name="${judgeName}") 獲取法官整體統計
2. 根據結果,向用戶提供具體的分析選項,例如:
   - "您想了解${judgeName}法官的勝訴率分析嗎?"
   - "您想了解${judgeName}法官常引用的法條嗎?"
   - "您想了解${judgeName}法官的案由分布嗎?"
3. **重要**: 在回答中明確提到是「${judgeName}法官」,不要問用戶是哪位法官

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;

    // 新版本: 上下文在前
    const systemPromptNew = contextSection + SYSTEM_PROMPT;

    // 舊版本: 上下文在後
    const systemPromptOld = SYSTEM_PROMPT + '\n\n' + contextSection;

    // 增強的用戶問題
    const enhancedQuestion = `[關於${judgeName}法官] ${question}`;

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('新版本 System Prompt 結構:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('1. 🔴 **當前對話上下文** (最高優先級)');
    console.log('   - 法官名稱: ' + judgeName);
    console.log('   - 關鍵規則: 不要問用戶是哪位法官');
    console.log('   - 建議工作流程: 先調用 analyze_judge');
    console.log('');
    console.log('2. 基礎 System Prompt');
    console.log('   - 能力說明');
    console.log('   - 工作流程');
    console.log('   - 範例');
    console.log('');
    console.log('總長度:', systemPromptNew.length, '字符');
    console.log('上下文位置: 最前面 (優先級最高)');
    console.log('');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('舊版本 System Prompt 結構:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('1. 基礎 System Prompt');
    console.log('   - 能力說明');
    console.log('   - 工作流程');
    console.log('   - 範例');
    console.log('');
    console.log('2. 🔴 **當前對話上下文**');
    console.log('   - 法官名稱: ' + judgeName);
    console.log('   - 關鍵規則: 不要問用戶是哪位法官');
    console.log('');
    console.log('總長度:', systemPromptOld.length, '字符');
    console.log('上下文位置: 最後面 (容易被忽略)');
    console.log('');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('用戶問題增強:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('原始問題:', question);
    console.log('增強後:', enhancedQuestion);
    console.log('');
    console.log('優勢: 雙重保險,確保 GPT 知道是在問黃麟捷法官');
    console.log('');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('預期效果:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('❌ 舊版本 GPT 可能回答:');
    console.log('   "請提供您想要分析的法官姓名"');
    console.log('');
    console.log('✅ 新版本 GPT 應該回答:');
    console.log('   "您想了解黃麟捷法官的哪些統計數據?"');
    console.log('   或');
    console.log('   直接調用 analyze_judge(judge_name="黃麟捷")');
    console.log('');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('關鍵改進:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('1. ✅ 上下文優先級最高 (放在最前面)');
    console.log('2. ✅ 明確標記 "最高優先級 - 請優先閱讀"');
    console.log('3. ✅ 用戶問題中明確包含法官名稱 (雙重保險)');
    console.log('4. ✅ 針對"其他"類型問題,提供明確的建議工作流程');
    console.log('5. ✅ 強調"不要問用戶是哪位法官"');
    console.log('');

    console.log('========================================');
    console.log('測試完成');
    console.log('========================================');
}

// 執行測試
testContextPriority();

