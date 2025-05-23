// 後端: controllers/configController.js
import { commerceConfig } from '../config/commerceConfig.js'; // 引入配置

export async function getCommerceConfigController(req, res, next) {
  try {
    // 未來這裡可以加入一些邏輯，例如根據用戶地區返回不同配置等
    // 目前直接返回整個配置
    res.status(200).json(commerceConfig);
  } catch (error) {
    console.error('[Config Controller] Error fetching commerce config:', error);
    next(error); // 交給全局錯誤處理
  }
}