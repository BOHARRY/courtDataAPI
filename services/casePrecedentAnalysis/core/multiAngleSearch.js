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
        const minScore = getThresholdValue(threshold);
        const searchStrategy = getPositionBasedSearchStrategy(position, caseType);

        console.log(`[VECTOR-TEST] 📊 搜索參數: 角度數=${Object.keys(searchAngles).length}, 閾值=${minScore}`);

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

        console.log(`[VECTOR-TEST] ✅ 多角度搜尋完成: ${successfulResults.length}/${searchResults.length} 成功，共 ${totalResults} 個結果\n`);

        if (successfulResults.length === 0) {
            throw new Error('所有搜尋角度都失敗');
        }

        return searchResults;

    } catch (error) {
        console.error('[VECTOR-TEST] ❌ 多角度搜尋失敗:', error);
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
        // 生成該角度的查詢向量
        const queryVector = await generateEmbedding(config.query);

        // 構建基本過濾條件（法院層級、案件類型、標籤）
        const basicFilters = buildBasicFilters(courtLevel, caseType, caseDescription);

        // 構建 KNN 查詢，直接在 KNN 中添加 filter
        const knnQuery = {
            field: searchStrategy.primaryVectorField,
            query_vector: queryVector,
            k: KNN_CONFIG.k,
            num_candidates: KNN_CONFIG.num_candidates
        };

        // 將過濾條件直接添加到 KNN 查詢中
        if (basicFilters.length > 0 || searchStrategy.filterQuery) {
            const allFilters = [...basicFilters];
            if (searchStrategy.filterQuery) {
                allFilters.push(searchStrategy.filterQuery);
            }
            knnQuery.filter = allFilters;
        }

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

        // 篩選並標記來源角度
        const filteredResults = hits
            .filter(hit => (hit._score || 0) >= minScore)
            .map((hit, index) => {
                // 🔍 記錄前 5 個案例的詳細信息
                if (index < 5) {
                    console.log(`[VECTOR-TEST] 📄 [${angleName}] 案例 ${index + 1}: ${hit._source?.JID} | 相似度: ${(hit._score * 100).toFixed(1)}% | 案由: ${hit._source?.JTITLE?.substring(0, 30)}...`);
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

        console.log(`[VECTOR-TEST] ✅ [${angleName}] ES返回 ${hits.length} 個 → 篩選後 ${filteredResults.length} 個（閾值: ${minScore}）`);

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
 * @param {Object} knnQuery - KNN 查詢配置（已包含 filter）
 * @param {Object} searchStrategy - 搜索策略
 * @param {string} courtLevel - 法院層級（已在 knnQuery.filter 中處理）
 * @param {string} caseType - 案件類型（已在 knnQuery.filter 中處理）
 * @param {string} caseDescription - 案件描述（已在 knnQuery.filter 中處理）
 * @returns {Object} ES 查詢對象
 */
function buildSearchQuery(knnQuery, searchStrategy, courtLevel, caseType, caseDescription) {
    // ⚠️ 重要：過濾條件已經在 knnQuery.filter 中，不需要再添加到 query.bool.filter
    const searchQuery = {
        index: ES_INDEX_NAME,
        knn: knnQuery,  // KNN 查詢已包含 filter
        _source: ES_SOURCE_FIELDS,
        size: 25,
        timeout: KNN_CONFIG.timeout
    };

    // 不再需要在 query.bool.filter 中添加過濾條件
    // 因為 KNN 查詢的 filter 會在向量搜索階段就生效，性能更好

    return searchQuery;
}

