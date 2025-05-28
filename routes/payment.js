// routes/payment.js
import express from 'express';
import {
    initiateCheckoutController,
    handleMpgNotifyController,
    handlePeriodNotifyController,
    handleMpgReturnController,
    handlePeriodReturnController,
    handleGeneralNotifyController,
    handleDefaultNotifyController
} from '../controllers/paymentController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// 前端發起結帳請求 (需要用戶登入驗證)
router.post('/initiate-checkout', verifyToken, initiateCheckoutController);

// 接收藍新金流的背景通知 (NotifyURL) - 不需要 verifyToken
router.post('/notify/mpg', handleMpgNotifyController); // 保留，API參數可能會指向這裡
router.post('/notify/period', handlePeriodNotifyController); // 保留
router.post('/notify/general', handleGeneralNotifyController); // <--- 新增通用接收路由

// 接收藍新金流的前景跳轉 (ReturnURL) - 不需要驗證，僅作引導
// 藍新文件指出 ReturnURL 和 NotifyURL 都是 POST
router.post('/return/mpg', handleMpgReturnController);
router.post('/return/period', handlePeriodReturnController);

// 新增：備用的/通用的通知接收點，用於藍新後台設定
router.post('/notify/default-handler', handleDefaultNotifyController); 

export default router;