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
            "judges.exact": judgeName // 確保 ES mapping 中 judges 字段有 .exact (keyword 類型)
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
        latestCourtName: '未知法院', // <<--- 新增欄位並給予預設值
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

    let latestValidDate = '00000000'; // YYYYMMDD 格式，用於比較
    let courtForLatestDate = analytics.latestCourtName; // 使用預設值初始化

    esHits.forEach(hit => {
        const source = hit._source;
        if (!source) return;

        // 1. 近三年案件數 (使用 JDATE)
        if (source.JDATE && typeof source.JDATE === 'string' && source.JDATE.length === 8) {
            if (source.JDATE > latestValidDate) {
                latestValidDate = source.JDATE;
                if (source.court && typeof source.court === 'string' && source.court.trim() !== '') {
                    courtForLatestDate = source.court.trim();
                }
            }
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
        } else {
            verdictCounter['未知判決結果'] = (verdictCounter['未知判決結果'] || 0) + 1; // <<--- 兜底
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
    analytics.latestCourtName = courtForLatestDate; // 更新最新法院名稱

    // --- 格式化並計算百分比 ---
    const rawCaseTypesDistribution = formatCounterToPercentageArray(caseTypeCounter, analytics.caseStats.totalCases, 5);
    analytics.caseStats.caseTypes = rawCaseTypesDistribution.map(item => ({
        type: item.key, // <<--- 將 formatCounterToPercentageArray 返回的 'key' 映射到 'type'
        count: item.count,
        percent: item.percent
    }));
    const rawVerdictDistribution = formatCounterToPercentageArray(verdictCounter, analytics.caseStats.totalCases, 5);
    analytics.verdictDistribution = rawVerdictDistribution.map(item => ({
        result: item.key, // <<--- 將 formatCounterToPercentageArray 返回的 'key' 映射到 'result'
        count: item.count,
        percent: item.percent
    }));
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

    const sourceForRepCases = esHits;

    analytics.representativeCases = sourceForRepCases
        .sort((a, b) => { // 這個排序是為了 representativeCases 內部
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
                date: s.JDATE,
                summary_ai: s.summary_ai || '',
                main_reasons_ai: Array.isArray(s.main_reasons_ai) ? s.main_reasons_ai : [],
                lawyerperformance: Array.isArray(s.lawyerperformance) ? s.lawyerperformance : [],
                case_type: s.case_type || '',
            };
        });

    console.log(`[aggregateJudgeCaseData] 法官 ${judgeName} 最新服務法院: ${analytics.latestCourtName}`);
    // console.log("[aggregateJudgeCaseData] Final civil analysis entry:", JSON.stringify(analytics.caseTypeAnalysis.civil, null, 2));
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
    const summary = Array.isArray(source.summary_ai) ?
        source.summary_ai.join(' ').toLowerCase() :
        String(source.summary_ai || '').toLowerCase();
    const mainReasons = Array.isArray(source.main_reasons_ai) ?
        source.main_reasons_ai.map(r => String(r).toLowerCase()) : [];
    const isRuling = source.is_ruling === "是" || String(source.JCASE || '').toLowerCase().includes("裁");

    // 是否為裁定案件
    if (isRuling) {
        if (checkAnyMatch(['駁回聲請', '聲請駁回', '抗告駁回'], [verdict, summary])) {
            if (mainType === 'civil') return JUDGE_CENTRIC_OUTCOMES.CIVIL_PROCEDURAL_DISMISSAL;
            // ... 處理其他類型裁定 ...
        }
        return JUDGE_CENTRIC_OUTCOMES.PROCEDURAL_RULING;
    }

    switch (mainType) {
        case 'civil':
            // 1. 和解/調解成立
            if (checkAnyMatch([
                '和解', '調解成立', '達成和解', '兩造調解成立', '調解筆錄', '和解筆錄',
                '調解方案', '調解條件', '雙方合意', '雙方達成協議', '雙方同意'
            ], [verdict, verdictType, summary])) {
                return JUDGE_CENTRIC_OUTCOMES.CIVIL_SETTLEMENT;
            }

            // 2. 原告撤回訴訟
            if (checkAnyMatch([
                '撤回起訴', '原告撤回', '原告撤回其訴', '撤回本件訴訟', '撤回本訴',
                '聲明撤回', '撤回所提起之訴', '撤銷訴訟', '終結訴訟', '原告自行撤回',
                '同意原告撤回', '撤回訴訟'
            ], [verdict, verdictType, summary])) {
                return JUDGE_CENTRIC_OUTCOMES.CIVIL_PLAINTIFF_WITHDRAWAL;
            }

            // 3. 程序駁回 (民事)
            if (checkAnyMatch([
                '程序駁回', '程序不合法', '程序上不合法', '未繳納裁判費', '起訴不備要件',
                '欠缺當事人適格', '欠缺訴訟權能', '欠缺訴訟資格', '無當事人能力',
                '未依法繳納', '無訴訟權能', '未補正', '起訴程序不合法', '未合法送達',
                '起訴不合程式', '管轄權', '受理訴訟之權限'
            ], [verdict, verdictType, summary]) ||
                (mainReasons.some(reason => reason.includes('程序') || reason.includes('管轄')))) {
                return JUDGE_CENTRIC_OUTCOMES.CIVIL_PROCEDURAL_DISMISSAL;
            }

            // 4. 被告反訴成立
            const hasReaction = verdict.includes('反訴') || summary.includes('反訴');
            if (hasReaction && checkAnyMatch([
                '反訴有理由', '反訴成立', '被告反訴有理由', '准許被告反訴', '被告反訴請求',
                '原告應給付被告', '反訴請求有理由', '反訴部分成立', '反訴所請',
                '被告反訴請求有理由', '反訴', '被告勝訴'
            ], [verdict, verdictType, summary])) {
                return JUDGE_CENTRIC_OUTCOMES.CIVIL_DEFENDANT_COUNTERCLAIM_WIN;
            }

            // 5. 使用律師表現分析 - 優先使用這個更準確的數據源
            if (source.lawyerperformance && Array.isArray(source.lawyerperformance) && source.lawyerperformance.length > 0) {
                // 處理資料可能是陣列的情況
                const processLawyerPerformance = (perf) => {
                    const side = Array.isArray(perf.side) ? perf.side[0] : perf.side;
                    const verdictText = Array.isArray(perf.verdict) ? perf.verdict[0] : perf.verdict;

                    if (!side || !verdictText) return null;

                    // 原告代理律師分析
                    if (side.includes('plaintiff')) {
                        // 從律師表現的verdict文字直接判斷
                        if (verdictText.includes('完全勝訴') || verdictText.includes('全部勝訴')) {
                            return JUDGE_CENTRIC_OUTCOMES.CIVIL_PLAINTIFF_WIN_FULL;
                        }
                        if (verdictText.includes('部分勝訴')) {
                            return JUDGE_CENTRIC_OUTCOMES.CIVIL_PLAINTIFF_WIN_PARTIAL;
                        }
                        if (verdictText.includes('完全敗訴') || verdictText.includes('全部敗訴')) {
                            return JUDGE_CENTRIC_OUTCOMES.CIVIL_PLAINTIFF_CLAIM_DISMISSED;
                        }

                        // 使用金額比較判斷
                        const claimAmount = getNumericValue(perf.claim_amount);
                        const grantedAmount = getNumericValue(perf.granted_amount);

                        if (claimAmount > 0 && grantedAmount > 0) {
                            if (grantedAmount < claimAmount * 0.95) {
                                return JUDGE_CENTRIC_OUTCOMES.CIVIL_PLAINTIFF_WIN_PARTIAL;
                            } else {
                                return JUDGE_CENTRIC_OUTCOMES.CIVIL_PLAINTIFF_WIN_FULL;
                            }
                        }

                        // 使用百分比判斷
                        const percentage = getNumericValue(perf.percentage_awarded);
                        if (percentage > 0) {
                            if (percentage < 95) {
                                return JUDGE_CENTRIC_OUTCOMES.CIVIL_PLAINTIFF_WIN_PARTIAL;
                            } else {
                                return JUDGE_CENTRIC_OUTCOMES.CIVIL_PLAINTIFF_WIN_FULL;
                            }
                        }
                    }

                    // 被告代理律師分析
                    if (side.includes('defendant')) {
                        if (verdictText.includes('完全勝訴') || verdictText.includes('全部勝訴')) {
                            return JUDGE_CENTRIC_OUTCOMES.CIVIL_PLAINTIFF_CLAIM_DISMISSED;
                        }
                        if (verdictText.includes('部分勝訴') || verdictText.includes('部分敗訴')) {
                            return JUDGE_CENTRIC_OUTCOMES.CIVIL_PLAINTIFF_WIN_PARTIAL;
                        }
                        if (verdictText.includes('完全敗訴') || verdictText.includes('全部敗訴')) {
                            return JUDGE_CENTRIC_OUTCOMES.CIVIL_PLAINTIFF_WIN_FULL;
                        }
                    }

                    return null;
                };

                // 嘗試從每一個律師表現判斷
                for (const perf of source.lawyerperformance) {
                    const result = processLawyerPerformance(perf);
                    if (result) return result;
                }
            }

            // 6. 分析主文和摘要，判斷勝訴情況

            // 部分勝訴的明確標示
            const partialWinIndicators = [
                '原告其餘之訴駁回', '其餘之訴駁回', '原告其餘請求駁回', '其餘請求駁回',
                '其餘部分駁回', '駁回原告其餘', '部分勝訴', '一部勝訴', '一部有理由',
                '部分有理由', '部分請求有理由', '一部請求有理由', '原告部分勝訴',
                '一部駁回', '部分駁回', '逾此部分駁回', '逾此範圍駁回', '逾此金額駁回',
                '部分給付', '部分賠償', '部分返還', '原告部分請求', '其他部分駁回',
                '原告其他之訴駁回', '原告其餘之訴', '餘項駁回'
            ];

            // 勝訴跡象
            const winIndicators = [
                '被告應給付', '應給付原告', '被告應賠償', '應賠償原告', '被告應返還',
                '確認契約', '確認買賣', '確認債權', '確認債務', '確認房屋', '確認所有權',
                '確認土地', '塗銷抵押權', '變更登記', '被告應將', '被告應辦理',
                '原告勝訴', '准許原告請求', '原告請求有理由', '被告應支付', '給付原告',
                '應按月給付', '被告連帶賠償', '被告應連帶給付', '應返還原告', '應將房屋返還'
            ];

            // 敗訴跡象
            const loseIndicators = [
                '原告之訴駁回', '駁回原告之訴', '原告全部請求駁回', '原告請求駁回',
                '駁回原告請求', '全部駁回原告', '請求無理由', '請求無法律上',
                '全部請求均駁回', '訴請無理由', '訴之聲明駁回', '原告訴請全部駁回',
                '訴駁回', '所有請求均駁回', '全案駁回', '原告敗訴', '被告勝訴',
                '駁回原告訴之聲明', '駁回原告', '駁回全部請求'
            ];

            // 檢查主文分段判斷部分勝訴
            const verdictSentences = verdict.split(/[。；]/);
            let hasGrantPart = false;
            let hasDismissPart = false;

            for (const sentence of verdictSentences) {
                if (checkAnyMatch(winIndicators, [sentence])) {
                    hasGrantPart = true;
                }
                if (sentence.includes('駁回') && !sentence.includes('程序駁回')) {
                    hasDismissPart = true;
                }
            }

            // 分析摘要中的判決結果線索
            const summarySentences = summary.split(/[。；]/);
            let hasSummaryWinIndication = false;
            let hasSummaryLoseIndication = false;
            let hasSummaryPartialIndication = false;

            for (const sentence of summarySentences) {
                // 檢查摘要中是否提到判決結果
                if (sentence.includes('判決') || sentence.includes('法院認為') ||
                    sentence.includes('法院判決') || sentence.includes('判決結果')) {

                    if (checkAnyMatch(winIndicators, [sentence])) {
                        hasSummaryWinIndication = true;
                    }
                    if (checkAnyMatch(loseIndicators, [sentence])) {
                        hasSummaryLoseIndication = true;
                    }
                    if (checkAnyMatch(partialWinIndicators, [sentence])) {
                        hasSummaryPartialIndication = true;
                    }
                }
            }

            // 根據摘要判斷結果
            const hasPartialWin = checkAnyMatch(partialWinIndicators, [verdict, verdictType, summary]);
            const hasWin = checkAnyMatch(winIndicators, [verdict, verdictType, summary]) ||
                verdictType.includes('原告勝訴');
            const hasLose = checkAnyMatch(loseIndicators, [verdict, verdictType, summary]) &&
                !checkAnyMatch(['程序駁回', '程序不合法'], [verdict, verdictType, summary]);

            // 判斷順序: 部分勝訴 > 完全敗訴 > 完全勝訴
            if (hasPartialWin || (hasGrantPart && hasDismissPart) || hasSummaryPartialIndication) {
                return JUDGE_CENTRIC_OUTCOMES.CIVIL_PLAINTIFF_WIN_PARTIAL;
            }

            if (hasLose || hasSummaryLoseIndication) {
                return JUDGE_CENTRIC_OUTCOMES.CIVIL_PLAINTIFF_CLAIM_DISMISSED;
            }

            if (hasWin || hasGrantPart || hasSummaryWinIndication ||
                summary.includes('判決被告敗訴') || summary.includes('法院判決原告勝訴')) {
                return JUDGE_CENTRIC_OUTCOMES.CIVIL_PLAINTIFF_WIN_FULL;
            }

            // 7. 分析main_reasons_ai判斷結果
            if (mainReasons.some(r => r.includes('原告勝訴') || r.includes('被告敗訴'))) {
                return JUDGE_CENTRIC_OUTCOMES.CIVIL_PLAINTIFF_WIN_FULL;
            }

            if (mainReasons.some(r => r.includes('部分勝訴') || r.includes('部分請求'))) {
                return JUDGE_CENTRIC_OUTCOMES.CIVIL_PLAINTIFF_WIN_PARTIAL;
            }

            if (mainReasons.some(r => r.includes('原告敗訴') || r.includes('被告勝訴') || r.includes('駁回'))) {
                return JUDGE_CENTRIC_OUTCOMES.CIVIL_PLAINTIFF_CLAIM_DISMISSED;
            }

            // 8. 默認其他民事結果
            return JUDGE_CENTRIC_OUTCOMES.CIVIL_OTHER;

        // 刑事案件...
        case 'criminal':
            // 1. 使用律師表現分析 - 最詳細和精確的資料來源
            if (source.lawyerperformance && Array.isArray(source.lawyerperformance) && source.lawyerperformance.length > 0) {
                for (const perf of source.lawyerperformance) {
                    const side = Array.isArray(perf.side) ? perf.side[0] : perf.side;
                    const verdictText = Array.isArray(perf.verdict) ? perf.verdict[0] : String(perf.verdict || '');

                    // 不區分大小寫的比較
                    const verdictLower = verdictText.toLowerCase();

                    // 處理無罪和程序性結果
                    if (verdictLower.includes('無罪')) {
                        return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_ACQUITTED;
                    }
                    if (verdictLower.includes('免訴')) {
                        return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_IMMUNITY;
                    }
                    if (verdictLower.includes('不受理') || verdictLower.includes('案件不受理')) {
                        return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_NOT_ACCEPTED;
                    }
                    if (verdictLower.includes('公訴駁回') || verdictLower.includes('自訴駁回')) {
                        return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_PROSECUTION_DISMISSED;
                    }
                    if (verdictLower.includes('程序性裁定') || verdictLower.includes('procedural')) {
                        return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_PROCEDURAL;
                    }

                    // 處理有罪但與量刑相關的結果
                    if (verdictLower.includes('有罪')) {
                        // 緩刑判決
                        if (verdictLower.includes('緩刑')) {
                            return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_GUILTY_PROBATION;
                        }

                        // 減輕刑罰判決 - 包括顯著和略微減輕
                        if (verdictLower.includes('減輕') ||
                            verdictLower.includes('刑度低於求刑') ||
                            verdictLower.includes('罪名減輕') ||
                            verdictLower.includes('從輕量刑')) {
                            return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_GUILTY_MITIGATED;
                        }

                        // 罰金判決
                        if (verdictLower.includes('罰金') && !verdictLower.includes('徒刑') && !verdictLower.includes('拘役')) {
                            return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_GUILTY_FINE;
                        }

                        // 徒刑判決 - 包括符合預期和依法量刑
                        if (verdictLower.includes('徒刑') ||
                            verdictLower.includes('拘役') ||
                            verdictLower.includes('判刑') ||
                            verdictLower.includes('符合預期') ||
                            verdictLower.includes('刑度與求刑相當') ||
                            verdictLower.includes('依法量刑')) {
                            return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_GUILTY_IMPRISONMENT;
                        }

                        // 其他有罪情況
                        return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_GUILTY_OTHER;
                    }
                }
            }

            // 2. 無罪、免訴、不受理和公訴駁回判斷 - 使用更完整的關鍵詞列表
            const acquittalIndicators = [
                '無罪', '不構成犯罪', '未能證明被告犯罪', '未達有罪確信', '不能證明',
                '證據不足', '犯罪嫌疑不足', '未達有罪確信', '未能證明', '非犯罪行為',
                '未違反法律', '無犯罪事實', '應諭知無罪', '諭知被告無罪',
                '不能證明被告有何犯行', '不應科刑', '無罪判決'
            ];

            const immunityIndicators = [
                '免訴', '依法不得訴追', '曾經判決確定', '已逾公訴時效', '已逾訴追期間',
                '一行為不二罰', '國家不得重複處罰', '一事不再理', '一事不二罰',
                '既判力', '已判決確定', '確定判決之效力', '法定免訴', '法定免刑'
            ];

            const nonAcceptanceIndicators = [
                '不受理', '管轄錯誤', '起訴程序不合法', '非受理法院', '應由其他法院審理',
                '未具備合法要件', '程序違法', '欠缺訴訟條件', '檢察官不具備告訴權',
                '未經合法告訴', '告訴乃論', '未經被害人告訴', '非告訴權人', '告訴逾期',
                '未獲告訴人同意', '偵查未完備', '案件不受理', '聲請不受理'
            ];

            const prosecutionDismissalIndicators = [
                '公訴駁回', '自訴駁回', '檢察官起訴駁回', '檢察官起訴違法', '起訴違法',
                '起訴書未記載犯罪事實', '起訴書未法定要件', '起訴顯然違背法律規定',
                '不合法定程式', '自訴程序不合法', '非有自訴權人', '非直接被害人',
                '非偵查終結', '起訴違法', '檢察官指控未被受理'
            ];

            // 檢查並返回相應結果
            if (checkAnyMatch(acquittalIndicators, [verdict, verdictType, summary]) &&
                !checkAnyMatch(['部分無罪', '部分有罪', '犯有'], [verdict, verdictType, summary])) {
                return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_ACQUITTED;
            }

            if (checkAnyMatch(immunityIndicators, [verdict, verdictType, summary])) {
                return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_IMMUNITY;
            }

            if (checkAnyMatch(nonAcceptanceIndicators, [verdict, verdictType, summary])) {
                return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_NOT_ACCEPTED;
            }

            if (checkAnyMatch(prosecutionDismissalIndicators, [verdict, verdictType, summary])) {
                return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_PROSECUTION_DISMISSED;
            }

            // 3. 判斷有罪的各種情況 - 增強判斷邏輯
            // 檢查有罪的指標
            const guiltyIndicators = [
                '有罪', '犯有', '犯罪', '判處', '應執行', '處有期徒刑', '處拘役',
                '處罰金', '科罰金', '處刑', '宣告刑', '定應執行刑', '量處', '犯',
                '依法量刑', '有期徒刑', '拘役', '罰金', '科刑', '判刑'
            ];

            const hasGuilty = checkAnyMatch(guiltyIndicators, [verdict, verdictType, summary]) ||
                summary.includes('法院判決被告有罪') ||
                (source.verdict_type && source.verdict_type.includes('有罪'));

            if (hasGuilty) {
                // 判斷是否為緩刑
                const probationIndicators = [
                    '緩刑', '宣告緩刑', '緩期執行', '宣告二年緩刑', '宣告三年緩刑',
                    '宣告四年緩刑', '宣告五年緩刑', '宣告一年緩刑', '宣告六個月緩刑',
                    '併宣告緩刑', '緩期', '准予緩刑', '給予緩刑', '經爭取緩刑'
                ];

                if (checkAnyMatch(probationIndicators, [verdict, verdictType, summary])) {
                    return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_GUILTY_PROBATION;
                }

                // 判斷是否為減刑 - 包括顯著和略微減輕
                const mitigationIndicators = [
                    '減輕其刑', '酌減其刑', '減輕', '自首減刑', '自白減刑', '自新減刑',
                    '自首', '坦承犯行', '自白', '坦白', '減輕幅度', '減刑',
                    '自白減輕', '自首減輕', '良好表現減輕', '減刑幅度', '減輕其刑',
                    '減輕刑度', '顯著減輕', '略微減輕', '刑度低於求刑', '罪名減輕',
                    '從輕量刑', '從寬量刑', '經自首減刑', '經自首減輕'
                ];

                if (checkAnyMatch(mitigationIndicators, [verdict, verdictType, summary])) {
                    return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_GUILTY_MITIGATED;
                }

                // 判斷是否為徒刑
                const imprisonmentIndicators = [
                    '有期徒刑', '處有期徒刑', '拘役', '處拘役', '併科拘役', '入獄',
                    '執行徒刑', '應執行有期徒刑', '需服刑', '服刑', '判處徒刑',
                    '判刑', '刑度與求刑相當', '符合預期', '依法量刑', '判處有期徒刑',
                    '宣告徒刑', '執行刑', '應執行刑', '有罪判決'
                ];

                // 判斷是否為罰金
                const fineIndicators = [
                    '罰金', '科罰金', '處罰金', '罰鍰', '併科罰金', '處以罰金',
                    '罰款', '科以罰金', '科處罰金', '科處', '處以新臺幣'
                ];

                // 排除易科罰金的情況
                const easyFineIndicators = [
                    '易科罰金', '易服勞役', '易服社會勞動', '易科'
                ];

                // 同時檢查是否有徒刑和罰金
                const hasImprisonment = checkAnyMatch(imprisonmentIndicators, [verdict, verdictType, summary]);
                const hasFine = checkAnyMatch(fineIndicators, [verdict, verdictType, summary]) &&
                    !checkAnyMatch(imprisonmentIndicators, [verdict, verdictType, summary]) && // 確保沒有徒刑
                    !verdictType.includes('徒刑');  // 再次確認判決類型不包含徒刑

                // 排除易科罰金的情況
                const hasEasyFine = checkAnyMatch(easyFineIndicators, [verdict, verdictType, summary]);

                // 優先判斷徒刑
                if (hasImprisonment) {
                    return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_GUILTY_IMPRISONMENT;
                }

                // 純罰金
                if (hasFine && !hasEasyFine) {
                    return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_GUILTY_FINE;
                }

                // 其他有罪情況
                return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_GUILTY_OTHER;
            }

            // 4. 程序性刑事結果 - 擴充關鍵詞列表
            const proceduralIndicators = [
                '程序裁定', '程序判決', '管轄權', '程序不合法', '合併審理', '分離審理',
                '移送管轄', '移送', '程序要件', '程序上', '併案審理', '證據調查',
                '保全證據', '證據保全', '審判期日', '延期審理', '撤換辯護人',
                '指定辯護人', '審判長', '法官迴避', '鑑定人指定', '鑑定', '傳喚證人',
                '通緝', '拘提', '羈押', '具保', '責付', '限制住居', '搜索',
                '扣押', '勘驗', '調查證據', '簡式審判', '簡易判決', '協商程序',
                '審判不公開', '傳聞證據', '證據能力', 'procedural', '程序性裁定',
                '再開辯論', '程序性羈押延長', '犯罪嫌疑重大延長限制'
            ];

            if (checkAnyMatch(proceduralIndicators, [verdict, verdictType, summary]) ||
                isRuling) {
                return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_PROCEDURAL;
            }

            // 5. 分析摘要中的關鍵判決線索
            for (const sentence of summarySentences) {
                if (sentence.includes('判決') || sentence.includes('法院認為')) {
                    if (sentence.includes('無罪')) {
                        return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_ACQUITTED;
                    }
                    if (sentence.includes('緩刑')) {
                        return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_GUILTY_PROBATION;
                    }
                    if (sentence.includes('有期徒刑') || sentence.includes('徒刑') || sentence.includes('拘役')) {
                        return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_GUILTY_IMPRISONMENT;
                    }
                    if (sentence.includes('罰金') && !sentence.includes('徒刑') && !sentence.includes('拘役')) {
                        return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_GUILTY_FINE;
                    }
                    if (sentence.includes('減輕') || sentence.includes('減刑')) {
                        return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_GUILTY_MITIGATED;
                    }
                }
            }

            // 6. 分析main_reasons_ai尋找更多線索
            if (mainReasons.some(r => r.includes('無罪') || r.includes('未構成犯罪'))) {
                return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_ACQUITTED;
            }

            if (mainReasons.some(r => r.includes('有罪') || r.includes('犯罪成立'))) {
                if (mainReasons.some(r => r.includes('緩刑'))) {
                    return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_GUILTY_PROBATION;
                }
                if (mainReasons.some(r => r.includes('減輕') || r.includes('減刑'))) {
                    return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_GUILTY_MITIGATED;
                }
                if (mainReasons.some(r => r.includes('徒刑') || r.includes('拘役'))) {
                    return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_GUILTY_IMPRISONMENT;
                }
                if (mainReasons.some(r => r.includes('罰金'))) {
                    return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_GUILTY_FINE;
                }
                return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_DEFENDANT_GUILTY_OTHER;
            }

            // 7. 默認結果
            return JUDGE_CENTRIC_OUTCOMES.CRIMINAL_OTHER;
    }
}

// 輔助函數：檢查關鍵詞是否出現在任一文本中
function checkAnyMatch(keywords, textArray) {
    return keywords.some(keyword =>
        textArray.some(text => text && text.includes(keyword))
    );
}

// 輔助函數：獲取數值，處理數組或字符串
function getNumericValue(value) {
    if (typeof value === 'number') return value;
    if (Array.isArray(value) && value.length > 0) {
        return typeof value[0] === 'number' ? value[0] : parseFloat(String(value[0])) || 0;
    }
    return parseFloat(String(value)) || 0;
}

function formatCounterToPercentageArray(counter, totalCount, topN) {
    if (!totalCount || totalCount === 0) return [];
    return Object.entries(counter)
        .sort(([, countA], [, countB]) => countB - countA)
        .slice(0, topN)
        .map(([originalKey, count]) => ({
            key: originalKey,
            count,
            percent: parseFloat(((count / totalCount) * 100).toFixed(1)) || 0,
        }));
}

function calculateRate(numerator, denominator) {
    if (!denominator || denominator === 0) return 0;
    const rate = parseFloat((((numerator || 0) / denominator) * 100).toFixed(1));
    return isNaN(rate) ? 0 : rate; // 確保不會返回 NaN
}