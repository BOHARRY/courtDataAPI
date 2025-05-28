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
export const GMAIL_APP_USER = process.env.GMAIL_APP_USER;
export const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
export const CONTACT_FORM_RECIPIENT_EMAIL = process.env.CONTACT_FORM_RECIPIENT_EMAIL;
export const FIREBASE_STORAGE_BUCKET_NAME = process.env.FIREBASE_STORAGE_BUCKET_NAME;

export const NEWEBPAY_MERCHANT_ID = process.env.NEWEBPAY_MERCHANT_ID;
export const NEWEBPAY_HASH_KEY = process.env.NEWEBPAY_HASH_KEY;
export const NEWEBPAY_HASH_IV = process.env.NEWEBPAY_HASH_IV;
export const NEWEBPAY_MPG_URL = process.env.NEWEBPAY_MPG_URL || 'https://ccore.newebpay.com/MPG/mpg_gateway';
export const NEWEBPAY_PERIOD_URL = process.env.NEWEBPAY_PERIOD_URL || 'https://ccore.newebpay.com/MPG/period';
export const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000'; // 前端基礎 URL

export const BACKEND_API_URL = process.env.BACKEND_API_URL;

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

if (!GMAIL_APP_USER || !GMAIL_APP_PASSWORD || !CONTACT_FORM_RECIPIENT_EMAIL) {
  console.warn("WARNING: Gmail configuration for contact form is not complete. Email notifications may not work.");
}
if (!FIREBASE_STORAGE_BUCKET_NAME) {
    console.warn("WARNING: FIREBASE_STORAGE_BUCKET_NAME is not set. File attachments for contact form will fail.");
}

// 新增藍新金流相關的警告
if (!NEWEBPAY_MERCHANT_ID || !NEWEBPAY_HASH_KEY || !NEWEBPAY_HASH_IV) {
    console.warn("WARNING: Newebpay configuration is incomplete. Payment functions will not work.");
}