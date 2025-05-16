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

  processedCases.forEach(caseInfo => {
    const { id, mainType, sideFromPerf, neutralOutcomeCode } = caseInfo;

    if (!neutralOutcomeCode || !mainType || mainType === 'unknown' || !sideFromPerf || sideFromPerf === 'unknown') {
      detailedWinRatesStats[mainType] = detailedWinRatesStats[mainType] || {};
      const unknownRoleBucket = detailedWinRatesStats[mainType].unknown_role = detailedWinRatesStats[mainType].unknown_role || createFinalOutcomeStats();
      unknownRoleBucket[FINAL_STAT_KEYS.TOTAL]++;
      unknownRoleBucket[FINAL_STAT_KEYS.OTHER_UNKNOWN]++;
      return;
    }

    detailedWinRatesStats[mainType] = detailedWinRatesStats[mainType] || { overall: 0, plaintiff: createFinalOutcomeStats(), defendant: createFinalOutcomeStats(), other_side: createFinalOutcomeStats() };
    let targetRoleBucket;

    if (['plaintiff', 'appellant', 'claimant', 'petitioner', 'applicant'].includes(sideFromPerf)) {
      targetRoleBucket = detailedWinRatesStats[mainType].plaintiff = detailedWinRatesStats[mainType].plaintiff || createFinalOutcomeStats();
    } else if (['defendant', 'appellee', 'respondent'].includes(sideFromPerf)) {
      targetRoleBucket = detailedWinRatesStats[mainType].defendant = detailedWinRatesStats[mainType].defendant || createFinalOutcomeStats();
    } else {
      targetRoleBucket = detailedWinRatesStats[mainType].other_side = detailedWinRatesStats[mainType].other_side || createFinalOutcomeStats();
      targetRoleBucket[FINAL_STAT_KEYS.TOTAL]++;
      targetRoleBucket[FINAL_STAT_KEYS.OTHER_UNKNOWN]++;
      return;
    }

    targetRoleBucket[FINAL_STAT_KEYS.TOTAL]++;
    let finalStatKeyToIncrement = FINAL_STAT_KEYS.OTHER_UNKNOWN; // <--- 使用常數

    if (neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.PROCEDURAL_NEUTRAL ||
        neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.CRIMINAL_CHARGE_DISMISSED_NO_PROSECUTION ||
        neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.CRIMINAL_CHARGE_DISMISSED_NOT_ACCEPTED) {
      finalStatKeyToIncrement = FINAL_STAT_KEYS.PROCEDURAL; // <--- 使用常數
    } else if (neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.SETTLEMENT_NEUTRAL || neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.WITHDRAWAL_NEUTRAL) {
      finalStatKeyToIncrement = FINAL_STAT_KEYS.NEUTRAL_SETTLEMENT; // <--- 使用常數
    } else if (neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.NOT_APPLICABLE_OR_UNKNOWN_NEUTRAL ||
               neutralOutcomeCode.endsWith('_UNCATEGORIZED_NEUTRAL') || // 這裡的 endsWith 需要注意，如果 _UNCATEGORIZED_NEUTRAL 本身是常數，則直接比較
               neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.UNKNOWN_NEUTRAL ||
               neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.CIVIL_UNCATEGORIZED_NEUTRAL || // 明確列出
               neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.CRIMINAL_UNCATEGORIZED_NEUTRAL ||
               neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.ADMIN_RULING_UNCATEGORIZED_NEUTRAL ||
               neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.ADMIN_JUDGMENT_UNCATEGORIZED_NEUTRAL
             ) {
      finalStatKeyToIncrement = FINAL_STAT_KEYS.OTHER_UNKNOWN; // <--- 使用常數
    } else {
      if (mainType === 'civil') {
        if (targetRoleBucket === detailedWinRatesStats.civil.plaintiff) {
          if ([NEUTRAL_OUTCOME_CODES.CIVIL_P_WIN_FULL, NEUTRAL_OUTCOME_CODES.CIVIL_P_WIN_MAJOR, NEUTRAL_OUTCOME_CODES.GENERIC_WIN_FULL, NEUTRAL_OUTCOME_CODES.CIVIL_RULING_GRANTED].includes(neutralOutcomeCode)) finalStatKeyToIncrement = FINAL_STAT_KEYS.FAVORABLE_FULL;
          else if ([NEUTRAL_OUTCOME_CODES.CIVIL_P_WIN_PARTIAL, NEUTRAL_OUTCOME_CODES.CIVIL_P_WIN_MINOR, NEUTRAL_OUTCOME_CODES.GENERIC_WIN_PARTIAL].includes(neutralOutcomeCode)) finalStatKeyToIncrement = FINAL_STAT_KEYS.FAVORABLE_PARTIAL;
          else if ([NEUTRAL_OUTCOME_CODES.CIVIL_P_LOSE_FULL, NEUTRAL_OUTCOME_CODES.CIVIL_D_WIN_FULL, NEUTRAL_OUTCOME_CODES.CIVIL_RULING_DISMISSED, NEUTRAL_OUTCOME_CODES.GENERIC_LOSE_FULL].includes(neutralOutcomeCode)) finalStatKeyToIncrement = FINAL_STAT_KEYS.UNFAVORABLE_FULL;
        } else if (targetRoleBucket === detailedWinRatesStats.civil.defendant) {
          if ([NEUTRAL_OUTCOME_CODES.CIVIL_D_WIN_FULL, NEUTRAL_OUTCOME_CODES.CIVIL_D_MITIGATE_MAJOR, NEUTRAL_OUTCOME_CODES.CIVIL_P_LOSE_FULL, NEUTRAL_OUTCOME_CODES.GENERIC_WIN_FULL, NEUTRAL_OUTCOME_CODES.CIVIL_RULING_DISMISSED].includes(neutralOutcomeCode)) finalStatKeyToIncrement = FINAL_STAT_KEYS.FAVORABLE_FULL;
          else if ([NEUTRAL_OUTCOME_CODES.CIVIL_D_MITIGATE_PARTIAL, NEUTRAL_OUTCOME_CODES.CIVIL_D_MITIGATE_MINOR, NEUTRAL_OUTCOME_CODES.GENERIC_WIN_PARTIAL].includes(neutralOutcomeCode)) finalStatKeyToIncrement = FINAL_STAT_KEYS.FAVORABLE_PARTIAL;
          else if ([NEUTRAL_OUTCOME_CODES.CIVIL_D_LOSE_FULL, NEUTRAL_OUTCOME_CODES.CIVIL_P_WIN_FULL, NEUTRAL_OUTCOME_CODES.CIVIL_P_WIN_MAJOR, NEUTRAL_OUTCOME_CODES.CIVIL_P_WIN_PARTIAL, NEUTRAL_OUTCOME_CODES.CIVIL_P_WIN_MINOR, NEUTRAL_OUTCOME_CODES.GENERIC_LOSE_FULL, NEUTRAL_OUTCOME_CODES.CIVIL_RULING_GRANTED].includes(neutralOutcomeCode)) finalStatKeyToIncrement = FINAL_STAT_KEYS.UNFAVORABLE_FULL;
        }
      } else if (mainType === 'criminal') {
        if (targetRoleBucket === detailedWinRatesStats.criminal.defendant) {
          if (neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.CRIMINAL_ACQUITTED || neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.CRIMINAL_RULING_BAIL_GRANTED) finalStatKeyToIncrement = FINAL_STAT_KEYS.FAVORABLE_FULL;
          else if ([NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_SIG_REDUCED, NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_SLIGHT_REDUCED, NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_PROBATION, NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_FINE_CONVERTIBLE, NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_FINE_ONLY].includes(neutralOutcomeCode)) finalStatKeyToIncrement = FINAL_STAT_KEYS.FAVORABLE_PARTIAL;
          else if ([NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_AGGRAVATED, NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_AS_EXPECTED_OR_SENTENCED, NEUTRAL_OUTCOME_CODES.CRIMINAL_RULING_DETENTION_ORDERED].includes(neutralOutcomeCode)) finalStatKeyToIncrement = FINAL_STAT_KEYS.UNFAVORABLE_FULL;
        }
      } else if (mainType === 'administrative') {
        if (targetRoleBucket === detailedWinRatesStats.administrative.plaintiff) {
          if ([NEUTRAL_OUTCOME_CODES.ADMIN_WIN_REVOKE_FULL, NEUTRAL_OUTCOME_CODES.ADMIN_WIN_OBLIGATION, NEUTRAL_OUTCOME_CODES.ADMIN_RULING_STAY_GRANTED].includes(neutralOutcomeCode)) finalStatKeyToIncrement = FINAL_STAT_KEYS.FAVORABLE_FULL;
          else if (neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.ADMIN_WIN_REVOKE_PARTIAL) finalStatKeyToIncrement = FINAL_STAT_KEYS.FAVORABLE_PARTIAL;
          else if ([NEUTRAL_OUTCOME_CODES.ADMIN_LOSE_DISMISSED, NEUTRAL_OUTCOME_CODES.ADMIN_RULING_STAY_DENIED].includes(neutralOutcomeCode)) finalStatKeyToIncrement = FINAL_STAT_KEYS.UNFAVORABLE_FULL;
        }
      }
    }
    targetRoleBucket[finalStatKeyToIncrement]++;
  });

  ['civil', 'criminal', 'administrative'].forEach(mainType => {
    const stats = detailedWinRatesStats[mainType];
    if (!stats) return;
    let totalFavorable = 0;
    let totalConsideredForRate = 0;
    const rolesToConsider = ['plaintiff', 'defendant'];
    rolesToConsider.forEach(role => {
      const roleStats = stats[role];
      if (roleStats) {
        totalFavorable += (roleStats[FINAL_STAT_KEYS.FAVORABLE_FULL] || 0) + (roleStats[FINAL_STAT_KEYS.FAVORABLE_PARTIAL] || 0);
        totalConsideredForRate += (roleStats[FINAL_STAT_KEYS.FAVORABLE_FULL] || 0) +
                                  (roleStats[FINAL_STAT_KEYS.FAVORABLE_PARTIAL] || 0) +
                                  (roleStats[FINAL_STAT_KEYS.UNFAVORABLE_FULL] || 0);
      }
    });
    stats.overall = totalConsideredForRate > 0 ? Math.round((totalFavorable / totalConsideredForRate) * 100) : 0;
  });
  return detailedWinRatesStats;
}