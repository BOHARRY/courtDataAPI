// config/environment.js
import dotenv from 'dotenv';

// 確保 dotenv.config() 已經在應用程式入口處被調用
// 這裡主要是為了集中管理和導出配置

export const PORT = parseInt(process.env.PORT, 10) || 3000;
export const ES_URL = process.env.ES_URL;
export const ES_API_KEY = process.env.ES_API_KEY;
export const FIREBASE_SERVICE_ACCOUNT_KEY_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON;
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
export const OPENAI_MODEL_NAME_EMBEDDING = 'text-embedding-3-large';
export const OPENAI_MODEL_NAME_CHAT = 'gpt-4.1';

// 檢查必要的環境變數是否存在
if (!ES_URL) {
  console.error("FATAL ERROR: ES_URL environment variable is not set.");
  process.exit(1);
}
if (!ES_API_KEY) {
  console.error("FATAL ERROR: ES_API_KEY environment variable is not set.");
  process.exit(1);
}
if (!FIREBASE_SERVICE_ACCOUNT_KEY_JSON) {
  console.error("FATAL ERROR: FIREBASE_SERVICE_ACCOUNT_KEY_JSON environment variable is not set.");
  process.exit(1);
}
if (!OPENAI_API_KEY) {
  console.error("FATAL ERROR: OPENAI_API_KEY environment variable is not set.");
  process.exit(1);
}

// 記得檢查 OPENAI_MODEL_NAME_CHAT 是否也需要
if (!OPENAI_MODEL_NAME_EMBEDDING) {
  console.warn("WARNING: OPENAI_MODEL_NAME_EMBEDDING environment variable is not set. Defaulting in service.");
}
if (!OPENAI_MODEL_NAME_CHAT) {
  console.warn("WARNING: OPENAI_MODEL_NAME_CHAT environment variable is not set. Defaulting in service.");
}