// routes/payment.js
import express from 'express';
import {
    initiateCheckoutController,
    handleMpgNotifyController,
    handlePeriodNotifyController,
    handleMpgReturnController,
    handlePeriodReturnController
} from '../controllers/paymentController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// 前端發起結帳請求 (需要用戶登入驗證)
router.post('/initiate-checkout', verifyToken, initiateCheckoutController);

// 接收藍新金流的背景通知 (NotifyURL) - 不需要 verifyToken
router.post('/notify/mpg', handleMpgNotifyController);
router.post('/notify/period', handlePeriodNotifyController);

// 接收藍新金流的前景跳轉 (ReturnURL) - 不需要驗證，僅作引導
// 藍新文件指出 ReturnURL 和 NotifyURL 都是 POST
router.post('/return/mpg', handleMpgReturnController);
router.post('/return/period', handlePeriodReturnController);

export default router;