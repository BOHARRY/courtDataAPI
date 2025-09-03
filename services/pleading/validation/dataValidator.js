// services/pleading/validation/dataValidator.js

/**
 * 🎯 數據驗證模組
 * 負責驗證訴狀生成所需的數據完整性
 */

/**
 * 檢查可用資訊，避免AI瞎掰
 */
export function validateAvailableData(pleadingData) {
    const { caseInfo, claims, laws, evidence } = pleadingData;

    return {
        // 基本資訊檢查
        hasBasicInfo: !!(caseInfo?.caseType && caseInfo?.description),
        hasAmount: !!(caseInfo?.amount || claims?.some(c => c.amount)),
        hasSpecificDates: !!(caseInfo?.keyDates || caseInfo?.contractDate),
        hasCompleteParties: !!(caseInfo?.plaintiff && caseInfo?.defendant),
        hasCaseNumber: !!(caseInfo?.caseNumber),
        hasCourtInfo: !!(caseInfo?.court || caseInfo?.courtLevel),

        // 內容檢查
        hasClaims: !!(claims && claims.length > 0),
        hasLaws: !!(laws && laws.length > 0),
        hasEvidence: !!(evidence && evidence.length > 0),

        // 詳細計數
        claimsCount: claims?.length || 0,
        lawsCount: laws?.length || 0,
        evidenceCount: evidence?.length || 0
    };
}

/**
 * 創建資訊限制說明文本
 */
export function createInfoLimitationText(availableInfo) {
    const limitations = [];

    limitations.push(`- 案件基本資訊：${availableInfo.hasBasicInfo ? '已提供' : '部分缺失'}`);
    limitations.push(`- 具體金額：${availableInfo.hasAmount ? '已提供' : '未提供，請用○○元'}`);
    limitations.push(`- 關鍵日期：${availableInfo.hasSpecificDates ? '已提供' : '未提供，請用○年○月○日'}`);
    limitations.push(`- 當事人完整資料：${availableInfo.hasCompleteParties ? '已提供' : '部分缺失，請適當略過'}`);
    limitations.push(`- 法院案號：${availableInfo.hasCaseNumber ? '已提供' : '未提供，請用（案號：尚未立案）'}`);
    limitations.push(`- 法院資訊：${availableInfo.hasCourtInfo ? '已提供' : '未提供，請用○○地方法院'}`);
    limitations.push(`- 法律主張：${availableInfo.hasClaims ? `已提供${availableInfo.claimsCount}項` : '未提供'}`);
    limitations.push(`- 法條依據：${availableInfo.hasLaws ? `已提供${availableInfo.lawsCount}條` : '未提供'}`);
    limitations.push(`- 證據材料：${availableInfo.hasEvidence ? `已提供${availableInfo.evidenceCount}項` : '未提供'}`);

    return limitations.join('\n');
}

/**
 * 創建法條白名單
 */
export function createLawWhitelist(laws) {
    if (!laws || laws.length === 0) {
        return '無提供法條';
    }
    
    return laws.map(law => 
        law.articleNumber || law.title || law.content?.substring(0, 20)
    ).join('、');
}

/**
 * 組裝案件資料文本
 */
export function assembleCaseDataText(pleadingData) {
    const { caseInfo, claims, laws, evidence, disputes } = pleadingData;
    let caseDataText = '';
    
    // 案件基本信息
    if (caseInfo) {
        caseDataText += `【案件基本資訊】\n`;
        caseDataText += `案由：${caseInfo.caseType || '未指定'}\n`;
        caseDataText += `法院層級：${caseInfo.courtLevel || '未指定'}\n`;
        caseDataText += `案件性質：${caseInfo.caseNature || '未指定'}\n`;
        caseDataText += `當事人立場：${caseInfo.stance || '未指定'}\n`;
        caseDataText += `案件描述：${caseInfo.description || '未提供'}\n\n`;
    }
    
    // 法律主張
    if (claims && claims.length > 0) {
        caseDataText += `【法律主張】\n`;
        claims.forEach((claim, index) => {
            caseDataText += `${index + 1}. ${claim.content || claim.claimContent || '無內容'}\n`;
            if (claim.legalBasis) {
                caseDataText += `   法律依據：${claim.legalBasis}\n`;
            }
            if (claim.factualBasis) {
                caseDataText += `   事實依據：${claim.factualBasis}\n`;
            }
        });
        caseDataText += '\n';
    }
    
    // 法條依據
    if (laws && laws.length > 0) {
        caseDataText += `【法條依據】\n`;
        laws.forEach((law, index) => {
            caseDataText += `${index + 1}. ${law.title || '法條'}\n`;
            caseDataText += `   內容：${law.content || '無內容'}\n`;
        });
        caseDataText += '\n';
    }
    
    // 證據材料
    if (evidence && evidence.length > 0) {
        caseDataText += `【證據材料】\n`;
        evidence.forEach((item, index) => {
            caseDataText += `${index + 1}. ${item.content || '無內容'}\n`;
            if (item.evidenceType) {
                caseDataText += `   證據類型：${item.evidenceType}\n`;
            }
        });
        caseDataText += '\n';
    }
    
    // 爭點內容（如果有）
    if (disputes && disputes.length > 0) {
        caseDataText += `【爭點內容】\n`;
        disputes.forEach((dispute, index) => {
            caseDataText += `${index + 1}. ${dispute.content || dispute.disputeContent || '無內容'}\n`;
        });
        caseDataText += '\n';
    }
    
    return caseDataText;
}
