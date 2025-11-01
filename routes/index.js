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
import paymentRoutes from './payment.js';
import intakeRoutes from './intake.js';
import ezshipRoutes from './ezship.js'; // 新增這行
import workspaceRoutes from './workspace.js';
import semanticSearchRoutes from './semantic-search.js';
import maintenanceRoutes from './maintenanceRoutes.js'; // 維護模式路由
import lawSearchRoutes from './law-search.js';
import mcpRoutes from './mcp.js';
import aiAgentRoutes from './ai-agent.js';
import citationRoutes from './citation.js';
import auditLogRoutes from './auditLogs.js'; // 🔥 新增引用判決查詢路由
import adminUsersRoutes from './adminUsers.js';
import satisfactionSurveyRoutes from './satisfactionSurvey.js'; // 🎯 滿意度調查路由
import systemStatusRoutes from './systemStatus.js'; // 🎯 系統狀況路由
import caseDescriptionSearchRoutes from './case-description-search.js'; // 🆕 案由搜尋路由
import attachmentRoutes from './attachment.js'; // 🆕 附表解析路由
import { getCaseDetailController } from '../controllers/judgment-controller.js';
import { verifyToken } from '../middleware/auth.js';


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
router.use('/payment', paymentRoutes);
router.use('/intake', intakeRoutes);
router.use('/ezship', ezshipRoutes); // 新增這行
router.use('/workspaces', workspaceRoutes);
router.use('/system', maintenanceRoutes); // 維護模式路由
router.use('/semantic-search', semanticSearchRoutes);
router.use('/law-search', lawSearchRoutes); // 新增語意搜尋路由
router.use('/mcp', mcpRoutes); // 新增 MCP 路由
router.use('/ai-agent', aiAgentRoutes); // 新增 AI Agent 路由
router.use('/citation', verifyToken, citationRoutes); // 🔥 新增引用判決查詢路由（需要身份驗證）
router.use('/audit-logs', auditLogRoutes);
router.use('/admin/users', adminUsersRoutes);
router.use('/admin', systemStatusRoutes); // 🎯 系統狀況路由
router.use('/satisfaction-survey', satisfactionSurveyRoutes); // 🎯 滿意度調查路由
router.use('/case-description-search', caseDescriptionSearchRoutes); // 🆕 案由搜尋路由
router.use('/attachment', attachmentRoutes); // 🆕 附表解析路由

// 案件詳情路由（用於律師表現浮動視窗）
router.get('/case-detail/:id', verifyToken, getCaseDetailController);

// 可以有一個根路由 /api 的健康檢查或歡迎訊息
router.get('/', (req, res) => {
  res.json({ message: 'Welcome to the Boooook API!' });
});

export default router;

