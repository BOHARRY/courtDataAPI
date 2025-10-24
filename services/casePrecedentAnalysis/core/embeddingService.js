// services/casePrecedentAnalysis/core/embeddingService.js

import { OpenAI } from 'openai';
import { OPENAI_API_KEY } from '../../../config/environment.js';
import { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, AI_CONFIG } from '../utils/constants.js';

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

/**
 * 使用 OpenAI 生成案件描述的向量
 * 
 * @param {string} text - 要生成向量的文本
 * @returns {Promise<number[]>} 向量數組 (1536 維)
 * @throws {Error} 如果生成失敗
 */
export async function generateEmbedding(text) {
    try {
        const response = await openai.embeddings.create({
            model: EMBEDDING_MODEL,
            input: text,
            dimensions: EMBEDDING_DIMENSIONS
        });
        return response.data[0].embedding;
    } catch (error) {
        console.error('[embeddingService] 生成向量失敗:', error);
        throw new Error('無法生成案件描述的向量表示');
    }
}

/**
 * 使用 GPT-4o 進行案件事由補足與分析（成本控制版）
 * 限制 token 使用量，專注於律師核心需求
 * 
 * @param {string} userInput - 用戶輸入的案件描述
 * @returns {Promise<Object>} 補足後的案件描述
 */
export async function enrichCaseDescription(userInput) {
    try {
        console.log(`🔵 [ENRICH-START] 使用 GPT-4o 補足案件事由: "${userInput}"`);

        const prompt = `你是資深法律專家。請分析以下案件事由，提取核心法律爭點並轉換為搜尋查詢：

案件事由：「${userInput}」

請提供：
1. 核心法律爭點：將案件轉換為法律問題形式（例如：「原告主張之損害賠償請求權是否成立？」）
2. 法律術語：正式法律用詞（1-2個精準詞彙）
3. 實務用詞：實務常用表達（1-2個常見說法）
4. 爭點導向：具體法律爭點（1-2個核心爭點）

要求：
- 核心法律爭點要以問句形式呈現，模仿判決書中的法律爭點格式
- 其他維度限制15字內
- 使用繁體中文
- 避免過於寬泛的詞彙

JSON格式回應：
{
  "legalIssueQuery": "核心法律爭點（問句形式）",
  "formalTerms": "正式法律術語",
  "practicalTerms": "實務常用說法",
  "specificIssues": "具體法律爭點"
}`;

        console.log(`🔵 [ENRICH-API-CALL] 開始調用 OpenAI API`);
        const response = await openai.chat.completions.create({
            model: AI_CONFIG.enrichment.model,
            messages: [{ role: "user", content: prompt }],
            max_tokens: AI_CONFIG.enrichment.max_tokens,
            temperature: AI_CONFIG.enrichment.temperature,
            response_format: { type: "json_object" }
        });

        console.log(`🔵 [ENRICH-API-SUCCESS] OpenAI API 調用成功`);
        const enrichment = JSON.parse(response.choices[0].message.content);
        console.log(`🔵 [ENRICH-RESULT] 事由補足結果:`, enrichment);
        return enrichment;

    } catch (error) {
        console.error('🔴 [ENRICH-ERROR] 事由補足失敗');
        console.error('🔴 [ENRICH-ERROR] 錯誤類型:', error.name);
        console.error('🔴 [ENRICH-ERROR] 錯誤訊息:', error.message);
        console.error('🔴 [ENRICH-ERROR] 錯誤堆疊:', error.stack);

        // 降級策略：返回基本結構
        const fallback = {
            formalTerms: userInput,
            practicalTerms: userInput,
            specificIssues: userInput
        };
        console.log('🟡 [ENRICH-FALLBACK] 使用降級策略:', fallback);
        return fallback;
    }
}

/**
 * 批量生成向量（用於優化性能）
 * 
 * @param {string[]} texts - 要生成向量的文本數組
 * @returns {Promise<number[][]>} 向量數組的數組
 */
export async function generateEmbeddingsBatch(texts) {
    try {
        const response = await openai.embeddings.create({
            model: EMBEDDING_MODEL,
            input: texts,
            dimensions: EMBEDDING_DIMENSIONS
        });
        return response.data.map(item => item.embedding);
    } catch (error) {
        console.error('[embeddingService] 批量生成向量失敗:', error);
        throw new Error('無法批量生成向量');
    }
}

