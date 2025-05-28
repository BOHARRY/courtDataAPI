// index.js (主入口文件)
import dotenv from 'dotenv';

// 1. 在所有其他 import 之前載入環境變數
dotenv.config();

// 2. 只引入必要的初始化函數和不依賴 Firebase 的模組
import { initializeFirebase } from './config/firebase.js';
import { PORT } from './config/environment.js';

async function main() {
  try {
    // 3. 首先執行 Firebase 初始化
    initializeFirebase();
    console.log("Firebase initialization completed in main function.");
    
    // 4. 在 Firebase 初始化後，使用動態 import 載入依賴 Firebase 的模組
    const { default: app } = await import('./config/express.js');
    const { checkElasticsearchConnection } = await import('./config/elasticsearch.js');
    
    console.log("Express app and other modules imported after Firebase init.");
    
    // 5. 檢查 Elasticsearch 連接
    const esConnected = await checkElasticsearchConnection();
    if (!esConnected) {
      console.warn("Warning: Elasticsearch connection check failed. The application may not function correctly.");
    }
    
    // 6. 啟動 HTTP 伺服器
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`API is available at http://localhost:${PORT}/api`);
    });
    
  } catch (error) {
    console.error('Failed to start server or initialize Firebase:', error);
    process.exit(1);
  }
}

// 7. 執行主函數
main();