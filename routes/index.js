// routes/index.js
import express from 'express';
import searchRoutes from './search.js';
import judgmentRoutes from './judgment.js';
import lawyerRoutes from './lawyer.js';
import userRoutes from './user.js';
// 未來如果有其他路由模組，也從這裡引入

const router = express.Router();

// 掛載各個子路由
router.use('/search', searchRoutes);       // 例如 /api/search/...
router.use('/judgments', judgmentRoutes);  // 例如 /api/judgments/...
router.use('/lawyers', lawyerRoutes);    // 例如 /api/lawyers/...
router.use('/users', userRoutes);        // 例如 /api/users/...

// 可以有一個根路由 /api 的健康檢查或歡迎訊息
router.get('/', (req, res) => {
  res.json({ message: 'Welcome to the Boooook API!' });
});

export default router;