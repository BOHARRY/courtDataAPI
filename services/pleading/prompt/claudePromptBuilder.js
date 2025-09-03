// services/pleading/prompt/claudePromptBuilder.js

import { BasePromptBuilder } from './basePromptBuilder.js';

/**
 * 🎯 Claude 專用提示詞建構器
 * 針對 Claude 的特性優化提示詞格式
 */

export class ClaudePromptBuilder extends BasePromptBuilder {
    constructor() {
        super();
    }

    /**
     * 建構 Claude 優化的提示詞
     */
    buildPrompt(pleadingData) {
        const baseData = this.buildBasePromptData(pleadingData);
        
        return this.assembleClaudePrompt(baseData);
    }

    /**
     * 組裝 Claude 專用提示詞
     */
    assembleClaudePrompt(data) {
        const {
            documentConfig,
            stanceInstruction,
            stanceConsistencyRequirement,
            caseDataText,
            infoLimitations,
            lawWhitelist,
            templateStructure
        } = data;

        // Claude 專用：更結構化的提示詞格式 + AI 內容標記
        return `你是台灣資深律師，專精各類法律文書撰寫。請根據以下資料，${stanceInstruction}，生成專業的${documentConfig.type}草稿。

${this.commonSections.formatRequirements}

## 🏷️ AI 內容標記要求（重要）
為確保透明度，請在生成內容結束後，在文檔最末使用以下標記格式補充所有非原始資料的內容：

- **【AI補充-法條】**：自行引用的法條條文（未在法條清單中的）
- **【AI補充-事實】**：基於邏輯推論補充的事實描述
- **【AI補充-論述】**：專業法律分析和論述
- **【AI補充-程序】**：為符合法院格式要求添加的程序性內容
- **【AI補充-計算】**：利息、金額等計算邏輯

**標記範例**：
"依據【AI補充-法條】民法第184條第1項前段規定【/AI補充-法條】，被告應負損害賠償責任。"

這樣律師就能清楚識別哪些內容需要額外驗證。

## 📋 案件資料
${stanceConsistencyRequirement}
${caseDataText}

${this.commonSections.prohibitions}

## 📊 可用資訊限制
${infoLimitations}

${this.createLawLimitationSection(lawWhitelist)}

## 📝 文書結構要求
**必須嚴格按照以下模板生成，不得省略任何章節**：
${templateStructure}

${this.createSpecialRequirementsSection(documentConfig)}

${this.createClaimExampleSection(documentConfig)}

${this.commonSections.dateConsistency}

${this.createFinalReminderSection(documentConfig.type)}`;
    }

    /**
     * 創建 Claude 專用的 AI 標記說明
     */
    createAIMarkingInstructions() {
        return `## 🏷️ AI 內容標記要求（重要）
為確保透明度，請在生成內容結束後，在文檔最末使用以下標記格式補充所有非原始資料的內容：

- **【AI補充-法條】**：自行引用的法條條文（未在法條清單中的）
- **【AI補充-事實】**：基於邏輯推論補充的事實描述
- **【AI補充-論述】**：專業法律分析和論述
- **【AI補充-程序】**：為符合法院格式要求添加的程序性內容
- **【AI補充-計算】**：利息、金額等計算邏輯

**標記範例**：
"依據【AI補充-法條】民法第184條第1項前段規定【/AI補充-法條】，被告應負損害賠償責任。"

這樣律師就能清楚識別哪些內容需要額外驗證。`;
    }

    /**
     * 針對 Claude 優化的結構化章節
     */
    createStructuredSections(data) {
        return {
            header: this.createHeaderSection(data),
            caseData: this.createCaseDataSection(data),
            constraints: this.createConstraintsSection(data),
            requirements: this.createRequirementsSection(data),
            examples: this.createExamplesSection(data),
            footer: this.createFooterSection(data)
        };
    }

    /**
     * 創建標題章節
     */
    createHeaderSection(data) {
        return `你是台灣資深律師，專精各類法律文書撰寫。請根據以下資料，${data.stanceInstruction}，生成專業的${data.documentConfig.type}草稿。`;
    }

    /**
     * 創建案件資料章節
     */
    createCaseDataSection(data) {
        return `## 📋 案件資料
${data.stanceConsistencyRequirement}
${data.caseDataText}`;
    }

    /**
     * 創建約束條件章節
     */
    createConstraintsSection(data) {
        return `${this.commonSections.prohibitions}

## 📊 可用資訊限制
${data.infoLimitations}

${this.createLawLimitationSection(data.lawWhitelist)}`;
    }

    /**
     * 創建需求章節
     */
    createRequirementsSection(data) {
        return `## 📝 文書結構要求
**必須嚴格按照以下模板生成，不得省略任何章節**：
${data.templateStructure}

${this.createSpecialRequirementsSection(data.documentConfig)}`;
    }

    /**
     * 創建範例章節
     */
    createExamplesSection(data) {
        return `${this.createClaimExampleSection(data.documentConfig)}

${this.commonSections.dateConsistency}`;
    }

    /**
     * 創建結尾章節
     */
    createFooterSection(data) {
        return this.createFinalReminderSection(data.documentConfig.type);
    }
}
