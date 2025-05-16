// controllers/judgeController.js
import * as judgeService from '../services/judgeService.js';
import * as creditService from '../services/credit.js'; // <<--- 引入 creditService
import admin from 'firebase-admin';

// 注意：點數成本的定義可以放在這裡，或者從 constants.js 引入
// 為了與路由文件中的示例保持一致，這裡假設它們是在路由層傳入 checkAndDeductCredits 中介軟體的

const JUDGE_ANALYTICS_BASE_COST = 2;
const JUDGE_REANALYZE_COST = 1;

export async function getJudgeAnalyticsController(req, res, next) {
    const userId = req.user.uid;
    const judgeName = req.params.judgeName;

    if (!judgeName) {
        return res.status(400).json({ error: 'Bad Request', message: 'Judge name is required in URL path.' });
    }

    console.log(`[JudgeController] User: ${userId} requesting analytics for judge: ${judgeName}`);
    const userDocRef = admin.firestore().collection('users').doc(userId);

    try {
        let analyticsResult = null;

        await admin.firestore().runTransaction(async (transaction) => {
            // 1. 檢查並扣除積分
            const { sufficient, currentCredits } = await creditService.checkAndDeductUserCreditsInTransaction(
                transaction,
                userDocRef,
                userId,
                JUDGE_ANALYTICS_BASE_COST,
                { action: 'judge_analytics_fetch', details: { judgeName } }
            );

            if (!sufficient) {
                const error = new Error('Insufficient credits');
                error.statusCode = 402;
                error.details = { required: JUDGE_ANALYTICS_BASE_COST, current: currentCredits };
                throw error; // 拋出以便外層 catch 捕獲並返回 402
            }

            // 2. 執行獲取法官分析數據的服務
            analyticsResult = await judgeService.getJudgeAnalytics(judgeName);
        });

        // Transaction 成功完成
        if (analyticsResult && analyticsResult.data) {
            console.log(`[JudgeController] Successfully retrieved analytics for ${judgeName}. Status: ${analyticsResult.status}`);
            res.status(200).json({
                status: analyticsResult.status,
                data: analyticsResult.data,
            });
        } else {
            console.error(`[JudgeController] Transaction succeeded but service returned unexpected result for ${judgeName}:`, analyticsResult);
            const err = new Error(`Failed to get analytics for judge "${judgeName}" (unexpected service response after transaction).`);
            err.statusCode = 500;
            next(err);
        }
    } catch (error) {
        console.error(`[JudgeController] Error getting analytics for judge ${judgeName}, User ${userId}:`, error.message, error.stack);
        if (error.message === 'Insufficient credits' && error.statusCode === 402) {
            return res.status(402).json({
                error: '您的點數不足，請購買積分或升級方案。',
                required: error.details?.required || JUDGE_ANALYTICS_BASE_COST,
                current: error.details?.current || 0
            });
        }
        if (error.statusCode === 404 && error.message.includes('not found')) {
            return res.status(404).json({ error: 'Not Found', message: error.message });
        }
        // User data not found from creditService
        if (error.message === 'User data not found.' && error.statusCode === 404) {
            return res.status(404).json({
                error: 'User data not found',
                message: '找不到您的用戶資料，請嘗試重新登入。'
            });
        }
        next(error);
    }
}

export async function getAIAnalysisStatusController(req, res, next) {
    const userId = req.user.uid;
    const judgeName = req.params.judgeName;

    if (!judgeName) {
        return res.status(400).json({ error: 'Bad Request', message: 'Judge name is required.' });
    }

    console.log(`[JudgeController] User: ${userId} requesting AI analysis status for judge: ${judgeName}`);

    try {
        // 查詢狀態通常不消耗點數
        const statusResult = await judgeService.getAIAnalysisStatus(judgeName);

        // statusResult 結構應為 { processingStatus, traits?, tendency?, estimatedTimeRemaining? }
        if (statusResult.processingStatus === 'not_found_in_status_check' || statusResult.processingStatus === 'not_found') {
            return res.status(404).json({ error: 'Not Found', message: `Analysis status for judge "${judgeName}" not found.` });
        }

        res.status(200).json(statusResult);

    } catch (error) {
        console.error(`[JudgeController] Error getting AI status for judge ${judgeName}, User ${userId}:`, error);
        next(error);
    }
}

export async function triggerReanalysisController(req, res, next) {
    const userId = req.user.uid;
    const judgeName = req.params.judgeName;

    if (!judgeName) {
        return res.status(400).json({ error: 'Bad Request', message: 'Judge name is required.' });
    }

    console.log(`[JudgeController] User: ${userId} triggering reanalysis for judge: ${judgeName}`);
    const userDocRef = admin.firestore().collection('users').doc(userId);

    try {
        let reanalyzeServiceResult = null;

        await admin.firestore().runTransaction(async (transaction) => {
            // 1. 檢查並扣除積分
            const { sufficient, currentCredits } = await creditService.checkAndDeductUserCreditsInTransaction(
                transaction,
                userDocRef,
                userId,
                JUDGE_REANALYZE_COST,
                { action: 'judge_reanalyze', details: { judgeName } }
            );

            if (!sufficient) {
                const error = new Error('Insufficient credits for reanalysis');
                error.statusCode = 402;
                error.details = { required: JUDGE_REANALYZE_COST, current: currentCredits };
                throw error;
            }

            // 2. 執行觸發重新分析的服務
            reanalyzeServiceResult = await judgeService.triggerReanalysis(judgeName);
        });

        // Transaction 成功完成
        if (reanalyzeServiceResult && (reanalyzeServiceResult.status === "initiated" || reanalyzeServiceResult.status === "initiated_no_cases")) {
            console.log(`[JudgeController] Reanalysis ${reanalyzeServiceResult.status} for ${judgeName}.`);
            res.status(200).json(reanalyzeServiceResult);
        } else {
            console.error(`[JudgeController] Transaction succeeded but service returned unexpected result for reanalysis of ${judgeName}:`, reanalyzeServiceResult);
            const err = new Error(`Failed to trigger reanalysis for judge "${judgeName}" (unexpected service response after transaction).`);
            err.statusCode = 500;
            next(err);
        }
    } catch (error) {
        console.error(`[JudgeController] Error triggering reanalysis for judge ${judgeName}, User ${userId}:`, error);
        if (error.message === 'Insufficient credits for reanalysis' && error.statusCode === 402) {
            return res.status(402).json({
                error: '您的點數不足以觸發重新分析。',
                required: error.details?.required || JUDGE_REANALYZE_COST,
                current: error.details?.current || 0
            });
        }
        if (error.statusCode === 404 && error.message.includes('not found for reanalysis')) {
            return res.status(404).json({ error: 'Not Found', message: error.message });
        }
        if (error.message === 'User data not found.' && error.statusCode === 404) {
            return res.status(404).json({
                error: 'User data not found',
                message: '找不到您的用戶資料，請嘗試重新登入。'
            });
        }
        next(error);
    }
}