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
import platformStatusRoutes from './platformStatusRoutes.js';
import contactRoutes from './contactRoutes.js';
import paymentRoutes from './payment.js';
import intakeRoutes from './intake.js';
import ezshipRoutes from './ezship.js'; // 新增這行
import workspaceRoutes from './workspace.js';
import semanticSearchRoutes from './semantic-search.js';
import lawSearchRoutes from './law-search.js';
import mcpRoutes from './mcp.js';


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
router.use('/platform-status', platformStatusRoutes); // 新增掛載平台狀態路由
router.use('/contact', contactRoutes);
router.use('/payment', paymentRoutes);
router.use('/intake', intakeRoutes); 
router.use('/ezship', ezshipRoutes); // 新增這行
router.use('/workspaces', workspaceRoutes);
router.use('/semantic-search', semanticSearchRoutes);
router.use('/law-search', lawSearchRoutes); // 新增語意搜尋路由
router.use('/mcp', mcpRoutes); // 新增 MCP 路由


// 可以有一個根路由 /api 的健康檢查或歡迎訊息
router.get('/', (req, res) => {
  res.json({ message: 'Welcome to the Boooook API!' });
});

export default router;
