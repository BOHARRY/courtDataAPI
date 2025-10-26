// services/judgmentService.js
import esClient from '../config/elasticsearch.js';

const ES_INDEX_NAME = 'search-boooook';  // ✅ 與 caseDescriptionSearchService 使用相同的索引

/**
 * 批次獲取判決資料（根據 JID 列表）
 * 用於案由搜尋的換頁功能
 */
export async function batchGetJudgmentsByJids(jids) {
    try {
        console.log(`[JudgmentService] 批次獲取 ${jids.length} 筆判決資料...`);

        const result = await esClient.mget({
            index: ES_INDEX_NAME,
            body: {
                ids: jids
            },
            _source: [
                // 基本資訊
                'JID', 'court', 'JDATE', 'JTITLE',
                'JYEAR', 'JCASE', 'JNO',

                // 案件分類
                'case_type', 'stage0_case_type', 'verdict_type',

                // 案件難度分數
                'SCORE',  // ✅ 案件難度分數（用於顯示難度球球）

                // AI 摘要和分析
                'summary_ai', 'main_reasons_ai',

                // 法律依據
                'legal_basis', 'legal_issues',

                // 可引用段落
                'citable_paragraphs',

                // 完整判決書
                'JFULL',

                // 法院見解標記
                'CourtInsightsStart', 'CourtInsightsEND'
            ]
        });

        const judgments = result.docs
            .filter(doc => doc.found)
            .map(doc => {
                const source = doc._source;

                // ✅ 保持原始格式，不做轉換
                // 前端會根據需要處理陣列或字串格式
                return {
                    ...source,
                    id: source.JID,
                    title: source.JTITLE || ''
                };
            });

        console.log(`[JudgmentService] 成功獲取 ${judgments.length}/${jids.length} 筆判決資料`);

        // 按照原始 jids 的順序排序結果
        const jidToJudgment = {};
        judgments.forEach(j => {
            jidToJudgment[j.JID] = j;
        });

        const orderedJudgments = jids
            .map(jid => jidToJudgment[jid])
            .filter(j => j !== undefined);

        return orderedJudgments;

    } catch (error) {
        console.error('[JudgmentService] 批次獲取判決失敗:', error);
        throw error;
    }
}

