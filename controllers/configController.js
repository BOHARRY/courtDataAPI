// 後端: controllers/configController.js
import { commerceConfig as coreCommerceConfig } from '../config/commerceConfig.js'; // 重命名以避免衝突
import { subscriptionProducts as coreSubscriptionProducts } from '../config/subscriptionProducts.js';

export async function getCommerceConfigController(req, res, next) {
  try {
    // 未來這裡可以加入一些邏輯，例如根據用戶地區返回不同配置等
    // 目前直接返回整個配置
    res.status(200).json(coreCommerceConfig);
  } catch (error) {
    console.error('[Config Controller] Error fetching commerce config:', error);
    next(error); // 交給全局錯誤處理
  }
}

export async function getSubscriptionProductsController(req, res, next) {
  try {
    res.status(200).json(coreSubscriptionProducts);
  } catch (error) {
    console.error('[Config Controller] Error fetching subscription products:', error);
    next(error);
  }
}