// services/ai/amountInsightsGenerator.js

/**
 * AI 金額洞察生成器
 * 使用 AI 分析金額數據並生成專業洞察
 */

import OpenAI from 'openai';
import { OPENAI_API_KEY } from '../../config/environment.js';
import { formatAmount, formatApprovalRate } from '../casePrecedentAnalysis/utils/amountUtils.js';

// OpenAI 客戶端
const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

/**
 * 生成金額分析洞察
 * @param {Object} statistics - 統計數據
 * @param {Array} normalAmounts - 正常範圍內的案件數組
 * @param {string} position - 立場（plaintiff/defendant）
 * @returns {Promise<Array>} 洞察數組
 */
export async function generateAmountInsights(statistics, normalAmounts, position = 'plaintiff') {
    console.log('[generateAmountInsights] 🤖 開始生成 AI 洞察');

    if (!statistics || normalAmounts.length === 0) {
        console.warn('[generateAmountInsights] ⚠️ 無有效數據，無法生成洞察');
        return ['⚠️ 無有效金額數據，無法提供分析'];
    }

    console.log('[generateAmountInsights] 統計數據:', {
        totalCases: statistics.totalCases,
        normalCases: statistics.normalCases,
        excludedCases: statistics.excludedCases,
        outlierCases: statistics.outlierCases,
        medianApprovalRate: formatApprovalRate(statistics.approvalRate.median)
    });

    try {
        // 構建 AI 提示詞
        const prompt = buildInsightsPrompt(statistics, normalAmounts, position);

        // 調用 OpenAI API
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `你是一位專業的法律數據分析師，擅長分析民事案件的金額數據並提供實用的洞察。

重要原則：
1. 統計數據已排除請求或獲准金額為 0 的案件，並使用標準差排除異常值
2. 使用「中位數」而非「平均數」來描述典型情況
3. 避免主觀推測，只陳述客觀數據事實
4. 提供具體可行的策略建議
5. 語氣專業但易懂，避免過於技術性的統計術語`
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.3,
            max_tokens: 1000
        });

        // 解析 AI 回應
        const insightsText = response.choices[0].message.content;
        const insights = parseInsights(insightsText);

        console.log(`[generateAmountInsights] ✅ 成功生成 ${insights.length} 條洞察`);
        return insights;

    } catch (error) {
        console.error('[generateAmountInsights] ❌ AI 洞察生成失敗:', error);
        console.error('[generateAmountInsights] 錯誤詳情:', error.message);

        // 返回基礎洞察作為 fallback
        console.log('[generateAmountInsights] 🔄 使用基礎洞察作為 fallback');
        return generateBasicInsights(statistics, normalAmounts, position);
    }
}

/**
 * 構建 AI 提示詞
 * @param {Object} statistics - 統計數據
 * @param {Array} normalAmounts - 正常範圍內的案件數組
 * @param {string} position - 立場
 * @returns {string} 提示詞
 */
function buildInsightsPrompt(statistics, normalAmounts, position) {
    const positionText = position === 'plaintiff' ? '原告' : '被告';

    return `
請分析以下民事案件的金額數據，並從${positionText}的角度提供專業洞察：

## 📊 數據概況

**總樣本數**: ${statistics.totalCases} 件判決
**有效案件**: ${statistics.normalCases} 件（標準差範圍內）
**排除案件**: ${statistics.excludedCases} 件（請求或獲准金額為 0）
${statistics.outlierCases > 0 ? `**異常案件**: ${statistics.outlierCases} 件（超出標準差範圍，已排除）` : ''}

## 📈 金額統計（標準差範圍內的案件）

**請求金額**:
- 中位數: ${formatAmount(statistics.claimAmount.median)}
- IQR 範圍: ${formatAmount(statistics.claimAmount.q1)} ~ ${formatAmount(statistics.claimAmount.q3)}（中間 50% 案件）
- 最小值: ${formatAmount(statistics.claimAmount.min)}
- 最大值: ${formatAmount(statistics.claimAmount.max)}

**獲准金額**:
- 中位數: ${formatAmount(statistics.grantedAmount.median)}
- IQR 範圍: ${formatAmount(statistics.grantedAmount.q1)} ~ ${formatAmount(statistics.grantedAmount.q3)}（中間 50% 案件）
- 最小值: ${formatAmount(statistics.grantedAmount.min)}
- 最大值: ${formatAmount(statistics.grantedAmount.max)}

**獲准率**:
- 中位數: ${formatApprovalRate(statistics.approvalRate.median)}
- IQR 範圍: ${formatApprovalRate(statistics.approvalRate.q1)} ~ ${formatApprovalRate(statistics.approvalRate.q3)}
- 最小值: ${formatApprovalRate(statistics.approvalRate.min)}
- 最大值: ${formatApprovalRate(statistics.approvalRate.max)}

## 🎯 分析要求

請提供 4-6 條專業洞察，每條洞察應該：

1. **基於標準差範圍內的統計數據**（已排除異常值和無效案件）
2. **優先使用中位數**來描述典型情況（而非平均數）
3. **客觀陳述數據事實**，避免主觀推測（例如不要說「原告保守」這類動機猜測）
4. **提供具體可行的策略建議**
5. **語氣專業但易懂**，避免過於技術性的統計術語

${position === 'plaintiff' ? `
## 原告方關注重點：
- 合理的請求金額範圍（參考中位數和 IQR）
- 法院的典型獲准比例
- 如何提高獲准率的策略
` : `
## 被告方關注重點：
- 預估可能的賠償金額範圍
- 和解金額的參考依據
- 抗辯策略的成功率
- 訴訟成本與和解的權衡
`}

請以以下格式輸出（每條洞察一行，以「-」開頭）：

- 洞察 1
- 洞察 2
- 洞察 3
...
`;
}

/**
 * 解析 AI 回應中的洞察
 * @param {string} text - AI 回應文本
 * @returns {Array} 洞察數組
 */
function parseInsights(text) {
    // 提取以「-」開頭的行
    const lines = text.split('\n');
    const insights = lines
        .filter(line => line.trim().startsWith('-'))
        .map(line => line.trim().substring(1).trim())
        .filter(line => line.length > 0);

    return insights;
}

/**
 * 生成基礎洞察（fallback）
 * @param {Object} statistics - 統計數據
 * @param {Array} normalAmounts - 正常範圍內的案件數組
 * @param {string} position - 立場
 * @returns {Array} 洞察數組
 */
function generateBasicInsights(statistics, normalAmounts, position) {
    const positionText = position === 'plaintiff' ? '原告' : '被告';
    const insights = [];

    if (!statistics || normalAmounts.length === 0) {
        insights.push('⚠️ 無有效金額數據，無法提供分析');
        return insights;
    }

    // 基礎洞察 1: 樣本數量
    insights.push(
        `分析了 ${statistics.totalCases} 件相同案由的民事判決（排除 ${statistics.excludedCases} 件請求或獲准金額為 0 的案件）。`
    );

    // 基礎洞察 2: 中位數
    insights.push(
        `請求金額中位數為 ${formatAmount(statistics.claimAmount.median)}，法院實際准許金額中位數為 ${formatAmount(statistics.grantedAmount.median)}。`
    );

    // 基礎洞察 3: 中位獲准率
    const medianRate = statistics.approvalRate.median;
    insights.push(
        `中位獲准率為 ${formatApprovalRate(medianRate)}，表示法院通常會准許約 ${formatApprovalRate(medianRate)} 的請求金額。`
    );

    // 基礎洞察 4: IQR 區間
    insights.push(
        `多數案件的獲准金額落在 ${formatAmount(statistics.grantedAmount.q1)} ～ ${formatAmount(statistics.grantedAmount.q3)} 之間（IQR 範圍，代表中間 50% 的案件）。`
    );

    // 基礎洞察 5: 基於立場的建議
    if (position === 'plaintiff') {
        insights.push(
            `建議${positionText}在提出請求時，參考中位數 ${formatAmount(statistics.claimAmount.median)} 作為基準，並準備充分證據支持請求金額的合理性。`
        );
    } else {
        insights.push(
            `建議${positionText}在答辯時，可參考中位獲准率 ${formatApprovalRate(medianRate)}，評估和解或抗辯策略。預估可能的賠償金額約在 ${formatAmount(statistics.grantedAmount.q1)} ～ ${formatAmount(statistics.grantedAmount.q3)} 之間。`
        );
    }

    // 基礎洞察 6: 異常值提示
    if (statistics.outlierCases > 0) {
        insights.push(
            `發現 ${statistics.outlierCases} 件異常案件（超出標準差範圍），已排除於統計之外以確保數據準確性。`
        );
    }

    return insights;
}

/**
 * 導出函數
 */
export default {
    generateAmountInsights
};

