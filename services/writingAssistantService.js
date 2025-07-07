// services/writingAssistantService.js

import admin from 'firebase-admin';
import OpenAI from 'openai';

// 初始化 OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

/**
 * 🎯 書狀寫作助手服務
 * 基於援引判例生成各種法律文書的寫作範例
 */

/**
 * 創建書狀寫作 Prompt
 */
function createWritingPrompt(citation, position, caseDescription, documentType) {
    const positionLabel = position === 'plaintiff' ? '原告' : position === 'defendant' ? '被告' : '中性';
    const documentLabels = {
        complaint: '起訴狀',
        answer: '答辯狀',
        appeal: '上訴狀',
        brief: '準備書狀'
    };

    const documentLabel = documentLabels[documentType] || '法律文書';

    return `你是資深訴訟律師，請基於以下援引判例為${positionLabel}方律師撰寫${documentLabel}的援引範例。

援引判例：${citation.citation}
推薦等級：${citation.recommendationLevel}
推薦理由：${citation.reason}
使用策略：${citation.usageStrategy}
案件描述：${caseDescription}
律師立場：${positionLabel}
文書類型：${documentLabel}

請生成一個完整的段落範例，要求：
1. 使用正式的法律文書語言
2. 符合台灣法院實務慣例
3. 長度約150-200字
4. 包含完整的論證邏輯
5. 可以直接複製到實際書狀中使用

請以 JSON 格式回應：
{
  "example": "完整的段落範例文字",
  "keyPoints": ["關鍵論證點1", "關鍵論證點2", "關鍵論證點3"],
  "usageTips": "使用建議和注意事項",
  "riskWarning": "可能的風險提醒（如有）"
}

重要原則：
1. 必須基於提供的援引判例內容
2. 符合${positionLabel}方的立場和策略
3. 使用台灣法院認可的引用格式
4. 絕對不要編造不存在的法條或判例
5. 確保論證邏輯清晰且有說服力
6. 請使用繁體中文回應`;
}

/**
 * 使用 GPT 生成單一文書類型的範例
 */
async function generateSingleDocumentExample(citation, position, caseDescription, documentType) {
    try {
        console.log(`[WritingAssistant] 開始生成${documentType}範例`);

        const prompt = createWritingPrompt(citation, position, caseDescription, documentType);

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: "你是專業的訴訟律師，擅長撰寫各種法律文書。請使用繁體中文回應，並以 JSON 格式提供分析結果。絕對不要編造或推測不確定的信息。"
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.1,
            max_tokens: 1500,
            response_format: { type: "json_object" }
        });

        if (!response?.choices?.[0]?.message?.content) {
            throw new Error('GPT 回應格式錯誤');
        }

        const result = JSON.parse(response.choices[0].message.content);
        console.log(`[WritingAssistant] ${documentType}範例生成成功`);
        
        return {
            type: documentType,
            example: result.example,
            keyPoints: result.keyPoints || [],
            usageTips: result.usageTips || '',
            riskWarning: result.riskWarning || ''
        };

    } catch (error) {
        console.error(`[WritingAssistant] 生成${documentType}範例失敗:`, error);
        throw error;
    }
}

/**
 * 生成所有文書類型的範例
 */
async function generateAllDocumentExamples(citation, position, caseDescription) {
    try {
        console.log('[WritingAssistant] 開始生成所有文書範例');

        const documentTypes = ['complaint', 'answer', 'appeal', 'brief'];
        const results = {};

        // 並行生成所有文書類型
        const promises = documentTypes.map(type => 
            generateSingleDocumentExample(citation, position, caseDescription, type)
        );

        const examples = await Promise.all(promises);

        // 組織結果
        examples.forEach(example => {
            results[example.type] = example.example;
        });

        // 取第一個範例的建議作為整體建議
        const firstExample = examples[0];

        return {
            writingExamples: results,
            strategicAdvice: firstExample.usageTips,
            riskWarnings: firstExample.riskWarning,
            keyPoints: firstExample.keyPoints,
            generatedAt: new Date().toISOString()
        };

    } catch (error) {
        console.error('[WritingAssistant] 生成所有文書範例失敗:', error);
        throw error;
    }
}

/**
 * 啟動書狀生成任務
 */
async function startWritingAssistantTask(citationData, position, caseDescription, userId) {
    const db = admin.firestore();
    const taskRef = db.collection('aiAnalysisTasks').doc();
    const taskId = taskRef.id;

    try {
        console.log(`[WritingAssistant] 啟動書狀生成任務: ${taskId}`);

        // 創建任務記錄
        const taskData = {
            userId,
            taskId,
            analysisType: 'writing_assistant',
            status: 'pending',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            inputData: {
                citation: citationData,
                position,
                caseDescription
            }
        };

        await taskRef.set(taskData);

        // 異步執行生成任務
        executeWritingAssistantInBackground(taskId, citationData, position, caseDescription, userId);

        return {
            message: '書狀範例生成任務已啟動',
            taskId
        };

    } catch (error) {
        console.error('[WritingAssistant] 啟動任務失敗:', error);
        throw error;
    }
}

/**
 * 背景執行書狀生成
 */
async function executeWritingAssistantInBackground(taskId, citationData, position, caseDescription, userId) {
    const db = admin.firestore();
    const taskRef = db.collection('aiAnalysisTasks').doc(taskId);

    try {
        console.log(`[WritingAssistant] 開始執行書狀生成任務: ${taskId}`);

        // 更新狀態為處理中
        await taskRef.update({
            status: 'processing',
            processingStartedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // 生成書狀範例
        const result = await generateAllDocumentExamples(citationData, position, caseDescription);

        // 保存結果
        await taskRef.update({
            status: 'complete',
            result: result,
            completedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`[WritingAssistant] 書狀生成任務 ${taskId} 完成`);

    } catch (error) {
        console.error(`[WritingAssistant] 書狀生成任務 ${taskId} 失敗:`, error);

        await taskRef.update({
            status: 'failed',
            error: error.message,
            failedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }
}

export {
    startWritingAssistantTask,
    generateAllDocumentExamples,
    generateSingleDocumentExample
};
