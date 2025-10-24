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
 * @param {Array} amounts - 金額數據數組
 * @param {string} position - 立場（plaintiff/defendant）
 * @returns {Promise<Array>} 洞察數組
 */
export async function generateAmountInsights(statistics, amounts, position = 'plaintiff') {
    console.log('[generateAmountInsights] 🤖 開始生成 AI 洞察');
    console.log('[generateAmountInsights] 統計數據:', {
        totalCases: statistics.totalCases,
        medianApprovalRate: formatApprovalRate(statistics.approvalRate.median)
    });

    try {
        // 構建 AI 提示詞
        const prompt = buildInsightsPrompt(statistics, amounts, position);

        // 調用 OpenAI API
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: '你是一位專業的法律數據分析師，擅長分析民事案件的金額數據並提供實用的洞察。'
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
        return generateBasicInsights(statistics, amounts, position);
    }
}

/**
 * 構建 AI 提示詞
 * @param {Object} statistics - 統計數據
 * @param {Array} amounts - 金額數據數組
 * @param {string} position - 立場
 * @returns {string} 提示詞
 */
function buildInsightsPrompt(statistics, amounts, position) {
    const positionText = position === 'plaintiff' ? '原告' : '被告';
    
    return `
請分析以下民事案件的金額數據，並從${positionText}的角度提供專業洞察：

## 統計數據

**樣本數量**: ${statistics.totalCases} 件判決

**請求金額**:
- 中位數: ${formatAmount(statistics.claimAmount.median)}
- 平均數: ${formatAmount(statistics.claimAmount.mean)}
- 範圍: ${formatAmount(statistics.claimAmount.min)} ~ ${formatAmount(statistics.claimAmount.max)}
- IQR: ${formatAmount(statistics.claimAmount.q1)} ~ ${formatAmount(statistics.claimAmount.q3)}

**獲准金額**:
- 中位數: ${formatAmount(statistics.grantedAmount.median)}
- 平均數: ${formatAmount(statistics.grantedAmount.mean)}
- 範圍: ${formatAmount(statistics.grantedAmount.min)} ~ ${formatAmount(statistics.grantedAmount.max)}
- IQR: ${formatAmount(statistics.grantedAmount.q1)} ~ ${formatAmount(statistics.grantedAmount.q3)}

**獲准率**:
- 中位數: ${formatApprovalRate(statistics.approvalRate.median)}
- 平均數: ${formatApprovalRate(statistics.approvalRate.mean)}
- 範圍: ${formatApprovalRate(statistics.approvalRate.min)} ~ ${formatApprovalRate(statistics.approvalRate.max)}
- IQR: ${formatApprovalRate(statistics.approvalRate.q1)} ~ ${formatApprovalRate(statistics.approvalRate.q3)}

## 要求

請提供 4-6 條專業洞察，每條洞察應該：
1. 基於數據事實
2. 對律師有實際參考價值
3. 語氣專業但易懂
4. 避免使用過於技術性的統計術語

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
 * @param {Array} amounts - 金額數據數組
 * @param {string} position - 立場
 * @returns {Array} 洞察數組
 */
function generateBasicInsights(statistics, amounts, position) {
    const positionText = position === 'plaintiff' ? '原告' : '被告';
    const insights = [];

    // 基礎洞察 1: 樣本數和中位數
    insights.push(
        `根據 ${statistics.totalCases} 件相同案由的判決，中位請求金額約為${formatAmount(statistics.claimAmount.median)}，法院平均准許約${formatAmount(statistics.grantedAmount.median)}。`
    );

    // 基礎洞察 2: IQR 區間
    insights.push(
        `金額多集中於${formatAmount(statistics.grantedAmount.q1)}至${formatAmount(statistics.grantedAmount.q3)}區間（IQR），佔總案件的 50%。`
    );

    // 基礎洞察 3: 平均獲准率
    insights.push(
        `平均獲准率為${formatApprovalRate(statistics.approvalRate.mean)}，表示法院通常會准許約${Math.round(statistics.approvalRate.mean * 100)}%的請求金額。`
    );

    // 基礎洞察 4: 基於立場的建議
    if (position === 'plaintiff') {
        insights.push(
            `建議${positionText}在提出請求時，參考中位數${formatAmount(statistics.claimAmount.median)}作為基準，並準備充分證據支持請求金額的合理性。`
        );
    } else {
        insights.push(
            `建議${positionText}在答辯時，可參考平均獲准率${formatApprovalRate(statistics.approvalRate.mean)}，評估和解或抗辯策略。`
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

