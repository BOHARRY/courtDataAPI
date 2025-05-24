// utils/case-analyzer.js
import {
  CRIMINAL_KEYWORDS_TITLE,
  CIVIL_KEYWORDS_TITLE,
  NEUTRAL_OUTCOME_CODES
} from './constants.js';

/**
 * 根據案件來源資料判斷主要案件類型。
 * @param {object} source - Elasticsearch 中的 _source 物件。
 * @returns {string} 'civil', 'criminal', 'administrative', 或 'unknown'。
 */
export function getMainType(source = {}) {
  let caseTypeInput = source.case_type; // 原始的 case_type 值

  if (Array.isArray(caseTypeInput)) { // <--- 明確檢查是否為陣列
    if (caseTypeInput.length > 0 && typeof caseTypeInput[0] === 'string') {
      // 如果是陣列，並且第一個元素是字串，我們就取第一個元素
      console.log(`[getMainType] source.case_type for JID ${source.JID || 'N/A'} was an array. Using first element: "${caseTypeInput[0]}"`);
      caseTypeInput = caseTypeInput[0];
    } else if (caseTypeInput.length === 0) {
      // 如果是空陣列
      console.warn(`[getMainType] Warning: source.case_type for JID ${source.JID || 'N/A'} is an empty array. Treating as empty string.`);
      caseTypeInput = '';
    } else {
      // 如果陣列的第一個元素不是字串，或者有其他複雜情況
      console.warn(`[getMainType] Warning: source.case_type for JID ${source.JID || 'N/A'} is an array but its first element is not a string or array is complex. Value:`, caseTypeInput, `. Treating as empty string.`);
      caseTypeInput = '';
    }
  } else if (typeof caseTypeInput !== 'string') { // 如果不是陣列，也不是字串
    console.warn(`[getMainType] Warning: source.case_type for JID ${source.JID || 'N/A'} is not a string and not an array. Type: ${typeof caseTypeInput}, Value:`, caseTypeInput, `. Treating as empty string.`);
    caseTypeInput = '';
  }

  // 現在 caseTypeInput 應該是字串或者 ''
  const caseType = (caseTypeInput || '').toLowerCase();
  const court = (source.court || '').toLowerCase();
  const jtitle = (source.JTITLE || '').toLowerCase();
  const jcase = (source.JCASE || '').toLowerCase();


  if (caseType.includes('行政') || court.includes('行政法院') ||
    ((jtitle.includes('稅') || jtitle.includes('徵收') || jtitle.includes('處分') || jtitle.includes('訴願')) && !jtitle.includes('民事') && !jtitle.includes('刑事'))) {
    return 'administrative';
  }
  if (jcase.startsWith('刑附民')) return 'civil'; // 刑附民本質是民事求償
  if (caseType.includes('刑事') || court.includes('刑事庭') ||
    CRIMINAL_KEYWORDS_TITLE.some(kw => jtitle.includes(kw) && !CIVIL_KEYWORDS_TITLE.some(cKw => jtitle.includes(cKw))) ||
    (jcase.startsWith('刑') && !jcase.startsWith('刑附民')) || jcase.startsWith('少刑') || jcase.startsWith('易刑')) {
    return 'criminal';
  }
  const civilJcaseChars = ['民', '家', '訴', '執', '全', '抗', '促', '裁', '督', '易', '簡', '上', '再', '國', '消'];
  if (caseType.includes('民事') || caseType.includes('家事') ||
    court.includes('民事庭') || court.includes('家事法庭') || court.includes('簡易庭') ||
    CIVIL_KEYWORDS_TITLE.some(kw => jtitle.includes(kw)) ||
    civilJcaseChars.some(char => jcase.includes(char) && !jcase.startsWith('刑') && !jcase.startsWith('行'))) {
    return 'civil';
  }
  // 細化行政判斷 (作為次級兜底)
  if (jcase.startsWith('行') || jcase.startsWith('訴願')) return 'administrative';
  return 'unknown';
}

/**
 * 從律師表現物件中獲取律師的立場。
 * @param {object} lawyerPerfObject - 案件來源中的 lawyerperformance 物件的單個元素。
 * @returns {string} 'plaintiff', 'defendant', 'appellant', 'appellee', 'intervenor', 'agent', 或 'unknown'。
 */
export function getSideFromPerformance(lawyerPerfObject) {
  if (lawyerPerfObject && lawyerPerfObject.side) {
    return lawyerPerfObject.side.toLowerCase(); // 直接返回原始 side，保持資訊
  }
  return 'unknown';
}

/**
 * 根據律師表現的判決文本、主案件類型和上下文獲取詳細的判決結果代碼和描述。
 * @param {string | null} perfVerdictText - 律師表現物件中的 verdict 文本。
 * @param {string} mainType - 案件主類型 ('civil', 'criminal', 'administrative')。
 * @param {object} sourceForContext - 完整的案件 _source 物件，用於上下文參考。
 * @param {object | null} lawyerPerfObject - 律師的 lawyerperformance 物件。
 * @returns {{neutralOutcomeCode: string, description: string}}
 */
export function getDetailedResult(perfVerdictText, mainType, sourceForContext = {}, lawyerPerfObject = null) {
  let isSubstantiveRuling = false;
  let neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.UNKNOWN_NEUTRAL; // 通用未知中性結果
  let description = perfVerdictText || sourceForContext.verdict || sourceForContext.verdict_type || '結果資訊不足';
  const pv = (perfVerdictText || "").toLowerCase();
  const sideFromPerf = lawyerPerfObject ? getSideFromPerformance(lawyerPerfObject) : 'unknown';

  const isRulingCase = // 是否為裁定性質
    sourceForContext.is_ruling === "是" || sourceForContext.is_ruling === true ||
    (sourceForContext.JCASE || '').toLowerCase().includes("裁") ||
    (sourceForContext.JCASE || '').toLowerCase().includes("抗") || // 抗告也是裁定
    (sourceForContext.JCASE || '').toLowerCase().includes("聲") || // 聲請通常導致裁定
    (sourceForContext.JTITLE || '').toLowerCase().includes("裁定");

  // 從 lawyerPerfObject 獲取程序性判斷
  const isProceduralByPerf = lawyerPerfObject ? (lawyerPerfObject.is_procedural === true || String(lawyerPerfObject.is_procedural).toLowerCase() === 'true') : false;

  // 第一步：檢查是否有實質性結果的裁定或判決，無論案件類型
  if (pv.includes("完全勝訴") || pv.includes("勝訴") || pv.includes("有理由") || pv.includes("准予") ||
    pv.includes("被告: 完全勝訴") || pv.includes("原告: 完全勝訴")) {
    isSubstantiveRuling = true;

    if (mainType === 'civil') {
      if (sideFromPerf === 'plaintiff') {
        neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CIVIL_P_WIN_FULL;
      } else if (sideFromPerf === 'defendant') {
        neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CIVIL_D_WIN_FULL;
      } else {
        neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.GENERIC_WIN_FULL;
      }
    } else if (mainType === 'administrative') {
      neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.ADMIN_WIN_REVOKE_FULL;
    } else {
      neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.GENERIC_WIN_FULL;
    }
  }
  else if (pv.includes("完全敗訴") || pv.includes("敗訴") || pv.includes("無理由") || pv.includes("駁回") ||
    pv.includes("被告: 完全敗訴") || pv.includes("原告: 完全敗訴")) {
    isSubstantiveRuling = true;

    if (mainType === 'civil') {
      if (sideFromPerf === 'plaintiff') {
        neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CIVIL_P_LOSE_FULL;
      } else if (sideFromPerf === 'defendant') {
        neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CIVIL_D_LOSE_FULL;
      } else {
        neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.GENERIC_LOSE_FULL;
      }
    } else if (mainType === 'administrative') {
      neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.ADMIN_LOSE_DISMISSED;
    } else {
      neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.GENERIC_LOSE_FULL;
    }
  }
  // 部分勝訴/敗訴的處理
  else if (pv.includes("部分勝訴") || pv.includes("一部勝訴")) {
    isSubstantiveRuling = true;

    if (mainType === 'civil') {
      if (sideFromPerf === 'plaintiff') {
        neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CIVIL_P_WIN_PARTIAL;
      } else {
        neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.GENERIC_WIN_PARTIAL;
      }
    } else if (mainType === 'administrative') {
      neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.ADMIN_WIN_REVOKE_PARTIAL;
    } else {
      neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.GENERIC_WIN_PARTIAL;
    }
  }

  // 第二步：如果還沒設定結果代碼，且確實是程序性案件，才標記為程序性
  if (neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.UNKNOWN_NEUTRAL &&
    (isProceduralByPerf || pv.includes("程序性裁定") || pv.includes("procedural"))) {
    neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.PROCEDURAL_NEUTRAL;
  }
  // 其他中性結果
  else if (neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.UNKNOWN_NEUTRAL) {
    if (pv.includes("和解") || pv.includes("調解成立")) {
      neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.SETTLEMENT_NEUTRAL;
    } else if (mainType === 'civil' && (pv.includes("撤回起訴") || pv.includes("撤訴"))) {
      neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CIVIL_PLAINTIFF_WITHDRAWAL;
    } else if (pv.includes("n/a") || pv.includes("未明確記載") || pv.includes("不適用")) {
      neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.NOT_APPLICABLE_OR_UNKNOWN_NEUTRAL;
    }
    // 第三步：詳細案件類型分析（只在前面未設置代碼的情況下執行）
    else if (perfVerdictText) {
      if (mainType === 'civil') {
        // 民事案件結果判斷 (基於律師角度的 perfVerdictText)
        if (pv.includes("原告: 完全勝訴")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CIVIL_P_WIN_FULL;
        else if (pv.includes("原告: 大部分勝訴")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CIVIL_P_WIN_MAJOR;
        else if (pv.includes("原告: 部分勝訴")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CIVIL_P_WIN_PARTIAL;
        else if (pv.includes("原告: 小部分勝訴")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CIVIL_P_WIN_MINOR;
        else if (pv.includes("原告: 完全敗訴")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CIVIL_P_LOSE_FULL;
        else if (pv.includes("被告: 完全勝訴")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CIVIL_D_WIN_FULL;
        else if (pv.includes("被告: 大部分減免")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CIVIL_D_MITIGATE_MAJOR;
        else if (pv.includes("被告: 部分減免")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CIVIL_D_MITIGATE_PARTIAL;
        else if (pv.includes("被告: 小部分減免")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CIVIL_D_MITIGATE_MINOR;
        else if (pv.includes("被告: 完全敗訴")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CIVIL_D_LOSE_FULL;
        else if (isRulingCase && (pv.includes("准許") || pv.includes("准予") || pv.includes("抗告有理由"))) {
          neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CIVIL_RULING_GRANTED;
          isSubstantiveRuling = true;
        }
        else if (isRulingCase && (pv.includes("駁回"))) {
          neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CIVIL_RULING_DISMISSED;
          isSubstantiveRuling = true;
        }
        // 通用勝敗 (如果律師立場不明確時的兜底)
        else if (pv.startsWith("完全勝訴")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.GENERIC_WIN_FULL;
        else if (pv.startsWith("部分勝訴")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.GENERIC_WIN_PARTIAL;
        else if (pv.startsWith("完全敗訴")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.GENERIC_LOSE_FULL;
        else neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CIVIL_UNCATEGORIZED_NEUTRAL;
      } else if (mainType === 'criminal') {
        // 刑事案件結果判斷 (通常律師是被告辯護人)
        if (pv.includes("無罪")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CRIMINAL_ACQUITTED;
        else if (pv.includes("有罪但顯著減輕") || pv.includes("刑度低於求刑50%以上")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_SIG_REDUCED;
        else if (pv.includes("有罪但略微減輕") || pv.includes("刑度低於求刑但未達50%")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_SLIGHT_REDUCED;
        else if (pv.includes("緩刑")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_PROBATION;
        else if (pv.includes("得易科罰金")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_FINE_CONVERTIBLE;
        else if (pv.includes("罰金") && !(pv.includes("有期徒刑") || pv.includes("拘役"))) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_FINE_ONLY;
        else if (pv.includes("有罪且加重")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_AGGRAVATED;
        else if (pv.includes("有罪且符合預期") || pv.includes("有罪依法量刑") || (pv.includes("有罪") && !pv.includes("減輕") && !pv.includes("緩刑"))) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_AS_EXPECTED_OR_SENTENCED;
        else if (isRulingCase && (pv.includes("准予交保") || pv.includes("停止羈押"))) {
          neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CRIMINAL_RULING_BAIL_GRANTED;
          isSubstantiveRuling = true;
        }
        else if (isRulingCase && (pv.includes("羈押") || pv.includes("駁回交保"))) {
          neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CRIMINAL_RULING_DETENTION_ORDERED;
          isSubstantiveRuling = true;
        }
        else if ((sourceForContext.verdict_type || '').toLowerCase().includes("免訴")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CRIMINAL_CHARGE_DISMISSED_NO_PROSECUTION;
        else if ((sourceForContext.verdict_type || '').toLowerCase().includes("不受理")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CRIMINAL_CHARGE_DISMISSED_NOT_ACCEPTED;
        else neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CRIMINAL_UNCATEGORIZED_NEUTRAL;
      } else if (mainType === 'administrative') {
        // 行政案件結果判斷 (通常律師是原告代理人)
        if (isRulingCase) {
          if (pv.includes("准予停止執行") || pv.includes("聲請有理由")) {
            neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.ADMIN_RULING_STAY_GRANTED;
            isSubstantiveRuling = true;
          }
          else if (pv.includes("駁回停止執行") || pv.includes("聲請無理由")) {
            neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.ADMIN_RULING_STAY_DENIED;
            isSubstantiveRuling = true;
          }
          else neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.ADMIN_RULING_UNCATEGORIZED_NEUTRAL;
        } else { // 判決
          if ((pv.includes("撤銷原處分") || pv.includes("訴願決定")) && !(pv.includes("部分") || pv.includes("一部"))) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.ADMIN_WIN_REVOKE_FULL;
          else if (pv.includes("部分撤銷原處分") || pv.includes("一部撤銷")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.ADMIN_WIN_REVOKE_PARTIAL;
          else if (pv.includes("駁回訴訟") || pv.includes("訴願駁回") || pv.includes("原告之訴駁回")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.ADMIN_LOSE_DISMISSED;
          else if (pv.includes("義務訴訟勝訴") || pv.includes("命被告應為")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.ADMIN_WIN_OBLIGATION;
          else neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.ADMIN_JUDGMENT_UNCATEGORIZED_NEUTRAL;
        }
      }
    }
    // 兜底邏輯：基於案件本身的 verdict/verdict_type
    else if (neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.UNKNOWN_NEUTRAL) {
      const generalVerdict = (sourceForContext.verdict || sourceForContext.verdict_type || "").toLowerCase();
      if (generalVerdict && generalVerdict !== '結果資訊不足' && generalVerdict !== '結果未明') {
        if (mainType === 'civil') {
          if (generalVerdict.includes("和解") || generalVerdict.includes("調解")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.SETTLEMENT_NEUTRAL;
          else if (generalVerdict.includes("全部勝訴") || generalVerdict.includes("原告勝訴") || generalVerdict.includes("被告勝訴")) {
            neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.GENERIC_WIN_FULL;
            isSubstantiveRuling = true;
          }
          else if (generalVerdict.includes("部分勝訴") || generalVerdict.includes("一部勝訴")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.GENERIC_WIN_PARTIAL;
          else if (generalVerdict.includes("敗訴") || generalVerdict.includes("駁回") || generalVerdict.includes("原告之訴駁回")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.GENERIC_LOSE_FULL;
        } else if (mainType === 'criminal') {
          if (generalVerdict.includes("無罪")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CRIMINAL_ACQUITTED;
          else if (generalVerdict.includes("緩刑")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_PROBATION;
          else if (generalVerdict.includes("有罪")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_AS_EXPECTED_OR_SENTENCED;
          else if (generalVerdict.includes("免訴")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CRIMINAL_CHARGE_DISMISSED_NO_PROSECUTION;
          else if (generalVerdict.includes("不受理")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CRIMINAL_CHARGE_DISMISSED_NOT_ACCEPTED;
        } else if (mainType === 'administrative') {
          if (generalVerdict.includes("勝訴") || generalVerdict.includes("撤銷")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.ADMIN_WIN_REVOKE_FULL;
          else if (generalVerdict.includes("敗訴") || generalVerdict.includes("駁回")) neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.ADMIN_LOSE_DISMISSED;
        }
      }
    }
  }

  // 更新 description，如果原始 perfVerdictText 為空或不足
  if (!description || description.trim() === '' || description === '結果未明' || description === '結果資訊不足') {
    description = sourceForContext.verdict || sourceForContext.verdict_type || '結果資訊不足';
    if (!description || description.trim() === '') description = '結果資訊不足';
  }

  // 最終檢查並修正 description
  if (neutralOutcomeCode.endsWith('_UNCATEGORIZED_NEUTRAL') || neutralOutcomeCode === NEUTRAL_OUTCOME_CODES.UNKNOWN_NEUTRAL) {
    if (description === '結果資訊不足' && perfVerdictText) { // 如果 perfVerdictText 有內容但未被分類
      description = perfVerdictText; // 使用原始 perfVerdictText 作為描述
    }
  }

  return {
    neutralOutcomeCode,
    description,
    isSubstantiveRuling
  };
}

/**
 * [新增函數] 根據案件的 verdict_type 和 mainType 將判決結果標準化。
 * 專為 AI 勝訴案由分析等需要從整體案件角度判斷結果的功能設計。
 * @param {string | null} verdictTypeFromES - 從 Elasticsearch _source.verdict_type 獲取的判決結果類型。
 * @param {string} mainCaseType - 案件主類型 ('civil', 'criminal', 'administrative')。
 * @returns {{neutralOutcomeCode: string, description: string, isSubstantiveOutcome: boolean}}
 */
export function getStandardizedOutcomeForAnalysis(verdictTypeFromES, mainCaseType) {
  let neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.UNKNOWN_NEUTRAL;
  let description = verdictTypeFromES || '結果資訊不足';
  let isSubstantiveOutcome = false; // 標記是否為實質性判決結果

  const vText = String(verdictTypeFromES || '').toLowerCase();

  // --- 輔助函數，簡化關鍵字檢查 ---
  const check = (keywords) => keywords.some(kw => vText.includes(kw));

  if (mainCaseType === 'civil') {
    if (check(['原告勝訴'])) {
      neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CIVIL_P_WIN_FULL;
      isSubstantiveOutcome = true;
    } else if (check(['部分勝訴部分敗訴', '一部勝訴'])) {
      neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CIVIL_P_WIN_PARTIAL;
      isSubstantiveOutcome = true;
    } else if (check(['原告敗訴'])) {
      neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CIVIL_P_LOSE_FULL;
      isSubstantiveOutcome = true;
    } else if (check(['全部駁回'])) { // "全部駁回" 在民事中通常指原告訴請被駁回
      neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CIVIL_P_LOSE_FULL;
      isSubstantiveOutcome = true;
    } else if (check(['程序駁回'])) {
      neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.PROCEDURAL_DISMISSAL_GENERIC;
    } else if (check(['管轄權移送', '移送管轄'])) {
      neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.PROCEDURAL_NEUTRAL;
    } else if (check(['上訴駁回'])) {
      //  "上訴駁回" 維持原判，其勝敗需看原審。此處若無更多資訊，歸為中性或待分析。
      //  對於 AI 勝訴分析，如果我們假設使用者是一審原告，且想知道二審是否維持勝訴，
      //  則需要知道一審結果。簡化處理：先視為對上訴方不利。
      //  或者，如果我們只分析此單一判決的直接結果，它對上訴方是敗訴。
      //  MVP 階段，我們先將其視為一個較難直接歸類的結果，除非有明確的上下文。
      neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CIVIL_UNCATEGORIZED_NEUTRAL; // 或 UNKNOWN
    } else if (check(['抗告駁回'])) {
      neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CIVIL_UNCATEGORIZED_NEUTRAL; // 同上
    } else if (check(['和解', '調解'])) {
      neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.SETTLEMENT_NEUTRAL;
    } else if (check(['撤回起訴', '撤回訴訟'])) {
      neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CIVIL_PLAINTIFF_WITHDRAWAL;
    } else if (check(['假執行宣告', '暫時處分'])) { // 假執行通常伴隨勝訴判決，但本身是程序
      neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.PROCEDURAL_NEUTRAL;
    } else if (check(['訴訟終結', '複合主文'])) {
      neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CIVIL_UNCATEGORIZED_NEUTRAL;
    } else if (check(['不明'])) {
      neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.NOT_APPLICABLE_OR_UNKNOWN_NEUTRAL;
    }
  } else if (mainCaseType === 'criminal') {
    if (check(['被告無罪'])) {
      neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CRIMINAL_ACQUITTED;
      isSubstantiveOutcome = true;
    } else if (check(['被告有罪'])) { // 這是基礎判斷
      isSubstantiveOutcome = true;
      if (check(['緩刑'])) { // 判決類型中可能不會直接寫"緩刑"，這通常是判決主文的一部分
        neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_PROBATION;
      } else if (check(['部分有罪部分無罪', '一部有罪'])) {
        neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_PARTIAL_WIN;
      } else if (check(['認罪協商判決'])) {
        neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_PROBATION; // 通常較輕
      }
      // 其他 "被告有罪" 的情況，若無更細緻的分類 (如罰金、徒刑)，則歸為一般有罪
      else {
        neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CRIMINAL_GUILTY_AS_EXPECTED_OR_SENTENCED;
      }
    } else if (check(['不受理'])) { // 刑事的不受理對被告有利
      neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CRIMINAL_CHARGE_DISMISSED_NOT_ACCEPTED;
      isSubstantiveOutcome = true;
    } else if (check(['免訴'])) {
      neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CRIMINAL_CHARGE_DISMISSED_NO_PROSECUTION;
      isSubstantiveOutcome = true;
    } else if (check(['管轄權移送', '移送管轄'])) {
      neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.PROCEDURAL_NEUTRAL;
    } else if (check(['上訴駁回'])) { // 刑事 "上訴駁回" 通常指維持有罪判決，對被告不利
      neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CRIMINAL_APPEAL_DISMISSED_AGAINST_D;
      isSubstantiveOutcome = true;
    } else if (check(['非常上訴駁回'])) {
      neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CRIMINAL_UNCATEGORIZED_NEUTRAL;
    } else if (check(['抗告駁回'])) {
      neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CRIMINAL_UNCATEGORIZED_NEUTRAL;
    } else if (check(['非常上訴成立部分撤銷並改判'])) { // 結果需視改判內容
      neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.CRIMINAL_UNCATEGORIZED_NEUTRAL;
    } else if (check(['不明'])) {
      neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.NOT_APPLICABLE_OR_UNKNOWN_NEUTRAL;
    }
  } else if (mainCaseType === 'administrative') {
    // 假設分析視角為原告/人民
    if (check(['原告勝訴', '撤銷原處分', '訴願決定撤銷'])) { // 簡化，將多個勝訴表述合併
      neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.ADMIN_WIN_REVOKE_FULL;
      isSubstantiveOutcome = true;
    } else if (check(['部分勝訴', '一部撤銷'])) {
      neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.ADMIN_WIN_REVOKE_PARTIAL;
      isSubstantiveOutcome = true;
    } else if (check(['命被告應為特定行政處分', '命作成行政處分'])) {
      neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.ADMIN_WIN_OBLIGATION;
      isSubstantiveOutcome = true;
    } else if (check(['原告敗訴', '駁回訴訟', '訴願駁回', '原告之訴駁回'])) {
      neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.ADMIN_LOSE_DISMISSED;
      isSubstantiveOutcome = true;
    } else if (check(['程序駁回'])) {
      neutralOutcomeCode = NEUTRAL_OUTCOME_CODES.PROCEDURAL_DISMISSAL_GENERIC;
    }
    // 其他行政案件的 verdict_type key 需要根據您的數據來添加
  }

  // 如果 description 仍然是初始值，且 verdictTypeFromES 有值，則使用它
  if ((description === '結果資訊不足' || !description) && verdictTypeFromES) {
    description = verdictTypeFromES;
  }
  if (!description || description.trim() === '') description = '結果資訊不足';


  return {
    neutralOutcomeCode,
    description,
    isSubstantiveOutcome // 返回是否為實質性結果
  };
}

/**
 * 填充動態篩選選項，用於律師分析頁面的篩選器。
 * @param {object} optionsTarget - 要填充的目標物件 (例如 resultData.stats.dynamicFilterOptions)。
 * @param {object} esAggregations - (可選) 從 Elasticsearch 獲取的聚合數據。
 * @param {Array<object>} allProcessedCases - 所有已處理的案件列表，每個案件應包含 mainType, cause, result。
 * @param {string} lawyerName - (可選) 律師名稱，目前未使用，但保留以備將來擴展。
 */
export function populateDynamicFilterOptions(optionsTarget, esAggregations, allProcessedCases = [], lawyerName) {
  ['civil', 'criminal', 'administrative'].forEach(mainType => {
    // 確保目標物件結構存在
    if (!optionsTarget[mainType]) {
      optionsTarget[mainType] = { causes: [], verdicts: [] };
    }

    const typeCases = allProcessedCases.filter(c => c.mainType === mainType);
    const uniqueCauses = new Set();
    const uniqueVerdicts = new Set(); // 收集處理後的案件結果描述 (c.result)

    typeCases.forEach(c => {
      if (c.cause && c.cause.trim() && c.cause !== '未指定') {
        uniqueCauses.add(c.cause.trim());
      }
      // c.result 是 getDetailedResult 返回的 description
      if (c.result && c.result.trim() && c.result !== '結果資訊不足' && c.result !== '結果未分類') {
        uniqueVerdicts.add(c.result.trim());
      }
    });
    optionsTarget[mainType].causes = Array.from(uniqueCauses).sort();
    optionsTarget[mainType].verdicts = Array.from(uniqueVerdicts).sort();
  });
  // esAggregations 和 lawyerName 目前未使用，但保留簽名以備將來擴展
}

/**
 * 生成律師優劣勢分析的文本。
 * @param {string} lawyerName - 律師名稱。
 * @param {object | null} analyzedData - (可選) 已經分析過的律師案件數據，用於未來可能的動態生成。
 * @returns {{advantages: string, cautions: string, disclaimer: string}}
 */
export function generateLawyerAnalysis(lawyerName, analyzedData = null) {
  // 對於特定律師，可以提供固定的分析模板 (如原程式碼)
  if (lawyerName === '林大明') {
    return {
      advantages: "林律師於近年積極承辦租賃契約、工程款請求及不當得利案件，對於租賃契約條款的適用與解釋、以及工程施工瑕疵舉證程序，展現出高度的法律專業與應對經驗。\n在案件策略安排上，林律師擅長透過舉證資料的精細準備，強化契約明確性的主張，並有效利用證據規則進行抗辯，於租賃及工程類型訴訟中，呈現較高的勝訴比例。\n此外，在訴訟程序中具備良好的時程掌控能力，能妥善安排證人出庭與書狀提出，對於加速訴訟進行亦有所助益。",
      cautions: "根據統計資料觀察，在侵權行為、不當得利類型案件中，林律師在舉證責任配置及因果關係主張方面，部分案件表現較為薄弱，致使部分主張未獲法院支持。\n尤其於需要高度釐清事實細節（如侵權責任、損害範圍認定）的案件中，舉證力道及證明程度可能影響最終判決結果。\n建議於此類型訴訟中，強化因果關係及損害證明之資料準備，以提升整體案件掌控度與成功率。",
      disclaimer: "本資料係依法院公開判決書自動彙整分析，僅供參考，並非對個別案件結果作出判斷。"
    };
  }

  // 通用分析模板 (如果 analyzedData 未來用於動態生成，這裡可以修改)
  // console.log(`Generating generic analysis for ${lawyerName}, analyzedData available: ${!!analyzedData}`);
  return {
    advantages: `${lawyerName}律師具有豐富的訴訟經驗，熟悉司法實務運作。從判決書的分析來看，具有良好的案件準備能力和法律論證技巧。\n在庭審過程中能夠清晰地表達法律觀點，有條理地呈現證據，使法官更容易理解當事人的主張。\n善於掌握案件的關鍵爭點，能夠有效地針對核心問題提出法律依據和事實證明。`,
    cautions: `建議在訴訟前充分評估案件的法律風險，選擇更有利的訴訟策略。\n部分複雜案件中，可考慮加強對於專業領域知識的補充說明，以便法官更全面理解案情。\n在某些判決中，證據的提出時機和證據力評估方面可以有更精準的規劃，以提高整體案件的成功率。`,
    disclaimer: "本資料係依法院公開判決書自動彙整分析，僅供參考，並非對個別案件結果作出判斷。"
  };
}