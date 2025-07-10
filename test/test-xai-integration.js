// test/test-xai-integration.js
import dotenv from 'dotenv';

// 載入環境變數
dotenv.config();

// 直接導入 xAI 相關模組，避免完整環境配置依賴
import { XAIClient } from '../utils/xaiClient.js';

// 直接從環境變數獲取配置
const XAI_API_KEY = process.env.XAI_API_KEY;
const XAI_MODEL_VERIFICATION = process.env.XAI_MODEL_VERIFICATION || 'grok-beta';
const XAI_MODEL_ANALYSIS = process.env.XAI_MODEL_ANALYSIS || 'grok-beta';

// 創建 xAI 客戶端實例
const xaiClient = new XAIClient(XAI_API_KEY);

/**
 * 測試 xAI 客戶端的基本功能
 */
async function testXAIClient() {
    console.log('🧪 開始測試 xAI 客戶端整合...');
    
    try {
        // 測試基本聊天完成
        console.log('\n📝 測試基本聊天完成...');
        const basicResponse = await xaiClient.chat.completions.create({
            model: XAI_MODEL_VERIFICATION,
            messages: [
                { role: "system", content: "你是一個專業的法律助手。" },
                { role: "user", content: "請簡單介紹什麼是民法。" }
            ],
            temperature: 0.1,
            max_tokens: 200
        });
        
        console.log('✅ 基本聊天完成測試成功');
        console.log('回應內容:', basicResponse.choices[0].message.content.substring(0, 100) + '...');
        
        // 測試 JSON 格式回應
        console.log('\n📋 測試 JSON 格式回應...');
        const jsonResponse = await xaiClient.chat.completions.create({
            model: XAI_MODEL_ANALYSIS,
            messages: [
                { role: "system", content: "你是專業的法律分析師。" },
                { role: "user", content: "請分析一個簡單的合約糾紛案例，並以 JSON 格式回應，包含 analysis 和 recommendation 欄位。" }
            ],
            temperature: 0.1,
            max_tokens: 300,
            response_format: { type: "json_object" }
        });
        
        console.log('✅ JSON 格式回應測試成功');
        
        // 嘗試解析 JSON
        try {
            const jsonData = JSON.parse(jsonResponse.choices[0].message.content);
            console.log('✅ JSON 解析成功');
            console.log('JSON 結構:', Object.keys(jsonData));
        } catch (parseError) {
            console.log('⚠️ JSON 解析失敗:', parseError.message);
            console.log('原始回應:', jsonResponse.choices[0].message.content);
        }
        
        console.log('\n🎉 xAI 客戶端整合測試完成！');
        
    } catch (error) {
        console.error('❌ xAI 客戶端測試失敗:', error);
        console.error('錯誤詳情:', error.message);
        
        // 檢查是否是 API 密鑰問題
        if (error.message.includes('API') || error.message.includes('auth')) {
            console.log('\n💡 提示: 請確認 XAI_API_KEY 環境變數已正確設置');
        }
    }
}

/**
 * 測試援引分析服務的關鍵函數
 */
async function testCitationAnalysisIntegration() {
    console.log('\n🔍 測試援引分析服務整合...');
    
    try {
        // 模擬嚴格驗證測試
        console.log('\n🛡️ 測試嚴格驗證功能...');
        const verificationResponse = await xaiClient.chat.completions.create({
            model: XAI_MODEL_VERIFICATION,
            messages: [
                { role: "system", content: "你是資深法律專家，擁有完全否決權。請嚴格把關，確保推薦品質。" },
                { role: "user", content: `請對以下援引判例進行嚴格評分（0-10分）：

案件描述：租賃契約糾紛
分析立場：原告

待驗證援引：
1. 最高法院108年台上字第1234號判決
   使用統計：15次使用，8次在法院見解內
   價值分數：85

請以 JSON 格式回應：
{
  "verifiedCitations": [
    {
      "citation": "援引名稱",
      "finalScore": 0-10,
      "verificationReason": "評估理由",
      "shouldDisplay": true/false,
      "riskWarning": "風險警告"
    }
  ],
  "verificationSummary": "整體驗證說明",
  "rejectedCount": 0
}` }
            ],
            temperature: 0.1,
            max_tokens: 800,
            response_format: { type: "json_object" }
        });
        
        console.log('✅ 嚴格驗證測試成功');
        
        // 嘗試解析驗證結果
        try {
            const verificationData = JSON.parse(verificationResponse.choices[0].message.content);
            console.log('✅ 驗證結果解析成功');
            console.log('驗證摘要:', verificationData.verificationSummary);
        } catch (parseError) {
            console.log('⚠️ 驗證結果解析失敗:', parseError.message);
        }
        
        console.log('\n🎯 援引分析服務整合測試完成！');
        
    } catch (error) {
        console.error('❌ 援引分析服務測試失敗:', error);
    }
}

// 執行測試
async function runAllTests() {
    await testXAIClient();
    await testCitationAnalysisIntegration();
}

// 如果直接執行此文件，則運行測試
if (import.meta.url === `file://${process.argv[1]}`) {
    runAllTests();
}

export { testXAIClient, testCitationAnalysisIntegration };
