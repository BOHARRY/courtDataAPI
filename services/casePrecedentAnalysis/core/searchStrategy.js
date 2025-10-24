// services/casePrecedentAnalysis/core/searchStrategy.js

import {
    SIMILARITY_THRESHOLDS,
    DEFAULT_THRESHOLD,
    CASE_TYPE_MAP,
    COURT_LEVEL_MAP,
    PERSPECTIVE_MAP,
    VECTOR_FIELD_WEIGHTS,
    SEARCH_ANGLE_WEIGHTS,
    TAG_KEYWORDS
} from '../utils/constants.js';

/**
 * 將相似度門檻轉換為數值
 * ES cosine similarity 分數範圍是 0-1，公式：(1 + cosine_similarity) / 2
 * 用戶設定的百分比需要轉換為對應的分數閾值
 * 
 * @param {string} threshold - 門檻級別 ('low' | 'medium' | 'high' | 'very_high')
 * @returns {number} 門檻數值
 */
export function getThresholdValue(threshold) {
    return SIMILARITY_THRESHOLDS[threshold] || SIMILARITY_THRESHOLDS[DEFAULT_THRESHOLD];
}

/**
 * 將案件類型轉換為 ES 查詢條件
 * 
 * @param {string} caseType - 案件類型 (中文)
 * @returns {string} ES 查詢值 (英文)
 */
export function getCaseTypeFilter(caseType) {
    return CASE_TYPE_MAP[caseType] || CASE_TYPE_MAP['民事'];
}

/**
 * 將法院層級轉換為 ES 查詢條件
 * 
 * @param {string} courtLevel - 法院層級 (中文)
 * @returns {string} ES 查詢值 (英文)
 */
export function getCourtLevelFilter(courtLevel) {
    return COURT_LEVEL_MAP[courtLevel] || COURT_LEVEL_MAP['地方法院'];
}

/**
 * 生成四角度搜尋策略
 * 
 * @param {string} userInput - 用戶輸入
 * @param {Object} enrichment - AI 補足的案件描述
 * @returns {Object} 搜索角度配置
 */
export function generateSearchAngles(userInput, enrichment) {
    return {
        法律爭點: {
            query: enrichment.legalIssueQuery || userInput,
            weight: SEARCH_ANGLE_WEIGHTS.法律爭點,
            purpose: "法律爭點匹配（用於 legal_issues_vector）",
            displayName: "法律爭點"
        },
        核心概念: {
            query: userInput,
            weight: SEARCH_ANGLE_WEIGHTS.核心概念,
            purpose: "保持用戶原始表達",
            displayName: "核心概念"
        },
        法律術語: {
            query: enrichment.formalTerms || userInput,
            weight: SEARCH_ANGLE_WEIGHTS.法律術語,
            purpose: "正式法律用詞",
            displayName: "法律術語"
        },
        實務用詞: {
            query: enrichment.practicalTerms || userInput,
            weight: SEARCH_ANGLE_WEIGHTS.實務用詞,
            purpose: "實務常用表達",
            displayName: "實務用詞"
        },
        爭點導向: {
            query: enrichment.specificIssues || userInput,
            weight: SEARCH_ANGLE_WEIGHTS.爭點導向,
            purpose: "具體爭點角度",
            displayName: "爭點導向"
        }
    };
}

/**
 * 根據立場和案件類型選擇向量欄位和權重策略
 *
 * @param {string} position - 立場 (plaintiff/defendant/neutral)
 * @param {string} caseType - 案件類型 (民事/刑事/行政)
 * @returns {Object} 搜索策略配置
 */
export function getPositionBasedSearchStrategy(position, caseType = '民事') {
    // 🎯 根據立場選擇最合適的向量欄位
    let primaryVectorField;
    let vectorFieldReason;

    if (position === 'plaintiff') {
        primaryVectorField = 'plaintiff_combined_vector';
        vectorFieldReason = '原告立場：使用原告策略向量（包含成功要素、失敗教訓、風險警告）';
    } else if (position === 'defendant') {
        primaryVectorField = 'defendant_combined_vector';
        vectorFieldReason = '被告立場：使用被告策略向量（包含成功策略、勝訴公式、失敗策略）';
    } else {
        primaryVectorField = 'legal_issues_vector';
        vectorFieldReason = '中立立場：使用法律爭點向量（包含爭點問題與法院判斷）';
    }

    // 🔍 清晰的日誌輸出
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[VECTOR-TEST] 🎯 向量欄位選擇`);
    console.log(`[VECTOR-TEST] 立場: ${position}`);
    console.log(`[VECTOR-TEST] 案件類型: ${caseType}`);
    console.log(`[VECTOR-TEST] 選擇向量欄位: ${primaryVectorField}`);
    console.log(`[VECTOR-TEST] 選擇理由: ${vectorFieldReason}`);
    console.log(`${'='.repeat(80)}\n`);

    // 根據案件類型映射正確的視角欄位
    const perspectives = PERSPECTIVE_MAP[caseType] || PERSPECTIVE_MAP['民事'];

    // 獲取對應立場的向量欄位權重
    const vectorFields = VECTOR_FIELD_WEIGHTS[position] || VECTOR_FIELD_WEIGHTS.neutral;

    return {
        primaryVectorField: primaryVectorField,
        vectorFields: vectorFields,
        filterQuery: null  // 不再使用立場過濾，讓搜尋結果更客觀
    };
}

/**
 * 從案件描述中提取相關標籤
 * 
 * @param {string} caseDescription - 案件描述
 * @returns {string[]} 相關標籤數組
 */
export function extractRelevantTags(caseDescription) {
    const tags = [];
    const desc = caseDescription.toLowerCase();

    // 遍歷所有標籤關鍵字
    for (const [tag, keywords] of Object.entries(TAG_KEYWORDS)) {
        for (const keyword of keywords) {
            if (desc.includes(keyword)) {
                tags.push(tag);
                break;  // 找到一個關鍵字就足夠了
            }
        }
    }

    // 去重
    return [...new Set(tags)];
}

/**
 * 構建基本過濾條件
 * 
 * @param {string} courtLevel - 法院層級
 * @param {string} caseType - 案件類型
 * @param {string} caseDescription - 案件描述
 * @returns {Array} ES 過濾條件數組
 */
export function buildBasicFilters(courtLevel, caseType, caseDescription) {
    const filters = [];

    // 1. 法院層級過濾
    if (courtLevel && courtLevel !== '全部') {
        if (courtLevel === '地方法院') {
            // ⚠️ 改進：地方法院需要排除高等法院和最高法院
            filters.push({
                bool: {
                    must: [
                        // 必須包含地方法院相關關鍵字
                        {
                            bool: {
                                should: [
                                    { wildcard: { 'court.exact': '*地方法院*' } },
                                    { wildcard: { 'court.exact': '*簡易庭*' } },
                                    { wildcard: { 'court.exact': '*地院*' } }
                                ],
                                minimum_should_match: 1
                            }
                        }
                    ],
                    must_not: [
                        // 排除高等法院
                        { wildcard: { 'court.exact': '*高等*' } },
                        // 排除最高法院
                        { wildcard: { 'court.exact': '*最高*' } }
                    ]
                }
            });
            console.log(`[buildBasicFilters] 🏛️ 地方法院過濾：包含地方法院關鍵字，排除高等/最高法院`);
        } else if (courtLevel === '高等法院') {
            filters.push({ wildcard: { 'court.exact': '*高等*' } });
            console.log(`[buildBasicFilters] 🏛️ 高等法院過濾：包含「高等」關鍵字`);
        } else if (courtLevel === '最高法院') {
            filters.push({ wildcard: { 'court.exact': '*最高*' } });
            console.log(`[buildBasicFilters] 🏛️ 最高法院過濾：包含「最高」關鍵字`);
        }
    }

    // 2. 案件類型過濾
    if (caseType && caseType !== '全部') {
        const caseTypeValue = getCaseTypeFilter(caseType);
        filters.push({
            term: { 'stage0_case_type': caseTypeValue }
        });
    }

    // 3. 標籤過濾
    const relevantTags = extractRelevantTags(caseDescription);
    if (relevantTags.length > 0) {
        console.log(`[buildBasicFilters] 🏷️ 提取到相關標籤:`, relevantTags);
        filters.push({
            bool: {
                should: relevantTags.map(tag => ({
                    term: { 'tags': tag }
                })),
                minimum_should_match: 1
            }
        });
    }

    return filters;
}

