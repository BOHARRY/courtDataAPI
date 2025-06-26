// services/summarizeCommonPointsService.js
import esClient from '../config/elasticsearch.js';
import { OpenAI } from 'openai';
import { OPENAI_API_KEY, OPENAI_MODEL_NAME_CHAT, OPENAI_MODEL_NAME_NANO } from '../config/environment.js';
import admin from 'firebase-admin';

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

const ES_INDEX_NAME = 'search-boooook';
const EXTRACTION_MODEL = OPENAI_MODEL_NAME_NANO || 'gpt-4.1-nano';
const SYNTHESIS_MODEL = OPENAI_MODEL_NAME_CHAT || 'gpt-4.1';

/**
 * 從單篇判決書全文中萃取核心段落
 * @param {string} jfull - 判決書全文
 * @param {string} jid - 判決書 ID，用於日誌記錄
 * @returns {Promise<object>} - 包含萃取出的事實、爭點和理由的物件
 */
async function extractCoreParagraphs(jfull, jid) {
    console.log(`[summarizeCommonPointsService] [Stage 1] Starting extraction for JID: ${jid} using ${EXTRACTION_MODEL}`);
    const prompt = `你是一個高效的法律文本解析器。你的任務是從以下台灣判決書全文中，一字不差地提取出「事實及理由」段落中的核心內容。請專注於以下三個部分：
1.  **facts**: 描述案件基本事實的段落。
2.  **legalIssues**: 明確點出本案法律爭議點的段落。
3.  **reasons**: 法院闡述其判決理由和法律見解的關鍵段落。

請嚴格遵循以下 JSON 格式輸出，如果某個部分找不到對應內容，請回傳空字串 ""。

{
  "facts": "...",
  "legalIssues": "...",
  "reasons": "..."
}

判決書全文如下：
---
${jfull}
---
`;

    try {
        const response = await openai.chat.completions.create({
            model: EXTRACTION_MODEL,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.0,
            response_format: { type: "json_object" },
        });
        const content = response.choices[0].message.content;
        console.log(`[summarizeCommonPointsService] [Stage 1] Extraction successful for JID: ${jid}`);
        return JSON.parse(content);
    } catch (error) {
        console.error(`[summarizeCommonPointsService] [Stage 1] Failed to extract from JID: ${jid}`, error);
        // 即使失敗，也回傳一個空的結構，避免中斷整個流程
        return { facts: "", legalIssues: "", reasons: "" };
    }
}

/**
 * 安全地解析第二階段 AI 的回應
 * @param {string} rawContent - 從 OpenAI API 收到的原始字串
 * @returns {object} - 結構化的 report 物件
 */
function parseSynthesisResponse(rawContent) {
    console.log(`[summarizeCommonPointsService] [Stage 2] Parsing raw AI content: ${rawContent.substring(0, 200)}...`);
    try {
        const parsedJson = JSON.parse(rawContent);

        // **最嚴格的檢查**：確保 report 物件及其必要屬性存在
        if (parsedJson.report && typeof parsedJson.report.summaryText === 'string' && typeof parsedJson.report.citations === 'object') {
            console.log("[summarizeCommonPointsService] [Stage 2] Parsed successfully with expected structure.");
            return parsedJson.report;
        }

        // **備用檢查**：如果 AI 直接回傳了 report 物件的內容
        if (typeof parsedJson.summaryText === 'string' && typeof parsedJson.citations === 'object') {
            console.warn("[summarizeCommonPointsService] [Stage 2] AI returned report content directly. Adapting.");
            return parsedJson;
        }
        
        console.error("[summarizeCommonPointsService] [Stage 2] Parsed JSON lacks expected structure.", parsedJson);
        throw new Error("AI 回應的 JSON 結構不符預期。");

    } catch (jsonError) {
        console.error('[summarizeCommonPointsService] [Stage 2] Failed to parse AI response as JSON.', jsonError);
        // 如果 JSON 解析失敗，但內容看起來不像錯誤訊息，則將其包裝成一個錯誤報告
        if (rawContent && !rawContent.toLowerCase().includes("error") && !rawContent.trim().startsWith("{")) {
            return {
                summaryText: "AI 回應格式錯誤，但內容似乎有效。請回報此問題。\n\n原始回應：\n" + rawContent,
                citations: {}
            };
        }
        throw new Error(`AI 回應格式錯誤，無法解析: ${jsonError.message}`);
    }
}


/**
 * (背景執行) 真正的分析函式
 */
async function executeAnalysisInBackground(taskId, judgementIds, userId) {
    const db = admin.firestore();
    const taskRef = db.collection('aiAnalysisTasks').doc(taskId);

    try {
        // 1. 批次從 ES 獲取資料
        console.log(`[summarizeCommonPointsService] Fetching data for ${judgementIds.length} judgements from ES.`);
        const esResponse = await esClient.mget({
            index: ES_INDEX_NAME,
            body: { ids: judgementIds },
            _source: ['JFULL', 'summary_ai_full', 'JID', 'JTITLE'],
        });

        const foundDocs = esResponse.docs.filter(doc => doc.found).map(doc => doc._source);

        if (foundDocs.length < 2) {
            throw new Error(`找到的有效判決書數量不足 (${foundDocs.length}篇)，無法進行分析。`);
        }
        console.log(`[summarizeCommonPointsService] Found ${foundDocs.length} valid documents.`);

        // 2. 第一階段：並行萃取
        const extractionPromises = foundDocs.map(doc => extractCoreParagraphs(doc.JFULL, doc.JID));
        const extractedContents = await Promise.all(extractionPromises);

        const successfulExtractions = extractedContents.filter(c => c.facts || c.legalIssues || c.reasons).length;
        if (successfulExtractions < Math.min(2, foundDocs.length)) {
            throw new Error(`AI 無法從提供的判決書中有效萃取出足夠的核心內容 (${successfulExtractions}/${foundDocs.length})，請嘗試更換判例。`);
        }

        // 3. 第二階段：綜整
        let synthesisContext = "你是一位頂尖的台灣法律分析師。你的任務是分析以下多篇判決書的資料，並撰寫一份帶有原文引用的綜合分析報告。\n\n";
        
        foundDocs.forEach((doc, index) => {
            synthesisContext += `--- 判決書 ${index + 1} (ID: ${doc.JID}) ---\n`;
            synthesisContext += `【AI 預處理摘要】:\n${doc.summary_ai_full || '無提供 AI 摘要。'}\n\n`;
            synthesisContext += `【原文核心段落】:\n`;
            synthesisContext += `- 事實: "${extractedContents[index].facts || '未提取到'}"\n`;
            synthesisContext += `- 爭點: "${extractedContents[index].legalIssues || '未提取到'}"\n`;
            synthesisContext += `- 理由: "${extractedContents[index].reasons || '未提取到'}"\n---\n\n`;
        });

        synthesisContext += `【你的任務】:
請基於以上所有資料，撰寫一段流暢的分析報告。在報告中，當你引用任何來自【原文核心段落】的內容時，必須在該處插入一個引用標記 [n] (例如 [1], [2]...)。
最後，你必須提供一個 citations 物件，其中包含每個引用標記的來源。請嚴格遵循以下 JSON 格式輸出，並確保你的回應是一個合法的 JSON 物件：

{
  "report": {
    "summaryText": "你的分析報告...",
    "citations": {
      "1": {
        "judgementId": "來源判決書的ID",
        "originalText": "被引用的原文片段..."
      }
    }
  }
}
`;

        console.log(`[summarizeCommonPointsService] [Stage 2] Starting synthesis using ${SYNTHESIS_MODEL}`);
        const synthesisResponse = await openai.chat.completions.create({
            model: SYNTHESIS_MODEL,
            messages: [{ role: 'user', content: synthesisContext }],
            temperature: 0.3,
            response_format: { type: "json_object" },
        });

        const finalReport = parseSynthesisResponse(synthesisResponse.choices[0].message.content);
        console.log(`[summarizeCommonPointsService] [Stage 2] Synthesis successful for task ${taskId}.`);

        // 4. 將成功結果更新回 Firestore
        await taskRef.update({
            status: 'complete',
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            result: {
                analyzedCount: foundDocs.length,
                report: finalReport,
            }
        });

    } catch (error) {
        console.error(`[summarizeCommonPointsService] Background execution failed for task ${taskId}`, error);
        // 將失敗狀態和錯誤訊息更新回 Firestore
        await taskRef.update({
            status: 'failed',
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            error: error.message || '一個未知的錯誤發生了。',
        });
    }
}

/**
 * (入口函式) 啟動分析任務
 */
export async function startCommonPointsAnalysis(judgementIds, userId) {
    if (!judgementIds || judgementIds.length < 2) {
        const error = new Error('至少需要提供兩篇判決書才能進行比較分析。');
        error.statusCode = 400;
        throw error;
    }

    const db = admin.firestore();
    const taskRef = db.collection('aiAnalysisTasks').doc();
    const taskId = taskRef.id;

    const taskData = {
        userId,
        taskId,
        judgementIds,
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await taskRef.set(taskData);
    console.log(`[summarizeCommonPointsService] Task ${taskId} created for user ${userId}.`);

    // **非同步執行**，不等待其完成
    executeAnalysisInBackground(taskId, judgementIds, userId);

    return { taskId };
}

/**
 * (查詢函式) 獲取分析結果
 */
export async function getAnalysisResult(taskId, userId) {
    const db = admin.firestore();
    const taskRef = db.collection('aiAnalysisTasks').doc(taskId);
    const doc = await taskRef.get();

    if (!doc.exists) {
        const error = new Error('找不到指定的分析任務。');
        error.statusCode = 404;
        throw error;
    }

    const data = doc.data();

    // 安全檢查，確保使用者只能查詢自己的任務
    if (data.userId !== userId) {
        const error = new Error('無權限查詢此分析任務。');
        error.statusCode = 403;
        throw error;
    }

    return data;
}