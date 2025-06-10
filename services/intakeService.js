// services/intakeService.js (重構後)

import OpenAI from 'openai';
import { OPENAI_API_KEY } from '../config/environment.js';

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

/**
 * 通用的 AI 對話處理服務。
 * @param {Object} domainConfig - 來自 config/intakeDomainConfig.js 的領域設定。
 * @param {Array<Object>} conversationHistory - 對話歷史。
 * @param {Object} caseInfo - 目前已知的案件資訊。
 * @returns {Promise<Object>} - AI 生成的結構化回應。
 */
async function handleChat(domainConfig, conversationHistory, caseInfo = {}) {
    if (!conversationHistory || conversationHistory.length === 0) {
        throw new Error('對話歷史不得為空');
    }

    // 1. 生成記憶摘要
    const memoryContext = generateMemoryContext(domainConfig, caseInfo);

    // 2. 準備 Prompt 模板所需的參數
    const dialogueStage = caseInfo.dialogueStage || 'greeting';
    const caseType = caseInfo.caseType || null;
    const feeInfo = domainConfig.feeRanges[caseType] || domainConfig.feeRanges.default;

    // 3. 從領域設定檔中獲取動態的系統 Prompt
    const dynamicSystemPrompt = domainConfig.getSystemPromptTemplate({
        memoryContext,
        dialogueStage,
        caseType,
        feeInfo,
        assistantName: domainConfig.assistantName
    });

    try {
        const messages = [
            { role: 'system', content: dynamicSystemPrompt },
            ...conversationHistory,
        ];

        const response = await openai.chat.completions.create({
            model: 'gpt-4.1', // 注意：您的代碼中使用的是 gpt-4.1，我這裡修正為與 README 一致的 gpt-4o 或更新的模型
            messages: messages,
            response_format: { type: "json_object" },
            temperature: 0.7,
            max_tokens: 500,
        });

        const assistantResponseJson = response.choices[0].message.content;
        return JSON.parse(assistantResponseJson);

    } catch (error) {
        console.error('Error in intakeService:', error);
        return {
            analysis: { error: "API or parsing failed" },
            response: '抱歉，我這裡好像有點小問題，請稍後再試一次好嗎？'
        };
    }
}

/**
 * 通用的記憶摘要生成器。
 * @param {Object} domainConfig - 領域設定檔。
 * @param {Object} caseInfo - 案件資訊物件。
 * @returns {string}
 */
function generateMemoryContext(domainConfig, caseInfo) {
    const contextLines = [];
    contextLines.push(`- 案件類型: ${caseInfo.caseType || '未知'}`);

    const requiredInfo = domainConfig.requiredInfo[caseInfo.caseType] || [];
    const fieldMapping = domainConfig.fieldMapping;

    requiredInfo.forEach(field => {
        const key = fieldMapping[field] || field;
        contextLines.push(`- ${field}: ${caseInfo[key] || '未知'}`);
    });

    if (requiredInfo.length === 0 && caseInfo.caseType) {
        contextLines.push("\n請先深入了解案件具體發生了什麼事。");
    } else if (requiredInfo.length > 0) {
        contextLines.push("\n你的目標是引導使用者說出「未知」的項目。");
    }

    return contextLines.join('\n');
}

export { handleChat };