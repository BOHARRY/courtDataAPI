// services/casePrecedentAnalysis/__tests__/phase2-modules.test.js

/**
 * Phase 2 模組化測試
 * 測試新創建的核心搜索邏輯模組
 */

import { describe, it, expect } from '@jest/globals';
import {
    getThresholdValue,
    getCaseTypeFilter,
    getCourtLevelFilter,
    generateSearchAngles,
    getPositionBasedSearchStrategy,
    extractRelevantTags,
    buildBasicFilters
} from '../core/searchStrategy.js';
import {
    SIMILARITY_THRESHOLDS,
    CASE_TYPE_MAP,
    COURT_LEVEL_MAP,
    SEARCH_ANGLE_WEIGHTS
} from '../utils/constants.js';

describe('Phase 2: 核心搜索邏輯模組測試', () => {
    
    describe('searchStrategy.js', () => {
        
        it('getThresholdValue 應該正確轉換門檻值', () => {
            expect(getThresholdValue('low')).toBe(SIMILARITY_THRESHOLDS.low);
            expect(getThresholdValue('medium')).toBe(SIMILARITY_THRESHOLDS.medium);
            expect(getThresholdValue('high')).toBe(SIMILARITY_THRESHOLDS.high);
            expect(getThresholdValue('very_high')).toBe(SIMILARITY_THRESHOLDS.very_high);
            expect(getThresholdValue('invalid')).toBe(SIMILARITY_THRESHOLDS.medium); // 預設值
        });

        it('getCaseTypeFilter 應該正確轉換案件類型', () => {
            expect(getCaseTypeFilter('民事')).toBe(CASE_TYPE_MAP['民事']);
            expect(getCaseTypeFilter('刑事')).toBe(CASE_TYPE_MAP['刑事']);
            expect(getCaseTypeFilter('行政')).toBe(CASE_TYPE_MAP['行政']);
            expect(getCaseTypeFilter('invalid')).toBe(CASE_TYPE_MAP['民事']); // 預設值
        });

        it('getCourtLevelFilter 應該正確轉換法院層級', () => {
            expect(getCourtLevelFilter('地方法院')).toBe(COURT_LEVEL_MAP['地方法院']);
            expect(getCourtLevelFilter('高等法院')).toBe(COURT_LEVEL_MAP['高等法院']);
            expect(getCourtLevelFilter('最高法院')).toBe(COURT_LEVEL_MAP['最高法院']);
            expect(getCourtLevelFilter('invalid')).toBe(COURT_LEVEL_MAP['地方法院']); // 預設值
        });

        it('generateSearchAngles 應該生成正確的搜索角度', () => {
            const userInput = '車禍損害賠償';
            const enrichment = {
                legalIssueQuery: '原告主張之損害賠償請求權是否成立？',
                formalTerms: '侵權行為損害賠償',
                practicalTerms: '車禍賠償',
                specificIssues: '過失責任認定'
            };

            const angles = generateSearchAngles(userInput, enrichment);

            expect(angles).toHaveProperty('法律爭點');
            expect(angles).toHaveProperty('核心概念');
            expect(angles).toHaveProperty('法律術語');
            expect(angles).toHaveProperty('實務用詞');
            expect(angles).toHaveProperty('爭點導向');

            expect(angles.法律爭點.query).toBe(enrichment.legalIssueQuery);
            expect(angles.法律爭點.weight).toBe(SEARCH_ANGLE_WEIGHTS.法律爭點);
            expect(angles.核心概念.query).toBe(userInput);
        });

        it('getPositionBasedSearchStrategy 應該根據立場返回正確策略', () => {
            const plaintiffStrategy = getPositionBasedSearchStrategy('plaintiff', '民事');
            expect(plaintiffStrategy.primaryVectorField).toBe('legal_issues_vector');
            expect(plaintiffStrategy.vectorFields).toHaveProperty('legal_issues_vector');
            expect(plaintiffStrategy.vectorFields).toHaveProperty('plaintiff_combined_vector');

            const defendantStrategy = getPositionBasedSearchStrategy('defendant', '民事');
            expect(defendantStrategy.primaryVectorField).toBe('legal_issues_vector');
            expect(defendantStrategy.vectorFields).toHaveProperty('defendant_combined_vector');

            const neutralStrategy = getPositionBasedSearchStrategy('neutral');
            expect(neutralStrategy.primaryVectorField).toBe('legal_issues_vector');
            expect(neutralStrategy.vectorFields).toHaveProperty('replicable_strategies_vector');
        });

        it('extractRelevantTags 應該正確提取標籤', () => {
            const tags1 = extractRelevantTags('名譽權誹謗案件');
            expect(tags1).toContain('名譽權');

            const tags2 = extractRelevantTags('車禍交通事故');
            expect(tags2.length).toBeGreaterThan(0);

            const tags3 = extractRelevantTags('契約違約');
            expect(tags3).toContain('契約');

            const tags4 = extractRelevantTags('無關案件');
            expect(tags4).toEqual([]);
        });

        it('buildBasicFilters 應該構建正確的過濾條件', () => {
            const filters = buildBasicFilters('地方法院', '民事', '車禍損害賠償');
            
            expect(Array.isArray(filters)).toBe(true);
            expect(filters.length).toBeGreaterThan(0);
            
            // 應該包含法院層級過濾
            const courtFilter = filters.find(f => f.bool?.should);
            expect(courtFilter).toBeDefined();
            
            // 應該包含案件類型過濾
            const caseTypeFilter = filters.find(f => f.term?.stage0_case_type);
            expect(caseTypeFilter).toBeDefined();
            expect(caseTypeFilter.term.stage0_case_type).toBe('civil');
        });
    });

    describe('constants.js', () => {
        
        it('應該導出所有必要的常量', () => {
            expect(SIMILARITY_THRESHOLDS).toBeDefined();
            expect(CASE_TYPE_MAP).toBeDefined();
            expect(COURT_LEVEL_MAP).toBeDefined();
            expect(SEARCH_ANGLE_WEIGHTS).toBeDefined();
        });

        it('相似度門檻應該在合理範圍內', () => {
            Object.values(SIMILARITY_THRESHOLDS).forEach(threshold => {
                expect(threshold).toBeGreaterThanOrEqual(0);
                expect(threshold).toBeLessThanOrEqual(1);
            });
        });

        it('搜索角度權重總和應該接近 1', () => {
            const totalWeight = Object.values(SEARCH_ANGLE_WEIGHTS).reduce((sum, w) => sum + w, 0);
            expect(totalWeight).toBeCloseTo(1.0, 2);
        });
    });
});

