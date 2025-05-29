// routes/payment.js
import express from 'express';
import {
    initiateCheckoutController,
    handleMpgNotifyController,
    handlePeriodNotifyController,
    handleMpgReturnController,
    handlePeriodReturnController,
    handleGeneralNotifyController // <--- 只引入這個作為通用/備用通知處理器
    // 移除 handleDefaultNotifyController 的引入
} from '../controllers/paymentController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// 前端發起結帳請求 (需要用戶登入驗證)
router.post('/initiate-checkout', verifyToken, initiateCheckoutController);

// 接收藍新金流的背景通知 (NotifyURL) - 不需要 verifyToken
// 這些是 API 參數中 NotifyURL 可能會精確指向的端點 (推薦)
router.post('/notify/mpg', handleMpgNotifyController);
router.post('/notify/period', handlePeriodNotifyController);

// 這是您在藍新後台可以設定的【一個】通用的 Notify URL (備用或主要，取決於您的策略)
router.post('/notify/general', handleGeneralNotifyController);

// 接收藍新金流的前景跳轉 (ReturnURL) - 不需要驗證，僅作引導
// 我們之前在 paymentController.js 中已經創建了 handleGeneralReturnController。
import { handleGeneralReturnController } from '../controllers/paymentController.js'; // 確保引入
router.post('/return/general', handleGeneralReturnController);


export default router;