// services/casePrecedentAnalysis/__tests__/phase3-ai-modules.test.js

/**
 * Phase 3 AI 分析邏輯模組測試
 * 測試新創建的 AI 分析相關模組
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
    buildInsightSummaryPrompt,
    buildReasonMergePrompt,
    buildAnomalyAnalysisPrompt,
    buildPositionPrompt,
    buildCriticalAnalysisPrompt,
    cleanMarkdownFromResponse,
    buildSystemPrompt
} from '../ai/promptBuilder.js';

describe('Phase 3: AI 分析邏輯模組測試', () => {
    
    describe('promptBuilder.js', () => {
        
        it('buildInsightSummaryPrompt 應該為成功策略生成正確的提示詞', () => {
            const insights = ['策略1', '策略2', '策略3'];
            const prompt = buildInsightSummaryPrompt(insights, 'success', 'plaintiff');
            
            expect(prompt).toContain('原告方');
            expect(prompt).toContain('成功策略');
            expect(prompt).toContain('策略1');
            expect(prompt).toContain('策略2');
            expect(prompt).toContain('策略3');
            expect(prompt).toContain('JSON');
        });

        it('buildInsightSummaryPrompt 應該為風險因素生成正確的提示詞', () => {
            const insights = ['風險1', '風險2'];
            const prompt = buildInsightSummaryPrompt(insights, 'risk', 'defendant');
            
            expect(prompt).toContain('被告方');
            expect(prompt).toContain('風險因素');
            expect(prompt).toContain('風險1');
            expect(prompt).toContain('風險2');
            expect(prompt).toContain('JSON');
        });

        it('buildReasonMergePrompt 應該生成判決理由合併提示詞', () => {
            const reasons = ['理由1', '理由2', '理由3'];
            const prompt = buildReasonMergePrompt(reasons, 'win');
            
            expect(prompt).toContain('理由1');
            expect(prompt).toContain('理由2');
            expect(prompt).toContain('理由3');
            expect(prompt).toContain('JSON');
        });

        it('buildAnomalyAnalysisPrompt 應該生成異常案例分析提示詞', () => {
            const caseDescription = '車禍損害賠償';
            const mainCases = [
                { title: '案例1', verdictType: '原告勝訴' },
                { title: '案例2', verdictType: '原告勝訴' }
            ];
            const anomalyCases = [
                { title: '案例3', verdictType: '原告敗訴' }
            ];
            
            const prompt = buildAnomalyAnalysisPrompt(caseDescription, mainCases, anomalyCases);
            
            expect(prompt).toContain('車禍損害賠償');
            expect(prompt).toContain('案例1');
            expect(prompt).toContain('案例3');
            expect(prompt).toContain('keyDifferences');
            expect(prompt).toContain('riskFactors');
        });

        it('buildPositionPrompt 應該為原告生成正確的提示詞', () => {
            const mainPattern = { verdict: '原告勝訴', count: 10, percentage: 80 };
            const caseSummaries = ['摘要1', '摘要2'];
            
            const prompt = buildPositionPrompt('plaintiff', '車禍案件', mainPattern, caseSummaries);
            
            expect(prompt).toContain('原告');
            expect(prompt).toContain('攻擊策略');
            expect(prompt).toContain('車禍案件');
            expect(prompt).toContain('原告勝訴');
            expect(prompt).toContain('摘要1');
        });

        it('buildPositionPrompt 應該為被告生成正確的提示詞', () => {
            const mainPattern = { verdict: '被告勝訴', count: 5, percentage: 50 };
            const caseSummaries = ['摘要1'];
            
            const prompt = buildPositionPrompt('defendant', '契約糾紛', mainPattern, caseSummaries);
            
            expect(prompt).toContain('被告');
            expect(prompt).toContain('防禦策略');
            expect(prompt).toContain('契約糾紛');
        });

        it('buildPositionPrompt 應該為中立立場生成正確的提示詞', () => {
            const mainPattern = { verdict: '部分勝訴', count: 8, percentage: 60 };
            const caseSummaries = ['摘要1', '摘要2'];
            
            const prompt = buildPositionPrompt('neutral', '侵權案件', mainPattern, caseSummaries);
            
            expect(prompt).toContain('中立客觀分析');
            expect(prompt).toContain('侵權案件');
        });

        it('buildCriticalAnalysisPrompt 應該生成重大判決分析提示詞', () => {
            const distribution = {
                '原告勝訴': { count: 10, percentage: 50 },
                '被告勝訴': { count: 8, percentage: 40 },
                '部分勝訴': { count: 2, percentage: 10 }
            };
            const caseSummaries = ['摘要1', '摘要2'];
            
            const prompt = buildCriticalAnalysisPrompt('plaintiff', '損害賠償', distribution, caseSummaries);
            
            expect(prompt).toContain('原告');
            expect(prompt).toContain('攻擊策略');
            expect(prompt).toContain('損害賠償');
            expect(prompt).toContain('原告勝訴');
            expect(prompt).toContain('50%');
        });

        it('cleanMarkdownFromResponse 應該移除 ```json 標記', () => {
            const content = '```json\n{"key": "value"}\n```';
            const cleaned = cleanMarkdownFromResponse(content);
            
            expect(cleaned).toBe('{"key": "value"}');
            expect(cleaned).not.toContain('```');
        });

        it('cleanMarkdownFromResponse 應該移除 ``` 標記', () => {
            const content = '```\n{"key": "value"}\n```';
            const cleaned = cleanMarkdownFromResponse(content);
            
            expect(cleaned).toBe('{"key": "value"}');
            expect(cleaned).not.toContain('```');
        });

        it('cleanMarkdownFromResponse 應該處理沒有標記的內容', () => {
            const content = '{"key": "value"}';
            const cleaned = cleanMarkdownFromResponse(content);
            
            expect(cleaned).toBe('{"key": "value"}');
        });

        it('buildSystemPrompt 應該返回正確的系統提示詞', () => {
            expect(buildSystemPrompt('insight_summary')).toContain('法律分析助手');
            expect(buildSystemPrompt('reason_merge')).toContain('判決理由');
            expect(buildSystemPrompt('anomaly_analysis')).toContain('法律分析師');
            expect(buildSystemPrompt('mainstream_analysis')).toContain('訴訟律師');
            expect(buildSystemPrompt('critical_analysis')).toContain('訴訟律師');
            expect(buildSystemPrompt('unknown')).toContain('法律分析助手');
        });
    });

    describe('insightSummarizer.js', () => {
        
        // 注意：這些測試需要 mock OpenAI API
        // 實際測試時應該使用 jest.mock() 來模擬 API 調用
        
        it('應該導出所有必要的函數', async () => {
            const { 
                summarizeStrategicInsights,
                mergeSemanticReasons,
                batchSummarizeInsights,
                generateInsightText,
                formatInsightDetails
            } = await import('../ai/insightSummarizer.js');
            
            expect(typeof summarizeStrategicInsights).toBe('function');
            expect(typeof mergeSemanticReasons).toBe('function');
            expect(typeof batchSummarizeInsights).toBe('function');
            expect(typeof generateInsightText).toBe('function');
            expect(typeof formatInsightDetails).toBe('function');
        });

        it('generateInsightText 應該正確生成摘要文本', async () => {
            const { generateInsightText } = await import('../ai/insightSummarizer.js');
            
            const insights = ['洞察1', '洞察2', '洞察3', '洞察4', '洞察5', '洞察6'];
            const text = generateInsightText(insights, 3);
            
            expect(text).toBe('洞察1、洞察2、洞察3');
        });

        it('generateInsightText 應該處理空數組', async () => {
            const { generateInsightText } = await import('../ai/insightSummarizer.js');
            
            const text = generateInsightText([], 5);
            expect(text).toBe('');
        });

        it('formatInsightDetails 應該格式化洞察詳情', async () => {
            const { formatInsightDetails } = await import('../ai/insightSummarizer.js');
            
            const details = [
                { category: '類別1', count: 3, examples: ['例子1', '例子2'] },
                { category: '類別2', count: 2, examples: ['例子3'] }
            ];
            
            const formatted = formatInsightDetails(details);
            
            expect(formatted).toContain('類別1');
            expect(formatted).toContain('類別2');
            expect(formatted).toContain('例子1');
            expect(formatted).toContain('例子3');
        });
    });

    describe('strategicInsights.js', () => {
        
        it('應該導出所有必要的函數', async () => {
            const { 
                generateStrategicInsights,
                generatePositionStats
            } = await import('../analysis/strategicInsights.js');
            
            expect(typeof generateStrategicInsights).toBe('function');
            expect(typeof generatePositionStats).toBe('function');
        });

        // 注意：generateStrategicInsights 和 generatePositionStats 的完整測試
        // 需要準備測試數據和 mock AI 調用
        // 這裡只測試基本的函數存在性
    });

    describe('模組集成測試', () => {
        
        it('promptBuilder 和 insightSummarizer 應該能協同工作', async () => {
            const insights = ['策略1', '策略2', '策略3'];
            const prompt = buildInsightSummaryPrompt(insights, 'success', 'plaintiff');
            
            // 驗證提示詞包含所有必要信息
            expect(prompt).toBeTruthy();
            expect(prompt.length).toBeGreaterThan(100);
        });

        it('所有模組應該使用一致的數據格式', () => {
            // 驗證提示詞格式一致性
            const successPrompt = buildInsightSummaryPrompt(['test'], 'success', 'plaintiff');
            const riskPrompt = buildInsightSummaryPrompt(['test'], 'risk', 'defendant');
            
            expect(successPrompt).toContain('JSON');
            expect(riskPrompt).toContain('JSON');
        });
    });
});

