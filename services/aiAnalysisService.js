// services/aiAnalysisService.js
import admin from 'firebase-admin';
import OpenAI from 'openai'; // 假設您使用官方 openai 庫
import { JUDGES_COLLECTION } from './judgeService.js'; // 從 judgeService 引入常數 (或直接定義)
import { OPENAI_API_KEY } from '../config/environment.js'; // <<--- 引入

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY, // <<--- 使用導入的變數
});

const MODEL_NAME = process.env.OPENAI_MODEL_NAME || 'gpt-4.1'; // 或 'gpt-3.5-turbo'

/**
 * 安全更新法官文檔，處理文檔不存在的情況
 * @param {DocumentReference} judgeDocRef - Firestore 文檔參考
 * @param {Object} data - 要更新的數據
 * @returns {Promise<boolean>} - 操作是否成功
 */
async function updateJudgeDocument(judgeDocRef, data) {
    try {
        // 先檢查文檔是否存在
        const docSnapshot = await judgeDocRef.get();

        if (docSnapshot.exists) {
            // 文檔存在，使用update
            await judgeDocRef.update(data);
            console.log(`[AIAnalysisService] 成功更新已存在的法官資料: ${judgeDocRef.id}`);
        } else {
            // 文檔不存在，使用set with merge
            await judgeDocRef.set(data, { merge: true });
            console.log(`[AIAnalysisService] 成功建立新的法官資料: ${judgeDocRef.id}`);
        }
        return true;
    } catch (error) {
        console.error(`[AIAnalysisService] 更新法官資料失敗: ${judgeDocRef.id}`, error);
        throw error; // 向上傳遞錯誤以便調用者處理
    }
}

/**
 * 解析AI回傳的特徵(traits)JSON資料
 * @param {string} responseContent - AI的原始回應內容
 * @param {string} judgeName - 法官姓名，用於記錄日誌
 * @returns {Array} - 解析出的特徵陣列
 */
function parseAIResponseToTraits(responseContent, judgeName) {
    try {
        // 先嘗試直接解析整個回應
        const parsedContent = JSON.parse(responseContent);

        // 情況1: 回應是直接的特徵陣列
        if (Array.isArray(parsedContent)) {
            if (parsedContent.length === 0) {
                console.warn(`[AIAnalysisService] AI返回了空陣列作為特徵，這可能是錯誤: ${judgeName}`);
                return [];
            }
            return validateTraits(parsedContent);
        }

        // 情況2: 回應是包含陣列的物件 (例如 {"traits": [...]} 或其他鍵)
        if (typeof parsedContent === 'object' && parsedContent !== null) {
            // 檢查是否是單個特徵物件
            if (parsedContent.text && parsedContent.icon && parsedContent.confidence) {
                return validateTraits([parsedContent]);
            }

            // 尋找可能包含特徵陣列的屬性
            for (const key of Object.keys(parsedContent)) {
                if (Array.isArray(parsedContent[key])) {
                    return validateTraits(parsedContent[key]);
                }
            }

            console.warn(`[AIAnalysisService] 無法在AI回應中找到特徵陣列: ${judgeName}`, parsedContent);
        }

        // 無法識別的格式
        console.warn(`[AIAnalysisService] AI回傳的JSON格式無法識別: ${judgeName}`, parsedContent);
        return [];

    } catch (error) {
        console.error(`[AIAnalysisService] 解析AI回應JSON失敗: ${judgeName}`, error, "\n原始內容:", responseContent);

        // 嘗試尋找可能的JSON片段 (有時模型會在JSON前後添加文字)
        try {
            const jsonMatch = responseContent.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
            if (jsonMatch) {
                console.log(`[AIAnalysisService] 嘗試解析可能的JSON片段: ${judgeName}`);
                return parseAIResponseToTraits(jsonMatch[0], judgeName);
            }
        } catch (e) {
            console.error(`[AIAnalysisService] 嘗試解析JSON片段也失敗: ${judgeName}`, e);
        }

        return [];
    }
}

/**
 * 驗證特徵格式並確保數據合法性
 * @param {Array} traits - 待驗證的特徵陣列
 * @returns {Array} - 格式正確的特徵陣列
 */
function validateTraits(traits) {
    // 過濾出格式正確的特徵
    const validTraits = traits.filter(trait =>
        trait && typeof trait === 'object' &&
        typeof trait.text === 'string' &&
        typeof trait.icon === 'string' &&
        ['高', '中', '低'].includes(trait.confidence)
    );

    if (validTraits.length < traits.length) {
        console.warn(`[AIAnalysisService] 部分特徵格式不正確，已過濾: ${traits.length} -> ${validTraits.length}`);
    }

    return validTraits;
}

/**
 * 標準化案例數據，處理各種可能的數據結構
 * @param {Object} caseData - 案例原始數據
 * @returns {Object} - 標準化後的案例數據
 */
function normalizeCase(caseData) {
    // 創建一個新物件，避免修改原始數據
    const normalized = { ...caseData };

    // 1. 處理_source層，將其合併到頂層
    if (normalized._source) {
        Object.keys(normalized._source).forEach(key => {
            if (!normalized[key]) { // 避免覆蓋已有的屬性
                normalized[key] = normalized._source[key];
            }
        });
    }

    // 2. 處理fields層
    if (normalized.fields) {
        Object.keys(normalized.fields).forEach(key => {
            // 如果頂層和_source都沒有該屬性，則從fields取
            if (!normalized[key] && normalized.fields[key]) {
                // 處理fields中的數組
                if (Array.isArray(normalized.fields[key]) && normalized.fields[key].length > 0) {
                    normalized[key] = normalized.fields[key];
                }
            }
        });
    }

    // 3. 特別處理lawyerperformance
    if (!normalized.lawyerperformance) {
        // 嘗試從各種可能路徑獲取
        if (normalized.fields && normalized.fields.lawyerperformance) {
            normalized.lawyerperformance = normalized.fields.lawyerperformance;
        } else if (normalized._source && normalized._source.lawyerperformance) {
            normalized.lawyerperformance = normalized._source.lawyerperformance;
        }
    }

    return normalized;
}

/**
 * 從案例數據中安全提取律師表現
 * @param {Object} caseData - 案例標準化後的數據
 * @returns {Array} - 律師表現數組
 */
function extractLawyerPerformance(caseData) {
    // 首先，記錄正在處理的案例
    console.log(`[AIAnalysisService] 提取律師表現 - 案例ID: ${caseData.JID || '未知'}`);

    let performances = [];
    let performanceSource = null;
    
    // 1. 檢查所有可能路徑（按優先順序）
    const possiblePaths = [
        { source: '直接', data: caseData.lawyerperformance },
        { source: '_source', data: caseData._source?.lawyerperformance },
        { source: 'fields', data: caseData.fields?.lawyerperformance }
    ];
    
    // 2. 嘗試每個路徑
    for (const path of possiblePaths) {
        if (path.data) {
            performanceSource = path.source;
            
            // 處理數組或對象
            if (Array.isArray(path.data)) {
                performances = [...path.data];
            } else if (typeof path.data === 'object') {
                performances = [path.data];
            }
            
            // 如果找到了，不再嘗試其他路徑
            if (performances.length > 0) {
                console.log(`[AIAnalysisService] 在${performanceSource}路徑找到${performances.length}個律師表現記錄`);
                break;
            }
        }
    }
    
    // 3. 特殊處理：處理雙層數組結構（fields中常見）
    if (performances.length === 1 && Array.isArray(performances[0]) && performances[0].length > 0) {
        console.log(`[AIAnalysisService] 找到雙層數組結構，進行展平`);
        performances = performances[0];
    }
    
    // 4. 處理數組內的每個元素
    if (performances.length > 0) {
        performances = performances.map(perf => {
            const normalized = {};
            
            // 處理每個屬性
            Object.keys(perf).forEach(key => {
                // 處理數組類型的屬性（常見於fields結構）
                if (Array.isArray(perf[key])) {
                    if (perf[key].length > 0) {
                        normalized[key] = perf[key][0];
                    } else {
                        normalized[key] = null;
                    }
                } else {
                    normalized[key] = perf[key];
                }
            });
            
            return normalized;
        });
        
        console.log(`[AIAnalysisService] 成功標準化${performances.length}個律師表現記錄`);
    } else {
        console.log(`[AIAnalysisService] 未找到任何律師表現記錄`);
    }
    
    return performances;
}

/**
 * 驗證裁判傾向格式並確保數據合法性
 * @param {Object} tendency - 待驗證的裁判傾向物件
 * @returns {Object|null} - 格式正確的裁判傾向物件或null
 */
function validateTendency(tendency) {
    if (!tendency || typeof tendency !== 'object') {
        return null;
    }

    // 檢查必要屬性
    if (!tendency.dimensions || !Array.isArray(tendency.dimensions) ||
        !tendency.chartData || typeof tendency.chartData !== 'object') {
        console.warn('[AIAnalysisService] 裁判傾向格式錯誤: 缺少必要屬性');
        return null;
    }

    // 檢查維度數量
    if (tendency.dimensions.length !== 6) {
        console.warn(`[AIAnalysisService] 裁判傾向維度數量錯誤: ${tendency.dimensions.length} (應為6)`);

        // 如果維度太少，可以選擇保留現有維度而不是直接返回null
        if (tendency.dimensions.length > 0) {
            console.log('[AIAnalysisService] 將使用不完整的維度數據');
        } else {
            return null;
        }
    }

    // 檢查chartData格式
    if (!Array.isArray(tendency.chartData.labels) || !Array.isArray(tendency.chartData.data)) {
        console.warn('[AIAnalysisService] 裁判傾向圖表數據格式錯誤');

        // 如果維度存在但圖表數據格式錯誤，重建圖表數據
        if (tendency.dimensions.length > 0) {
            tendency.chartData = {
                labels: tendency.dimensions.map(d => d.name),
                data: tendency.dimensions.map(d => d.score)
            };
            console.log('[AIAnalysisService] 已重建圖表數據');
        } else {
            return null;
        }
    }

    // 驗證每個維度的格式
    const validDimensions = tendency.dimensions.filter(dim =>
        dim && typeof dim === 'object' &&
        typeof dim.name === 'string' &&
        typeof dim.score === 'number' &&
        dim.score >= 1 && dim.score <= 5 &&
        typeof dim.value === 'string' &&
        typeof dim.icon === 'string' &&
        typeof dim.explanation === 'string'
    );

    if (validDimensions.length < tendency.dimensions.length) {
        console.warn(`[AIAnalysisService] 部分維度格式不正確，已過濾: ${tendency.dimensions.length} -> ${validDimensions.length}`);
        tendency.dimensions = validDimensions;

        // 如果過濾後沒有維度，返回null
        if (validDimensions.length === 0) {
            return null;
        }

        // 重建圖表數據
        tendency.chartData = {
            labels: validDimensions.map(d => d.name),
            data: validDimensions.map(d => d.score)
        };
    }

    return tendency;
}

/**
 * 異步觸發對特定法官的 AI 分析 (特徵標籤和裁判傾向)。
 * 分析完成後，結果將直接更新回 Firestore。
 * @param {string} judgeName - 法官姓名。
 * @param {Array<object>} casesData - 用於 AI 分析的案件數據列表 (通常是 ES 返回的 _source 列表)。
                                      AI 可能需要 JFULL, summary_ai, main_reasons_ai 等欄位。
 */
export async function triggerAIAnalysis(judgeName, casesData, baseAnalyticsData) {

    if (casesData.length > 0) {
        const firstCase = casesData[0];
        console.log(`[AIAnalysisService] ========= 診斷開始 =========`);
        console.log(`[AIAnalysisService] 第一個案例資料結構診斷:`);
        console.log(`- 案例ID: ${firstCase.JID || '未知'}`);
        console.log(`- 頂層鍵: ${Object.keys(firstCase).join(', ')}`);
        console.log(`- 是否有_source: ${!!firstCase._source}`);
        console.log(`- 是否有fields: ${!!firstCase.fields}`);

        // 檢查律師表現的各種可能位置
        const paths = [
            { name: '直接路徑', data: firstCase.lawyerperformance },
            { name: '_source路徑', data: firstCase._source?.lawyerperformance },
            { name: 'fields路徑', data: firstCase.fields?.lawyerperformance }
        ];

        paths.forEach(path => {
            if (path.data) {
                console.log(`- 發現律師表現於${path.name}:`);
                try {
                    const sample = JSON.stringify(path.data).substring(0, 150) + '...';
                    console.log(`  ${sample}`);
                } catch (e) {
                    console.log(`  (無法序列化)`);
                }
            } else {
                console.log(`- ${path.name}下未找到律師表現數據`);
            }
        });

        console.log(`[AIAnalysisService] ========= 診斷結束 =========`);
    }

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
                await updateJudgeDocument(judgeDocRef, {
                    traits: mockTraits,
                    tendency: mockTendency,
                    processingStatus: 'complete',
                    aiProcessedAt: admin.firestore.FieldValue.serverTimestamp(),
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
                    processingError: null, // 清除錯誤
                });
                console.log(`[AIAnalysisService] SIMULATED successful AI analysis and Firestore update for ${judgeName}.`);
            } else {
                await updateJudgeDocument(judgeDocRef, {
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
        console.log(`[AIAnalysisService] Preparing traits prompt for ${judgeName}...`);
        // --- 1. 生成法官特徵標籤 (Traits) ---
        // 準備提示詞，可能需要選取部分代表性案件的摘要或全文片段
        // 修改樣本選取策略，增加樣本量和多樣性
        const normalizedCases = casesData.map(normalizeCase);
        const sampleCasesForTraits = (() => {
            // 增加取樣數量
            const maxSamples = Math.min(casesData.length, 10); // 增加到15個

            // 如果案例數量足夠，嘗試多樣化選擇
            if (casesData.length > 20) {
                // 從不同時期選擇案例，確保多樣性
                const samples = [];
                // 取最新的5個
                samples.push(...casesData.slice(0, 5));
                // 取中間部分的5個
                const middleIndex = Math.floor(casesData.length / 2);
                samples.push(...casesData.slice(middleIndex, middleIndex + 5));
                // 取較早的5個
                samples.push(...casesData.slice(casesData.length - 5, casesData.length));
                return samples;
            }
            // 如果案例數量不足，就按順序取
            return normalizedCases.slice(0, maxSamples);

        })();
        const traitSamplesText = sampleCasesForTraits.map((c, i) => {
            try {
                let lawyerPerformanceSummary = "該案件律師表現摘要:";
                const performances = extractLawyerPerformance(c);

                if (performances.length > 0) {
                    performances.forEach((perf, idx) => {
                        const lawyer = perf.lawyer || '未知姓名';
                        const side = perf.side;
                        const sideText = side === 'plaintiff' ? '原告方' : side === 'defendant' ? '被告方' : '未知立場';
                        const comment = perf.comment || perf.verdict || '無特定評論';

                        lawyerPerformanceSummary += `  律師 ${idx + 1} (${lawyer}, ${sideText}): ${comment}\n`;
                    });
                } else {
                    lawyerPerformanceSummary += "  (無律師表現記錄或記錄格式不符)\n";
                }

                // 安全提取摘要
                const summary = c.summary_ai ||
                    (Array.isArray(c.summary_ai) ? c.summary_ai.join(' ') : null) ||
                    '(無摘要)';

                return `
        案件 ${i + 1} :
        案件摘要: ${summary}
        ${lawyerPerformanceSummary}--------------------`;
            } catch (error) {
                console.error(`[AIAnalysisService] 處理案件 ${i + 1} 摘要時出錯:`, error);
                return `
        案件 ${i + 1} :
        案件摘要: (處理此案件摘要時出錯)
        --------------------`;
            }
        }).join('\n');

        // 加入日誌確認案例數量和摘要長度
        console.log(`[AIAnalysisService] 已處理 ${sampleCasesForTraits.length} 個案件樣本，總摘要長度: ${traitSamplesText.length}`);

        const traitsPrompt = `
你是一位專業的台灣法律內容分析專家。請基於以下 ${sampleCasesForTraits.length} 份判決書的資訊，分析法官 ${judgeName} 在審理這些案件時可能展現出的主要判決特徵或審判風格。
你必須提出「至少3個，最多5個」不同判決特徵、風格標籤，**即使部分特徵置信度較低，也應嘗試推論。**

務必輸出一個 JSON 陣列，例如：
[
  {"text": "重視程序正義", "icon": "⚖️", "confidence": "高"},{"text": "判決用詞簡潔", "icon": "✍️", "confidence": "中"},{"text": "對證據要求嚴格", "icon": "🔍", "confidence": "中"}
]

"text": 一個簡潔的特徵描述 (6-10個正體中文字)
"icon": 一個對應該特徵的 emoji（單個 emoji）
"confidence": "高"、"中"、"低" 三種之一

本次需要請你判斷的判決書內容摘要如下：
${traitSamplesText}
`;
        console.log(`[AIAnalysisService] OpenAI response received for traits for ${judgeName}.`); // <<--- 確認是否執行到這裡
        console.log(`[AIAnalysisService] Traits prompt for ${judgeName} (length: ${traitsPrompt.length}):\n`, traitsPrompt.substring(0, 500) + "...");
        const traitsResponse = await openai.chat.completions.create({
            model: MODEL_NAME,
            messages: [{ role: 'user', content: traitsPrompt }],
            temperature: 0.7, // 調整溫度以獲得更具創造性的回應
            response_format: { type: "json_object" }, // 要求 JSON 輸出 (如果模型支持)
        });

        let traits = [];
        if (traitsResponse.choices && traitsResponse.choices[0] && traitsResponse.choices[0].message.content) {
            traits = parseAIResponseToTraits(traitsResponse.choices[0].message.content, judgeName);

        }
        console.log(`[AIAnalysisService] 最終生成的特徵 (${traits.length}個) for ${judgeName}:`, traits);

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
        console.log(`[AIAnalysisService] Tendency prompt constructed for ${judgeName}. Length: ${tendencyPrompt.length}. Calling OpenAI for tendency...`);
        // 這裡可以選擇使用不同的模型或參數
        console.log(`[AIAnalysisService] Tendency prompt for ${judgeName} (length: ${tendencyPrompt.length}):\n`, tendencyPrompt.substring(0, 500) + "...");

        const tendencyResponse = await openai.chat.completions.create({
            model: MODEL_NAME,
            messages: [{ role: 'user', content: tendencyPrompt }],
            temperature: 0.5,
            response_format: { type: "json_object" },
        });

        console.log(`[AIAnalysisService] OpenAI response received for tendency for ${judgeName}.`); // <<--- 確認是否執行到這

        let tendency = null;
        if (tendencyResponse.choices && tendencyResponse.choices[0] && tendencyResponse.choices[0].message.content) {
            try {
                const parsedTendency = JSON.parse(tendencyResponse.choices[0].message.content);
                tendency = validateTendency(parsedTendency);

                if (!tendency) {
                    console.warn(`[AIAnalysisService] 裁判傾向格式無效，將嘗試修復: ${judgeName}`);

                    // 嘗試從回應中提取有用的部分
                    if (parsedTendency && typeof parsedTendency === 'object') {
                        // 檢查是否有維度數據但格式錯誤
                        if (parsedTendency.dimensions && Array.isArray(parsedTendency.dimensions) && parsedTendency.dimensions.length > 0) {
                            // 嘗試構建一個有效的tendency物件
                            const validDimensions = parsedTendency.dimensions.filter(dim =>
                                dim && typeof dim === 'object' &&
                                typeof dim.name === 'string' &&
                                typeof dim.score === 'number'
                            );

                            if (validDimensions.length > 0) {
                                tendency = {
                                    dimensions: validDimensions.map(dim => ({
                                        name: dim.name,
                                        score: dim.score,
                                        value: dim.value || `${dim.score > 3 ? '偏高' : dim.score < 3 ? '偏低' : '中等'}`,
                                        icon: dim.icon || '⚖️',
                                        explanation: dim.explanation || `${dim.name}評分為${dim.score}分`
                                    })),
                                    chartData: {
                                        labels: validDimensions.map(d => d.name),
                                        data: validDimensions.map(d => d.score)
                                    },
                                    note: "此裁判傾向分析經過系統修復，僅供參考。"
                                };
                                console.log(`[AIAnalysisService] 成功修復裁判傾向數據: ${judgeName}`);
                            }
                        }
                    }
                }
            } catch (e) {
                console.error(`[AIAnalysisService] 解析裁判傾向JSON失敗: ${judgeName}`, e, "\n原始內容:", tendencyResponse.choices[0].message.content);

                // 嘗試尋找可能的JSON片段
                try {
                    const jsonMatch = tendencyResponse.choices[0].message.content.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        console.log(`[AIAnalysisService] 嘗試解析可能的JSON片段: ${judgeName}`);
                        const parsedFromMatch = JSON.parse(jsonMatch[0]);
                        tendency = validateTendency(parsedFromMatch);
                    }
                } catch (extractError) {
                    console.error(`[AIAnalysisService] 嘗試提取JSON片段也失敗: ${judgeName}`, extractError);
                }
            }
        }
        console.log(`[AIAnalysisService] 最終生成的裁判傾向 for ${judgeName}:`, tendency ? '有效' : '無效');

        // --- 3. 更新 Firestore ---
        const updateData = {
            traits: traits,
            tendency: tendency,
            processingStatus: 'complete',
            aiProcessedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(), // 同時更新 lastUpdated
            processingError: null, // 清除可能存在的舊錯誤
        };
        await updateJudgeDocument(judgeDocRef, updateData);
        console.log(`[AIAnalysisService] Successfully updated Firestore for ${judgeName} with AI results.`);

    } catch (error) {
        console.error(`[AIAnalysisService] AI analysis failed for judge ${judgeName}:`, error);
        // 記錄錯誤到 Firestore
        try {
            await updateJudgeDocument(judgeDocRef, {
                processingStatus: 'failed',
                processingError: error.message || 'Unknown AI analysis error',
                lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log(`[AIAnalysisService] Updated Firestore with FAILED status for ${judgeName}.`);
        } catch (fsError) {
            console.error(`[AIAnalysisService] Failed to update Firestore with error status for ${judgeName}:`, fsError);
        }
        // 可以選擇是否向上拋出錯誤，取決於 triggerAIAnalysis 是否需要在其調用處處理錯誤
        // throw error;
    }
}