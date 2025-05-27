// Boooook/controllers/platformStatusController.js
import * as platformStatusService from '../services/platformStatusService.js';

export async function updateDatabaseStatsController(req, res, next) {
  try {
    const adminUid = req.user.uid; // 來自 verifyToken
    const { judgmentCount, judgmentDateRange, lastUpdated, displayMessage } = req.body;

    if (typeof judgmentCount !== 'number' || !judgmentDateRange || !lastUpdated || !displayMessage) {
      return res.status(400).json({ error: 'Bad Request', message: '缺少必要的欄位 (judgmentCount, judgmentDateRange, lastUpdated, displayMessage)。' });
    }

    const newData = {
      judgmentCount,
      judgmentDateRange,
      lastUpdated,
      displayMessage,
    };

    await platformStatusService.updateDatabaseStats(newData, adminUid);
    res.status(200).json({ message: '資料庫狀態已成功更新。', data: newData });
  } catch (error) {
    next(error);
  }
}

export async function getDatabaseStatsController(req, res, next) {
  try {
    const stats = await platformStatusService.getDatabaseStats();
    if (stats) {
      res.status(200).json(stats);
    } else {
      // 如果文檔不存在，可以返回 404 或一個預設的空訊息
      res.status(200).json({ displayMessage: "目前尚無資料庫狀態資訊。" });
    }
  } catch (error) {
    next(error);
  }
}