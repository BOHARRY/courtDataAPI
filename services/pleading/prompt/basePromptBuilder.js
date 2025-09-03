// services/pleading/prompt/basePromptBuilder.js

import { getTemplateConfig, createTemplateStructure, getStanceInstruction } from '../config/templates.js';
import { determineDocumentConfig } from '../config/stanceValidation.js';
import { validateAvailableData, createInfoLimitationText, createLawWhitelist, assembleCaseDataText } from '../validation/dataValidator.js';

/**
 * 🎯 基礎提示詞建構器
 * 提供通用的提示詞建構邏輯
 */

export class BasePromptBuilder {
    constructor() {
        this.commonSections = {
            prohibitions: this.createProhibitionsSection(),
            formatRequirements: this.createFormatRequirementsSection(),
            dateConsistency: this.createDateConsistencySection()
        };
    }

    /**
     * 建構基礎提示詞數據
     */
    buildBasePromptData(pleadingData) {
        const { litigationStage, caseInfo, laws } = pleadingData;
        
        // 提取實際當事人立場
        const actualStance = caseInfo?.stance;

        // 獲取模板配置
        const templateConfig = getTemplateConfig(litigationStage);
        
        // 確定文書配置並驗證立場一致性
        const documentConfig = determineDocumentConfig(litigationStage, actualStance, templateConfig);
        
        // 驗證可用資訊
        const availableInfo = validateAvailableData(pleadingData);
        
        // 創建各種文本組件
        const lawWhitelist = createLawWhitelist(laws);
        const caseDataText = assembleCaseDataText(pleadingData);
        const infoLimitations = createInfoLimitationText(availableInfo);
        const stanceInstruction = getStanceInstruction(actualStance, documentConfig.tone, litigationStage);
        const templateStructure = createTemplateStructure(documentConfig);
        
        // 立場一致性要求
        const stanceConsistencyRequirement = actualStance ? 
            `\n【立場一致性要求 - 極其重要】\n當事人立場：${actualStance === 'plaintiff' ? '原告' : '被告'}\n書狀類型：${documentConfig.type}\n請確保整份文書的語氣、論述角度、法律主張都完全符合${actualStance === 'plaintiff' ? '原告' : '被告'}立場。絕對不可出現立場錯配的內容。\n` : '';

        return {
            documentConfig,
            actualStance,
            availableInfo,
            lawWhitelist,
            caseDataText,
            infoLimitations,
            stanceInstruction,
            templateStructure,
            stanceConsistencyRequirement
        };
    }

    /**
     * 創建禁止事項章節
     */
    createProhibitionsSection() {
        return `## ⚠️ 絕對禁止事項
1. **嚴禁編造**：不得編造任何未提供的事實、金額、日期、人名、地址
2. **嚴禁假設**：不得假設任何法院案號、判決內容、當事人詳細資料
3. **標準留空**：對於不清楚的資訊，必須使用標準留空用語：
   - 金額不明：「新臺幣○○元」
   - 日期不明：「○年○月○日」
   - 地址不明：「（送達地址略）」
   - 案號不明：「（案號：尚未立案）」
   - 法院不明：「○○地方法院」
   - 當事人資料不全：「（身分證字號略）」
   - 其他不明：「（詳如附件）」或「（略）」`;
    }

    /**
     * 創建格式要求章節
     */
    createFormatRequirementsSection() {
        return `【格式要求 - 極其重要】
請生成純文字格式的正式法律文書，絕對不可使用任何 Markdown 符號：
- 禁止使用：# ## ### 等標題符號
- 禁止使用：** ** 等粗體符號  
- 禁止使用：* - 等列表符號
- 禁止使用：代碼區塊符號
- 只能使用：純文字、空行、縮排、標點符號
- 標題格式：直接寫標題文字，不加任何符號
- 強調格式：使用「」或直接文字，不用粗體符號

【正確格式範例】
民事上訴狀

案號：（案號：尚未立案）

當事人

上訴人（原審被告）
姓名：（略）
身分證字號：（身分證字號略）

上訴聲明

一、原判決廢棄。
二、被上訴人在第一審之訴駁回。

【錯誤格式範例 - 絕對禁止】
# 民事上訴狀
## 案號：（案號：尚未立案）
**上訴人（原審被告）**`;
    }

    /**
     * 創建日期一致性章節
     */
    createDateConsistencySection() {
        return `【日期一致性要求】
如有交貨日期，請統一以交貨後30日為利息起算日，並在文中明載計算基礎。所有利息起算日期必須一致。`;
    }

    /**
     * 創建法條使用限制章節
     */
    createLawLimitationSection(lawWhitelist) {
        return `## ⚖️ 法條使用限制
**僅得引用以下法條**：${lawWhitelist}
- 不得新增清單外法條
- 如認為清單內條文不適合，請在文末「（法律評註）」說明不引用理由`;
    }

    /**
     * 創建特殊注意事項章節
     */
    createSpecialRequirementsSection(documentConfig) {
        let section = `## 🎯 特殊注意事項\n${documentConfig.specialRequirements.map(req => `- ${req}`).join('\n')}`;
        
        if (documentConfig.stanceValidation && !documentConfig.stanceValidation.isValid) {
            section += `\n⚠️ **立場驗證警告**\n檢測到立場與書狀類型可能不匹配，請特別注意確保內容符合實際當事人立場。`;
        }
        
        return section;
    }

    /**
     * 創建聲明範例章節
     */
    createClaimExampleSection(documentConfig) {
        return `## 📋 ${documentConfig.claimFormat}範例格式
${documentConfig.claimExample}`;
    }

    /**
     * 創建最終提醒章節
     */
    createFinalReminderSection(documentType) {
        return `【最終提醒】
1. 寧可留空也絕不編造未提供的資訊
2. 絕對不可使用任何 Markdown 符號（#、**、*、-等）
3. 必須是純文字格式的正式法律文書
4. 所有標題直接寫文字，不加任何符號

請使用正式的法律文書語言，符合台灣法院實務慣例，生成可以直接使用的專業${documentType}。`;
    }
}
