// services/casePrecedentAnalysis/analysis/criticalPatternAnalyzer.js

import { OpenAI } from 'openai';
import { OPENAI_API_KEY, OPENAI_MODEL_NAME_CHAT } from '../../../config/environment.js';
import { getCriticalAnalysisPrompt } from '../ai/criticalAnalysisPrompts.js';
import { prepareEnrichedCaseSummaries, formatAnalysisResult } from './criticalCaseAnalyzer.js';

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

const ANALYSIS_MODEL = OPENAI_MODEL_NAME_CHAT || 'gpt-4.1';

/**
 * 使用 AI 分析重大判決模式
 * 優先分析重大勝訴和重大敗訴案例
 * 
 * @param {string} caseDescription - 案件描述
 * @param {Array} criticalCases - 重大判決案例列表
 * @param {Object} distribution - 案例分布統計
 * @param {string} position - 立場 ('plaintiff' | 'defendant')
 * @returns {Promise<Object>} 分析結果
 */
export async function analyzeCriticalPattern(caseDescription, criticalCases, distribution, position = 'defendant') {
    try {
        console.log(`[analyzeCriticalPattern] 🎯 開始分析重大判決模式，立場: ${position}`);
        console.log(`[analyzeCriticalPattern] 📊 案例分布: 重大勝訴 ${distribution.majorVictory} 件, 重大敗訴 ${distribution.majorDefeat} 件, 部分勝訴 ${distribution.partialSuccess} 件`);

        // 1. 準備包含立場分析的案例摘要文本
        const caseSummaries = prepareEnrichedCaseSummaries(criticalCases, position);

        // 2. 生成提示詞
        const prompt = getCriticalAnalysisPrompt(position, caseDescription, distribution, caseSummaries);

        // 3. 調用 OpenAI API
        const response = await openai.chat.completions.create({
            model: ANALYSIS_MODEL,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            response_format: { type: "json_object" }
        });

        const analysisResult = JSON.parse(response.choices[0].message.content);

        // 4. 格式化分析結果
        const formattedResult = formatAnalysisResult(analysisResult, criticalCases, position, distribution);

        console.log(`[analyzeCriticalPattern] ✅ 重大判決分析完成，立場: ${position}`);
        return formattedResult;

    } catch (error) {
        console.error('[analyzeCriticalPattern] AI分析失敗:', error);
        throw error;
    }
}

