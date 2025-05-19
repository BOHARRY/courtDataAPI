// index.js (主入口文件)
import dotenv from 'dotenv';

// 在所有其他 import 之前載入環境變數
dotenv.config();

import app from './config/express.js';
import { initializeFirebase } from './config/firebase.js';
import { checkElasticsearchConnection } from './config/elasticsearch.js';
import { PORT } from './config/environment.js';


// 啟動伺服器的主函數
async function startServer() {
  try {
    // 初始化 Firebase Admin SDK
    initializeFirebase();
    
    // 檢查 Elasticsearch 連接
    const esConnected = await checkElasticsearchConnection();
    if (!esConnected) {
      console.warn("Warning: Elasticsearch connection check failed. The application may not function correctly.");
    }
    
    // 啟動 HTTP 伺服器
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`API is available at http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// 啟動應用程式
startServer();