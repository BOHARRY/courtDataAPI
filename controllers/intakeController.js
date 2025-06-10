// controllers/intakeController.js (最終版)

import { handleChat } from '../services/intakeService.js';

async function chatController(req, res, next) {
    try {
        const { conversationHistory, caseInfo } = req.body;

        if (!Array.isArray(conversationHistory) || conversationHistory.length === 0) {
            return res.status(400).json({
                status: 'failed',
                message: '請求格式錯誤，需要提供 conversationHistory 陣列。'
            });
        }

        // --- 階段管理邏輯 ---
        let currentCaseInfo = caseInfo || {};
        // 初始階段設為 'greeting'
        if (!currentCaseInfo.dialogueStage) {
            currentCaseInfo.dialogueStage = 'greeting';
        }
        // ----------------------
        // 如果沒有提供案件類型，則預設為 null
        const structuredResponse = await handleChat(conversationHistory, currentCaseInfo);
        // --- 更新記憶體 ---
        // 這裡我們假設 structuredResponse.analysis 包含 AI 的分析結果
        const updatedCaseInfo = updateMemory(currentCaseInfo, structuredResponse.analysis, conversationHistory.slice(-1)[0].content);

        // --- 更新下一階段 ---
        // 如果 AI 剛做完費用說明，下一階段就進入正式的資訊收集
        if (updatedCaseInfo.dialogueStage === 'fee_mentioned') {
            updatedCaseInfo.dialogueStage = 'collecting';
        }
        // 如果 AI 剛剛判斷出案件類型，下一階段就應該是提及費用
        if (updatedCaseInfo.dialogueStage === 'greeting' && updatedCaseInfo.caseType) {
            updatedCaseInfo.dialogueStage = 'fee_mention_pending';
        }
        // --------------------

        const conversationState = structuredResponse.conversationState || 'collecting';
        if (conversationState === 'completed') {
            console.log(`對話完成，準備轉交律師。`);
        }

        res.status(200).json({
            status: 'success',
            response: structuredResponse.response,
            conversationState: conversationState,
            updatedCaseInfo: updatedCaseInfo,
        });

    } catch (error) {
        console.error('Error in chatController:', error);
        next(error);
    }
}

/**
 * 根據 AI 的分析和使用者最新的話，更新案件資訊 (記憶體)
 * @param {Object} oldCaseInfo - 更新前的案件資訊
 * @param {Object} analysis - AI 的分析結果
 * @param {string} userLastUtterance - 使用者最新的那句話
 * @returns {Object} - 更新後的案件資訊
 */
function updateMemory(oldCaseInfo, analysis, userLastUtterance) {
    const newCaseInfo = { ...oldCaseInfo };

    // 1. 更新案件類型 (只在還未知時更新)
    if (!newCaseInfo.caseType && analysis.caseType && analysis.caseType !== '其他') {
        newCaseInfo.caseType = analysis.caseType;
    }

    // 2. 簡易的資訊提取與更新 (這部分未來可以做得更精細)
    // 這裡我們用一個簡化的規則：如果 AI 提取的關鍵字包含特定詞彙，就更新對應欄位
    const entities = analysis.keyEntities || [];

    // 簡易判斷刑度
    if (entities.some(e => e.includes('年') || e.includes('月')) && (userLastUtterance.includes('判') || userLastUtterance.includes('刑'))) {
        newCaseInfo.sentence = entities.find(e => e.includes('年') || e.includes('月'));
    }

    // 簡易判斷判決日期
    if (entities.some(e => e.includes('週') || e.includes('月') || e.includes('號') || e.includes('日'))) {
        if (!oldCaseInfo.sentence && (userLastUtterance.includes('判') || userLastUtterance.includes('宣判'))) {
            newCaseInfo.verdictDate = entities.find(e => e.includes('週') || e.includes('月') || e.includes('號') || e.includes('日'));
        }
    }

    // 3. 儲存最新的分析，供除錯或未來使用
    newCaseInfo.lastAnalysis = analysis;

    if (analysis.action === 'mention_fee') {
        newCaseInfo.dialogueStage = 'fee_mentioned';
    }
    return newCaseInfo;
}

export { chatController };