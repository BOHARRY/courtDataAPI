// routes/contactRoutes.js
// 📌 此路由目前停用。
// 若未來要重新啟動聯絡表單，建議：
// 1. 前端加入 CAPTCHA / 速率限制，避免垃圾信或大量檔案上傳。
// 2. 後端改用受限的檔案儲存流程，統一在 service 層處理通知信。
// 目前僅回傳空 Router 以避免未使用的端點被誤觸。

import express from 'express';

const router = express.Router();

// router.post('/submit', ...) // 🔒 未來實作位置

export default router;
