// services/aiAnalysisService.js
import admin from 'firebase-admin';
import OpenAI from 'openai'; // 假設您使用官方 openai 庫
import { JUDGES_COLLECTION } from './judgeService.js'; // 從 judgeService 引入常數 (或直接定義)
import { OPENAI_API_KEY } from '../config/environment.js'; // <<--- 引入

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY, // <<--- 使用導入的變數
});

const MODEL_NAME = process.env.OPENAI_MODEL_NAME || 'gpt-4o'; // 或 'gpt-3.5-turbo'

/**
 * 異步觸發對特定法官的 AI 分析 (特徵標籤和裁判傾向)。
 * 分析完成後，結果將直接更新回 Firestore。
 * @param {string} judgeName - 法官姓名。
 * @param {Array<object>} casesData - 用於 AI 分析的案件數據列表 (通常是 ES 返回的 _source 列表)。
                                      AI 可能需要 JFULL, summary_ai, main_reasons_ai 等欄位。
 */
export async function triggerAIAnalysis(judgeName, casesData, baseAnalyticsData) {
    console.log(`[AIAnalysisService] Starting AI analysis for judge: ${judgeName} with ${casesData.length} cases.`);
    const judgeDocRef = admin.firestore().collection(JUDGES_COLLECTION || 'judges').doc(judgeName);

    // --- FOR FRONTEND TESTING - SIMULATE AI COMPLETION / FAILURE ---
    const SIMULATE_AI_FOR_TESTING = false; // 開關：設為 true 以使用模擬，設為 false 以嘗試真實 AI 調用

    if (SIMULATE_AI_FOR_TESTING) {
        console.log(`[AIAnalysisService] SIMULATING AI behavior for ${judgeName}`);
        const mockTraits = [
            { text: "審理詳盡模擬", icon: "꼼", confidence: "高" },
            { text: "重視書狀品質", icon: "✍️", confidence: "中" },
            { text: "判決說理清晰", icon: "📜", confidence: "高" },
        ];
        const mockTendency = {
            dimensions: [
                { name: "舉證要求", score: 4, value: "偏高 (模)", icon: "⚖️", explanation: "多數案件要求完整證據鏈 (模擬)" },
                { name: "程序瑕疵敏感度", score: 3, value: "中等 (模)", icon: "📜", explanation: "對程序要求相對標準 (模擬)" },
                { name: "賠償認定", score: 3, value: "中性 (模)", icon: "💰", explanation: "賠償金額認定居中 (模擬)" },
                { name: "事實認定精細度", score: 4, value: "精細 (模)", icon: "🔍", explanation: "注重案件事實細節 (模擬)" },
                { name: "認定標準穩定性", score: 4, value: "穩定 (模)", icon: "🔗", explanation: "類似案件判決標準一致 (模擬)" },
                { name: "原告傾向性", score: 3, value: "中立 (模)", icon: "⚔️", explanation: "對原被告無明顯偏好 (模擬)" },
            ],
            chartData: {
                labels: ["舉證要求", "程序瑕疵敏感度", "賠償認定", "事實認定精細度", "認定標準穩定性", "原告傾向性"],
                data: [4, 3, 3, 4, 4, 3]
            },
            note: "此為模擬 AI 分析結果，僅供測試。"
        };
        // 模擬一個隨機的延遲時間 (例如 5 到 15 秒)
        const randomDelay = Math.floor(Math.random() * 10000) + 5000;
        console.log(`[AIAnalysisService] Simulating AI processing for ${judgeName} with delay: ${randomDelay}ms`);

        await new Promise(resolve => setTimeout(resolve, randomDelay));

        const shouldSucceed = Math.random() > 0.15; // 85% 的模擬成功率

        try {
            if (shouldSucceed) {
                await judgeDocRef.update({
                    traits: mockTraits,
                    tendency: mockTendency,
                    processingStatus: 'complete',
                    aiProcessedAt: admin.firestore.FieldValue.serverTimestamp(),
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
                    processingError: null, // 清除錯誤
                });
                console.log(`[AIAnalysisService] SIMULATED successful AI analysis and Firestore update for ${judgeName}.`);
            } else {
                await judgeDocRef.update({
                    processingStatus: 'failed',
                    processingError: 'Simulated AI processing failure during test.',
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
                    // traits 和 tendency 可以不清空，或者設為空數組/null
                    traits: [],
                    tendency: null,
                });
                console.log(`[AIAnalysisService] SIMULATED failed AI analysis for ${judgeName}.`);
            }
        } catch (fsError) {
            console.error(`[AIAnalysisService] SIMULATED: Error updating Firestore for ${judgeName} after AI simulation:`, fsError);
        }
        return; // 模擬結束，直接返回
    }

    try {
        // --- 1. 生成法官特徵標籤 (Traits) ---
        // 準備提示詞，可能需要選取部分代表性案件的摘要或全文片段
        const sampleCasesForTraits = casesData.slice(0, Math.min(casesData.length, 10)); // 取前10件或更少
        const traitSamplesText = sampleCasesForTraits.map((c, i) => {
            let lawyerPerformanceSummary = "該案件律師表現摘要:\n";
            if (c.lawyerperformance && Array.isArray(c.lawyerperformance) && c.lawyerperformance.length > 0) {
                c.lawyerperformance.forEach((perf, idx) => {
                    lawyerPerformanceSummary += `  律師 ${idx + 1} (${perf.lawyer || '未知姓名'}, ${perf.side === 'plaintiff' ? '原告方' : perf.side === 'defendant' ? '被告方' : '未知立場'}): ${perf.comment || perf.verdict || '無特定評論'}\n`;
                });
            } else {
                lawyerPerformanceSummary += "  (無律師表現記錄或記錄格式不符)\n";
            }

            return `
            案件 ${i + 1} (案號/JID: ${c.JID || '未知'}):
            案件摘要: ${c.summary_ai || (c.JFULL || '').substring(0, 250)}...
            ${lawyerPerformanceSummary}--------------------`; // 分隔每個案件
        }).join('\n\n');

        const traitsPrompt = `
  你是一位專業的台灣法律內容分析專家。請基於以下 ${sampleCasesForTraits.length} 份判決書的相關資訊，分析法官 ${judgeName} 在審理這些案件時可能展現出的主要判決特徵或審判風格。
**請務必提供至少 3 個，至多 5 個最明顯的特徵標籤。** 如果難以找出多個，請嘗試從不同角度（例如，對證據的態度、對程序的重視、判決書的寫作風格、對特定類型案件的處理方式等）進行分析，以湊足至少3個標籤。每個標籤應包含：
  1.  "text": 一個簡潔的特徵描述 (6-10個正體中文字)。
  2.  "icon": 一個適合該特徵的 emoji 圖標 (單個 emoji 字符)。
  3.  "confidence": 你對此特徵判斷的置信度，分為 "高", "中", "低" 三個等級。

  判決書樣本資訊:
  ${traitSamplesText}

  思考步驟指引：
    1. 通讀所有案件摘要，找出反覆出現的行為模式或判決特點。
    2. 從不同維度思考，例如：法官對證據的要求、對程序問題的處理、對特定法律條文的偏好、判決書的語言風格、對弱勢方的態度等。
    3. 嘗試為每個識別出的特點給予一個標籤。
    4. 即使某些特徵的置信度只是“中”或“低”，如果它們是基於樣本可觀察到的，也請盡量列出，以達到至少3個標籤的目標。
    5. 最後，從所有可能的標籤中，篩選出3到5個最能代表該法官的特徵。

  請嚴格僅返回一個 JSON 格式的陣列，直接包含這些標籤物件，不要有任何額外的解釋或 Markdown 格式。例如（即使只有三個標籤也要是陣列）：
  [
    {"text": "重視程序正義", "icon": "⚖️", "confidence": "高"},
    {"text": "契約解釋嚴謹", "icon": "📜", "confidence": "中"},
    {"text": "判決簡明扼要", "icon": "✍️", "confidence": "中"}
  ]
`;
        console.log(`[AIAnalysisService] Traits prompt for ${judgeName} (length: ${traitsPrompt.length}):\n`, traitsPrompt.substring(0, 500) + "...");
        const traitsResponse = await openai.chat.completions.create({
            model: MODEL_NAME,
            messages: [{ role: 'user', content: traitsPrompt }],
            temperature: 0.3, // 較低的 temperature 使輸出更具決定性
            response_format: { type: "json_object" }, // 要求 JSON 輸出 (如果模型支持)
        });

        let traits = [];
        // 嘗試解析 AI 返回的 JSON 結果
        if (traitsResponse.choices && traitsResponse.choices[0] && traitsResponse.choices[0].message.content) {
            try {
                const parsedResult = JSON.parse(traitsResponse.choices[0].message.content);
                if (Array.isArray(parsedResult)) {
                    traits = parsedResult;
                } else if (typeof parsedResult === 'object' && parsedResult !== null) {
                    // 檢查是否是單個 trait 物件的結構
                    if (parsedResult.text && parsedResult.icon && parsedResult.confidence) {
                        traits = [parsedResult]; // 將單個物件放入陣列
                        console.log(`[AIAnalysisService] OpenAI returned a single trait object for ${judgeName}, wrapped in an array.`);
                    } else {
                        // 嘗試從常見的 key 中提取陣列 (如之前)
                        const keys = Object.keys(parsedResult);
                        if (keys.length === 1 && Array.isArray(parsedResult[keys[0]])) {
                            traits = parsedResult[keys[0]];
                        } else {
                            console.warn(`[AIAnalysisService] Traits JSON from OpenAI for ${judgeName} was an object but not the expected array or single trait structure:`, parsedResult);
                        }
                    }
                } else {
                    console.warn(`[AIAnalysisService] Traits JSON from OpenAI for ${judgeName} was not an array or expected object:`, parsedResult);
                }
            } catch (e) {
                console.error(`[AIAnalysisService] Error parsing traits JSON from OpenAI for ${judgeName}:`, e, "\nRaw content:", traitsResponse.choices[0].message.content);
            }
        }
        console.log(`[AIAnalysisService] Generated traits for ${judgeName}:`, traits);

        // --- 2. 生成裁判傾向 (Tendency) ---
        // 準備裁判傾向分析所需的統計數據 (這部分數據應由 aggregateJudgeCaseData 提供，並傳入此函數)
        const civilStats = baseAnalyticsData?.caseTypeAnalysis?.civil;
        const criminalStats = baseAnalyticsData?.caseTypeAnalysis?.criminal;
        const overallReasoningStrength = baseAnalyticsData?.legalStats?.reasoningStrength;


        const tendencyPrompt = `
你是一位資深的台灣法律數據分析師。請詳細審閱以下關於法官 ${judgeName} 的審判統計數據。
主要統計數據參考 (如果特定類型案件數量為0或數據不足，則相關比率可能為0或不適用，請綜合判斷)：

【民事案件統計】
- 原告訴請完全支持率約: ${civilStats?.plaintiffClaimFullySupportedRate !== undefined ? civilStats.plaintiffClaimFullySupportedRate : 'N/A'}%
- 原告訴請部分支持率約: ${civilStats?.plaintiffClaimPartiallySupportedRate !== undefined ? civilStats.plaintiffClaimPartiallySupportedRate : 'N/A'}%
- 原告訴請駁回(實質)率約: ${civilStats?.plaintiffClaimDismissedRate !== undefined ? civilStats.plaintiffClaimDismissedRate : 'N/A'}%
- 和解率約: ${civilStats?.settlementRate !== undefined ? civilStats.settlementRate : 'N/A'}%
- 平均判准金額與請求金額比例約: ${civilStats?.overallGrantedToClaimRatio !== undefined ? civilStats.overallGrantedToClaimRatio : 'N/A'}%

【刑事案件統計】
- 整體定罪率約: ${criminalStats?.overallConvictionRate !== undefined ? criminalStats.overallConvictionRate : 'N/A'}%
- 無罪率約: ${criminalStats?.acquittedRate !== undefined ? criminalStats.acquittedRate : 'N/A'}%
- 有罪判決中緩刑比例約: ${criminalStats?.probationRateAmongGuilty !== undefined ? criminalStats.probationRateAmongGuilty : 'N/A'}% (此為有罪判決中的比例)

【整體統計】
- 判決理由強度分佈: 高 ${overallReasoningStrength?.high || 0}件, 中 ${overallReasoningStrength?.medium || 0}件, 低 ${overallReasoningStrength?.low || 0}件

基於以上提供的統計數據，並結合你對台灣司法實務的廣泛理解，請在以下六個維度上對法官 ${judgeName} 的可能傾向進行評分。評分範圍為1至5分，5分表示該傾向非常顯著，1分表示非常不顯著。
同時，為每個維度提供一個簡短精確的解釋 (15-25個正體中文字，說明評分依據) 和一個相關的 emoji 圖標。

六個評估維度:
1.  **舉證要求** (法官對當事人證據提出標準的要求程度)
2.  **程序瑕疵敏感度** (法官對訴訟程序上微小瑕疵的容忍程度；低容忍度即高敏感度)
3.  **賠償認定** (在民事損害賠償案件中，判賠金額相對於一般標準或請求的傾向：例如保守、中等、略高)
4.  **事實認定精細度** (法官對案件事實細節的審查深入程度)
5.  **認定標準穩定性** (法官在類似案件中判決標準與理由的一致性程度)
6.  **原告傾向性** (在民事或行政訴訟中，當事實或法律適用存在模糊空間時，相較於被告/行政機關，是否略微傾向原告方)

輸出要求：
請**嚴格僅返回一個 JSON 格式的物件**。此 JSON 物件的結構必須如下：
{
  "dimensions": [
    { "name": "舉證要求", "score": /* 數字1-5 */, "value": "文字描述 (例如: 偏高/中等)", "icon": "⚖️", "explanation": "簡短解釋..." },
    { "name": "程序瑕疵敏感度", "score": /* ... */, "value": "...", "icon": "📜", "explanation": "..." },
    { "name": "賠償認定", "score": /* ... */, "value": "...", "icon": "💰", "explanation": "..." },
    { "name": "事實認定精細度", "score": /* ... */, "value": "...", "icon": "🔍", "explanation": "..." },
    { "name": "認定標準穩定性", "score": /* ... */, "value": "...", "icon": "🔗", "explanation": "..." },
    { "name": "原告傾向性", "score": /* ... */, "value": "...", "icon": "⚔️", "explanation": "..." }
  ],
  "chartData": {
    "labels": ["舉證要求", "程序瑕疵敏感度", "賠償認定", "事實認定精細度", "認定標準穩定性", "原告傾向性"],
    "data": [/* 對應的六個score數字陣列 */]
  },
  "note": "此裁判傾向分析基於提供的統計數據推估，並可能包含主觀詮釋，僅供參考，不構成任何法律建議。"
}

請確保 "value" 文字描述與 "score" 評分相對應（例如：score 1-2 對應偏低/保守/不顯著，score 3 對應中等/中立，score 4-5 對應偏高/顯著/寬鬆）。
最終輸出必須是純粹的、單一的、符合上述結構的 JSON 物件，不包含任何額外的文字、註解或 Markdown 標記。
`;
        console.log(`[AIAnalysisService] Tendency prompt for ${judgeName} (length: ${tendencyPrompt.length}):\n`, tendencyPrompt.substring(0, 500) + "...");

        const tendencyResponse = await openai.chat.completions.create({
            model: MODEL_NAME,
            messages: [{ role: 'user', content: tendencyPrompt }],
            temperature: 0.5,
            response_format: { type: "json_object" },
        });

        let tendency = null;
        if (tendencyResponse.choices && tendencyResponse.choices[0] && tendencyResponse.choices[0].message.content) {
            try {
                tendency = JSON.parse(tendencyResponse.choices[0].message.content);
                // 這裡可以加入對 tendency 結構的驗證
                if (!tendency.dimensions || !tendency.chartData || !Array.isArray(tendency.dimensions) || tendency.dimensions.length !== 6) {
                    console.warn(`[AIAnalysisService] Tendency JSON from OpenAI for ${judgeName} has incorrect structure:`, tendency);
                    tendency = null; // 結構不對則重置
                }
            } catch (e) {
                console.error(`[AIAnalysisService] Error parsing tendency JSON from OpenAI for ${judgeName}:`, e, "\nRaw content:", tendencyResponse.choices[0].message.content);
            }
        }
        console.log(`[AIAnalysisService] Generated tendency for ${judgeName}:`, tendency);

        // --- 3. 更新 Firestore ---
        const updateData = {
            traits: traits,
            tendency: tendency,
            processingStatus: 'complete',
            aiProcessedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(), // 同時更新 lastUpdated
            processingError: null, // 清除可能存在的舊錯誤
        };
        await judgeDocRef.update(updateData);
        console.log(`[AIAnalysisService] Successfully updated Firestore for ${judgeName} with AI results.`);

    } catch (error) {
        console.error(`[AIAnalysisService] AI analysis failed for judge ${judgeName}:`, error);
        // 記錄錯誤到 Firestore
        try {
            await judgeDocRef.update({
                processingStatus: 'failed',
                processingError: error.message || 'Unknown AI analysis error',
                lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            });
        } catch (fsError) {
            console.error(`[AIAnalysisService] Failed to update Firestore with error status for ${judgeName}:`, fsError);
        }
        // 可以選擇是否向上拋出錯誤，取決於 triggerAIAnalysis 是否需要在其調用處處理錯誤
        // throw error;
    }
}