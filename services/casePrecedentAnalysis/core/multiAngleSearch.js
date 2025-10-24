// services/casePrecedentAnalysis/core/multiAngleSearch.js

import esClient from '../../../config/elasticsearch.js';
import { generateEmbedding } from './embeddingService.js';
import {
    getThresholdValue,
    getPositionBasedSearchStrategy,
    buildBasicFilters
} from './searchStrategy.js';
import {
    ES_INDEX_NAME,
    KNN_CONFIG,
    ES_SOURCE_FIELDS
} from '../utils/constants.js';

/**
 * 執行立場導向的多角度並行語意搜尋
 * 
 * @param {Object} searchAngles - 搜索角度配置
 * @param {string} courtLevel - 法院層級
 * @param {string} caseType - 案件類型
 * @param {string} threshold - 相似度門檻
 * @param {string} position - 立場 (plaintiff/defendant/neutral)
 * @param {string} caseDescription - 案件描述
 * @returns {Promise<Array>} 搜索結果數組
 */
export async function performMultiAngleSearch(
    searchAngles,
    courtLevel,
    caseType,
    threshold,
    position = 'neutral',
    caseDescription = ''
) {
    try {
        console.log(`🟣 [MULTI-SEARCH-START] ===== 開始立場導向多角度搜尋 =====`);
        console.log(`🟣 [MULTI-SEARCH-START] 立場: ${position}，角度數量: ${Object.keys(searchAngles).length}`);
        console.log(`🟣 [MULTI-SEARCH-START] 參數:`, { courtLevel, caseType, threshold });

        const minScore = getThresholdValue(threshold);
        console.log(`🟣 [MULTI-SEARCH-START] 最低分數閾值: ${minScore}`);

        const searchStrategy = getPositionBasedSearchStrategy(position, caseType);
        console.log(`🟣 [MULTI-SEARCH-START] 搜索策略:`, {
            primaryVectorField: searchStrategy.primaryVectorField,
            vectorFields: Object.keys(searchStrategy.vectorFields || {}),
            hasFilter: !!searchStrategy.filterQuery
        });

        // 並行執行所有角度的搜尋
        const searchPromises = Object.entries(searchAngles).map(async ([angleName, config]) => {
            return await performSingleAngleSearch(
                angleName,
                config,
                searchStrategy,
                courtLevel,
                caseType,
                caseDescription,
                minScore
            );
        });

        // 等待所有搜尋完成
        const searchResults = await Promise.all(searchPromises);

        // 統計成功的搜尋
        const successfulResults = searchResults.filter(r => r.success);
        const totalResults = successfulResults.reduce((sum, r) => sum + r.resultCount, 0);

        console.log(`[multiAngleSearch] 立場導向多角度搜尋完成: ${successfulResults.length}/${searchResults.length} 成功，共 ${totalResults} 個結果`);

        if (successfulResults.length === 0) {
            throw new Error('所有搜尋角度都失敗');
        }

        return searchResults;

    } catch (error) {
        console.error('[multiAngleSearch] 立場導向多角度搜尋失敗:', error);
        throw error;
    }
}

/**
 * 執行單一角度的搜索
 * 
 * @private
 * @param {string} angleName - 角度名稱
 * @param {Object} config - 角度配置
 * @param {Object} searchStrategy - 搜索策略
 * @param {string} courtLevel - 法院層級
 * @param {string} caseType - 案件類型
 * @param {string} caseDescription - 案件描述
 * @param {number} minScore - 最低分數
 * @returns {Promise<Object>} 搜索結果
 */
async function performSingleAngleSearch(
    angleName,
    config,
    searchStrategy,
    courtLevel,
    caseType,
    caseDescription,
    minScore
) {
    try {
        console.log(`🟣 [ANGLE-${angleName}] 開始搜尋: "${config.query}"`);

        // 生成該角度的查詢向量
        console.log(`🟣 [ANGLE-${angleName}] 生成查詢向量...`);
        const queryVector = await generateEmbedding(config.query);
        console.log(`🟣 [ANGLE-${angleName}] ✅ 向量生成完成，維度: ${queryVector?.length}`);

        // 構建 KNN 查詢
        const knnQuery = {
            field: searchStrategy.primaryVectorField,
            query_vector: queryVector,
            k: KNN_CONFIG.k,
            num_candidates: KNN_CONFIG.num_candidates
        };

        // 構建完整的搜索查詢
        const searchQuery = buildSearchQuery(
            knnQuery,
            searchStrategy,
            courtLevel,
            caseType,
            caseDescription
        );

        // 執行搜索
        const response = await esClient.search(searchQuery);

        const hits = response.hits?.hits || [];
        console.log(`[multiAngleSearch] 角度「${angleName}」返回 ${hits.length} 個結果`);

        // 篩選並標記來源角度
        const filteredResults = hits
            .filter(hit => (hit._score || 0) >= minScore)
            .map((hit, index) => {
                // 詳細日誌：檢查前 3 個案例的 position_based_analysis
                if (index < 3) {
                    console.log(`[performSingleAngleSearch] 🔍 案例 ${index + 1} (${hit._source?.JID}):`);
                    console.log(`  - position_based_analysis 存在: ${!!hit._source?.position_based_analysis}`);
                }

                return {
                    id: hit._source?.JID || 'unknown',
                    title: hit._source?.JTITLE || '無標題',
                    verdictType: hit._source?.verdict_type || 'unknown',
                    court: hit._source?.court || '未知法院',
                    year: hit._source?.JYEAR || '未知年份',
                    similarity: hit._score || 0,
                    sourceAngle: angleName,
                    angleWeight: config.weight,
                    originalSimilarity: hit._score || 0,
                    positionAnalysis: hit._source?.position_based_analysis || null,
                    source: hit._source  // 完整的 source 數據
                };
            });

        return {
            angleName,
            config,
            results: filteredResults,
            success: true,
            resultCount: filteredResults.length,
            searchStrategy: searchStrategy.primaryVectorField
        };

    } catch (error) {
        console.error(`[multiAngleSearch] 角度「${angleName}」搜尋失敗:`, error);
        return {
            angleName,
            config,
            results: [],
            success: false,
            error: error.message,
            resultCount: 0
        };
    }
}

/**
 * 構建 ES 搜索查詢
 * 
 * @private
 * @param {Object} knnQuery - KNN 查詢配置
 * @param {Object} searchStrategy - 搜索策略
 * @param {string} courtLevel - 法院層級
 * @param {string} caseType - 案件類型
 * @param {string} caseDescription - 案件描述
 * @returns {Object} ES 查詢對象
 */
function buildSearchQuery(knnQuery, searchStrategy, courtLevel, caseType, caseDescription) {
    const searchQuery = {
        index: ES_INDEX_NAME,
        knn: knnQuery,
        _source: ES_SOURCE_FIELDS,
        size: 25,
        timeout: KNN_CONFIG.timeout
    };

    // 構建基本過濾條件
    const basicFilters = buildBasicFilters(courtLevel, caseType, caseDescription);

    // 結合立場過濾和基本過濾
    if (basicFilters.length > 0 || searchStrategy.filterQuery) {
        const filters = [...basicFilters];

        if (searchStrategy.filterQuery) {
            filters.push(searchStrategy.filterQuery);
        }

        searchQuery.query = {
            bool: {
                filter: filters
            }
        };
    }

    return searchQuery;
}

