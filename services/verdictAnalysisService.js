// services/verdictAnalysisService.js

/**
 * 🆕 從 position_based_analysis 數據分析勝負
 * 
 * 這個函數使用 Elasticsearch 中已存在的 position_based_analysis 數據來判斷案例的勝負。
 * 根據 ES 查詢驗證 (2025-10-11)，100% 的案例都有完整的 position_based_analysis 數據。
 * 
 * @param {Object} case_ - 案例對象
 * @param {string} position - 立場 ('plaintiff' | 'defendant' | 'neutral')
 * @returns {Object} 勝負分析結果
 * 
 * @example
 * const verdictAnalysis = analyzeVerdictFromPositionData(case_, 'defendant');
 * console.log(verdictAnalysis.isWin); // true 只有當 overall_result === 'major_victory'
 * console.log(verdictAnalysis.isPartialWin); // true 當 overall_result === 'partial_success'
 * console.log(verdictAnalysis.isLose); // true 當 overall_result === 'major_defeat'
 */
export function analyzeVerdictFromPositionData(case_, position) {
    // 1. 獲取 position_based_analysis 數據
    const positionAnalysis = case_.positionAnalysis || case_.source?.position_based_analysis;

    // 2. ✅ ES 查詢驗證: 100% 覆蓋率 (10,519/10,519)
    // 如果缺少數據，這是一個嚴重錯誤，應該拋出異常
    if (!positionAnalysis) {
        console.error(`[analyzeVerdictFromPositionData] ❌ 案例 ${case_.id} 缺少 position_based_analysis 數據`);
        console.error(`[analyzeVerdictFromPositionData] 案例數據:`, {
            id: case_.id,
            title: case_.title,
            hasPositionAnalysis: !!case_.positionAnalysis,
            hasSource: !!case_.source,
            hasSourcePositionAnalysis: !!case_.source?.position_based_analysis
        });
        throw new Error(`案例 ${case_.id} 缺少必要的 position_based_analysis 數據 (數據完整性問題)`);
    }

    // 3. 根據立場選擇對應的視角
    const perspective = position === 'plaintiff'
        ? positionAnalysis.plaintiff_perspective
        : positionAnalysis.defendant_perspective;

    if (!perspective) {
        console.error(`[analyzeVerdictFromPositionData] ❌ 案例 ${case_.id} 缺少 ${position}_perspective 數據`);
        throw new Error(`案例 ${case_.id} 缺少必要的 ${position}_perspective 數據`);
    }

    // 4. 基於 overall_result 判斷勝負
    const overallResult = perspective.overall_result;

    // ✅ ES 查詢驗證: overall_result 只有 3 種值
    // - major_victory: 大勝
    // - partial_success: 部分成功
    // - major_defeat: 大敗
    if (!['major_victory', 'partial_success', 'major_defeat'].includes(overallResult)) {
        console.warn(`[analyzeVerdictFromPositionData] ⚠️ 未知的 overall_result 值: ${overallResult}`);
    }

    // 5. 構建返回結果
    return {
        // 原始數據
        overallResult: overallResult,
        caseValue: perspective.case_value,  // ⚠️ 注意: 被告使用 example (model_defense, neutral_example, negative_example)
                                            //          原告使用 precedent (positive_precedent, neutral_precedent, negative_precedent)

        // 勝負判斷 (✅ 只有 major_victory 才算勝利!)
        isWin: overallResult === 'major_victory',
        isPartialWin: overallResult === 'partial_success',
        isLose: overallResult === 'major_defeat',

        // 為了向後兼容，保留 isPartial 欄位
        isPartial: overallResult === 'partial_success',

        // 詳細資訊 (根據立場不同，欄位名稱可能不同)
        // 原告: successful_elements, critical_failures, key_lessons
        // 被告: successful_strategies, failed_strategies, winning_formula
        successfulStrategies: perspective.successful_strategies || perspective.successful_elements || [],
        failedStrategies: perspective.failed_strategies || perspective.critical_failures || [],
        winningFormula: perspective.winning_formula || perspective.key_lessons || [],
        riskWarning: perspective.risk_warning || null,
        replicationPotential: perspective.replication_potential || null,

        // 元數據
        hasPositionData: true,
        dataSource: 'position_based_analysis',
        position: position
    };
}

/**
 * 分析判決分布
 * 
 * @param {Array} cases - 案例列表
 * @returns {Object} 判決分布統計
 */
export function analyzeVerdictDistribution(cases) {
    const verdictStats = {};
    const totalCases = cases.length;

    cases.forEach(case_ => {
        const verdict = case_.verdictType || case_.verdict || '未知';
        if (!verdictStats[verdict]) {
            verdictStats[verdict] = {
                count: 0,
                percentage: 0,
                cases: []
            };
        }
        verdictStats[verdict].count++;
        verdictStats[verdict].cases.push({
            id: case_.id,
            title: case_.title,
            court: case_.court,
            year: case_.year
        });
    });

    // 計算百分比
    Object.keys(verdictStats).forEach(verdict => {
        verdictStats[verdict].percentage = Math.round((verdictStats[verdict].count / totalCases) * 100);
    });

    // 排序（按數量降序）
    const sortedVerdicts = Object.entries(verdictStats)
        .sort((a, b) => b[1].count - a[1].count)
        .reduce((acc, [verdict, stats]) => {
            acc[verdict] = stats;
            return acc;
        }, {});

    return {
        total: totalCases,
        distribution: sortedVerdicts,
        mostCommon: Object.keys(sortedVerdicts)[0] || '未知',
        mostCommonCount: sortedVerdicts[Object.keys(sortedVerdicts)[0]]?.count || 0
    };
}

/**
 * ❌ 已廢棄: analyzeVerdictOutcome()
 * 
 * 這個函數使用 verdict_type 字串匹配來判斷勝負，存在嚴重邏輯錯誤：
 * - 將所有 "部分勝訴部分敗訴" 案例都標記為 isWin = true
 * - 導致被告分析勝率虛高 (96% 而非實際的 31.2%)
 * 
 * 根據 ES 查詢驗證 (2025-10-11):
 * - "部分勝訴部分敗訴" 案例中，只有 3.3% 是被告的 major_victory
 * - 58.6% 是 partial_success，38.1% 是 major_defeat
 * 
 * 請使用 analyzeVerdictFromPositionData() 替代此函數。
 * 
 * @deprecated 使用 analyzeVerdictFromPositionData() 替代
 */
/*
function analyzeVerdictOutcome(verdict, position) {
    // 🎯 基於結構化的 verdict_type 進行精確分類
    const result = {
        isWin: false,
        isLose: false,
        isPartial: false,
        winRate: 0, // 勝訴程度 0-100%
        category: 'unknown'
    };

    // 🔍 民事案件的精細分類
    if (verdict === '原告勝訴') {
        result.category = 'full_win';
        result.winRate = 100;
        if (position === 'plaintiff') {
            result.isWin = true;
        } else if (position === 'defendant') {
            result.isLose = true;
        }
    } else if (verdict === '原告敗訴') {
        result.category = 'full_lose';
        result.winRate = 0;
        if (position === 'plaintiff') {
            result.isLose = true;
        } else if (position === 'defendant') {
            result.isWin = true;
        }
    } else if (verdict === '部分勝訴部分敗訴') {
        // ❌ 錯誤邏輯: 將所有 "部分勝訴部分敗訴" 都標記為 isWin = true
        // 這導致被告分析勝率虛高 (96% 而非 31.2%)
        result.category = 'partial_win';
        result.isPartial = true;
        result.winRate = 50;

        // 部分勝訴對雙方都有參考價值
        if (position === 'plaintiff') {
            result.isWin = true; // 原告視角：部分勝訴仍算成功
        } else if (position === 'defendant') {
            result.isWin = true; // ❌ 被告視角：避免完全敗訴也算成功 (錯誤!)
        }
    } else if (verdict === '上訴駁回') {
        // 需要根據上訴方判斷
        result.category = 'appeal_rejected';
        result.winRate = 0; // 上訴方敗訴
        result.isLose = true;
    } else if (verdict === '和解成立') {
        result.category = 'settlement';
        result.isPartial = true;
        result.winRate = 50; // 和解通常是雙方妥協
    } else if (verdict.includes('駁回')) {
        result.category = 'rejected';
        result.winRate = 0;
        if (position === 'plaintiff') {
            result.isLose = true;
        } else if (position === 'defendant') {
            result.isWin = true;
        }
    }

    return result;
}
*/

