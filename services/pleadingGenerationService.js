// services/pleadingGenerationService.js

import admin from 'firebase-admin';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { OPENAI_API_KEY, CLAUDE_API_KEY, CLAUDE_MODEL_PLEADING } from '../config/environment.js';

// 初始化 OpenAI（保留作為備用）
const openai = new OpenAI({
    apiKey: OPENAI_API_KEY
});

// 🚀 新增：初始化 Claude Opus 4
const anthropic = new Anthropic({
    apiKey: CLAUDE_API_KEY
});

/**
 * 🎯 訴狀生成服務
 * 基於整合的案件資料生成完整的法律訴狀文件
 */

/**
 * 🔥 改進：四種書狀類型的精確配置
 * 每種書狀都有專門的模板結構和注意事項
 */
const PLEADING_TEMPLATES = {
    complaint: {
        type: '民事起訴狀',
        tone: 'plaintiff',
        sections: ['標題', '當事人', '訴之聲明', '事實', '理由', '法條依據', '證據清單', '此致法院、具狀人、日期', '附件與副本數'],
        specialRequirements: ['利息起算日要明確', '管轄依據要寫清楚', '語氣主動積極，完整敘事'],
        claimFormat: '訴之聲明',
        claimExample: '一、被告應給付原告新臺幣○○元及自○年○月○日起至清償日止按年息○%計算之利息。\n二、訴訟費用由被告負擔。'
    },
    answer: {
        type: '民事答辯狀',
        tone: 'defendant',
        sections: ['標題', '當事人', '答辯聲明', '逐項答辯事實', '抗辯理由', '法條依據', '證據清單', '此致法院、具狀人、日期'],
        specialRequirements: ['強調駁斥原告事實、證據', '可加入反訴或備位抗辯', '逐項回應原告主張'],
        claimFormat: '答辯聲明',
        claimExample: '一、原告之請求均應駁回。\n二、訴訟費用由原告負擔。'
    },
    appeal: {
        type: '民事上訴狀',
        tone: 'appellant',
        sections: ['標題', '當事人', '上訴聲明', '上訴理由', '法條依據', '證據清單', '此致法院、具狀人、日期'],
        specialRequirements: ['必須註明原審案號', '限期內提出', '針對原審判決的具體錯誤'],
        claimFormat: '上訴聲明',
        claimExample: '一、撤銷原判決。\n二、被上訴人應給付上訴人新臺幣○○元及利息。\n三、訴訟費用由被上訴人負擔。'
    },
    brief: {
        type: '民事準備書狀',
        tone: 'neutral',
        sections: ['標題', '當事人', '目的', '爭點整理、補充事實', '法條依據', '證據清單', '此致法院、具狀人、日期'],
        specialRequirements: ['通常簡短重點式', '可用條列式格式', '配合法官要求格式'],
        claimFormat: '目的',
        claimExample: '一、補充事實及理由。\n二、整理爭點事項。'
    }
};

/**
 * 🔥 改進：檢查可用資訊，避免瞎掰
 */
function validateAvailableData(pleadingData) {
    const { caseInfo, claims, laws, evidence } = pleadingData;

    return {
        // 基本資訊檢查
        hasBasicInfo: !!(caseInfo?.caseType && caseInfo?.description),
        hasAmount: !!(caseInfo?.amount || claims?.some(c => c.amount)),
        hasSpecificDates: !!(caseInfo?.keyDates || caseInfo?.contractDate),
        hasCompleteParties: !!(caseInfo?.plaintiff && caseInfo?.defendant),
        hasCaseNumber: !!(caseInfo?.caseNumber),
        hasCourtInfo: !!(caseInfo?.court || caseInfo?.courtLevel),

        // 內容檢查
        hasClaims: !!(claims && claims.length > 0),
        hasLaws: !!(laws && laws.length > 0),
        hasEvidence: !!(evidence && evidence.length > 0),

        // 詳細計數
        claimsCount: claims?.length || 0,
        lawsCount: laws?.length || 0,
        evidenceCount: evidence?.length || 0
    };
}

/**
 * 🔥 改進：確定文書類型和配置，並驗證立場一致性
 */
function determineDocumentConfig(litigationStage, actualStance) {
    const config = PLEADING_TEMPLATES[litigationStage] || PLEADING_TEMPLATES.complaint;

    // 🔥 新增：立場與書狀類型的一致性驗證
    const validCombinations = {
        complaint: ['plaintiff'],           // 起訴狀只能是原告
        answer: ['defendant'],              // 答辯狀只能是被告
        appeal: ['plaintiff', 'defendant'], // 上訴狀原告被告都可以
        brief: ['plaintiff', 'defendant']   // 準備書狀原告被告都可以
    };

    const validStances = validCombinations[litigationStage] || [];

    if (actualStance && !validStances.includes(actualStance)) {
        console.warn(`[PleadingGeneration] ⚠️ 立場與書狀類型不匹配: ${actualStance} + ${litigationStage}`);
        // 記錄警告但不阻止生成，讓AI自行判斷
    }

    return {
        ...config,
        // 添加驗證結果到配置中
        stanceValidation: {
            isValid: !actualStance || validStances.includes(actualStance),
            actualStance,
            validStances,
            litigationStage
        }
    };
}

/**
 * 🔥 改進：創建資訊限制說明文本
 */
function createInfoLimitationText(availableInfo) {
    const limitations = [];

    limitations.push(`- 案件基本資訊：${availableInfo.hasBasicInfo ? '已提供' : '部分缺失'}`);
    limitations.push(`- 具體金額：${availableInfo.hasAmount ? '已提供' : '未提供，請用○○元'}`);
    limitations.push(`- 關鍵日期：${availableInfo.hasSpecificDates ? '已提供' : '未提供，請用○年○月○日'}`);
    limitations.push(`- 當事人完整資料：${availableInfo.hasCompleteParties ? '已提供' : '部分缺失，請適當略過'}`);
    limitations.push(`- 法院案號：${availableInfo.hasCaseNumber ? '已提供' : '未提供，請用（案號：尚未立案）'}`);
    limitations.push(`- 法院資訊：${availableInfo.hasCourtInfo ? '已提供' : '未提供，請用○○地方法院'}`);
    limitations.push(`- 法律主張：${availableInfo.hasClaims ? `已提供${availableInfo.claimsCount}項` : '未提供'}`);
    limitations.push(`- 法條依據：${availableInfo.hasLaws ? `已提供${availableInfo.lawsCount}條` : '未提供'}`);
    limitations.push(`- 證據材料：${availableInfo.hasEvidence ? `已提供${availableInfo.evidenceCount}項` : '未提供'}`);

    return limitations.join('\n');
}

/**
 * 🔥 改進：根據實際當事人立場和書狀類型獲取語氣指導
 */
function getStanceInstruction(actualStance, documentTone, litigationStage) {
    // 優先使用實際當事人立場
    if (actualStance) {
        const stanceInstructions = {
            plaintiff: '以原告立場撰寫，語氣主動積極，強調權利主張',
            defendant: '以被告立場撰寫，強調駁斥和抗辯，反駁原告主張'
        };

        // 根據訴訟階段調整語氣細節
        const stageModifiers = {
            complaint: actualStance === 'plaintiff' ? '，完整敘述事實和請求' : '',
            answer: actualStance === 'defendant' ? '，逐項回應並提出抗辯' : '',
            appeal: '，針對原審判決提出具體錯誤指摘',
            brief: '，簡潔重點式表達立場'
        };

        const baseInstruction = stanceInstructions[actualStance] || '以當事人立場撰寫';
        const stageModifier = stageModifiers[litigationStage] || '';

        return baseInstruction + stageModifier;
    }

    // 備用：使用書狀類型的語氣（向後兼容）
    const toneInstructions = {
        plaintiff: '以原告立場撰寫，語氣主動積極',
        defendant: '以被告立場撰寫，強調駁斥和抗辯',
        appellant: '以上訴人立場撰寫，針對原審錯誤',
        neutral: '以當事人立場撰寫，簡短重點式'
    };

    return toneInstructions[documentTone] || '以當事人立場撰寫';
}

/**
 * 🔥 改進：創建專門的模板結構文本
 */
function createTemplateStructure(documentConfig) {
    return documentConfig.sections.map((section, index) =>
        `${index + 1}. ${section}`
    ).join('\n');
}

/**
 * 🎯 為 Claude Opus 4 創建優化的訴狀生成 Prompt
 * Claude 在法律文件理解和生成方面表現更佳
 */
function createClaudeOptimizedPrompt(pleadingData) {
    const { litigationStage, caseInfo, claims, laws, evidence, disputes } = pleadingData;

    // 🔥 改進：提取實際當事人立場
    const actualStance = caseInfo?.stance;

    // 🔥 改進：使用新的書狀配置系統，包含立場驗證
    const documentConfig = determineDocumentConfig(litigationStage, actualStance);
    const documentType = documentConfig.type;
    const documentTone = documentConfig.tone;

    // 🔥 改進：檢查可用資訊，避免瞎掰
    const availableInfo = validateAvailableData(pleadingData);

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

    // 🔥 改進：創建資訊限制說明
    const infoLimitations = createInfoLimitationText(availableInfo);

    // 🔥 改進：根據實際立場和書狀類型調整語氣指導
    const stanceInstruction = getStanceInstruction(actualStance, documentTone, litigationStage);

    // 🔥 改進：創建專門的模板結構
    const templateStructure = createTemplateStructure(documentConfig);

    // 🔥 新增：立場一致性要求
    const stanceConsistencyRequirement = actualStance ?
        `\n【立場一致性要求 - 極其重要】\n當事人立場：${actualStance === 'plaintiff' ? '原告' : '被告'}\n書狀類型：${documentType}\n請確保整份文書的語氣、論述角度、法律主張都完全符合${actualStance === 'plaintiff' ? '原告' : '被告'}立場。絕對不可出現立場錯配的內容。\n` : '';

    // 🎯 Claude 專用：更結構化的提示詞格式
    return `你是台灣資深律師，專精各類法律文書撰寫。請根據以下資料，${stanceInstruction}，生成專業的${documentType}草稿。

## 📋 案件資料
${stanceConsistencyRequirement}
${caseDataText}

## ⚠️ 絕對禁止事項
1. **嚴禁編造**：不得編造任何未提供的事實、金額、日期、人名、地址
2. **嚴禁假設**：不得假設任何法院案號、判決內容、當事人詳細資料
3. **標準留空**：對於不清楚的資訊，必須使用標準留空用語：
   - 金額不明：「新臺幣○○元」
   - 日期不明：「○年○月○日」
   - 地址不明：「（送達地址略）」
   - 案號不明：「（案號：尚未立案）」
   - 法院不明：「○○地方法院」
   - 當事人資料不全：「（身分證字號略）」
   - 其他不明：「（詳如附件）」或「（略）」

## 📊 可用資訊限制
${infoLimitations}

## ⚖️ 法條使用限制
**僅得引用以下法條**：${lawWhitelist}
- 不得新增清單外法條
- 如認為清單內條文不適合，請在文末「（法律評註）」說明不引用理由

## 📝 文書結構要求
**必須嚴格按照以下模板生成，不得省略任何章節**：
${templateStructure}

## 🎯 特殊注意事項
${documentConfig.specialRequirements.map(req => `- ${req}`).join('\n')}
${documentConfig.stanceValidation && !documentConfig.stanceValidation.isValid ?
    `\n⚠️ **立場驗證警告**\n檢測到立場與書狀類型可能不匹配，請特別注意確保內容符合實際當事人立場。` : ''}

## 📋 ${documentConfig.claimFormat}範例格式
${documentConfig.claimExample}

## 📅 日期一致性要求
如有交貨日期，請統一以交貨後30日為利息起算日，並在文中明載計算基礎。所有利息起算日期必須一致。

請使用正式的法律文書語言，符合台灣法院實務慣例，生成可以直接使用的專業${documentType}。**寧可留空也絕不編造未提供的資訊**。`;
}

/**
 * 創建訴狀生成 Prompt（GPT 版本）
 * 🔥 使用固定模板化策略，確保專業格式和法條白名單控制
 */
function createPleadingPrompt(pleadingData) {
    const { litigationStage, caseInfo, claims, laws, evidence, disputes } = pleadingData;

    // 🔥 改進：提取實際當事人立場
    const actualStance = caseInfo?.stance;

    // 🔥 改進：使用新的書狀配置系統，包含立場驗證
    const documentConfig = determineDocumentConfig(litigationStage, actualStance);
    const documentType = documentConfig.type;
    const documentTone = documentConfig.tone;

    // 🔥 改進：檢查可用資訊，避免瞎掰
    const availableInfo = validateAvailableData(pleadingData);

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
    
    // 🔥 改進：創建資訊限制說明
    const infoLimitations = createInfoLimitationText(availableInfo);

    // 🔥 改進：根據實際立場和書狀類型調整語氣指導
    const stanceInstruction = getStanceInstruction(actualStance, documentTone, litigationStage);

    // 🔥 改進：創建專門的模板結構
    const templateStructure = createTemplateStructure(documentConfig);

    // 🔥 新增：立場一致性要求
    const stanceConsistencyRequirement = actualStance ?
        `\n【立場一致性要求 - 極其重要】\n當事人立場：${actualStance === 'plaintiff' ? '原告' : '被告'}\n書狀類型：${documentType}\n請確保整份文書的語氣、論述角度、法律主張都完全符合${actualStance === 'plaintiff' ? '原告' : '被告'}立場。絕對不可出現立場錯配的內容。\n` : '';

    return `作為資深台灣律師，你精通各種法律文書的編寫，請根據這些資料，${stanceInstruction}，生成一份專業的${documentType}草稿。
${stanceConsistencyRequirement}
${caseDataText}

【絕對禁止事項 - 嚴禁瞎掰】
1. 不得編造任何未提供的事實、金額、日期、人名、地址
2. 不得假設任何法院案號、判決內容、當事人詳細資料
3. 對於不清楚的資訊，必須使用標準留空用語：
   - 金額不明：「新臺幣○○元」
   - 日期不明：「○年○月○日」
   - 地址不明：「（送達地址略）」
   - 案號不明：「（案號：尚未立案）」
   - 法院不明：「○○地方法院」
   - 當事人資料不全：「（身分證字號略）」
   - 其他不明：「（詳如附件）」或「（略）」

【可用資訊限制】
${infoLimitations}

【重要限制】
僅得引用以下法條：${lawWhitelist}
不得新增清單外法條。如認為清單內條文不適合，請在文末「（法律評註）」說明不引用理由，不得另引他條。

【必須嚴格按照以下模板生成，不得省略任何章節】
${templateStructure}

【特殊注意事項】
${documentConfig.specialRequirements.map(req => `- ${req}`).join('\n')}
${documentConfig.stanceValidation && !documentConfig.stanceValidation.isValid ?
    `\n⚠️ 【立場驗證警告】\n檢測到立場與書狀類型可能不匹配，請特別注意確保內容符合實際當事人立場。` : ''}

【${documentConfig.claimFormat}範例格式】
${documentConfig.claimExample}

【日期一致性要求】
如有交貨日期，請統一以交貨後30日為利息起算日，並在文中明載計算基礎。所有利息起算日期必須一致。

請使用正式的法律文書語言，符合台灣法院實務慣例，生成可以直接使用的專業${documentType}。寧可留空也絕不編造未提供的資訊。`;
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
        console.log(`[PleadingGeneration] 當事人立場: ${pleadingData.caseInfo?.stance || '未指定'}`);

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

        // 🚀 智能 AI 模型選擇：優先 Claude，備用 GPT
        const result = await generatePleadingContentWithFallback(pleadingData);

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
 * 🎯 智能 AI 模型選擇：優先 Claude，備用 GPT
 * 提供最佳的法律文件生成體驗
 */
async function generatePleadingContentWithFallback(pleadingData) {
    try {
        // 🚀 優先使用 Claude Opus 4（法律文件判別能力更強）
        console.log('[PleadingGeneration] 🎯 嘗試使用 Claude Opus 4 生成訴狀');
        return await generatePleadingContentWithClaude(pleadingData);

    } catch (claudeError) {
        console.warn('[PleadingGeneration] ⚠️ Claude Opus 4 生成失敗，切換到 GPT-4.1 備用方案');
        console.warn('[PleadingGeneration] Claude 錯誤:', claudeError.message);

        try {
            // 🔄 備用方案：使用 GPT-4.1
            const result = await generatePleadingContentWithGPT(pleadingData);

            // 在結果中標記使用了備用模型
            result.metadata.model = "gpt-4.1 (fallback)";
            result.metadata.fallbackReason = claudeError.message;

            return result;

        } catch (gptError) {
            console.error('[PleadingGeneration] ❌ 所有 AI 模型都失敗');
            console.error('[PleadingGeneration] GPT 錯誤:', gptError.message);
            throw new Error(`AI 訴狀生成完全失敗 - Claude: ${claudeError.message}, GPT: ${gptError.message}`);
        }
    }
}

/**
 * 🚀 使用 Claude Opus 4 生成訴狀內容
 * 經測試 Claude 在法律文件判別能力上明顯優於 GPT-4.1
 */
async function generatePleadingContentWithClaude(pleadingData) {
    try {
        console.log('[PleadingGeneration] 🎯 使用 Claude Opus 4 生成訴狀內容');
        console.log('[PleadingGeneration] 立場資訊:', {
            stance: pleadingData.caseInfo?.stance,
            litigationStage: pleadingData.litigationStage,
            documentType: pleadingData.litigationStage
        });

        // 🎯 為 Claude 創建優化的提示詞
        const prompt = createClaudeOptimizedPrompt(pleadingData);

        console.log('[PleadingGeneration] 提示詞長度:', prompt.length);

        // 🚀 調用 Claude Opus 4
        const response = await anthropic.messages.create({
            model: CLAUDE_MODEL_PLEADING,
            max_tokens: 4000, // Claude 支援更長的輸出
            temperature: 0.1, // 較低的溫度確保一致性
            messages: [
                {
                    role: "user",
                    content: prompt
                }
            ]
        });

        const pleadingContent = response.content[0].text;

        console.log('[PleadingGeneration] Claude Opus 4 生成完成，內容長度:', pleadingContent.length);

        // 組裝結果
        const result = {
            pleadingContent: pleadingContent,
            generatedAt: new Date().toISOString(),
            litigationStage: pleadingData.litigationStage,
            metadata: {
                model: CLAUDE_MODEL_PLEADING,
                totalTokens: response.usage?.input_tokens + response.usage?.output_tokens || 0,
                inputTokens: response.usage?.input_tokens || 0,
                outputTokens: response.usage?.output_tokens || 0,
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
        console.error('[PleadingGeneration] Claude Opus 4 生成失敗:', error);
        throw new Error(`Claude 訴狀生成失敗: ${error.message}`);
    }
}

/**
 * 🔄 備用：GPT-4.1 生成訴狀內容（保留作為備用方案）
 */
async function generatePleadingContentWithGPT(pleadingData) {
    try {
        console.log('[PleadingGeneration] 開始AI生成訴狀內容');
        console.log('[PleadingGeneration] 立場資訊:', {
            stance: pleadingData.caseInfo?.stance,
            litigationStage: pleadingData.litigationStage,
            documentType: pleadingData.litigationStage
        });

        // 🔄 為 GPT 創建提示詞
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
    generatePleadingContentWithFallback as generatePleadingContent,
    generatePleadingContentWithClaude,
    generatePleadingContentWithGPT
};
