// services/casePrecedentAnalysis/ai/promptBuilder.js

/**
 * AI 提示詞構建模組
 * 負責構建各種 AI 分析所需的提示詞
 */

/**
 * 構建策略洞察歸納的提示詞
 * @param {Array} insights - 洞察列表
 * @param {String} type - 類型 ('success' | 'risk')
 * @param {String} position - 立場 ('plaintiff' | 'defendant')
 * @returns {String} 提示詞
 */
export function buildInsightSummaryPrompt(insights, type, position) {
    const positionLabel = position === 'plaintiff' ? '原告方' : '被告方';
    const typeLabel = type === 'success' ? '成功策略' : '風險因素';

    if (type === 'success') {
        return `你是資深訴訟律師。請將以下${positionLabel}的成功策略按照語義相似性進行分類合併。

成功策略列表：
${insights.map((insight, index) => `${index + 1}. ${insight}`).join('\n')}

請按照以下規則分類：
1. 將語義相似的策略歸為同一類
2. 為每一類選擇一個簡潔明確的類別名稱，最多不超過10字
3. 類別名稱應該是**可操作的策略**，例如「充分舉證證明損害」而非「舉證問題」
4. 優先使用律師實務用語，便於律師理解和應用
5. 如果某個策略很獨特，可以單獨成類
6. 所有文字請使用繁體中文

請以純JSON格式回應，不要包含任何markdown標記或說明文字：
{
  "策略類別1": ["具體策略1", "具體策略2"],
  "策略類別2": ["具體策略3"],
  ...
}

正確示範：
{
  "充分舉證證明損害": ["提供醫療單據證明傷害", "提供鑑定報告證明因果關係"],
  "善用程序抗辯": ["主張時效抗辯成功", "主張管轄權異議成功"],
  "法律適用正確": ["正確援引民法第184條", "正確主張侵權行為構成要件"]
}

重要：只返回JSON對象，不要添加任何其他文字或格式標記。`;
    } else {
        return `你是資深訴訟律師。請將以下${positionLabel}的失敗風險因素按照語義相似性進行分類合併。

風險因素列表：
${insights.map((insight, index) => `${index + 1}. ${insight}`).join('\n')}

請按照以下規則分類：
1. 將語義相似的風險歸為同一類
2. 為每一類選擇一個簡潔明確的類別名稱，最多不超過10字
3. 類別名稱應該是**明確的風險點**，例如「舉證不足」而非「證據問題」
4. 優先使用律師實務用語，便於律師識別和規避
5. 如果某個風險很獨特，可以單獨成類
6. 所有文字請使用繁體中文

請以純JSON格式回應，不要包含任何markdown標記或說明文字：
{
  "風險類別1": ["具體風險1", "具體風險2"],
  "風險類別2": ["具體風險3"],
  ...
}

正確示範：
{
  "舉證責任未盡": ["未能證明損害存在", "未能證明因果關係"],
  "法律適用錯誤": ["錯誤援引法條", "未能證明構成要件"],
  "程序瑕疵": ["逾期提出證據", "未依法送達"]
}

重要：只返回JSON對象，不要添加任何其他文字或格式標記。`;
    }
}

/**
 * 構建判決理由合併的提示詞
 * @param {Array} reasons - 判決理由列表
 * @param {String} type - 類型 ('win' | 'lose')
 * @returns {String} 提示詞
 */
export function buildReasonMergePrompt(reasons, type) {
    const typeLabel = type === 'win' ? '勝訴' : '敗訴';
    
    return `請將以下法律判決理由按照語義相似性進行分類合併。

理由列表：
${reasons.map((reason, index) => `${index + 1}. ${reason}`).join('\n')}

請按照以下規則分類：
1. 將語義相似的理由歸為同一類
2. 為每一類選擇一個簡潔明確的類別名稱（最多15字）
3. 類別名稱應該是法律專業術語，例如「侵權行為構成要件具備」而非「侵權問題」
4. 如果某個理由很獨特，可以單獨成類
5. 所有文字請使用繁體中文

請以純JSON格式回應，不要包含任何markdown標記或說明文字：
{
  "理由類別1": ["具體理由1", "具體理由2"],
  "理由類別2": ["具體理由3"],
  ...
}

正確示範：
{
  "侵權行為構成要件具備": ["被告行為具有過失", "原告損害與被告行為有因果關係"],
  "損害賠償範圍認定": ["醫療費用合理必要", "精神慰撫金酌定適當"],
  "程序要件符合": ["起訴合法", "管轄權無誤"]
}

重要：只返回JSON對象，不要添加任何其他文字或格式標記。`;
}

/**
 * 構建異常案例分析的提示詞
 * @param {String} caseDescription - 案件描述
 * @param {Array} mainCases - 主流案例
 * @param {Array} anomalyCases - 異常案例
 * @returns {String} 提示詞
 */
export function buildAnomalyAnalysisPrompt(caseDescription, mainCases, anomalyCases) {
    return `你是一位資深的法律分析師。請分析以下案例數據，找出異常判決結果的關鍵差異因素。

用戶案件描述：
${caseDescription}

主流判決案例（${mainCases.length}件）：
${mainCases.slice(0, 3).map(c => `- ${c.title}: ${c.verdictType}`).join('\n')}

異常判決案例（${anomalyCases.length}件）：
${anomalyCases.slice(0, 3).map(c => `- ${c.title}: ${c.verdictType}`).join('\n')}

請分析並以JSON格式回應：
{
  "keyDifferences": ["差異因素1", "差異因素2"],
  "riskFactors": ["風險因素1", "風險因素2"],
  "opportunities": ["機會點1", "機會點2"],
  "strategicInsights": "整體策略建議"
}`;
}

/**
 * 構建立場導向主流判決分析的提示詞
 * @param {String} position - 立場 ('plaintiff' | 'defendant' | 'neutral')
 * @param {String} caseDescription - 案件描述
 * @param {Object} mainPattern - 主流判決模式
 * @param {Array} caseSummaries - 案例摘要
 * @returns {String} 提示詞
 */
export function buildPositionPrompt(position, caseDescription, mainPattern, caseSummaries) {
    const baseInfo = `**用戶案件描述：**
${caseDescription}

**主流判決模式：** ${mainPattern.verdict} (${mainPattern.count}件，${mainPattern.percentage}%)

**相關案例摘要：**
${caseSummaries.join('\n\n')}`;

    if (position === 'plaintiff') {
        return `${baseInfo}

**分析角度：原告方攻擊策略**

請從原告律師的角度，分析這些案例中的關鍵成功因素和風險點。請以JSON格式回應：
{
  "keyFactors": ["關鍵因素1", "關鍵因素2"],
  "successStrategies": ["成功策略1", "成功策略2"],
  "riskWarnings": ["風險警告1", "風險警告2"],
  "recommendations": "整體建議"
}`;
    } else if (position === 'defendant') {
        return `${baseInfo}

**分析角度：被告方防禦策略**

請從被告律師的角度，分析這些案例中的關鍵防禦要點和風險因素。請以JSON格式回應：
{
  "keyFactors": ["關鍵因素1", "關鍵因素2"],
  "defenseStrategies": ["防禦策略1", "防禦策略2"],
  "riskWarnings": ["風險警告1", "風險警告2"],
  "recommendations": "整體建議"
}`;
    } else {
        return `${baseInfo}

**分析角度：中立客觀分析**

請客觀分析這些案例的判決模式和關鍵因素。請以JSON格式回應：
{
  "keyFactors": ["關鍵因素1", "關鍵因素2"],
  "commonPatterns": ["常見模式1", "常見模式2"],
  "criticalIssues": ["關鍵爭點1", "關鍵爭點2"],
  "recommendations": "整體建議"
}`;
    }
}

/**
 * 構建重大判決分析的提示詞
 * @param {String} position - 立場
 * @param {String} caseDescription - 案件描述
 * @param {Object} distribution - 判決分布
 * @param {Array} caseSummaries - 案例摘要
 * @returns {String} 提示詞
 */
export function buildCriticalAnalysisPrompt(position, caseDescription, distribution, caseSummaries) {
    const positionLabel = position === 'plaintiff' ? '原告' : '被告';
    const strategyLabel = position === 'plaintiff' ? '攻擊' : '防禦';

    const baseInfo = `**用戶案件描述：**
${caseDescription}

**判決分布統計：**
${Object.entries(distribution).map(([verdict, stats]) => 
    `- ${verdict}: ${stats.count}件 (${stats.percentage}%)`
).join('\n')}

**相關案例摘要：**
${caseSummaries.join('\n\n')}`;

    return `${baseInfo}

**分析角度：${positionLabel}方${strategyLabel}策略**

請從${positionLabel}律師的專業角度，深入分析這些判決案例，提供實戰性的策略建議。

請以JSON格式回應：
{
  "criticalFactors": ["關鍵成功/失敗因素"],
  "strategicRecommendations": ["具體可操作的策略建議"],
  "riskAssessment": ["風險評估和預警"],
  "tacticalAdvice": ["戰術性建議"]
}`;
}

/**
 * 清理 AI 響應中的 markdown 標記
 * @param {String} content - AI 響應內容
 * @returns {String} 清理後的內容
 */
export function cleanMarkdownFromResponse(content) {
    let cleaned = content.trim();
    
    // 移除 ```json 標記
    if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } 
    // 移除 ``` 標記
    else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    return cleaned;
}

/**
 * 構建系統提示詞
 * @param {String} type - 分析類型
 * @returns {String} 系統提示詞
 */
export function buildSystemPrompt(type) {
    const prompts = {
        'insight_summary': '你是專業的法律分析助手，擅長將相似的法律策略和風險進行分類整理，並提供給資深律師高度判斷價值。',
        'reason_merge': '你是專業的法律分析助手，擅長將相似的判決理由進行語義分類合併。',
        'anomaly_analysis': '你是資深的法律分析師，擅長發現異常判決案例的關鍵差異因素。',
        'mainstream_analysis': '你是資深訴訟律師，擅長從實戰角度分析判決案例並提供策略建議。',
        'critical_analysis': '你是資深訴訟律師，擅長深度分析判決模式並提供具體可操作的訴訟策略。'
    };
    
    return prompts[type] || '你是專業的法律分析助手。';
}

