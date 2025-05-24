// routes/index.js
import express from 'express';
import searchRoutes from './search.js';
import judgmentRoutes from './judgment.js';
import lawyerRoutes from './lawyer.js';
import userRoutes from './user.js';
import judgeRoutes from './judge.js';
import complaintRoutes from './complaint.js'; // 新增引入
import configRoutes from './configRoutes.js'; // <--- 引入新的配置路由
import aiAnalysisRoutes from './aiAnalysisRoutes.js';

const router = express.Router();

// 掛載各個子路由
router.use('/search', searchRoutes);       // 例如 /api/search/...
router.use('/judgments', judgmentRoutes);  // 例如 /api/judgments/...
router.use('/lawyers', lawyerRoutes);    // 例如 /api/lawyers/...
router.use('/users', userRoutes);        // 例如 /api/users/...
router.use('/judges', judgeRoutes); // <<--- 新增掛載
router.use('/complaint', complaintRoutes); // 新增掛載
router.use('/config', configRoutes); 
router.use('/ai', aiAnalysisRoutes);

// 可以有一個根路由 /api 的健康檢查或歡迎訊息
router.get('/', (req, res) => {
  res.json({ message: 'Welcome to the Boooook API!' });
});

export default router;