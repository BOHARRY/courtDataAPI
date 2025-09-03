// services/pleading/prompt/gptPromptBuilder.js

import { BasePromptBuilder } from './basePromptBuilder.js';

/**
 * 🎯 GPT 專用提示詞建構器
 * 針對 GPT 的特性優化提示詞格式
 */

export class GPTPromptBuilder extends BasePromptBuilder {
    constructor() {
        super();
    }

    /**
     * 建構 GPT 優化的提示詞
     */
    buildPrompt(pleadingData) {
        const baseData = this.buildBasePromptData(pleadingData);
        
        return this.assembleGPTPrompt(baseData);
    }

    /**
     * 組裝 GPT 專用提示詞
     */
    assembleGPTPrompt(data) {
        const {
            documentConfig,
            stanceInstruction,
            stanceConsistencyRequirement,
            caseDataText,
            infoLimitations,
            lawWhitelist,
            templateStructure
        } = data;

        // GPT 專用：傳統格式的提示詞
        return `作為資深台灣律師，你精通各種法律文書的編寫，請根據這些資料，${stanceInstruction}，生成一份專業的${documentConfig.type}草稿。

${this.commonSections.formatRequirements}

案件資料：
${stanceConsistencyRequirement}
${caseDataText}

${this.commonSections.prohibitions}

可用資訊限制：
${infoLimitations}

法條使用限制：
僅得引用以下法條：${lawWhitelist}
- 不得新增清單外法條
- 如認為清單內條文不適合，請在文末「（法律評註）」說明不引用理由

文書結構要求：
必須嚴格按照以下模板生成，不得省略任何章節：
${templateStructure}

特殊注意事項：
${documentConfig.specialRequirements.map(req => `- ${req}`).join('\n')}
${documentConfig.stanceValidation && !documentConfig.stanceValidation.isValid ? 
    '\n⚠️ 立場驗證警告\n檢測到立場與書狀類型可能不匹配，請特別注意確保內容符合實際當事人立場。' : ''}

${documentConfig.claimFormat}範例格式：
${documentConfig.claimExample}

${this.commonSections.dateConsistency}

${this.createFinalReminderSection(documentConfig.type)}`;
    }

    /**
     * 創建 GPT 專用的簡化格式
     */
    createSimplifiedFormat(data) {
        return {
            introduction: this.createIntroduction(data),
            caseData: this.createSimplifiedCaseData(data),
            constraints: this.createSimplifiedConstraints(data),
            structure: this.createSimplifiedStructure(data),
            conclusion: this.createSimplifiedConclusion(data)
        };
    }

    /**
     * 創建簡化的介紹
     */
    createIntroduction(data) {
        return `作為資深台灣律師，你精通各種法律文書的編寫，請根據這些資料，${data.stanceInstruction}，生成一份專業的${data.documentConfig.type}草稿。`;
    }

    /**
     * 創建簡化的案件資料
     */
    createSimplifiedCaseData(data) {
        return `案件資料：
${data.stanceConsistencyRequirement}
${data.caseDataText}`;
    }

    /**
     * 創建簡化的約束條件
     */
    createSimplifiedConstraints(data) {
        return `重要限制：
1. 絕對不可編造未提供的資訊
2. 不明資訊請用標準留空格式
3. 僅能引用提供的法條：${data.lawWhitelist}
4. 必須使用純文字格式，禁用 Markdown 符號`;
    }

    /**
     * 創建簡化的結構要求
     */
    createSimplifiedStructure(data) {
        return `文書結構：
${data.templateStructure}

特殊要求：
${data.documentConfig.specialRequirements.map(req => `- ${req}`).join('\n')}`;
    }

    /**
     * 創建簡化的結論
     */
    createSimplifiedConclusion(data) {
        return `請生成專業、準確、符合台灣法院實務的${data.documentConfig.type}。寧可留空也不編造資訊。`;
    }

    /**
     * 針對 GPT 的特殊優化
     */
    optimizeForGPT(prompt) {
        // GPT 特殊優化：
        // 1. 減少過於複雜的格式要求
        // 2. 使用更直接的指令
        // 3. 避免過多的符號和標記
        
        return prompt
            .replace(/【/g, '[')
            .replace(/】/g, ']')
            .replace(/## /g, '')
            .replace(/\*\*/g, '');
    }

    /**
     * 創建 GPT 專用的系統提示
     */
    createSystemPrompt() {
        return `你是台灣資深律師，專精各種法律文書的編寫。請嚴格按照指示生成專業的法律文書。

重要原則：
1. 絕對不可編造任何未提供的資訊
2. 使用純文字格式，不使用 Markdown 符號
3. 嚴格遵循台灣法院實務慣例
4. 確保立場一致性`;
    }
}
