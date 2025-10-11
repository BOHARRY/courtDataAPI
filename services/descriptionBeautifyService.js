// services/descriptionBeautifyService.js

import OpenAI from 'openai';
import { OPENAI_API_KEY, OPENAI_MODEL_NAME_NANO } from '../config/environment.js';

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

/**
 * 判斷描述是否有意義
 * @param {string} description - 案件描述
 * @returns {boolean} - 是否有意義
 */
function isDescriptionMeaningful(description) {
    if (!description || description.trim().length < 5) {
        return false;
    }

    const trimmedDesc = description.trim();

    // 無意義的關鍵詞和模式
    const meaninglessPatterns = [
        /今天天氣/,
        /天氣真好/,
        /測試/,
        /test/i,
        /^[a-z]{1,5}$/i,  // 純字母且很短 (如 "wer", "abc")
        /當事人.*想要判.*有罪/,
        /原告.*想要判.*被告.*有罪/,
        /隨便/,
        /不知道/,
        /沒有/,
        /^[0-9]+$/,  // 純數字
        /^[!@#$%^&*()]+$/,  // 純符號
    ];

    // 檢查是否匹配無意義模式
    const isMatched = meaninglessPatterns.some(pattern => pattern.test(trimmedDesc));
    
    if (isMatched) {
        console.log('[DescriptionBeautify] 檢測到無意義描述:', trimmedDesc);
        return false;
    }

    return true;
}

/**
 * 構建潤飾模式的 Prompt
 */
function buildBeautifyPrompt(description, caseType, courtLevel, caseNature, stance) {
    return `你是專業的法律文書助手。請將以下案件描述潤飾成專業的法律語言:

原始描述: ${description}
案由: ${caseType || '未指定'}
法院層級: ${courtLevel || '未指定'}
案件性質: ${caseNature || '未指定'}
立場: ${stance || '未指定'}

要求:
1. 使用專業法律用語
2. 保持原意,不添加虛構事實
3. 字數控制在 100-200 字
4. 使用繁體中文
5. 格式清晰,邏輯連貫
6. 不要包含「本案」、「茲」等過於正式的開頭
7. 直接描述案件事實和爭議

請直接輸出潤飾後的描述,不要包含其他說明或前綴。`;
}

/**
 * 構建生成模式的 Prompt
 */
function buildGeneratePrompt(caseType, courtLevel, caseNature, stance) {
    const stanceText = stance === 'plaintiff' ? '原告' : stance === 'defendant' ? '被告' : '中性';
    
    return `你是專業的法律文書助手。請根據以下信息生成一個專業的案件描述範例:

案由: ${caseType || '一般民事糾紛'}
法院層級: ${courtLevel || '地方法院'}
案件性質: ${caseNature || '民事'}
立場: ${stanceText}

要求:
1. 生成一個典型的「${caseType || '一般民事糾紛'}」案件描述範例
2. 使用專業法律用語
3. 字數控制在 100-150 字
4. 使用繁體中文
5. 不要包含具體金額、日期、人名等細節 (使用「某甲」、「某乙」等代稱)
6. 描述應該符合${stanceText}的立場
7. 不要包含「本案」、「茲」等過於正式的開頭
8. 直接描述案件事實和爭議

請直接輸出案件描述範例,不要包含其他說明或前綴。`;
}

/**
 * AI 潤飾案件描述
 * @param {Object} data - 案件數據
 * @param {string} data.description - 原始描述
 * @param {string} data.caseType - 案由
 * @param {string} data.courtLevel - 法院層級
 * @param {string} data.caseNature - 案件性質
 * @param {string} data.stance - 辯護立場
 * @param {string} data.mode - 模式 (auto | beautify | generate)
 * @returns {Promise<Object>} - 潤飾結果
 */
export async function beautifyDescription(data) {
    try {
        const { description, caseType, courtLevel, caseNature, stance, mode = 'auto' } = data;

        console.log('[DescriptionBeautify] 開始處理:', {
            descriptionLength: description?.length || 0,
            caseType,
            mode
        });

        // 判斷實際使用的模式
        let actualMode = mode;
        if (mode === 'auto') {
            actualMode = isDescriptionMeaningful(description) ? 'beautify' : 'generate';
            console.log('[DescriptionBeautify] 自動判斷模式:', actualMode);
        }

        // 構建 Prompt
        const prompt = actualMode === 'beautify'
            ? buildBeautifyPrompt(description, caseType, courtLevel, caseNature, stance)
            : buildGeneratePrompt(caseType, courtLevel, caseNature, stance);

        console.log('[DescriptionBeautify] 調用 AI 模型:', OPENAI_MODEL_NAME_NANO);

        // 調用 OpenAI API (使用 nano 模型)
        const response = await openai.chat.completions.create({
            model: OPENAI_MODEL_NAME_NANO,
            messages: [
                {
                    role: 'system',
                    content: '你是專業的台灣法律文書助手,精通繁體中文法律用語。請使用專業但易懂的語言,避免過於艱澀的文言文。'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.7,  // 適度的創造性
            max_tokens: 500,   // 控制輸出長度
            top_p: 0.9,
            frequency_penalty: 0.3,  // 減少重複
            presence_penalty: 0.3    // 鼓勵多樣性
        });

        const beautifiedDescription = response.choices[0].message.content.trim();

        console.log('[DescriptionBeautify] AI 處理完成:', {
            mode: actualMode,
            originalLength: description?.length || 0,
            beautifiedLength: beautifiedDescription.length,
            tokensUsed: response.usage?.total_tokens || 0
        });

        return {
            success: true,
            originalDescription: description || '',
            beautifiedDescription,
            mode: actualMode,
            metadata: {
                model: OPENAI_MODEL_NAME_NANO,
                tokensUsed: response.usage?.total_tokens || 0,
                timestamp: new Date().toISOString()
            }
        };

    } catch (error) {
        console.error('[DescriptionBeautify] 處理失敗:', error);
        
        // 返回錯誤信息
        throw new Error(`AI 潤飾失敗: ${error.message}`);
    }
}

/**
 * 批次潤飾多個描述 (未來擴展用)
 */
export async function batchBeautifyDescriptions(descriptionsArray) {
    const results = [];
    
    for (const data of descriptionsArray) {
        try {
            const result = await beautifyDescription(data);
            results.push(result);
        } catch (error) {
            results.push({
                success: false,
                error: error.message,
                originalDescription: data.description
            });
        }
    }
    
    return results;
}

