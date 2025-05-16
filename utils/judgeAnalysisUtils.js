// utils/judgeAnalysisUtils.js

import {
    CIVIL_KEYWORDS_TITLE,
    CRIMINAL_KEYWORDS_TITLE,
    JUDGE_CENTRIC_OUTCOMES
} from './constants.js';

// 假設 determineMainCaseType, analyzeJudgeCentricOutcome, 
// initializeCaseTypeAnalysisEntry, formatCounterToPercentageArray, calculateRate
// 這些輔助函數定義在本文件的其他地方或已正確導入。
// 為了完整性，我會將它們也包含在這個程式碼塊的末尾。
/**
 * 構建 Elasticsearch 查詢 DSL，用於獲取特定法官審理的所有案件。
 * @param {string} judgeName - 法官姓名。
 * @returns {object} Elasticsearch 查詢的 query 部分。
 */
export function buildEsQueryForJudgeCases(judgeName) { // <<--- 補上函數定義並導出
    if (!judgeName || typeof judgeName !== 'string' || judgeName.trim() === '') {
        throw new Error('Judge name must be a non-empty string.');
    }
    return {
        term: {
            "judges.raw": judgeName // 確保 ES mapping 中 judges 字段有 .raw (keyword 類型)
        }
    };
}

/**
 * 從 Elasticsearch 返回的案件命中結果中聚合分析數據，生成法官的基礎統計信息。
 * @param {Array<object>} esHits - 從 Elasticsearch 查詢到的案件命中列表 (hits.hits)。
 * @param {string} judgeName - 當前分析的法官姓名。
 * @returns {object} 包含法官基礎分析數據的物件。
 */
export function aggregateJudgeCaseData(esHits, judgeName) {
    if (!Array.isArray(esHits)) {
        console.warn("[aggregateJudgeCaseData] esHits is not an array. Returning empty analytics.");
        esHits = [];
    }

    const analytics = {
        caseStats: {
            totalCases: esHits.length,
            recentCases: 0,
            caseTypes: [], // { type: string, count: number, percent: number }
        },
        verdictDistribution: [], // { result: string, count: number, percent: number } (基於原始 verdict_type)
        legalStats: {
            legalBasis: [], // { code: string, count: number }
            reasoningStrength: { high: 0, medium: 0, low: 0 }, // count
        },
        caseTypeAnalysis: { /* key 是主案件類型 (civil, criminal, administrative) */ },
        representativeCases: [],
    };

    if (esHits.length === 0) {
        ['civil', 'criminal', 'administrative', 'other'].forEach(type => {
            analytics.caseTypeAnalysis[type] = initializeCaseTypeAnalysisEntry();
        });
        return analytics;
    }

    const now = new Date();
    const threeYearsAgoDate = new Date(now.getFullYear() - 3, now.getMonth(), now.getDate());

    const caseTypeCounter = {};
    const verdictCounter = {};
    const legalBasisCounter = {};
    const reasoningStrengthCounter = { high: 0, medium: 0, low: 0 };

    ['civil', 'criminal', 'administrative', 'other'].forEach(type => {
        analytics.caseTypeAnalysis[type] = initializeCaseTypeAnalysisEntry();
    });

    esHits.forEach(hit => {
        const source = hit._source;
        if (!source) return;

        // 1. 近三年案件數 (使用 JDATE)
        if (source.JDATE && typeof source.JDATE === 'string' && source.JDATE.length === 8) {
            try {
                const year = parseInt(source.JDATE.substring(0, 4), 10);
                const month = parseInt(source.JDATE.substring(4, 6), 10) - 1; // JS 月份 0-11
                const day = parseInt(source.JDATE.substring(6, 8), 10);
                const caseDate = new Date(year, month, day);
                if (!isNaN(caseDate.getTime()) && caseDate >= threeYearsAgoDate) {
                    analytics.caseStats.recentCases++;
                }
            } catch (e) {
                console.warn(`[aggregateJudgeCaseData] Error parsing JDATE: ${source.JDATE} for JID ${source.JID || 'N/A'}`, e);
            }
        }

        // 2. 案件類型 (原始 case_type)
        if (source.case_type) {
            caseTypeCounter[source.case_type] = (caseTypeCounter[source.case_type] || 0) + 1;
        }

        // 3. 判決結果分佈 (基於原始 verdict_type)
        if (source.verdict_type) {
            verdictCounter[source.verdict_type] = (verdictCounter[source.verdict_type] || 0) + 1;
        }

        // 4. 常用法條
        if (source.legal_basis && Array.isArray(source.legal_basis)) {
            source.legal_basis.forEach(law => {
                if (typeof law === 'string' && law.trim() !== '') {
                    legalBasisCounter[law.trim()] = (legalBasisCounter[law.trim()] || 0) + 1;
                }
            });
        }

        // 5. 判決理由強度
        if (source.outcome_reasoning_strength) {
            const strength = String(source.outcome_reasoning_strength).toLowerCase();
            if (strength === '高' || strength === 'high') reasoningStrengthCounter.high++;
            else if (strength === '中' || strength === 'medium') reasoningStrengthCounter.medium++;
            else if (strength === '低' || strength === 'low') reasoningStrengthCounter.low++;
        }

        // 6. 主案件類型分析 (caseTypeAnalysis)
        const mainType = determineMainCaseType(source);
        const analysisEntry = analytics.caseTypeAnalysis[mainType];
        analysisEntry.count++;

        const judgeCentricOutcomeCode = analyzeJudgeCentricOutcome(source, mainType);
        if (judgeCentricOutcomeCode) {
            analysisEntry.outcomes[judgeCentricOutcomeCode] = (analysisEntry.outcomes[judgeCentricOutcomeCode] || 0) + 1;
        }

        if (mainType === 'civil') {
            if (source.lawyerperformance && Array.isArray(source.lawyerperformance) && source.lawyerperformance.length > 0) {
                const firstLawyerPerf = source.lawyerperformance[0];
                if (firstLawyerPerf && typeof firstLawyerPerf.claim_amount === 'number' && !isNaN(firstLawyerPerf.claim_amount)) {
                    analysisEntry.totalClaimAmount += firstLawyerPerf.claim_amount;
                    analysisEntry.claimCount++;
                }
                if (firstLawyerPerf && typeof firstLawyerPerf.granted_amount === 'number' && !isNaN(firstLawyerPerf.granted_amount)) {
                    analysisEntry.totalGrantedAmount += firstLawyerPerf.granted_amount;
                    analysisEntry.grantedCount++;
                }
            }
        }
    });

    // --- 格式化並計算百分比 ---
    analytics.caseStats.caseTypes = formatCounterToPercentageArray(caseTypeCounter, analytics.caseStats.totalCases, 5);
    analytics.verdictDistribution = formatCounterToPercentageArray(verdictCounter, analytics.caseStats.totalCases, 5);
    analytics.legalStats.legalBasis = Object.entries(legalBasisCounter)
        .sort(([, countA], [, countB]) => countB - countA)
        .slice(0, 10)
        .map(([code, count]) => ({ code, count }));
    analytics.legalStats.reasoningStrength = reasoningStrengthCounter;

    // --- 計算 caseTypeAnalysis 中各 outcome 的百分比和特定指標 ---
    Object.keys(analytics.caseTypeAnalysis).forEach(type => {
        const entry = analytics.caseTypeAnalysis[type];
        if (entry.count === 0) {
            delete analytics.caseTypeAnalysis[type];
            return;
        }

        entry.outcomeDetails = Object.entries(entry.outcomes).map(([outcomeCode, count]) => ({
            code: outcomeCode,
            // description: getOutcomeDescription(outcomeCode), // 如果需要中文描述
            count: count,
            percent: calculateRate(count, entry.count)
        })).sort((a, b) => b.count - a.count);


        if (type === 'civil') {
            entry.plaintiffClaimFullySupportedRate = calculateRate(entry.outcomes[JUDGE_CENTRIC_OUTCOMES.CIVIL_PLAINTIFF_WIN_FULL], entry.count);
            entry.plaintiffClaimPartiallySupportedRate = calculateRate(entry.outcomes[JUDGE_CENTRIC_OUTCOMES.CIVIL_PLAINTIFF_WIN_PARTIAL], entry.count);
            entry.plaintiffClaimDismissedRate = calculateRate(entry.outcomes[JUDGE_CENTRIC_OUTCOMES.CIVIL_PLAINTIFF_CLAIM_DISMISSED], entry.count);
            entry.settlementRate = calculateRate(entry.outcomes[JUDGE_CENTRIC_OUTCOMES.CIVIL_SETTLEMENT], entry.count);
            entry.withdrawalRate = calculateRate(entry.outcomes[JUDGE_CENTRIC_OUTCOMES.CIVIL_PLAINTIFF_WITHDRAWAL], entry.count);
            entry.proceduralDismissalRate = calculateRate(entry.outcomes[JUDGE_CENTRIC_OUTCOMES.CIVIL_PROCEDURAL_DISMISSAL], entry.count);

            if (entry.claimCount > 0) {
                entry.averageClaimAmount = Math.round(entry.totalClaimAmount / entry.claimCount);
            } else {
                entry.averageClaimAmount = 0;
            }
            if (entry.grantedCount > 0) {
                entry.averageGrantedAmount = Math.round(entry.totalGrantedAmount / entry.grantedCount);
            } else {
                entry.averageGrantedAmount = 0;
            }
            if (entry.totalClaimAmount > 0) { // 使用 totalClaimAmount 避免除以0
                entry.overallGrantedToClaimRatio = parseFloat(((entry.totalGrantedAmount / entry.totalClaimAmount) * 100).toFixed(1)) || 0;
            } else {
                entry.overallGrantedToClaimRatio = (entry.totalGrantedAmount > 0 ? 100.0 : 0); // 如果無請求但有判准，視為100% (需商榷)
            }

        } else if (type === 'criminal') {
            entry.acquittedRate = calculateRate(entry.outcomes[JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_ACQUITTED], entry.count);
            entry.immunityRate = calculateRate(entry.outcomes[JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_IMMUNITY], entry.count);
            entry.notAcceptedRate = calculateRate(entry.outcomes[JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_NOT_ACCEPTED], entry.count);
            entry.prosecutionDismissedRate = calculateRate(entry.outcomes[JUDGE_CENTRIC_OUTCOMES.CRIMINAL_PROSECUTION_DISMISSED], entry.count);

            entry.guiltyProbationRate = calculateRate(entry.outcomes[JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_GUILTY_PROBATION], entry.count);
            entry.guiltyFineRate = calculateRate(entry.outcomes[JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_GUILTY_FINE], entry.count);
            entry.guiltyImprisonmentRate = calculateRate(entry.outcomes[JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_GUILTY_IMPRISONMENT], entry.count);
            entry.guiltyMitigatedRate = calculateRate(entry.outcomes[JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_GUILTY_MITIGATED], entry.count);

            const totalGuiltyCount =
                (entry.outcomes[JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_GUILTY_PROBATION] || 0) +
                (entry.outcomes[JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_GUILTY_FINE] || 0) +
                (entry.outcomes[JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_GUILTY_IMPRISONMENT] || 0) +
                (entry.outcomes[JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_GUILTY_MITIGATED] || 0) +
                (entry.outcomes[JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_GUILTY_OTHER] || 0);
            entry.overallConvictionRate = calculateRate(totalGuiltyCount, entry.count);

            const substantiveCriminalCasesCount = entry.count -
                (entry.outcomes[JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_ACQUITTED] || 0) -
                (entry.outcomes[JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_IMMUNITY] || 0) -
                (entry.outcomes[JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_NOT_ACCEPTED] || 0) -
                (entry.outcomes[JUDGE_CENTRIC_OUTCOMES.CRIMINAL_PROSECUTION_DISMISSED] || 0) -
                (entry.outcomes[JUDGE_CENTRIC_OUTCOMES.CRIMINAL_PROCEDURAL] || 0) - // 假設 CRMINAL_PROCEDURAL 也是非實質有罪
                (entry.outcomes[JUDGE_CENTRIC_OUTCOMES.CRIMINAL_OTHER] || 0); // 其他也先排除

            if (substantiveCriminalCasesCount > 0) {
                entry.probationRateAmongGuilty = calculateRate(entry.outcomes[JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_GUILTY_PROBATION], substantiveCriminalCasesCount);
                entry.fineRateAmongGuilty = calculateRate(entry.outcomes[JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_GUILTY_FINE], substantiveCriminalCasesCount);
                entry.imprisonmentRateAmongGuilty = calculateRate(entry.outcomes[JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_GUILTY_IMPRISONMENT], substantiveCriminalCasesCount);
            } else {
                entry.probationRateAmongGuilty = 0;
                entry.fineRateAmongGuilty = 0;
                entry.imprisonmentRateAmongGuilty = 0;
            }

        } else if (type === 'administrative') {
            entry.plaintiffWinRevokeFullRate = calculateRate(entry.outcomes[JUDGE_CENTRIC_OUTCOMES.ADMIN_PLAINTIFF_WIN_REVOKE_FULL], entry.count);
            entry.plaintiffWinRevokePartialRate = calculateRate(entry.outcomes[JUDGE_CENTRIC_OUTCOMES.ADMIN_PLAINTIFF_WIN_REVOKE_PARTIAL], entry.count);
            entry.plaintiffWinObligationRate = calculateRate(entry.outcomes[JUDGE_CENTRIC_OUTCOMES.ADMIN_PLAINTIFF_WIN_OBLIGATION], entry.count);
            entry.plaintiffClaimDismissedRate = calculateRate(entry.outcomes[JUDGE_CENTRIC_OUTCOMES.ADMIN_PLAINTIFF_CLAIM_DISMISSED], entry.count);
            entry.settlementRate = calculateRate(entry.outcomes[JUDGE_CENTRIC_OUTCOMES.ADMIN_SETTLEMENT], entry.count);
            entry.withdrawalRate = calculateRate(entry.outcomes[JUDGE_CENTRIC_OUTCOMES.ADMIN_PLAINTIFF_WITHDRAWAL], entry.count);
            entry.proceduralDismissalRate = calculateRate(entry.outcomes[JUDGE_CENTRIC_OUTCOMES.ADMIN_PROCEDURAL_DISMISSAL], entry.count);
        }
        // 清理臨時累加變數
        delete entry.totalClaimAmount;
        delete entry.claimCount;
        delete entry.totalGrantedAmount;
        delete entry.grantedCount;
        // 可以選擇是否保留原始的 outcomes 計數器，或者只保留 outcomeDetails
        // delete entry.outcomes;
    });

    analytics.representativeCases = esHits
        .sort((a, b) => {
            const scoreDiff = (b._source.SCORE || 0) - (a._source.SCORE || 0);
            if (scoreDiff !== 0) return scoreDiff;
            const dateA = String(a._source.JDATE || '00000000');
            const dateB = String(b._source.JDATE || '00000000');
            return dateB.localeCompare(dateA);
        })
        .slice(0, 10)
        .map(hit => {
            const s = hit._source;
            return {
                id: hit._id || s.JID,
                title: s.JTITLE || `${s.court || ''} ${s.JYEAR || ''}年${s.JCASE || ''}字第${s.JNO || ''}號`,
                cause: s.case_type || s.JTITLE,
                result: s.verdict_type || s.verdict,
                year: s.JYEAR,
                date: s.JDATE, // 前端將會接收 "YYYYMMDD"
            };
        });

    console.log(`[aggregateJudgeCaseData] Successfully aggregated data for ${judgeName}.`);
    return analytics;
}


// --- 輔助函數們 ---

function initializeCaseTypeAnalysisEntry() {
    return {
        count: 0,
        outcomes: {},
        totalClaimAmount: 0,
        claimCount: 0,
        totalGrantedAmount: 0,
        grantedCount: 0,
        // 為每個主類型預先定義好 Rate 指標，初始為 0
        // 民事
        plaintiffClaimFullySupportedRate: 0,
        plaintiffClaimPartiallySupportedRate: 0,
        plaintiffClaimDismissedRate: 0,
        settlementRate: 0, // 民事和行政共用
        withdrawalRate: 0, // 民事和行政共用
        proceduralDismissalRate: 0, // 民事和行政共用
        averageClaimAmount: 0,
        averageGrantedAmount: 0,
        overallGrantedToClaimRatio: 0,
        // 刑事
        acquittedRate: 0,
        immunityRate: 0,
        notAcceptedRate: 0,
        prosecutionDismissedRate: 0,
        guiltyProbationRate: 0,
        guiltyFineRate: 0,
        guiltyImprisonmentRate: 0,
        guiltyMitigatedRate: 0,
        overallConvictionRate: 0,
        probationRateAmongGuilty: 0,
        fineRateAmongGuilty: 0,
        imprisonmentRateAmongGuilty: 0,
        // 行政
        plaintiffWinRevokeFullRate: 0,
        plaintiffWinRevokePartialRate: 0,
        plaintiffWinObligationRate: 0,
        // admin_plaintiffClaimDismissedRate, admin_settlementRate 等與民事重複的key，
        // 在計算時會根據 type 賦值，所以這裡不需要重複定義
    };
}

function determineMainCaseType(source) {
    const caseType = String(source.case_type || '').trim();
    if (caseType.startsWith('民事')) return 'civil';
    if (caseType.startsWith('刑事')) return 'criminal';
    if (caseType.startsWith('行政')) return 'administrative';

    const title = String(source.JTITLE || '').toLowerCase();
    const jcase = String(source.JCASE || '').toLowerCase();

    if (jcase.includes('刑') || jcase.includes('易') || jcase.includes('少') || jcase.includes('訴緝') || jcase.includes('交') || jcase.includes('保安') || jcase.includes('毒') || jcase.includes('懲') || jcase.includes('劾')) return 'criminal';
    if (jcase.includes('admin') || jcase.includes('訴願') || jcase.includes('公法') || jcase.includes('稅') || jcase.includes('環')) return 'administrative';
    if (jcase.includes('訴') || jcase.includes('調') || jcase.includes('家') || jcase.includes('勞') || jcase.includes('選') || jcase.includes('消') || jcase.includes('國') || jcase.includes('簡') || jcase.includes('小') || jcase.includes('執') || jcase.includes('司執') || jcase.includes('促') || jcase.includes('支付') || jcase.includes('裁') || jcase.includes('抗') || jcase.includes('再') || jcase.includes('證')) {
        if (CRIMINAL_KEYWORDS_TITLE.some(k => title.includes(k))) return 'criminal';
        return 'civil';
    }
    if (CRIMINAL_KEYWORDS_TITLE.some(k => title.includes(k))) return 'criminal';
    if (CIVIL_KEYWORDS_TITLE.some(k => title.includes(k))) return 'civil';
    return 'other';
}

function analyzeJudgeCentricOutcome(source, mainType) {
    const verdictType = String(source.verdict_type || '').toLowerCase();
    const verdict = String(source.verdict || '').toLowerCase();
    const jfull = String(source.JFULL || '').toLowerCase();
    const isRuling = source.is_ruling === "是" || String(source.JCASE || '').toLowerCase().includes("裁");

    if (isRuling) { // 簡化裁定處理，可後續細化
        // 檢查是否為駁回性質的裁定
        if (verdict.includes('駁回聲請') || verdict.includes('聲請駁回') || verdict.includes('抗告駁回')) {
            if (mainType === 'civil') return JUDGE_CENTRIC_OUTCOMES.CIVIL_PROCEDURAL_DISMISSAL;
            if (mainType === 'criminal') return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_PROCEDURAL;
            if (mainType === 'administrative') return JUDGE_CENTRIC_OUTCOMES.ADMIN_PROCEDURAL_DISMISSAL;
            return JUDGE_CENTRIC_OUTCOMES.PROCEDURAL_RULING;
        }
        // 其他多數裁定歸為程序性，除非能明確判斷其實質影響
        return JUDGE_CENTRIC_OUTCOMES.PROCEDURAL_RULING;
    }

    switch (mainType) {
        case 'civil':
            if (verdictType.includes('和解') || verdict.includes('和解') || verdictType.includes('調解') || jfull.includes('達成和解') || jfull.includes('兩造調解成立')) return JUDGE_CENTRIC_OUTCOMES.CIVIL_SETTLEMENT;
            if (verdictType.includes('撤回') || verdict.includes('原告撤回') || jfull.includes('原告撤回其訴')) return JUDGE_CENTRIC_OUTCOMES.CIVIL_PLAINTIFF_WITHDRAWAL;

            if (verdictType.includes('原告勝訴') || verdict.includes('應給付') || verdict.includes('應履行') || verdict.includes('確認建築權存在') /* 示例 */) {
                // 檢查是否有 "其餘之訴駁回" 或 "部分駁回" 等字樣來判斷是否為部分勝訴
                const isPartialWinKeywords = ['一部勝訴', '部分勝訴', '一部駁回', '部分駁回', '其餘之訴駁回', '其餘請求駁回'];
                if (isPartialWinKeywords.some(kw => verdict.includes(kw) || verdictType.includes(kw) || jfull.includes(kw))) {
                    return JUDGE_CENTRIC_OUTCOMES.CIVIL_PLAINTIFF_WIN_PARTIAL;
                }
                // 如果有金額，且判准金額小於請求金額，也傾向是部分勝訴 (如果請求金額存在且大於0)
                if (source.lawyerperformance && source.lawyerperformance[0]) {
                    const perf = source.lawyerperformance[0];
                    if (typeof perf.claim_amount === 'number' && perf.claim_amount > 0 && typeof perf.granted_amount === 'number' && perf.granted_amount < perf.claim_amount) {
                        return JUDGE_CENTRIC_OUTCOMES.CIVIL_PLAINTIFF_WIN_PARTIAL;
                    }
                }
                return JUDGE_CENTRIC_OUTCOMES.CIVIL_PLAINTIFF_WIN_FULL;
            }
            if (verdictType.includes('被告勝訴') || verdict.includes('駁回原告之訴') || verdict.includes('原告之訴駁回')) {
                if (jfull.includes('程序上不合法') || jfull.includes('訴顯無理由') || jfull.includes('未繳納裁判費') || jfull.includes('起訴不備要件')) {
                    return JUDGE_CENTRIC_OUTCOMES.CIVIL_PROCEDURAL_DISMISSAL;
                }
                return JUDGE_CENTRIC_OUTCOMES.CIVIL_PLAINTIFF_CLAIM_DISMISSED;
            }
            if (verdict.includes('程序駁回') || verdictType.includes('程序駁回')) return JUDGE_CENTRIC_OUTCOMES.CIVIL_PROCEDURAL_DISMISSAL;
            return JUDGE_CENTRIC_OUTCOMES.CIVIL_OTHER;

        case 'criminal':
            if (verdictType.includes('無罪') || verdict.includes('無罪')) return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_ACQUITTED;
            if (verdictType.includes('免訴') || verdict.includes('免訴')) return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_IMMUNITY;
            if (verdictType.includes('不受理') || verdict.includes('不受理')) return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_NOT_ACCEPTED;
            if (verdictType.includes('公訴駁回') || verdict.includes('公訴駁回') || verdictType.includes('自訴駁回')) return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_PROSECUTION_DISMISSED;

            if (verdictType.includes('有罪') || verdict.includes('處有期徒刑') || verdict.includes('處拘役') || verdict.includes('處罰金') || verdict.includes('科罰金')) {
                if (verdict.includes('緩刑')) return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_GUILTY_PROBATION;
                if ((verdict.includes('罰金') || verdictType.includes('罰金') || verdict.includes('科罰金')) && (!verdict.includes('有期徒刑') && !verdict.includes('拘役'))) {
                    return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_GUILTY_FINE;
                }
                if (jfull.includes('減輕其刑') || jfull.includes('酌減其刑') || verdict.includes('減輕')) {
                    return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_GUILTY_MITIGATED;
                }
                if (verdict.includes('有期徒刑') || verdict.includes('拘役')) {
                    return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_GUILTY_IMPRISONMENT;
                }
                return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_GUILTY_OTHER;
            }
            return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_OTHER;

        case 'administrative':
            if (verdictType.includes('和解') || verdict.includes('和解') || jfull.includes('達成和解')) return JUDGE_CENTRIC_OUTCOMES.ADMIN_SETTLEMENT;
            if (verdictType.includes('撤回') || verdict.includes('原告撤回') || jfull.includes('原告撤回其訴')) return JUDGE_CENTRIC_OUTCOMES.ADMIN_PLAINTIFF_WITHDRAWAL;

            if (verdictType.includes('原告勝訴') || verdict.includes('訴願決定撤銷') || verdict.includes('原處分應予撤銷') || verdict.includes('原處分撤銷') || verdict.includes('應為如何之處分')) {
                if (jfull.includes('部分撤銷') || jfull.includes('一部撤銷') || verdict.includes('一部撤銷') || verdict.includes('部分撤銷')) {
                    return JUDGE_CENTRIC_OUTCOMES.ADMIN_PLAINTIFF_WIN_REVOKE_PARTIAL;
                }
                if (verdict.includes('應為何種具體內容之處分') || jfull.includes('應依本判決之法律見解另為適法之處分') || verdict.includes('應作成')) {
                    return JUDGE_CENTRIC_OUTCOMES.ADMIN_PLAINTIFF_WIN_OBLIGATION;
                }
                return JUDGE_CENTRIC_OUTCOMES.ADMIN_PLAINTIFF_WIN_REVOKE_FULL;
            }
            if (verdictType.includes('原告敗訴') || verdict.includes('駁回原告之訴') || verdict.includes('訴願駁回') || verdict.includes('原告之訴駁回')) {
                if (jfull.includes('程序上不合法') || jfull.includes('訴顯無理由') || jfull.includes('起訴不合程式') || jfull.includes('不備其他要件')) {
                    return JUDGE_CENTRIC_OUTCOMES.ADMIN_PROCEDURAL_DISMISSAL;
                }
                return JUDGE_CENTRIC_OUTCOMES.ADMIN_PLAINTIFF_CLAIM_DISMISSED;
            }
            if (verdict.includes('程序駁回') || verdictType.includes('程序駁回')) return JUDGE_CENTRIC_OUTCOMES.ADMIN_PROCEDURAL_DISMISSAL;
            return JUDGE_CENTRIC_OUTCOMES.ADMIN_OTHER;

        default:
            return JUDGE_CENTRIC_OUTCOMES.UNKNOWN_OUTCOME;
    }
}

function formatCounterToPercentageArray(counter, totalCount, topN) {
    if (!totalCount || totalCount === 0) return [];
    return Object.entries(counter)
        .sort(([, countA], [, countB]) => countB - countA)
        .slice(0, topN)
        .map(([key, count]) => ({
            key,
            count,
            percent: parseFloat(((count / totalCount) * 100).toFixed(1)) || 0,
        }));
}

function calculateRate(numerator, denominator) {
    if (!denominator || denominator === 0) return 0;
    const rate = parseFloat((((numerator || 0) / denominator) * 100).toFixed(1));
    return isNaN(rate) ? 0 : rate; // 確保不會返回 NaN
}