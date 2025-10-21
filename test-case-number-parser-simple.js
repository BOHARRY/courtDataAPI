// test-case-number-parser-simple.js
/**
 * 案號智能解析功能簡化測試
 * 只測試 AI 解析部分，不需要 Elasticsearch
 */

import dotenv from 'dotenv';
dotenv.config();

import { OpenAI } from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const OPENAI_MODEL_NAME_NANO = process.env.OPENAI_MODEL_NAME_NANO || 'gpt-4o-mini';

/**
 * 前端預檢
 */
function mightBeCaseNumber(input) {
    if (!input || typeof input !== 'string') {
        return false;
    }

    const trimmed = input.trim();
    
    if (trimmed.length < 5 || trimmed.length > 100) {
        return false;
    }

    const patterns = [
        /^[A-Z]{2,6},\d{2,4},.+,\d+,\d{8},\d+$/,
        /\d{2,4}\s*年\s*(度)?\s*[\u4e00-\u9fa5]{1,6}\s*字\s*第\s*\d+\s*號/,
        /(\d{2,4})?\s*[\u4e00-\u9fa5]{2,6}\s*\d+\s*字?\s*號?/,
        /[\u4e00-\u9fa5]+法院\s*\d{2,4}\s*年\s*[\u4e00-\u9fa5]+\s*字\s*第\s*\d+\s*號/,
        /\d{2,4}\s*年.*字.*\d+\s*號/,
        /^[A-Z]+,.*,.*,/,
    ];

    return patterns.some(pattern => pattern.test(trimmed));
}

/**
 * AI 解析
 */
async function parseCaseNumber(userInput) {
    try {
        console.log(`[AI 解析] 輸入: "${userInput}"`);
        
        const prompt = `你是台灣法律案號解析專家。請分析以下用戶輸入，判斷是否為判決書案號，並提取結構化信息。

**台灣判決書案號格式說明**：
1. 完整 JID 格式：STEV,113,店簡,120,20250528,2（法院代碼,年度,案件類型,案號,日期,版本）
2. 標準格式：113年度店簡字第120號 或 113年店簡字第120號
3. 簡化格式：114台上123字號 或 台上123號
4. 完整描述：最高法院109年台上字第2908號判決

**用戶輸入**：「${userInput}」

**請分析並以 JSON 格式回應**：
{
  "isCaseNumber": true/false,
  "confidence": 0.0-1.0,
  "format": "jid" | "standard" | "simplified" | "partial" | "unknown",
  "normalized": {
    "jid": "完整JID（如果輸入就是JID格式）",
    "year": "年度（例如：113）",
    "caseType": "案件類型（例如：店簡、台上）",
    "number": "案號（例如：120）",
    "court": "法院名稱（如果有提及）"
  }
}

**注意事項**：
- 全形數字轉半形（例如：１１３ → 113）
- 移除多餘空格
- 處理常見簡稱（例如：台上 = 台上、臺上）
- 「年度」兩字可有可無
- 如果信心度低於 0.7，設置 isCaseNumber 為 false

**重要**：請確保回應是有效的 JSON 格式，不要包含任何其他文字。`;

        const response = await openai.chat.completions.create({
            model: OPENAI_MODEL_NAME_NANO,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            max_tokens: 500,
            response_format: { type: "json_object" }
        });

        const parsed = JSON.parse(response.choices[0].message.content);
        return parsed;
        
    } catch (error) {
        console.error('[AI 解析失敗]:', error.message);
        return {
            isCaseNumber: false,
            confidence: 0,
            format: 'unknown',
            error: error.message
        };
    }
}

/**
 * 測試用例
 */
const testCases = [
    { name: '完整 JID', input: 'STEV,113,店簡,120,20250528,2', shouldMatch: true },
    { name: '標準格式', input: '113年度店簡字第120號', shouldMatch: true },
    { name: '簡化格式', input: '114台上123字號', shouldMatch: true },
    { name: '帶空格', input: '113 年度 店簡 字第 120 號', shouldMatch: true },
    { name: '非案號', input: '不當得利', shouldMatch: false },
];

/**
 * 執行測試
 */
async function runTests() {
    console.log('='.repeat(80));
    console.log('🧪 案號智能解析功能測試（簡化版）');
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
            console.log(`   ✓ 預檢: ${preCheckResult ? '✅ 可能是案號' : '❌ 不是案號'}`);

            // 步驟 2: AI 解析
            if (preCheckResult) {
                const parseResult = await parseCaseNumber(testCase.input);
                console.log(`   ✓ AI 解析:`);
                console.log(`      - 是否為案號: ${parseResult.isCaseNumber ? '✅ 是' : '❌ 否'}`);
                console.log(`      - 信心度: ${(parseResult.confidence * 100).toFixed(1)}%`);
                console.log(`      - 格式: ${parseResult.format}`);
                
                if (parseResult.normalized) {
                    console.log(`      - 標準化數據:`);
                    if (parseResult.normalized.jid) console.log(`         • JID: ${parseResult.normalized.jid}`);
                    if (parseResult.normalized.year) console.log(`         • 年度: ${parseResult.normalized.year}`);
                    if (parseResult.normalized.caseType) console.log(`         • 案件類型: ${parseResult.normalized.caseType}`);
                    if (parseResult.normalized.number) console.log(`         • 案號: ${parseResult.normalized.number}`);
                    if (parseResult.normalized.court) console.log(`         • 法院: ${parseResult.normalized.court}`);
                }

                const isCorrect = parseResult.isCaseNumber === testCase.shouldMatch;
                if (isCorrect) {
                    console.log(`   ✅ 測試通過`);
                    passedTests++;
                } else {
                    console.log(`   ❌ 測試失敗`);
                    failedTests++;
                }
            } else {
                if (!testCase.shouldMatch) {
                    console.log(`   ✅ 測試通過（正確識別為非案號）`);
                    passedTests++;
                } else {
                    console.log(`   ❌ 測試失敗（預檢應該通過）`);
                    failedTests++;
                }
            }

        } catch (error) {
            console.error(`   ❌ 測試失敗: ${error.message}`);
            failedTests++;
        }
    }

    console.log('\n' + '='.repeat(80));
    console.log('📊 測試總結');
    console.log('='.repeat(80));
    console.log(`總測試數: ${testCases.length}`);
    console.log(`✅ 通過: ${passedTests}`);
    console.log(`❌ 失敗: ${failedTests}`);
    console.log(`成功率: ${((passedTests / testCases.length) * 100).toFixed(1)}%`);
    console.log('='.repeat(80));
}

runTests().catch(error => {
    console.error('測試執行失敗:', error);
    process.exit(1);
});

