// services/casePrecedentAnalysis/utils/keyMetricsFetcher.js

/**
 * 批量獲取判決書的 key_metrics 數據
 * 用於金額分析等按需查詢場景
 */

import esClient from '../../../config/elasticsearch.js';
import { ES_INDEX_NAME } from './constants.js';

/**
 * 批量獲取判決書的 key_metrics
 * @param {Array<string>} jids - 判決書 ID 列表
 * @param {Object} similarityMap - 相似度映射表（JID -> similarity）
 * @returns {Promise<Array>} 包含 key_metrics 和 similarity 的案件數組
 */
export async function batchGetKeyMetrics(jids, similarityMap = {}) {
    console.log('[batchGetKeyMetrics] 開始批量查詢 key_metrics，JID 數量:', jids?.length || 0);
    console.log('[batchGetKeyMetrics] 相似度映射表大小:', Object.keys(similarityMap).length);

    if (!jids || jids.length === 0) {
        console.warn('[batchGetKeyMetrics] ⚠️ JID 列表為空');
        return [];
    }

    try {
        // 使用 mget (multi-get) 批量查詢
        const response = await esClient.mget({
            index: ES_INDEX_NAME,
            body: {
                ids: jids
            },
            _source: ['JID', 'JTITLE', 'key_metrics'] // 只獲取必要的字段
        });

        console.log('[batchGetKeyMetrics] ES 查詢完成:', {
            total: response.docs.length,
            found: response.docs.filter(doc => doc.found).length,
            notFound: response.docs.filter(doc => !doc.found).length
        });

        // 提取找到的文檔，並附加相似度信息
        const cases = response.docs
            .filter(doc => doc.found)
            .map(doc => ({
                id: doc._id,
                JID: doc._source.JID,
                JTITLE: doc._source.JTITLE,
                key_metrics: doc._source.key_metrics,
                similarity: similarityMap[doc._id] || similarityMap[doc._source.JID] || 0  // 🎯 添加相似度
            }));

        console.log('[batchGetKeyMetrics] ✅ 成功獲取 key_metrics:', {
            successCount: cases.length,
            hasKeyMetrics: cases.filter(c => c.key_metrics).length,
            hasSimilarity: cases.filter(c => c.similarity > 0).length
        });

        return cases;

    } catch (error) {
        console.error('[batchGetKeyMetrics] ❌ 批量查詢失敗:', error);
        throw error;
    }
}

