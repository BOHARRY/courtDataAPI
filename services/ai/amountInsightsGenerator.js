// services/ai/amountInsightsGenerator.js

/**
 * AI 金額洞察生成器
 * 使用 AI 分析金額數據並生成專業洞察
 */

import { formatAmount, formatApprovalRate } from '../casePrecedentAnalysis/utils/amountUtils.js';
import { callOpenAI } from '../../utils/openaiClient.js';

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
        const response = await callOpenAI([
            {
                role: 'system',
                content: '你是一位專業的法律數據分析師，擅長分析民事案件的金額數據並提供實用的洞察。'
            },
            {
                role: 'user',
                content: prompt
            }
        ], {
            model: 'gpt-4o-mini',
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
        throw error;
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
 * 導出函數
 */
export default {
    generateAmountInsights
};

