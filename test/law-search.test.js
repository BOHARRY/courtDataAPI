// test/law-search.test.js
// 法條搜索 API 測試範例

/**
 * 測試法條搜索 API 的範例腳本
 * 
 * 使用方式：
 * 1. 確保後端服務正在運行
 * 2. 設置有效的 JWT Token
 * 3. 運行測試腳本
 */

const API_BASE_URL = 'https://courtdataapi.onrender.com';
// const API_BASE_URL = 'http://localhost:3000'; // 本地測試

// 測試用的 JWT Token（需要替換為有效的 token）
const TEST_TOKEN = 'your_jwt_token_here';

/**
 * 測試法條精準搜索
 */
async function testBasicLawSearch() {
    console.log('\n=== 測試法條精準搜索 ===');
    
    const testCases = [
        {
            name: '條號搜索',
            params: { article_number: '184' }
        },
        {
            name: '法典搜索',
            params: { code_name: '民法' }
        },
        {
            name: '關鍵字搜索',
            params: { query: '侵權行為' }
        },
        {
            name: '混合搜索',
            params: { 
                query: '損害賠償', 
                code_name: '民法',
                search_type: 'mixed'
            }
        }
    ];

    for (const testCase of testCases) {
        try {
            console.log(`\n測試: ${testCase.name}`);
            
            const params = new URLSearchParams(testCase.params);
            const url = `${API_BASE_URL}/api/law-search/articles?${params}`;
            
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${TEST_TOKEN}`
                }
            });

            const data = await response.json();
            
            if (response.ok) {
                console.log(`✅ 成功 - 找到 ${data.total} 條結果`);
                if (data.articles.length > 0) {
                    const first = data.articles[0];
                    console.log(`   首條: ${first.code_name}${first.article_number} - ${first.text_original.substring(0, 50)}...`);
                }
            } else {
                console.log(`❌ 失敗 - ${data.message}`);
            }
            
        } catch (error) {
            console.log(`❌ 錯誤 - ${error.message}`);
        }
    }
}

/**
 * 測試法條語意搜索
 */
async function testSemanticLawSearch() {
    console.log('\n=== 測試法條語意搜索 ===');
    
    const testQueries = [
        '房東對於租賃物的修繕義務有哪些相關法條？',
        '公務員收賄的刑事責任',
        '契約違約的損害賠償計算',
        '侵權行為的構成要件'
    ];

    for (const query of testQueries) {
        try {
            console.log(`\n測試查詢: ${query}`);
            
            const response = await fetch(`${API_BASE_URL}/api/law-search/semantic`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${TEST_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query,
                    page: 1,
                    pageSize: 5
                })
            });

            const data = await response.json();
            
            if (response.ok) {
                console.log(`✅ 成功 - 找到 ${data.total} 條結果`);
                console.log(`   優化查詢: ${data.enhancedQuery?.enhanced || 'N/A'}`);
                console.log(`   關鍵字: ${data.enhancedQuery?.keywords?.join(', ') || 'N/A'}`);
                
                if (data.articles.length > 0) {
                    const first = data.articles[0];
                    console.log(`   最相關: ${first.code_name}${first.article_number} (相似度: ${first.relevanceScore?.toFixed(2)})`);
                }
            } else {
                console.log(`❌ 失敗 - ${data.message}`);
            }
            
        } catch (error) {
            console.log(`❌ 錯誤 - ${error.message}`);
        }
    }
}

/**
 * 測試搜索建議
 */
async function testSearchSuggestions() {
    console.log('\n=== 測試搜索建議 ===');
    
    const testQueries = ['民', '刑', '184', '侵權'];

    for (const query of testQueries) {
        try {
            console.log(`\n測試建議: "${query}"`);
            
            const response = await fetch(`${API_BASE_URL}/api/law-search/suggestions?query=${encodeURIComponent(query)}`);
            const data = await response.json();
            
            if (response.ok) {
                console.log(`✅ 成功 - ${data.suggestions.length} 個建議`);
                data.suggestions.forEach((suggestion, index) => {
                    console.log(`   ${index + 1}. [${suggestion.type}] ${suggestion.text}`);
                });
            } else {
                console.log(`❌ 失敗 - ${data.message}`);
            }
            
        } catch (error) {
            console.log(`❌ 錯誤 - ${error.message}`);
        }
    }
}

/**
 * 測試法條詳細內容
 */
async function testLawArticleDetail() {
    console.log('\n=== 測試法條詳細內容 ===');
    
    // 首先搜索一個法條來獲取 ID
    try {
        const searchResponse = await fetch(`${API_BASE_URL}/api/law-search/articles?article_number=184&code_name=民法`, {
            headers: {
                'Authorization': `Bearer ${TEST_TOKEN}`
            }
        });

        const searchData = await searchResponse.json();
        
        if (searchData.success && searchData.articles.length > 0) {
            const articleId = searchData.articles[0].id;
            console.log(`\n測試法條詳情: ID ${articleId}`);
            
            const detailResponse = await fetch(`${API_BASE_URL}/api/law-search/articles/${articleId}`, {
                headers: {
                    'Authorization': `Bearer ${TEST_TOKEN}`
                }
            });

            const detailData = await detailResponse.json();
            
            if (detailResponse.ok) {
                console.log(`✅ 成功獲取詳情`);
                const article = detailData.article;
                console.log(`   法條: ${article.code_name}${article.article_number}`);
                console.log(`   章節: ${article.chapter || 'N/A'}`);
                console.log(`   內容: ${article.text_original.substring(0, 100)}...`);
            } else {
                console.log(`❌ 失敗 - ${detailData.message}`);
            }
        } else {
            console.log('❌ 無法找到測試用的法條');
        }
        
    } catch (error) {
        console.log(`❌ 錯誤 - ${error.message}`);
    }
}

/**
 * 執行所有測試
 */
async function runAllTests() {
    console.log('🚀 開始法條搜索 API 測試');
    console.log(`API 基礎 URL: ${API_BASE_URL}`);
    
    if (TEST_TOKEN === 'your_jwt_token_here') {
        console.log('⚠️  警告: 請設置有效的 JWT Token');
        return;
    }

    await testBasicLawSearch();
    await testSemanticLawSearch();
    await testSearchSuggestions();
    await testLawArticleDetail();
    
    console.log('\n✨ 測試完成');
}

// 如果直接運行此檔案，執行測試
if (typeof module !== 'undefined' && require.main === module) {
    runAllTests().catch(console.error);
}

// 導出測試函數供其他模組使用
if (typeof module !== 'undefined') {
    module.exports = {
        testBasicLawSearch,
        testSemanticLawSearch,
        testSearchSuggestions,
        testLawArticleDetail,
        runAllTests
    };
}
