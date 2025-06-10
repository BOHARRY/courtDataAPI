// controllers/intakeController.js (引入狀態機邏輯版)

import { handleChat } from '../services/intakeService.js';

/**
 * 對話狀態機：根據當前階段和分析結果，決定下一個階段。
 * 這是我們所有「參照和比對」邏輯的集中地。
 * @param {string} currentStage - 當前的對話階段。
 * @param {Object} analysis - AI 的分析結果。
 * @param {Object} oldCaseInfo - 更新前的案件資訊。
 * @returns {string} - 下一個對話階段。
 */
function determineNextStage(currentStage, analysis, oldCaseInfo) {
    switch (currentStage) {
        case 'greeting':
            // 觸發事件：AI 成功判斷出案件類型
            if (analysis.caseType && analysis.caseType !== '其他') {
                return 'fee_mention_pending'; // 下一階段：準備提費用
            }
            return 'greeting'; // 保持不變，繼續等待案件類型

        case 'fee_mention_pending':
            // 觸發事件：AI 成功執行了提及費用的動作
            if (analysis.action === 'mention_fee') {
                return 'collecting'; // 下一階段：正式收集資訊
            }
            return 'fee_mention_pending'; // 保持不變，直到費用被提及

        case 'collecting':
            // 在收集階段，狀態通常保持不變，直到對話結束
            return 'collecting';

        default:
            return 'greeting';
    }
}


async function chatController(req, res, next) {
  try {
    const { conversationHistory, caseInfo } = req.body;
    const oldCaseInfo = caseInfo || {};

    // 初始階段設定
    const currentStage = oldCaseInfo.dialogueStage || 'greeting';

    const structuredResponse = await handleChat(conversationHistory, { ...oldCaseInfo, dialogueStage: currentStage });

    // --- 狀態更新流程 ---
    // 1. 先用純粹的函式更新案件的「事實」資訊 (如刑度、日期)
    const factUpdatedCaseInfo = updateFacts(oldCaseInfo, structuredResponse.analysis, conversationHistory.slice(-1)[0].content);

    // 2. 接著，使用我們的狀態機來決定「下一階段」
    const nextStage = determineNextStage(currentStage, structuredResponse.analysis, factUpdatedCaseInfo);

    // 3. 將更新後的事實和下一階段組合起來，成為完整的 updatedCaseInfo
    const updatedCaseInfo = {
        ...factUpdatedCaseInfo,
        dialogueStage: nextStage,
        lastAnalysis: structuredResponse.analysis // 儲存本次分析
    };
    // -------------------

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
 * 只負責更新案件的「事實」資訊，不再處理「階段」
 * (原來的 updateMemory 函式，改個名字讓職責更清晰)
 */
function updateFacts(oldCaseInfo, analysis, userLastUtterance) {
    const newCaseInfo = { ...oldCaseInfo };
    delete newCaseInfo.lastAnalysis; // 刪除舊的分析，準備放入新的
    delete newCaseInfo.dialogueStage; // 階段管理已移出

    if (!newCaseInfo.caseType && analysis.caseType && analysis.caseType !== '其他') {
        newCaseInfo.caseType = analysis.caseType;
    }
    
    const entities = analysis.keyEntities || [];
    
    if (entities.some(e => e.includes('年') || e.includes('月')) && (userLastUtterance.includes('判') || userLastUtterance.includes('刑'))) {
        newCaseInfo.sentence = entities.find(e => e.includes('年') || e.includes('月'));
    }

    if (entities.some(e => e.includes('週') || e.includes('月') || e.includes('號') || e.includes('日'))) {
        if (!oldCaseInfo.sentence && (userLastUtterance.includes('判') || userLastUtterance.includes('宣判'))) {
            newCaseInfo.verdictDate = entities.find(e => e.includes('週') || e.includes('月') || e.includes('號') || e.includes('日'));
        }
    }
    
    return newCaseInfo;
}

export { chatController };