// services/pleading/config/templates.js

/**
 * 🎯 訴狀模板配置模組
 * 集中管理所有訴狀類型的模板結構和配置
 */

/**
 * 訴狀模板定義
 * 每種書狀都有專門的模板結構和注意事項
 */
export const PLEADING_TEMPLATES = {
    complaint: {
        type: '民事起訴狀',
        tone: 'plaintiff',
        sections: [
            '標題', '當事人', '訴之聲明', '事實', '理由', 
            '法條依據', '證據清單', '此致法院、具狀人、日期', '附件與副本數'
        ],
        specialRequirements: [
            '利息起算日要明確', 
            '管轄依據要寫清楚', 
            '語氣主動積極，完整敘事'
        ],
        claimFormat: '訴之聲明',
        claimExample: '一、被告應給付原告新臺幣○○元及自○年○月○日起至清償日止按年息○%計算之利息。\n二、訴訟費用由被告負擔。'
    },
    answer: {
        type: '民事答辯狀',
        tone: 'defendant',
        sections: [
            '標題', '當事人', '答辯聲明', '逐項答辯事實', 
            '抗辯理由', '法條依據', '證據清單', '此致法院、具狀人、日期'
        ],
        specialRequirements: [
            '強調駁斥原告事實、證據', 
            '可加入反訴或備位抗辯', 
            '逐項回應原告主張'
        ],
        claimFormat: '答辯聲明',
        claimExample: '一、原告之請求均應駁回。\n二、訴訟費用由原告負擔。'
    },
    appeal: {
        type: '民事上訴狀',
        tone: 'appellant',
        sections: [
            '標題', '當事人', '上訴聲明', '上訴理由', 
            '法條依據', '證據清單', '此致法院、具狀人、日期'
        ],
        specialRequirements: [
            '必須註明原審案號', 
            '限期內提出', 
            '針對原審判決的具體錯誤'
        ],
        claimFormat: '上訴聲明',
        claimExample: '一、撤銷原判決。\n二、被上訴人應給付上訴人新臺幣○○元及利息。\n三、訴訟費用由被上訴人負擔。'
    },
    brief: {
        type: '民事準備書狀',
        tone: 'neutral',
        sections: [
            '標題', '當事人', '目的', '爭點整理、補充事實', 
            '法條依據', '證據清單', '此致法院、具狀人、日期'
        ],
        specialRequirements: [
            '通常簡短重點式', 
            '可用條列式格式', 
            '配合法官要求格式'
        ],
        claimFormat: '目的',
        claimExample: '一、補充事實及理由。\n二、整理爭點事項。'
    }
};

/**
 * 立場與訴訟階段的有效組合
 */
export const VALID_STANCE_COMBINATIONS = {
    complaint: ['plaintiff'],           // 起訴狀只能是原告
    answer: ['defendant'],              // 答辯狀只能是被告
    appeal: ['plaintiff', 'defendant'], // 上訴狀原告被告都可以
    brief: ['plaintiff', 'defendant']   // 準備書狀原告被告都可以
};

/**
 * 語氣指導映射
 */
export const STANCE_INSTRUCTIONS = {
    plaintiff: {
        base: '以原告立場撰寫，語氣主動積極，強調權利主張',
        modifiers: {
            complaint: '，完整敘述事實和請求',
            appeal: '，針對原審判決提出具體錯誤指摘',
            brief: '，簡潔重點式表達立場'
        }
    },
    defendant: {
        base: '以被告立場撰寫，強調駁斥和抗辯，反駁原告主張',
        modifiers: {
            answer: '，逐項回應並提出抗辯',
            appeal: '，針對原審判決提出具體錯誤指摘',
            brief: '，簡潔重點式表達立場'
        }
    }
};

/**
 * 獲取訴狀模板配置
 */
export function getTemplateConfig(litigationStage) {
    return PLEADING_TEMPLATES[litigationStage] || PLEADING_TEMPLATES.complaint;
}

/**
 * 創建模板結構文本
 */
export function createTemplateStructure(documentConfig) {
    return documentConfig.sections.map((section, index) =>
        `${index + 1}. ${section}`
    ).join('\n');
}

/**
 * 獲取語氣指導
 */
export function getStanceInstruction(actualStance, documentTone, litigationStage) {
    // 優先使用實際當事人立場
    if (actualStance && STANCE_INSTRUCTIONS[actualStance]) {
        const stanceConfig = STANCE_INSTRUCTIONS[actualStance];
        const baseInstruction = stanceConfig.base;
        const stageModifier = stanceConfig.modifiers[litigationStage] || '';
        
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
