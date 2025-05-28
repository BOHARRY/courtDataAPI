// 後端: routes/configRoutes.js
import express from 'express';
import { getCommerceConfigController,getSubscriptionProductsController } from '../controllers/configController.js';

// 這個 API 可以考慮是否需要 token 驗證，如果配置本身不敏感，可以不需要
// import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// GET /api/config/commerce
router.get('/commerce', getCommerceConfigController);
// 如果需要驗證： router.get('/commerce', verifyToken, getCommerceConfigController);

router.get('/subscription-products', getSubscriptionProductsController);

export default router;