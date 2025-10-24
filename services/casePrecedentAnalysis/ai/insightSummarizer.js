// services/casePrecedentAnalysis/ai/insightSummarizer.js

/**
 * 洞察摘要生成模組
 * 負責使用 AI 歸納和摘要策略洞察
 */

import { OpenAI } from 'openai';
import { OPENAI_API_KEY } from '../../../config/environment.js';
import {
    buildInsightSummaryPrompt,
    buildReasonMergePrompt,
    buildSystemPrompt,
    cleanMarkdownFromResponse
} from './promptBuilder.js';

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

/**
 * 清理引用標記
 * @param {String} text - 文本
 * @returns {String} 清理後的文本
 */
function cleanCitationMarkers(text) {
    if (!text) return '';
    return text.replace(/\[\d+\]/g, '').trim();
}

/**
 * 使用 AI 歸納策略洞察
 * 將 5-10 個原始洞察通過 AI 語義合併，生成 3-5 個精煉的核心要點
 * 
 * @param {Array} rawInsights - 原始洞察列表 (5-10 個)
 * @param {String} type - 類型 ('success' | 'risk')
 * @param {String} position - 立場 ('plaintiff' | 'defendant')
 * @returns {Object} 歸納後的洞察 { summary: [], details: [], totalCases: number }
 */
export async function summarizeStrategicInsights(rawInsights, type, position) {
    console.log(`[summarizeStrategicInsights] 開始歸納 ${type} 洞察，立場: ${position}，原始數量: ${rawInsights.length}`);

    if (rawInsights.length === 0) {
        return {
            summary: [],
            details: [],
            totalCases: 0
        };
    }

    try {
        // 1. 清理引用標記
        const cleanedInsights = rawInsights.map(insight => cleanCitationMarkers(insight));
        console.log(`[summarizeStrategicInsights] 清理引用標記完成`);

        // 2. 去重
        const uniqueInsights = [...new Set(cleanedInsights)].filter(s => s && s.trim());
        console.log(`[summarizeStrategicInsights] 去重後數量: ${uniqueInsights.length}`);

        // 3. 取前 10 個 (增加樣本數量)
        const topInsights = uniqueInsights.slice(0, 10);
        console.log(`[summarizeStrategicInsights] 取前 10 個進行 AI 分析`);

        // 4. 如果數量太少，直接返回
        if (topInsights.length <= 3) {
            console.log(`[summarizeStrategicInsights] 數量太少 (${topInsights.length})，直接返回`);
            return {
                summary: topInsights,
                details: topInsights.map(insight => ({
                    category: insight,
                    count: 1,
                    examples: [insight]
                })),
                totalCases: rawInsights.length
            };
        }

        // 5. 構建 AI 提示詞
        const prompt = buildInsightSummaryPrompt(topInsights, type, position);

        // 6. 調用 AI
        console.log(`[summarizeStrategicInsights] 調用 GPT-4o-mini 進行語義合併`);
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: buildSystemPrompt('insight_summary')
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.1,
            max_tokens: 1500
        });

        // 7. 處理 AI 響應
        let responseContent = response.choices[0].message.content;
        console.log(`[summarizeStrategicInsights] AI 原始響應長度: ${responseContent.length}`);

        responseContent = cleanMarkdownFromResponse(responseContent);

        const mergedCategories = JSON.parse(responseContent);
        console.log(`[summarizeStrategicInsights] AI 合併完成，生成 ${Object.keys(mergedCategories).length} 個類別`);

        // 8. 統計每個類別的重要性
        const categoryStats = Object.entries(mergedCategories).map(([category, examples]) => ({
            category: category,
            count: examples.length,
            examples: examples.slice(0, 2) // 保留 2 個代表性例子
        }));

        // 9. 按重要性排序 (出現次數降序)
        categoryStats.sort((a, b) => b.count - a.count);

        // 10. 取前 5 個核心要點
        const topCategories = categoryStats.slice(0, 5);

        // 11. 生成精煉的洞察文本
        const summary = topCategories.map(cat => {
            if (cat.count > 1) {
                return `${cat.category} (${cat.count}件)`;
            } else {
                return cat.category;
            }
        });

        console.log(`[summarizeStrategicInsights] 歸納完成，生成 ${summary.length} 個核心要點`);

        return {
            summary: summary,
            details: categoryStats,
            totalCases: rawInsights.length
        };

    } catch (error) {
        console.error(`[summarizeStrategicInsights] AI 歸納失敗:`, error);

        // Fallback: 返回前 5 個原始洞察
        const cleanedInsights = rawInsights.map(insight => cleanCitationMarkers(insight));
        const uniqueInsights = [...new Set(cleanedInsights)].filter(s => s && s.trim());
        const fallbackSummary = uniqueInsights.slice(0, 5);

        return {
            summary: fallbackSummary,
            details: fallbackSummary.map(insight => ({
                category: insight,
                count: 1,
                examples: [insight]
            })),
            totalCases: rawInsights.length
        };
    }
}

/**
 * 使用 AI 合併語義相似的判決理由
 * @param {Array} reasons - 判決理由列表
 * @param {String} type - 類型 ('win' | 'lose')
 * @returns {Object} 合併後的理由分類
 */
export async function mergeSemanticReasons(reasons, type) {
    if (!reasons || reasons.length === 0) {
        return {};
    }

    try {
        console.log(`[mergeSemanticReasons] 開始合併 ${reasons.length} 個${type === 'win' ? '勝訴' : '敗訴'}理由`);

        const prompt = buildReasonMergePrompt(reasons, type);

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: buildSystemPrompt('reason_merge')
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.1,
            max_tokens: 1000
        });

        let responseContent = response.choices[0].message.content;
        responseContent = cleanMarkdownFromResponse(responseContent);

        const mergedReasons = JSON.parse(responseContent);
        console.log(`[mergeSemanticReasons] 合併完成，生成 ${Object.keys(mergedReasons).length} 個類別`);

        return mergedReasons;

    } catch (error) {
        console.error(`[mergeSemanticReasons] 合併失敗:`, error);
        
        // Fallback: 返回原始理由
        const fallback = {};
        reasons.forEach((reason, index) => {
            fallback[`理由${index + 1}`] = [reason];
        });
        return fallback;
    }
}

/**
 * 批量處理洞察摘要
 * @param {Object} insightsData - 包含多個類型洞察的數據
 * @param {String} position - 立場
 * @returns {Object} 處理後的洞察數據
 */
export async function batchSummarizeInsights(insightsData, position) {
    const results = {};

    // 處理成功策略
    if (insightsData.successStrategies && insightsData.successStrategies.length > 0) {
        results.successStrategies = await summarizeStrategicInsights(
            insightsData.successStrategies,
            'success',
            position
        );
    }

    // 處理風險因素
    if (insightsData.riskFactors && insightsData.riskFactors.length > 0) {
        results.riskFactors = await summarizeStrategicInsights(
            insightsData.riskFactors,
            'risk',
            position
        );
    }

    return results;
}

/**
 * 生成洞察文本摘要
 * @param {Array} insights - 洞察列表
 * @param {Number} maxLength - 最大長度
 * @returns {String} 摘要文本
 */
export function generateInsightText(insights, maxLength = 5) {
    if (!insights || insights.length === 0) {
        return '';
    }

    const limited = insights.slice(0, maxLength);
    return limited.join('、');
}

/**
 * 格式化洞察詳情
 * @param {Array} details - 洞察詳情
 * @returns {String} 格式化後的文本
 */
export function formatInsightDetails(details) {
    if (!details || details.length === 0) {
        return '';
    }

    return details.map((detail, index) => {
        const examples = detail.examples.join('；');
        return `${index + 1}. ${detail.category} (${detail.count}件)\n   例如：${examples}`;
    }).join('\n\n');
}

