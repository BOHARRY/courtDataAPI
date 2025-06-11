// controllers/intakeController.js

import { handleChat } from '../services/intakeService.js';
import { lawDomainConfig } from '../config/intakeDomainConfig.js'; // 引入我們未來的設定檔
import { getOrCreateSession, updateSession } from '../services/conversationService.js';
/**
 * 新增：Session 控制器
 */
export async function sessionController(req, res, next) {
    try {
        const { sessionId } = req.body;
        const session = await getOrCreateSession(sessionId);
        res.status(200).json(session);
    } catch (error) {
        console.error('Error in sessionController:', error);
        next(error);
    }
}

/**
 * 核心對話控制器
 * 協調整個 AI 對話的請求、處理、狀態更新與回應流程。
 */
async function chatController(req, res, next) {
  try {
    const { sessionId, conversationHistory, caseInfo } = req.body;

    if (!sessionId) {
        return res.status(400).json({ status: 'failed', message: '缺少 sessionId。' });
    }
    
    // 1. 載入領域設定 (目前寫死為法律領域，未來可根據需求動態載入)
    const domainConfig = lawDomainConfig;

    // 2. 基本輸入驗證
    if (!Array.isArray(conversationHistory) || conversationHistory.length === 0) {
      return res.status(400).json({
        status: 'failed',
        message: '請求格式錯誤，需要提供 conversationHistory 陣列。'
      });
    }
    
    // 3. 呼叫核心服務，獲取 AI 的結構化回應
    // 我們將 caseInfo 傳遞給服務層，服務層會處理好所有與 Prompt 相關的邏輯
    const structuredResponse = await handleChat(domainConfig, conversationHistory, caseInfo);

    // 4. 根據 AI 回應和舊的 caseInfo，更新案件的「事實」資訊
    const factUpdatedCaseInfo = updateFacts(
      domainConfig, 
      caseInfo, 
      structuredResponse.analysis, 
      conversationHistory.slice(-1)[0].content
    );

    // 5. 使用狀態機，根據當前階段和 AI 分析，決定「下一階段」
    const currentStage = (caseInfo && caseInfo.dialogueStage) || 'greeting';
    const nextStage = determineNextStage(
      currentStage, 
      structuredResponse.analysis
    );

    // 6. 組合出最終要回傳給前端的、完整的案件資訊物件
    const updatedCaseInfo = {
        ...factUpdatedCaseInfo,
        dialogueStage: nextStage,
        lastAnalysis: structuredResponse.analysis // 儲存本次分析以供除錯或未來使用
    };
    
    // 7. 檢查對話是否結束，並在後端留下紀錄
    const conversationState = structuredResponse.conversationState || 'collecting';
    if (conversationState === 'completed') {
        console.log(`對話完成，準備轉交律師。最終案件資訊:`, JSON.stringify(updatedCaseInfo, null, 2));
    }

    // 關鍵一步：在回傳給前端之前，將最新的狀態存入資料庫
    await updateSession(sessionId, {
        updatedCaseInfo: updatedCaseInfo,
        conversationHistory: conversationHistory,
        conversationState: conversationState
    });

    // 8. 回傳成功的結果給前端
    res.status(200).json({
      status: 'success',
      response: structuredResponse.response, // 給使用者看的下一句話
      conversationState: conversationState,   // 當前對話狀態
      updatedCaseInfo: updatedCaseInfo,       // 更新後的完整案件資訊
    });

  } catch (error) {
    console.error('Error in chatController:', error);
    next(error); // 將錯誤傳遞給 Express 的統一錯誤處理中介軟體
  }
}

/**
 * 對話狀態機 (Dialogue Flow)
 * 職責：根據「當前階段」和「觸發事件(AI分析結果)」，決定「下一階段」。
 * 這對應您表格中的 `dialogueFlow` 模組。
 * @param {string} currentStage - 當前的對話階段。
 * @param {Object} analysis - AI 的分析結果。
 * @returns {string} - 下一個對話階段。
 */
function determineNextStage(currentStage, analysis) {
    switch (currentStage) {
        case 'greeting':
            // 觸發條件：AI 成功判斷出案件類型
            if (analysis.caseType && analysis.caseType !== '其他') {
                return 'fee_mention_pending';
            }
            return 'greeting'; // 條件不滿足，停留在當前階段

        case 'fee_mention_pending':
            // 觸發條件：AI 執行了提及費用的動作
            if (analysis.action === 'mention_fee') {
                return 'collecting';
            }
            return 'fee_mention_pending';

        case 'collecting':
            // 在收集階段，狀態通常保持不變，直到對話結束
            return 'collecting';

        default:
            return 'greeting'; // 任何未知狀態都重置為初始狀態
    }
}

/**
 * 事實更新器 (Fact Updater)
 * 職責：根據「實體填入規則(entityRules)」，更新案件資訊物件。
 * 這對應您表格中的 `entityRules` 模組。
 * @param {Object} domainConfig - 包含 `entityRules` 的領域設定。
 * @param {Object} oldCaseInfo - 更新前的案件資訊。
 * @param {Object} analysis - AI 的分析結果。
 * @param {string} userLastUtterance - 使用者最新的那句話。
 * @returns {Object} - 只包含更新後「事實」的案件資訊物件。
 */
function updateFacts(domainConfig, oldCaseInfo, analysis, userLastUtterance) {
    const newCaseInfo = { ...(oldCaseInfo || {}) };
    // 清理舊的分析和階段資訊，因為它們將被重新計算
    delete newCaseInfo.lastAnalysis;
    delete newCaseInfo.dialogueStage;

    // 更新案件類型
    if (!newCaseInfo.caseType && analysis.caseType && analysis.caseType !== '其他') {
        newCaseInfo.caseType = analysis.caseType;
    }
    
    const entities = analysis.keyEntities || [];
    const rules = domainConfig.entityRules || [];

    // 遍歷所有定義在設定檔中的規則
    rules.forEach(rule => {
        // 如果目標欄位已有值，則跳過，避免覆蓋
        if (newCaseInfo[rule.targetField]) return;

        // 檢查規則中的所有條件是否都滿足
        const entityMatch = rule.entityKeywords.some(kw => entities.some(e => e.includes(kw)));
        const utteranceMatch = rule.utteranceKeywords.some(kw => userLastUtterance.includes(kw));
        const preconditionMatch = rule.precondition ? rule.precondition(newCaseInfo) : true;

        if (entityMatch && utteranceMatch && preconditionMatch) {
            // 找到第一個匹配的實體並填入
            newCaseInfo[rule.targetField] = entities.find(e => rule.entityKeywords.some(kw => e.includes(kw)));
        }
    });
    
    return newCaseInfo;
}

export { chatController };