// controllers/intakeController.js (改進版本)

import { handleChat } from '../services/intakeService.js';
import { lawDomainConfig } from '../config/intakeDomainConfig.js';
import { 
    getExistingSession, 
    updateSession, 
    listSessionsByUser, 
    createSessionOnFirstMessage,
    prepareNewSession 
} from '../services/conversationService.js';

/**
 * Session 控制器：只獲取現有 session，不自動創建
 */
export async function sessionController(req, res, next) {
    try {
        const { anonymousUserId, sessionId } = req.body;
        const session = await getExistingSession(anonymousUserId, sessionId);
        res.status(200).json(session);
    } catch (error) {
        console.error('Error in sessionController:', error);
        next(error);
    }
}

/**
 * 核心對話控制器 - 支援延遲創建 Session
 */
export async function chatController(req, res, next) {
    try {
        const { sessionId, conversationHistory, caseInfo, anonymousUserId, isFirstMessage } = req.body;
        
        let actualSessionId = sessionId;
        let actualConversationHistory = conversationHistory;
        
        // 如果是第一則訊息且沒有 sessionId，創建新的 session
        if (isFirstMessage && !sessionId) {
            const userMessage = conversationHistory[conversationHistory.length - 1].content;
            const newSession = await createSessionOnFirstMessage(anonymousUserId, userMessage);
            actualSessionId = newSession.sessionId;
            actualConversationHistory = newSession.sessionData.conversationHistory;
        }
        
        if (!actualSessionId) {
            return res.status(400).json({ 
                status: 'failed', 
                message: '需要有效的 sessionId 或是第一則訊息' 
            });
        }

        const domainConfig = lawDomainConfig;
        
        // 使用 AI 處理對話
        const structuredResponse = await handleChat(
            domainConfig, 
            actualConversationHistory, 
            caseInfo
        );

        // 更新案件資訊
        const factUpdatedCaseInfo = updateFacts(
            domainConfig, 
            caseInfo, 
            structuredResponse.analysis, 
            actualConversationHistory[actualConversationHistory.length - 1].content
        );
        
        const currentStage = (caseInfo && caseInfo.dialogueStage) || 'greeting';
        const nextStage = determineNextStage(currentStage, structuredResponse.analysis);

        const updatedCaseInfo = {
            ...factUpdatedCaseInfo,
            dialogueStage: nextStage,
            lastAnalysis: structuredResponse.analysis
        };
        
        const conversationState = structuredResponse.conversationState || 'collecting';

        // 更新對話歷史（加入 AI 回應）
        const updatedConversationHistory = [
            ...actualConversationHistory, 
            { role: 'assistant', content: structuredResponse.response }
        ];

        // 異步更新資料庫
        updateSession(actualSessionId, {
            updatedCaseInfo: updatedCaseInfo,
            conversationHistory: updatedConversationHistory,
            conversationState: conversationState
        }).catch(err => console.error("Failed to update session:", err));

        if (conversationState === 'completed') {
            console.log(`對話完成，準備轉交律師。SessionID: ${actualSessionId}`);
        }

        res.status(200).json({
            status: 'success',
            sessionId: actualSessionId, // 返回實際的 sessionId
            response: structuredResponse.response,
            conversationState: conversationState,
            updatedCaseInfo: updatedCaseInfo,
            isNewSession: isFirstMessage && !sessionId
        });

    } catch (error) {
        console.error('Error in chatController:', error);
        next(error);
    }
}

/**
 * 列出使用者的歷史案件控制器
 */
export async function listSessionsController(req, res, next) {
    try {
        const { anonymousUserId } = req.query; 
        if (!anonymousUserId) {
            return res.status(400).json({ 
                status: 'failed', 
                message: '缺少 anonymousUserId。' 
            });
        }
        const sessions = await listSessionsByUser(anonymousUserId);
        res.status(200).json({ status: 'success', sessions });
    } catch (error) {
        console.error('Error in listSessionsController:', error);
        next(error);
    }
}

/**
 * 準備新案件控制器（不會真正創建到資料庫）
 */
export async function newSessionController(req, res, next) {
    try {
        const { anonymousUserId } = req.body;
        if (!anonymousUserId) {
            return res.status(400).json({ 
                status: 'failed', 
                message: '缺少 anonymousUserId。' 
            });
        }
        const newSession = await prepareNewSession(anonymousUserId);
        res.status(200).json({ status: 'success', ...newSession });
    } catch (error) {
        console.error('Error in newSessionController:', error);
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