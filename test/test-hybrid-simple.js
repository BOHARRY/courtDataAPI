// test/test-hybrid-simple.js
// 簡單測試混合版法條查詢（SerpAPI + Perplexity）

import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const SERPAPI_API_KEY = process.env.SERPAPI_API_KEY;
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

if (!SERPAPI_API_KEY || !PERPLEXITY_API_KEY) {
    console.error('錯誤: 請設置 SERPAPI_API_KEY 和 PERPLEXITY_API_KEY 環境變數');
    process.exit(1);
}

// 步驟 1: 使用 SerpAPI 獲取法條 URL
async function findLawURL(lawName) {
    const query = `law.moj.gov.tw LawSingle ${lawName}`;
    
    console.log(`[LawSearch] 🔍 步驟 1: 使用 SerpAPI 搜索法條 URL...`);
    console.log(`[LawSearch]    查詢: ${query}`);
    
    const params = {
        q: query,
        api_key: SERPAPI_API_KEY,
        engine: 'google',
        num: 5,
        gl: 'tw',
        hl: 'zh-tw',
        filter: '0',
        nfpr: '1',
        as_sitesearch: 'law.moj.gov.tw',
        as_dt: 'i'
    };
    
    try {
        const response = await axios.get('https://serpapi.com/search', { 
            params,
            timeout: 30000
        });
        
        const results = response.data.organic_results || [];
        
        if (results.length === 0) {
            console.log(`[LawSearch]    ❌ 未找到搜索結果`);
            return { success: false, error: '未找到搜索結果' };
        }
        
        // 找第一個包含 law.moj.gov.tw 和 LawSingle 的結果
        for (const result of results) {
            const link = result.link || '';
            if (link.includes('law.moj.gov.tw') && link.includes('LawSingle')) {
                console.log(`[LawSearch]    ✅ 找到 URL: ${link}`);
                return {
                    success: true,
                    url: link,
                    title: result.title || ''
                };
            }
        }
        
        console.log(`[LawSearch]    ❌ 未找到符合條件的 URL`);
        return { success: false, error: '未找到符合條件的 URL' };
        
    } catch (error) {
        console.error(`[LawSearch]    ❌ SerpAPI 請求失敗:`, error.message);
        return { success: false, error: `SerpAPI 請求失敗: ${error.message}` };
    }
}

// 步驟 2: 使用 Perplexity 讀取網頁內容
async function readLawContentWithPerplexity(url, lawName) {
    console.log(`[LawSearch] 📖 步驟 2: 使用 Perplexity 讀取網頁內容...`);
    console.log(`[LawSearch]    URL: ${url}`);
    
    const systemPrompt = `你是專業的法律文件分析助手。請精確提取法條原文，不要改寫或摘要條文內容。`;
    
    const userPrompt = `請閱讀以下網址的內容：${url}

這是台灣「${lawName}」的法條頁面。

請提供以下資訊（以 JSON 格式回覆）：
{
  "法條原文": "完整條文內容（逐字原文，不要摘要或改寫）",
  "出處來源": "${url}",
  "白話解析": "條文重點摘要（50字內）",
  "查詢時間": "當前時間（ISO 8601 格式）"
}

重要：
1. 法條原文必須是完整的原文，不要摘要或改寫
2. 只需回傳 JSON，不要其他說明文字
3. 不要返回「我無法」、「抱歉」等錯誤訊息`;

    try {
        const response = await axios.post(
            'https://api.perplexity.ai/chat/completions',
            {
                model: 'sonar',
                messages: [
                    {
                        role: 'system',
                        content: systemPrompt
                    },
                    {
                        role: 'user',
                        content: userPrompt
                    }
                ],
                temperature: 0.1,
                return_citations: true
            },
            {
                headers: {
                    'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 60000
            }
        );
        
        let content = response.data.choices[0].message.content;
        const citations = response.data.citations || [];
        
        console.log(`[LawSearch]    ✅ Perplexity 返回成功`);
        
        // 檢查是否包含錯誤訊息
        if (content.includes('我無法') || 
            content.includes('抱歉') || 
            content.includes('無法存取') ||
            content.includes('無法直接')) {
            console.log(`[LawSearch]    ⚠️ Perplexity 返回錯誤訊息`);
            throw new Error('Perplexity 返回錯誤訊息');
        }
        
        // 移除 markdown 標記
        if (content.includes('```json')) {
            content = content.split('```json')[1].split('```')[0].trim();
        } else if (content.includes('```')) {
            content = content.split('```')[1].split('```')[0].trim();
        }
        
        const result = JSON.parse(content);
        
        // 添加查詢時間（如果沒有）
        if (!result.查詢時間) {
            result.查詢時間 = new Date().toISOString();
        }
        
        // 添加引用來源（如果有）
        if (citations.length > 0) {
            result.citations = citations;
        }
        
        console.log(`[LawSearch]    ✅ JSON 解析成功`);
        
        return {
            success: true,
            data: result
        };
        
    } catch (error) {
        console.error(`[LawSearch]    ❌ Perplexity 讀取失敗:`, error.message);
        return { 
            success: false, 
            error: `Perplexity 讀取失敗: ${error.message}` 
        };
    }
}

// 測試案例
const testCases = [
    '民法第184條',
    '刑法第1條',
    '民法第1條'
];

async function runTests() {
    console.log('='.repeat(80));
    console.log('🔍 混合版法條查詢測試 (SerpAPI + Perplexity)');
    console.log('='.repeat(80));
    console.log(`\n測試案例數量: ${testCases.length}`);
    console.log(`測試時間: ${new Date().toLocaleString('zh-TW')}\n`);

    for (let i = 0; i < testCases.length; i++) {
        const lawName = testCases[i];
        
        console.log('\n' + '='.repeat(80));
        console.log(`📝 測試 ${i + 1}/${testCases.length}: ${lawName}`);
        console.log('='.repeat(80));

        const startTime = Date.now();

        // 步驟 1: 獲取 URL
        const urlResult = await findLawURL(lawName);
        
        if (!urlResult.success) {
            console.log(`\n❌ 測試失敗: ${urlResult.error}`);
            continue;
        }

        // 步驟 2: 讀取內容
        const contentResult = await readLawContentWithPerplexity(urlResult.url, lawName);
        
        const duration = Date.now() - startTime;

        if (!contentResult.success) {
            console.log(`\n⚠️ 找到 URL 但無法讀取內容`);
            console.log(`   URL: ${urlResult.url}`);
            console.log(`   錯誤: ${contentResult.error}`);
            continue;
        }

        const result = contentResult.data;

        console.log(`\n✅ 查詢成功！耗時: ${duration}ms (${(duration / 1000).toFixed(1)}秒)`);
        console.log('\n📋 解析結果:');
        console.log(`法條原文: ${result.法條原文}`);
        console.log(`出處來源: ${result.出處來源}`);
        console.log(`白話解析: ${result.白話解析}`);

        // 等待 3 秒
        if (i < testCases.length - 1) {
            console.log('\n⏳ 等待 3 秒...');
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }

    console.log('\n' + '='.repeat(80));
    console.log('🏁 測試完成');
    console.log('='.repeat(80));
}

runTests();

