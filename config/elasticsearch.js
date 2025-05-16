// config/elasticsearch.js
import { Client } from '@elastic/elasticsearch';
import { ES_URL, ES_API_KEY } from './environment.js';

if (!ES_URL || !ES_API_KEY) {
  // environment.js 中已經做了檢查，但這裡可以再次確認
  throw new Error('Elasticsearch URL or API Key is not configured in environment variables.');
}

const client = new Client({
  node: ES_URL,
  auth: {
    apiKey: ES_API_KEY
  }
});

// 可以添加一個健康檢查或 ping
export const checkElasticsearchConnection = async () => {
  try {
    await client.ping();
    console.log("Successfully connected to Elasticsearch.");
    return true;
  } catch (error) {
    console.error("Elasticsearch connection failed:", error);
    // 根據您的錯誤處理策略，可能需要 process.exit(1)
    // throw error; // 先不拋出，避免啟動時直接崩潰，但會在控制台打印錯誤
    return false;
  }
};

export default client; // 導出 ES 客戶端實例