// services/pleadingGenerationService.js

import admin from 'firebase-admin';
import OpenAI from 'openai';

// 初始化 OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

/**
 * 🎯 訴狀生成服務
 * 基於整合的案件資料生成完整的法律訴狀文件
 */

/**
 * 🔥 改進：確定文書類型和語氣
 * 解決當事人立場與文書類型混淆問題
 */
function determineDocumentTypeAndTone(litigationStage, stance) {
    if (litigationStage === 'complaint') {
        return { type: '起訴狀', tone: 'plaintiff' }; // 起訴狀固定為原告立場
    }
    if (litigationStage === 'answer') {
        return { type: '答辯狀', tone: stance || 'defendant' };
    }
    if (litigationStage === 'appeal') {
        return { type: '上訴狀', tone: stance || 'appellant' };
    }
    if (litigationStage === 'brief') {
        return { type: '準備書狀', tone: stance || 'plaintiff' };
    }

    // 預設為起訴狀
    return { type: '起訴狀', tone: 'plaintiff' };
}

/**
 * 創建訴狀生成 Prompt
 * 🔥 使用固定模板化策略，確保專業格式和法條白名單控制
 */
function createPleadingPrompt(pleadingData) {
    const { litigationStage, caseInfo, claims, laws, evidence, disputes } = pleadingData;

    // 🔥 改進：當事人立場與文書類型解耦
    const documentConfig = determineDocumentTypeAndTone(litigationStage, caseInfo?.stance);
    const documentType = documentConfig.type;
    const documentTone = documentConfig.tone;

    // 🔥 改進：法條白名單機制
    const lawWhitelist = laws && laws.length > 0
        ? laws.map(law => law.articleNumber || law.title || law.content?.substring(0, 20)).join('、')
        : '無提供法條';
    
    // 組裝案件資料文本
    let caseDataText = '';
    
    // 案件基本信息
    if (caseInfo) {
        caseDataText += `【案件基本資訊】\n`;
        caseDataText += `案由：${caseInfo.caseType || '未指定'}\n`;
        caseDataText += `法院層級：${caseInfo.courtLevel || '未指定'}\n`;
        caseDataText += `案件性質：${caseInfo.caseNature || '未指定'}\n`;
        caseDataText += `當事人立場：${caseInfo.stance || '未指定'}\n`;
        caseDataText += `案件描述：${caseInfo.description || '未提供'}\n\n`;
    }
    
    // 法律主張
    if (claims && claims.length > 0) {
        caseDataText += `【法律主張】\n`;
        claims.forEach((claim, index) => {
            caseDataText += `${index + 1}. ${claim.content || claim.claimContent || '無內容'}\n`;
            if (claim.legalBasis) {
                caseDataText += `   法律依據：${claim.legalBasis}\n`;
            }
            if (claim.factualBasis) {
                caseDataText += `   事實依據：${claim.factualBasis}\n`;
            }
        });
        caseDataText += '\n';
    }
    
    // 法條依據
    if (laws && laws.length > 0) {
        caseDataText += `【法條依據】\n`;
        laws.forEach((law, index) => {
            caseDataText += `${index + 1}. ${law.title || '法條'}\n`;
            caseDataText += `   內容：${law.content || '無內容'}\n`;
        });
        caseDataText += '\n';
    }
    
    // 證據材料
    if (evidence && evidence.length > 0) {
        caseDataText += `【證據材料】\n`;
        evidence.forEach((item, index) => {
            caseDataText += `${index + 1}. ${item.content || '無內容'}\n`;
            if (item.evidenceType) {
                caseDataText += `   證據類型：${item.evidenceType}\n`;
            }
        });
        caseDataText += '\n';
    }
    
    // 爭點內容（如果有）
    if (disputes && disputes.length > 0) {
        caseDataText += `【爭點內容】\n`;
        disputes.forEach((dispute, index) => {
            caseDataText += `${index + 1}. ${dispute.content || dispute.disputeContent || '無內容'}\n`;
        });
        caseDataText += '\n';
    }
    
    // 🔥 改進：固定模板化 Prompt
    const stanceInstruction = documentTone === 'plaintiff' ? '以原告立場撰寫' :
                             documentTone === 'defendant' ? '以被告立場撰寫' :
                             '以當事人立場撰寫';

    return `作為資深台灣律師，你精通各種法律文書的編寫，請根據這些資料，${stanceInstruction}，生成一份專業的${documentType}草稿。

${caseDataText}

【重要限制】
僅得引用以下法條：${lawWhitelist}
不得新增清單外法條。如認為清單內條文不適合，請在文末「（法律評註）」說明不引用理由，不得另引他條。

【必須嚴格按照以下模板生成，不得省略任何章節】

1. ${documentType}（置中抬頭）
2. 當事人資料（含送達地址、代理人資訊）
3. 訴之聲明（編號列點，使用'一、二、三、'格式）
4. 事實（分段，使用'(一)(二)(三)'格式）
5. 理由（分段，僅評述提供之法條清單內容）
6. 法條依據（僅列清單內條文之條名）
7. 證據清單（證一、證二...格式，附出處/日期）
8. 此致 ○○地方法院
9. 具狀人、日期

【格式要求】
- 第一行：${documentType}（置中）
- 當事人欄位包含：姓名、身分證字號、住所、送達地址
- 訴之聲明使用：'一、被告應給付...' '二、訴訟費用由被告負擔'
- 事實與理由分開撰寫，不要混合
- 結尾必須包含：'此致 ○○地方法院' + 具狀人 + 日期
- 證據清單使用：'證一：...' '證二：...' 格式

【日期一致性要求】
如有交貨日期，請統一以交貨後30日為利息起算日，並在文中明載計算基礎。所有利息起算日期必須一致。

請使用正式的法律文書語言，符合台灣法院實務慣例，生成可以直接使用的專業${documentType}。`;
}

/**
 * 啟動訴狀生成任務
 */
async function startPleadingGenerationTask(pleadingData, userId) {
    const db = admin.firestore();
    const taskRef = db.collection('aiAnalysisTasks').doc();
    const taskId = taskRef.id;

    try {
        console.log(`[PleadingGeneration] 啟動訴狀生成任務: ${taskId}`);
        console.log(`[PleadingGeneration] 用戶: ${userId}`);
        console.log(`[PleadingGeneration] 訴訟階段: ${pleadingData.litigationStage}`);

        // 創建任務記錄
        const taskData = {
            userId,
            taskId,
            analysisType: 'pleading_generation',
            status: 'pending',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            inputData: {
                litigationStage: pleadingData.litigationStage,
                caseInfo: pleadingData.caseInfo,
                claims: pleadingData.claims,
                laws: pleadingData.laws,
                evidence: pleadingData.evidence,
                disputes: pleadingData.disputes || [],
                judgements: pleadingData.judgements || [],
                cases: pleadingData.cases || [],
                language: pleadingData.language || 'traditional_chinese',
                format: pleadingData.format || 'standard'
            }
        };

        await taskRef.set(taskData);

        // 異步執行訴狀生成任務
        executePleadingGenerationInBackground(taskId, pleadingData, userId);

        return {
            message: '訴狀生成任務已啟動',
            taskId
        };

    } catch (error) {
        console.error('[PleadingGeneration] 啟動任務失敗:', error);
        throw error;
    }
}

/**
 * 背景執行訴狀生成
 */
async function executePleadingGenerationInBackground(taskId, pleadingData, userId) {
    const db = admin.firestore();
    const taskRef = db.collection('aiAnalysisTasks').doc(taskId);

    try {
        console.log(`[PleadingGeneration] 開始執行訴狀生成任務: ${taskId}`);

        // 更新狀態為處理中
        await taskRef.update({
            status: 'processing',
            processingStartedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // 生成訴狀內容
        const result = await generatePleadingContent(pleadingData);

        // 保存結果
        await taskRef.update({
            status: 'complete',
            result: result,
            completedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`[PleadingGeneration] 訴狀生成任務 ${taskId} 完成`);

    } catch (error) {
        console.error(`[PleadingGeneration] 訴狀生成任務 ${taskId} 失敗:`, error);

        await taskRef.update({
            status: 'failed',
            error: error.message,
            failedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }
}

/**
 * 生成訴狀內容
 * 調用GPT-4.1進行AI生成
 */
async function generatePleadingContent(pleadingData) {
    try {
        console.log('[PleadingGeneration] 開始AI生成訴狀內容');

        // 創建提示詞
        const prompt = createPleadingPrompt(pleadingData);

        console.log('[PleadingGeneration] 提示詞長度:', prompt.length);

        // 調用GPT-4.1
        const response = await openai.chat.completions.create({
            model: "gpt-4.1",//注意：GPT-4-turbo-preview為舊模型
            messages: [
                {
                    role: "system",
                    content: "你是專業的台灣律師，擅長撰寫各種法律文書。請使用繁體中文回應，生成符合台灣法院實務的正式法律文書。"
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.1, // 較低的溫度確保一致性
            // 不限制max_tokens，讓AI自由生成完整內容
        });

        const pleadingContent = response.choices[0].message.content;

        console.log('[PleadingGeneration] AI生成完成，內容長度:', pleadingContent.length);

        // 組裝結果
        const result = {
            pleadingContent: pleadingContent,
            generatedAt: new Date().toISOString(),
            litigationStage: pleadingData.litigationStage,
            metadata: {
                model: "gpt-4-turbo-preview",
                totalTokens: response.usage?.total_tokens || 0,
                promptTokens: response.usage?.prompt_tokens || 0,
                completionTokens: response.usage?.completion_tokens || 0,
                inputDataSummary: {
                    caseInfoProvided: !!pleadingData.caseInfo,
                    claimsCount: pleadingData.claims?.length || 0,
                    lawsCount: pleadingData.laws?.length || 0,
                    evidenceCount: pleadingData.evidence?.length || 0,
                    disputesCount: pleadingData.disputes?.length || 0
                }
            },
            // 添加原始輸入數據的摘要（用於結果節點顯示）
            inputSummary: {
                litigationStage: pleadingData.litigationStage,
                caseType: pleadingData.caseInfo?.caseType,
                claimsCount: pleadingData.claims?.length || 0,
                lawsCount: pleadingData.laws?.length || 0,
                evidenceCount: pleadingData.evidence?.length || 0
            }
        };

        return result;

    } catch (error) {
        console.error('[PleadingGeneration] AI生成失敗:', error);
        throw new Error(`AI訴狀生成失敗: ${error.message}`);
    }
}

export {
    startPleadingGenerationTask,
    generatePleadingContent
};
