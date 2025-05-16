// config/express.js
import express from 'express';
import cors from 'cors';
import mainRouter from '../routes/index.js';

const app = express();

// CORS 配置
app.use(cors({
  origin: '*', // 允許所有來源，生產環境建議限制特定域名
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 解析 JSON body
app.use(express.json());
// 解析 URL-encoded body
app.use(express.urlencoded({ extended: true }));

// 基本的日誌中間件 (可選, 只是示例)
app.use((req, res, next) => {
  console.log(`[Request] ${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
  next();
});

// 掛載路由
app.use('/api', mainRouter); // 所有 API 路由都有 /api 前綴

// 基本的 404 處理 (如果沒有路由匹配)
app.use((req, res, next) => {
  res.status(404).json({ error: 'Not Found', message: `The requested URL ${req.originalUrl} was not found on this server.` });
});

// 基本的錯誤處理中間件 (應該放在所有路由和中間件之後)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.stack || err.message || err);
  // 避免在生產環境洩露堆疊追蹤
  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' && statusCode === 500
    ? 'Internal Server Error'
    : err.message || 'An unexpected error occurred';

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }) // 開發模式下顯示堆疊
  });
});

export default app;