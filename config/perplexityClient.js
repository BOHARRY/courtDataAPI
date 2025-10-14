// config/perplexityClient.js
// Perplexity API 客戶端配置

import axios from 'axios';
import { PERPLEXITY_API_KEY } from './environment.js';

/**
 * Perplexity API 客戶端
 * 使用 axios 創建一個預配置的 HTTP 客戶端
 * 
 * API 文檔: https://docs.perplexity.ai/
 * 
 * 特點:
 * - 使用 sonar 模型進行網路搜尋
 * - 支援 search_domain_filter 限定搜尋範圍
 * - 支援 return_citations 返回引用來源
 * - 速度比 OpenAI GPT-5-mini 快約 10 倍
 */
const perplexityClient = axios.create({
    baseURL: 'https://api.perplexity.ai',
    headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json'
    },
    timeout: 30000 // 30 秒超時
});

// 添加請求攔截器（用於日誌記錄）
perplexityClient.interceptors.request.use(
    (config) => {
        console.log(`[PerplexityClient] 發送請求: ${config.method.toUpperCase()} ${config.url}`);
        return config;
    },
    (error) => {
        console.error('[PerplexityClient] 請求錯誤:', error);
        return Promise.reject(error);
    }
);

// 添加響應攔截器（用於錯誤處理）
perplexityClient.interceptors.response.use(
    (response) => {
        console.log(`[PerplexityClient] 收到響應: ${response.status} ${response.statusText}`);
        return response;
    },
    (error) => {
        if (error.response) {
            // 服務器返回錯誤狀態碼
            console.error('[PerplexityClient] 響應錯誤:', {
                status: error.response.status,
                statusText: error.response.statusText,
                data: error.response.data
            });
        } else if (error.request) {
            // 請求已發送但沒有收到響應
            console.error('[PerplexityClient] 無響應:', error.request);
        } else {
            // 其他錯誤
            console.error('[PerplexityClient] 錯誤:', error.message);
        }
        return Promise.reject(error);
    }
);

export default perplexityClient;

