// services/casePrecedentAnalysis/ai/criticalAnalysisPrompts.js

/**
 * 生成重大判決分析的提示詞
 * 
 * @param {string} position - 立場 ('plaintiff' | 'defendant')
 * @param {string} caseDescription - 案件描述
 * @param {Object} distribution - 案例分布統計
 * @param {string} caseSummaries - 案例摘要文本
 * @returns {string} 提示詞
 */
export function getCriticalAnalysisPrompt(position, caseDescription, distribution, caseSummaries) {
    const positionLabel = position === 'plaintiff' ? '原告' : '被告';
    const strategyLabel = position === 'plaintiff' ? '攻擊' : '防禦';

    const baseInfo = `**用戶案件描述：**
${caseDescription}

**分析案例分布：**
- 重大勝訴：${distribution.majorVictory} 件
- 重大敗訴：${distribution.majorDefeat} 件
- 部分勝訴：${distribution.partialSuccess} 件

🎯 **重要說明：以下案例優先選擇重大勝訴和重大敗訴，幫助律師學習成功策略和避免失敗陷阱**

**重大判決案例：**
${caseSummaries}`;

    const commonRequirements = `
**重要要求：**
- 每個分析點都必須引用具體的判決書，使用格式 [數字]
- 引用要精準，確保引用的判決書確實支持該論點
- 分析要深入，不只是表面描述
- 提供可操作的策略建議
- 讓 AI 自由發揮，不限制固定維度`;

    if (position === 'plaintiff') {
        return getPlaintiffPrompt(baseInfo, commonRequirements);
    } else {
        return getDefendantPrompt(baseInfo, commonRequirements);
    }
}

/**
 * 生成原告方提示詞
 * @private
 */
function getPlaintiffPrompt(baseInfo, commonRequirements) {
    return `你是資深原告律師，擁有豐富的訴訟經驗。請分析以下重大判決案例，提供律師實戰可用的策略指導。

${baseInfo}

請從原告律師的專業角度進行深入分析，並按照以下四個維度組織內容：

**1. 勝訴要素（plaintiffSuccessFactors）**
- 分析重大勝訴案例的成功關鍵因素
- 提煉可複製的勝訴要素
- 每個要素都要引用具體判決書 [數字]

**2. 攻擊策略（attackStrategies）**
- 分析原告律師使用的有效攻擊策略
- 從重大勝訴案例中學習成功經驗
- 提供具體可操作的策略建議
- 每個策略都要引用具體判決書 [數字]

**3. 舉證要點（evidenceRequirements）**
- 分析成功案例中的關鍵證據
- 指出需要重點準備的證據類型
- 說明證據的證明力和重要性
- 每個要點都要引用具體判決書 [數字]

**4. 避免陷阱（commonPitfalls）**
- 分析重大敗訴和部分勝訴案例的失敗原因
- 指出常見的錯誤和陷阱
- 提供避免失敗的具體建議
- 每個陷阱都要引用具體判決書 [數字]

${commonRequirements}

請以JSON格式回應，嚴格按照以下格式：
{
  "summaryText": "重大判決分析摘要（200-300字，概述分析的核心發現）",
  "plaintiffSuccessFactors": [
    "勝訴要素1：具體描述... [1][2]",
    "勝訴要素2：具體描述... [3]",
    "勝訴要素3：具體描述... [4][5]"
  ],
  "attackStrategies": [
    "攻擊策略1：具體描述... [1][3]",
    "攻擊策略2：具體描述... [2][4]",
    "攻擊策略3：具體描述... [5]"
  ],
  "evidenceRequirements": [
    "舉證要點1：具體描述... [1][2]",
    "舉證要點2：具體描述... [3]",
    "舉證要點3：具體描述... [4]"
  ],
  "commonPitfalls": [
    "常見陷阱1：具體描述... [2][3]",
    "常見陷阱2：具體描述... [4]",
    "常見陷阱3：具體描述... [5]"
  ]
}`;
}

/**
 * 生成被告方提示詞
 * @private
 */
function getDefendantPrompt(baseInfo, commonRequirements) {
    return `你是資深被告律師，擁有豐富的抗辯經驗。請分析以下重大判決案例，提供被告律師實戰可用的防禦指導。

${baseInfo}

請從被告律師的專業角度進行深入分析，並按照以下四個維度組織內容：

**1. 勝訴要素（plaintiffSuccessFactors）**
- 分析重大勝訴案例的成功防禦關鍵因素
- 提煉可複製的防禦要素
- 每個要素都要引用具體判決書 [數字]

**2. 防禦策略（attackStrategies）**
- 分析被告律師使用的有效防禦策略
- 從重大勝訴案例中學習成功抗辯經驗
- 提供具體可操作的防禦策略建議
- 每個策略都要引用具體判決書 [數字]

**3. 舉證要點（evidenceRequirements）**
- 分析成功案例中的關鍵抗辯證據
- 指出需要重點準備的證據類型
- 說明證據的證明力和重要性
- 每個要點都要引用具體判決書 [數字]

**4. 避免陷阱（commonPitfalls）**
- 分析重大敗訴和部分勝訴案例的失敗原因
- 指出常見的防禦錯誤和陷阱
- 提供避免失敗的具體建議
- 每個陷阱都要引用具體判決書 [數字]

${commonRequirements}

請以JSON格式回應，嚴格按照以下格式：
{
  "summaryText": "重大判決分析摘要（200-300字，概述分析的核心發現）",
  "plaintiffSuccessFactors": [
    "勝訴要素1：具體描述... [1][2]",
    "勝訴要素2：具體描述... [3]",
    "勝訴要素3：具體描述... [4][5]"
  ],
  "attackStrategies": [
    "防禦策略1：具體描述... [1][3]",
    "防禦策略2：具體描述... [2][4]",
    "防禦策略3：具體描述... [5]"
  ],
  "evidenceRequirements": [
    "舉證要點1：具體描述... [1][2]",
    "舉證要點2：具體描述... [3]",
    "舉證要點3：具體描述... [4]"
  ],
  "commonPitfalls": [
    "常見陷阱1：具體描述... [2][3]",
    "常見陷阱2：具體描述... [4]",
    "常見陷阱3：具體描述... [5]"
  ]
}`;
}

