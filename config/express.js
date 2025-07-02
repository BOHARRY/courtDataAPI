// config/express.js
import express from 'express';
import cors from 'cors';
import mainRouter from '../routes/index.js';
import judgmentProxyRouter from '../routes/judgmentProxy.js';

const app = express();

// CORS 配置
// 定義允許的來源白名單
const allowedOrigins = [
  'http://localhost:3000', // 開發環境
  'http://localhost:3001', // 另一個開發環境
  'http://localhost:3002', // 另一個開發環境
  'http://localhost:5000', // 另一個開發環境
  'http://localhost:5173', // Vite 預設端口
  'http://127.0.0.1:3000', // 本地 IP
  'http://127.0.0.1:3001', // 本地 IP
  'http://127.0.0.1:3002', // 本地 IP
  'http://127.0.0.1:5000', // 本地 IP
  'http://127.0.0.1:5173', // 本地 IP
  'https://frontend-court-search-web.vercel.app', // 生產環境 (假設)
];

app.use(cors({
  origin: function (origin, callback) {
    // 允許沒有 origin 的請求 (例如 Postman 或伺服器間請求)
    if (!origin) return callback(null, true);

    // 開發模式：允許所有 localhost 和 127.0.0.1 的請求
    if (process.env.NODE_ENV !== 'production') {
      if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
        return callback(null, true);
      }
    }

    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = '此來源的 CORS 政策不允許存取: ' + origin;
      console.log(`CORS 錯誤: ${msg}`);
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true // 允許帶有憑證的請求
}));

// 解析 JSON body，並增加大小限制
app.use(express.json({ limit: '50mb' }));
// 解析 URL-encoded body，並增加大小限制
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// 基本的日誌中間件 (可選, 只是示例)
app.use((req, res, next) => {
  console.log(`[Request] ${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
  next();
});

// 掛載路由
app.use('/api', mainRouter); // 所有 API 路由都有 /api 前綴
app.use('/api/judgment-proxy', judgmentProxyRouter);

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