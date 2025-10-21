// services/caseNumberParser.js
/**
 * 案號智能解析服務
 * 使用 GPT-4.1-nano 智能解析台灣判決書案號，並生成最優的 Elasticsearch 查詢
 */

import { OpenAI } from 'openai';
import { OPENAI_API_KEY, OPENAI_MODEL_NAME_NANO } from '../config/environment.js';

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

/**
 * 前端預檢：快速判斷輸入是否可能是案號
 * 使用正則表達式進行快速檢測，避免不必要的 AI 調用
 * 
 * @param {string} input - 用戶輸入
 * @returns {boolean} - 是否可能是案號
 */
export function mightBeCaseNumber(input) {
    if (!input || typeof input !== 'string') {
        return false;
    }

    const trimmed = input.trim();
    
    // 太短或太長都不太可能是案號
    if (trimmed.length < 5 || trimmed.length > 100) {
        return false;
    }

    // 案號特徵模式
    const patterns = [
        // 完整 JID 格式: STEV,113,店簡,120,20250528,2
        /^[A-Z]{2,6},\d{2,4},.+,\d+,\d{8},\d+$/,

        // 標準格式: 113年度店簡字第120號 或 113年店簡字第120號（支持空格）
        /\d{2,4}\s*年\s*(度)?\s*[\u4e00-\u9fa5]{1,6}\s*字\s*第\s*\d+\s*號/,

        // 簡化格式: 114台上123字號 或 台上123號（支持空格）
        /(\d{2,4})?\s*[\u4e00-\u9fa5]{2,6}\s*\d+\s*字?\s*號?/,

        // 包含法院名稱: 最高法院109年台上字第2908號（支持空格）
        /[\u4e00-\u9fa5]+法院\s*\d{2,4}\s*年\s*[\u4e00-\u9fa5]+\s*字\s*第\s*\d+\s*號/,

        // 包含「年」和「字」和「號」的組合（支持空格）
        /\d{2,4}\s*年.*字.*\d+\s*號/,

        // 包含逗號分隔的格式（可能是 JID）
        /^[A-Z]+,.*,.*,/,
    ];

    const matched = patterns.some(pattern => pattern.test(trimmed));
    
    if (matched) {
        console.log(`[CaseNumberParser] 預檢通過: "${trimmed}" 可能是案號`);
    }
    
    return matched;
}

/**
 * 使用 GPT-4.1-nano 智能解析案號
 * 
 * @param {string} userInput - 用戶輸入的原始字串
 * @returns {Promise<Object>} - 解析結果
 */
export async function parseCaseNumber(userInput) {
    try {
        console.log(`[CaseNumberParser] 使用 GPT-4.1-nano 解析案號: "${userInput}"`);
        
        const prompt = `你是台灣法律案號解析專家。請分析以下用戶輸入，判斷是否為判決書案號，並提取結構化信息。

**台灣判決書案號格式說明**：
1. 完整 JID 格式：STEV,113,店簡,120,20250528,2（法院代碼,年度,案件類型,案號,日期,版本）
2. 標準格式：113年度店簡字第120號 或 113年店簡字第120號
3. 簡化格式：114台上123字號 或 台上123號
4. 完整描述：最高法院109年台上字第2908號判決

**用戶輸入**：「${userInput}」

**請分析並以 JSON 格式回應**：
{
  "isCaseNumber": true/false,
  "confidence": 0.0-1.0,
  "format": "jid" | "standard" | "simplified" | "partial" | "unknown",
  "normalized": {
    "jid": "完整JID（如果輸入就是JID格式）",
    "year": "年度（例如：113）",
    "caseType": "案件類型（例如：店簡、台上）",
    "number": "案號（例如：120）",
    "court": "法院名稱（如果有提及）"
  },
  "esQuery": {
    "queryType": "term" | "bool_must" | "bool_should",
    "query": {}
  }
}

**esQuery 生成規則**：
1. 如果是完整 JID，使用：{ "queryType": "term", "query": { "term": { "JID": "完整JID" } } }
2. 如果有年度+案件類型+案號，使用：{ "queryType": "bool_must", "query": { "bool": { "must": [{"term": {"JYEAR": "年度"}}, {"term": {"JCASE": "案件類型"}}, {"term": {"JNO": "案號"}}] } } }
3. 如果只有部分信息，使用：{ "queryType": "bool_should", "query": { "bool": { "should": [...], "minimum_should_match": 1 } } }

**注意事項**：
- 全形數字轉半形（例如：１１３ → 113）
- 移除多餘空格
- 處理常見簡稱（例如：台上 = 台上、臺上）
- 「年度」兩字可有可無
- 如果信心度低於 0.7，設置 isCaseNumber 為 false

**重要**：請確保回應是有效的 JSON 格式，不要包含任何其他文字。`;

        const response = await openai.chat.completions.create({
            model: OPENAI_MODEL_NAME_NANO,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,  // 低溫度確保一致性
            max_tokens: 500,
            response_format: { type: "json_object" }
        });

        const parsed = JSON.parse(response.choices[0].message.content);
        console.log(`[CaseNumberParser] 解析結果:`, JSON.stringify(parsed, null, 2));
        
        return parsed;
        
    } catch (error) {
        console.error('[CaseNumberParser] AI 解析失敗:', error);
        // 返回失敗結果，不中斷搜索流程
        return {
            isCaseNumber: false,
            confidence: 0,
            format: 'unknown',
            error: error.message
        };
    }
}

/**
 * 從 AI 解析結果構建 Elasticsearch 查詢
 * 
 * @param {Object} parseResult - AI 解析結果
 * @returns {Object|null} - Elasticsearch 查詢對象，如果不是案號則返回 null
 */
export function buildCaseNumberQuery(parseResult) {
    // 如果不是案號或信心度太低，返回 null
    if (!parseResult.isCaseNumber || parseResult.confidence < 0.7) {
        console.log(`[CaseNumberParser] 不是案號或信心度不足 (${parseResult.confidence})，使用通用查詢`);
        return null;
    }

    // 如果 AI 已經生成了查詢，直接使用
    if (parseResult.esQuery && parseResult.esQuery.query) {
        console.log(`[CaseNumberParser] 使用 AI 生成的查詢:`, JSON.stringify(parseResult.esQuery.query, null, 2));
        return parseResult.esQuery.query;
    }

    // 備用方案：根據 normalized 數據手動構建查詢
    const { normalized } = parseResult;
    
    // 方案 1: 完整 JID
    if (normalized.jid) {
        return {
            term: { "JID": normalized.jid }
        };
    }
    
    // 方案 2: 年度 + 案件類型 + 案號
    if (normalized.year && normalized.caseType && normalized.number) {
        return {
            bool: {
                must: [
                    { term: { "JYEAR": normalized.year } },
                    { term: { "JCASE": normalized.caseType } },
                    { term: { "JNO": normalized.number } }
                ]
            }
        };
    }
    
    // 方案 3: 部分信息（使用 should）
    const shouldClauses = [];
    
    if (normalized.year) {
        shouldClauses.push({ term: { "JYEAR": normalized.year } });
    }
    if (normalized.caseType) {
        shouldClauses.push({ term: { "JCASE": normalized.caseType } });
    }
    if (normalized.number) {
        shouldClauses.push({ term: { "JNO": normalized.number } });
    }
    
    if (shouldClauses.length > 0) {
        return {
            bool: {
                should: shouldClauses,
                minimum_should_match: Math.min(2, shouldClauses.length)  // 至少匹配 2 個條件
            }
        };
    }
    
    // 無法構建查詢
    console.log(`[CaseNumberParser] 無法從解析結果構建查詢`);
    return null;
}

/**
 * 完整的案號智能處理流程
 *
 * @param {string} userInput - 用戶輸入
 * @returns {Promise<Object|null>} - Elasticsearch 查詢對象，如果不是案號則返回 null
 */
export async function processCaseNumberQuery(userInput) {
    try {
        // 步驟 1: 前端預檢
        if (!mightBeCaseNumber(userInput)) {
            console.log(`[CaseNumberParser] 預檢未通過，不是案號格式`);
            return null;
        }

        // 步驟 2: AI 解析
        const parseResult = await parseCaseNumber(userInput);

        // 步驟 3: 構建查詢
        const esQuery = buildCaseNumberQuery(parseResult);

        return esQuery;
    } catch (error) {
        console.error(`[CaseNumberParser] 處理案號查詢時發生錯誤:`, error);
        // 發生錯誤時返回 null，讓系統回退到通用查詢
        return null;
    }
}

