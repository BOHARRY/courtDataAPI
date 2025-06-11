// controllers/intakeController.js

import { handleChat } from '../services/intakeService.js';
import { lawDomainConfig } from '../config/intakeDomainConfig.js';
import { getOrCreateSession, updateSession, listSessionsByUser, forceCreateNewSession } from '../services/conversationService.js';

/**
 * 新增：列出使用者的歷史案件控制器
 */
export async function listSessionsController(req, res, next) {
    try {
        // 我們需要身份驗證來獲取 userId
        const { anonymousUserId } = req.query; 
        if (!anonymousUserId) {
            return res.status(400).json({ status: 'failed', message: '缺少 anonymousUserId。' });
        }
        const sessions = await listSessionsByUser(anonymousUserId);
        res.status(200).json({ status: 'success', sessions });
    } catch (error) {
        console.error('Error in listSessionsController:', error);
        next(error);
    }
}

/**
 * 新增：強制開新案件控制器
 */
export async function newSessionController(req, res, next) {
    try {
        const { anonymousUserId } = req.body;
        if (!anonymousUserId) {
            return res.status(400).json({ status: 'failed', message: '缺少 anonymousUserId。' });
        }
        const newSession = await forceCreateNewSession(anonymousUserId);
        res.status(201).json({ status: 'success', ...newSession });
    } catch (error) {
        console.error('Error in newSessionController:', error);
        next(error);
    }
}

/**
 * Session 控制器：處理對話的初始化與恢復
 */
export async function sessionController(req, res, next) {
    try {
        const { anonymousUserId, sessionId } = req.body;
        const session = await getOrCreateSession(anonymousUserId, sessionId);
        res.status(200).json(session);
    } catch (error) {
        console.error('Error in sessionController:', error);
        next(error);
    }
}

/**
 * 核心對話控制器 (升級版，使用 Session)
 */
export async function chatController(req, res, next) {
  try {
    const { sessionId, conversationHistory, caseInfo } = req.body;
    
    if (!sessionId) {
        return res.status(400).json({ status: 'failed', message: '缺少 sessionId。' });
    }

    const domainConfig = lawDomainConfig;
    
    const structuredResponse = await handleChat(domainConfig, conversationHistory, caseInfo);

    const factUpdatedCaseInfo = updateFacts(domainConfig, caseInfo, structuredResponse.analysis, conversationHistory.slice(-1)[0].content);
    
    const currentStage = (caseInfo && caseInfo.dialogueStage) || 'greeting';
    const nextStage = determineNextStage(currentStage, structuredResponse.analysis);

    const updatedCaseInfo = {
        ...factUpdatedCaseInfo,
        dialogueStage: nextStage,
        lastAnalysis: structuredResponse.analysis
    };
    
    const conversationState = structuredResponse.conversationState || 'collecting';

    // 在回傳給前端之前，異步更新資料庫
    updateSession(sessionId, {
        updatedCaseInfo: updatedCaseInfo,
        conversationHistory: [...conversationHistory, { role: 'assistant', content: structuredResponse.response }],
        conversationState: conversationState
    }).catch(err => console.error("Failed to update session in background:", err)); // 即使更新失敗也不要阻塞回應

    if (conversationState === 'completed') {
        console.log(`對話完成，準備轉交律師。SessionID: ${sessionId}`);
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