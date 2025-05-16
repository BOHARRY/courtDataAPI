// utils/win-rate-calculator.js
import { NEUTRAL_OUTCOME_CODES, FINAL_STAT_KEYS } from './constants.js'; // 確保路徑正確

/**
 * 創建一個用於存儲最終結果統計的初始物件結構。
 * @returns {object} 包含各種結果計數的統計物件。
 */
export function createFinalOutcomeStats() {
  return {
    [FINAL_STAT_KEYS.TOTAL]: 0,
    [FINAL_STAT_KEYS.FAVORABLE_FULL]: 0,
    [FINAL_STAT_KEYS.FAVORABLE_PARTIAL]: 0,
    [FINAL_STAT_KEYS.UNFAVORABLE_FULL]: 0,
    [FINAL_STAT_KEYS.NEUTRAL_SETTLEMENT]: 0,
    [FINAL_STAT_KEYS.PROCEDURAL]: 0,
    [FINAL_STAT_KEYS.OTHER_UNKNOWN]: 0,
  };
}

/**
 * 計算並更新詳細的勝訴率統計數據。
 * @param {Array<object>} processedCases - 已處理的案件列表。
 * @param {object} initialDetailedWinRatesStats - 初始統計數據物件。
 * @returns {object} 更新後的統計數據物件。
 */
export function calculateDetailedWinRates(processedCases = [], initialDetailedWinRatesStats) {
  const detailedWinRatesStats = JSON.parse(JSON.stringify(initialDetailedWinRatesStats));

  // 新增日誌，幫助調試
  console.log(`勝率計算 - 案件總數: ${processedCases.length}`);

  // 遍歷案件並統計
  processedCases.forEach(caseInfo => {
    const { id, mainType, sideFromPerf, neutralOutcomeCode, isSubstantiveRuling } = caseInfo;

    // 驗證必要字段是否存在
    if (!neutralOutcomeCode || !mainType || mainType === 'unknown' || !sideFromPerf || sideFromPerf === 'unknown') {
      detailedWinRatesStats[mainType] = detailedWinRatesStats[mainType] || {};
      const unknownRoleBucket = detailedWinRatesStats[mainType].unknown_role = detailedWinRatesStats[mainType].unknown_role || createFinalOutcomeStats();
      unknownRoleBucket[FINAL_STAT_KEYS.TOTAL]++;
      unknownRoleBucket[FINAL_STAT_KEYS.OTHER_UNKNOWN]++;
      console.log(`跳過無效案件: ${id}, 主類型=${mainType}, 立場=${sideFromPerf}, 代碼=${neutralOutcomeCode}`);
      return;
    }

    // 確保目標統計桶存在
    detailedWinRatesStats[mainType] = detailedWinRatesStats[mainType] || {
      overall: 0,
      plaintiff: createFinalOutcomeStats(),
      defendant: createFinalOutcomeStats(),
      other_side: createFinalOutcomeStats()
    };

    // 獲取目標統計桶
    let targetRoleBucket;
    if (['plaintiff', 'appellant', 'claimant', 'petitioner', 'applicant'].includes(sideFromPerf)) {
      targetRoleBucket = detailedWinRatesStats[mainType].plaintiff = detailedWinRatesStats[mainType].plaintiff || createFinalOutcomeStats();
    } else if (['defendant', 'appellee', 'respondent'].includes(sideFromPerf)) {
      targetRoleBucket = detailedWinRatesStats[mainType].defendant = detailedWinRatesStats[mainType].defendant || createFinalOutcomeStats();
    } else {
      targetRoleBucket = detailedWinRatesStats[mainType].other_side = detailedWinRatesStats[mainType].other_side || createFinalOutcomeStats();
      targetRoleBucket[FINAL_STAT_KEYS.TOTAL]++;
      targetRoleBucket[FINAL_STAT_KEYS.OTHER_UNKNOWN]++;
      console.log(`案件 ${id}: 無法確定律師角色，歸類為其他`);
      return;
    }

    // 案件總數加1
    targetRoleBucket[FINAL_STAT_KEYS.TOTAL]++;

    // 根據不同結果代碼更新對應統計
    let finalStatKeyToIncrement = FINAL_STAT_KEYS.OTHER_UNKNOWN;

    // 處理程序性結果 - 重要變化：考慮 isSubstantiveRuling 標記
    if ((neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.PROCEDURAL_NEUTRAL ||
      neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.CRIMINAL_CHARGE_DISMISSED_NO_PROSECUTION ||
      neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.CRIMINAL_CHARGE_DISMISSED_NOT_ACCEPTED)
      && !isSubstantiveRuling) {
      finalStatKeyToIncrement = FINAL_STAT_KEYS.PROCEDURAL;
      console.log(`案件 ${id}: 歸類為程序性 (${neutralOutcomeCode})`);
    }
    else if (neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.SETTLEMENT_NEUTRAL ||
      neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.WITHDRAWAL_NEUTRAL) {
      finalStatKeyToIncrement = FINAL_STAT_KEYS.NEUTRAL_SETTLEMENT;
      console.log(`案件 ${id}: 歸類為和解/撤訴 (${neutralOutcomeCode})`);
    }
    else if (neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.NOT_APPLICABLE_OR_UNKNOWN_NEUTRAL ||
      neutralOutcomeCode.endsWith('_UNCATEGORIZED_NEUTRAL') ||
      neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.UNKNOWN_NEUTRAL ||
      neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.CIVIL_UNCATEGORIZED_NEUTRAL ||
      neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.CRIMINAL_UNCATEGORIZED_NEUTRAL ||
      neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.ADMIN_RULING_UNCATEGORIZED_NEUTRAL ||
      neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.ADMIN_JUDGMENT_UNCATEGORIZED_NEUTRAL) {
      finalStatKeyToIncrement = FINAL_STAT_KEYS.OTHER_UNKNOWN;
      console.log(`案件 ${id}: 歸類為未知 (${neutralOutcomeCode})`);
    }
    else if (neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.NOT_APPLICABLE_OR_UNKNOWN_NEUTRAL ||
      neutralOutcomeCode.endsWith('_UNCATEGORIZED_NEUTRAL') ||
      neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.UNKNOWN_NEUTRAL ||
      neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.CIVIL_UNCATEGORIZED_NEUTRAL ||
      neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.CRIMINAL_UNCATEGORIZED_NEUTRAL ||
      neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.ADMIN_RULING_UNCATEGORIZED_NEUTRAL ||
      neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.ADMIN_JUDGMENT_UNCATEGORIZED_NEUTRAL) {
      finalStatKeyToIncrement = FINAL_STAT_KEYS.OTHER_UNKNOWN;
      console.log(`案件 ${id}: 歸類為未知 (${neutralOutcomeCode})`);
    }
    else {
      // 處理實質性案件結果
      if (mainType === 'civil') {
        if (targetRoleBucket === detailedWinRatesStats.civil.plaintiff) {
          if ([NEUTRAL_OUTCOME_CODES.CIVIL_P_WIN_FULL,
          NEUTRAL_OUTCOME_CODES.CIVIL_P_WIN_MAJOR,
          NEUTRAL_OUTCOME_CODES.GENERIC_WIN_FULL,
          NEUTRAL_OUTCOME_CODES.CIVIL_RULING_GRANTED].includes(neutralOutcomeCode)) {
            finalStatKeyToIncrement = FINAL_STAT_KEYS.FAVORABLE_FULL;
            console.log(`案件 ${id}: 民事原告完全有利`);
          }
          else if ([NEUTRAL_OUTCOME_CODES.CIVIL_P_WIN_PARTIAL,
          NEUTRAL_OUTCOME_CODES.CIVIL_P_WIN_MINOR,
          NEUTRAL_OUTCOME_CODES.GENERIC_WIN_PARTIAL].includes(neutralOutcomeCode)) {
            finalStatKeyToIncrement = FINAL_STAT_KEYS.FAVORABLE_PARTIAL;
            console.log(`案件 ${id}: 民事原告部分有利`);
          }
          else if ([NEUTRAL_OUTCOME_CODES.CIVIL_P_LOSE_FULL,
          NEUTRAL_OUTCOME_CODES.CIVIL_D_WIN_FULL,
          NEUTRAL_OUTCOME_CODES.CIVIL_RULING_DISMISSED,
          NEUTRAL_OUTCOME_CODES.GENERIC_LOSE_FULL].includes(neutralOutcomeCode)) {
            finalStatKeyToIncrement = FINAL_STAT_KEYS.UNFAVORABLE_FULL;
            console.log(`案件 ${id}: 民事原告完全不利`);
          }
        }
        else if (targetRoleBucket === detailedWinRatesStats.civil.defendant) {
          if ([NEUTRAL_OUTCOME_CODES.CIVIL_D_WIN_FULL,
          NEUTRAL_OUTCOME_CODES.CIVIL_D_MITIGATE_MAJOR,
          NEUTRAL_OUTCOME_CODES.CIVIL_P_LOSE_FULL,
          NEUTRAL_OUTCOME_CODES.GENERIC_WIN_FULL,
          NEUTRAL_OUTCOME_CODES.CIVIL_RULING_DISMISSED].includes(neutralOutcomeCode)) {
            finalStatKeyToIncrement = FINAL_STAT_KEYS.FAVORABLE_FULL;
            console.log(`案件 ${id}: 民事被告完全有利`);
          }
          else if ([NEUTRAL_OUTCOME_CODES.CIVIL_D_MITIGATE_PARTIAL,
          NEUTRAL_OUTCOME_CODES.CIVIL_D_MITIGATE_MINOR,
          NEUTRAL_OUTCOME_CODES.GENERIC_WIN_PARTIAL].includes(neutralOutcomeCode)) {
            finalStatKeyToIncrement = FINAL_STAT_KEYS.FAVORABLE_PARTIAL;
            console.log(`案件 ${id}: 民事被告部分有利`);
          }
          else if ([NEUTRAL_OUTCOME_CODES.CIVIL_D_LOSE_FULL,
          NEUTRAL_OUTCOME_CODES.CIVIL_P_WIN_FULL,
          NEUTRAL_OUTCOME_CODES.CIVIL_P_WIN_MAJOR,
          NEUTRAL_OUTCOME_CODES.CIVIL_P_WIN_PARTIAL,
          NEUTRAL_OUTCOME_CODES.CIVIL_P_WIN_MINOR,
          NEUTRAL_OUTCOME_CODES.GENERIC_LOSE_FULL,
          NEUTRAL_OUTCOME_CODES.CIVIL_RULING_GRANTED].includes(neutralOutcomeCode)) {
            finalStatKeyToIncrement = FINAL_STAT_KEYS.UNFAVORABLE_FULL;
            console.log(`案件 ${id}: 民事被告完全不利`);
          }
        }
      }
      else if (mainType === 'criminal') {
        if (targetRoleBucket === detailedWinRatesStats.criminal.defendant) {
          if (neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.CRIMINAL_ACQUITTED ||
            neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.CRIMINAL_RULING_BAIL_GRANTED) {
            finalStatKeyToIncrement = FINAL_STAT_KEYS.FAVORABLE_FULL;
            console.log(`案件 ${id}: 刑事被告完全有利`);
          }
          else if ([NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_SIG_REDUCED,
          NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_SLIGHT_REDUCED,
          NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_PROBATION,
          NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_FINE_CONVERTIBLE,
          NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_FINE_ONLY].includes(neutralOutcomeCode)) {
            finalStatKeyToIncrement = FINAL_STAT_KEYS.FAVORABLE_PARTIAL;
            console.log(`案件 ${id}: 刑事被告部分有利`);
          }
          else if ([NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_AGGRAVATED,
          NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_AS_EXPECTED_OR_SENTENCED,
          NEUTRAL_OUTCOME_CODES.CRIMINAL_RULING_DETENTION_ORDERED].includes(neutralOutcomeCode)) {
            finalStatKeyToIncrement = FINAL_STAT_KEYS.UNFAVORABLE_FULL;
            console.log(`案件 ${id}: 刑事被告完全不利`);
          }
        }
      }
      else if (mainType === 'administrative') {
        if (targetRoleBucket === detailedWinRatesStats.administrative.plaintiff) {
          // 處理行政案件裁定 - 顯式檢查實質性裁定
          if (isSubstantiveRuling && neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.ADMIN_RULING_STAY_GRANTED) {
            finalStatKeyToIncrement = FINAL_STAT_KEYS.FAVORABLE_FULL;
            console.log(`案件 ${id}: 行政原告裁定有利`);
          }
          else if (isSubstantiveRuling && neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.ADMIN_RULING_STAY_DENIED) {
            finalStatKeyToIncrement = FINAL_STAT_KEYS.UNFAVORABLE_FULL;
            console.log(`案件 ${id}: 行政原告裁定不利`);
          }
          // 處理其他行政案件判決
          else if ([NEUTRAL_OUTCOME_CODES.ADMIN_WIN_REVOKE_FULL,
          NEUTRAL_OUTCOME_CODES.ADMIN_WIN_OBLIGATION].includes(neutralOutcomeCode)) {
            finalStatKeyToIncrement = FINAL_STAT_KEYS.FAVORABLE_FULL;
            console.log(`案件 ${id}: 行政原告完全有利`);
          }
          else if (neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.ADMIN_WIN_REVOKE_PARTIAL) {
            finalStatKeyToIncrement = FINAL_STAT_KEYS.FAVORABLE_PARTIAL;
            console.log(`案件 ${id}: 行政原告部分有利`);
          }
          else if (neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.ADMIN_LOSE_DISMISSED) {
            finalStatKeyToIncrement = FINAL_STAT_KEYS.UNFAVORABLE_FULL;
            console.log(`案件 ${id}: 行政原告完全不利`);
          }
        }
      }
    }

    // 更新計數
    targetRoleBucket[finalStatKeyToIncrement]++;
  });

  // 計算整體勝訴率
  ['civil', 'criminal', 'administrative'].forEach(mainType => {
    const stats = detailedWinRatesStats[mainType];
    if (!stats) return;

    let totalFavorable = 0;
    let totalConsideredForRate = 0;

    const rolesToConsider = ['plaintiff', 'defendant'];
    rolesToConsider.forEach(role => {
      const roleStats = stats[role];
      if (roleStats) {
        // 計算有利結果總數
        totalFavorable += (roleStats[FINAL_STAT_KEYS.FAVORABLE_FULL] || 0) +
          (roleStats[FINAL_STAT_KEYS.FAVORABLE_PARTIAL] || 0);

        // 計算納入統計的總案件數
        totalConsideredForRate += (roleStats[FINAL_STAT_KEYS.FAVORABLE_FULL] || 0) +
          (roleStats[FINAL_STAT_KEYS.FAVORABLE_PARTIAL] || 0) +
          (roleStats[FINAL_STAT_KEYS.UNFAVORABLE_FULL] || 0);
      }
    });

    // 計算百分比
    stats.overall = totalConsideredForRate > 0 ?
      Math.round((totalFavorable / totalConsideredForRate) * 100) : 0;

    // 新增調試日誌
    console.log(`${mainType} 勝率計算: 有利結果=${totalFavorable}, 納入統計總數=${totalConsideredForRate}, 最終勝率=${stats.overall}%`);
  });

  return detailedWinRatesStats;
}