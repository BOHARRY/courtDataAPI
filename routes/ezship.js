// routes/ezship.js
import express from 'express';
import axios from 'axios';

const router = express.Router();

// ezShip API 端點
const EZSHIP_API_URL = 'https://www.ezship.com.tw/emap/ezship_request_return_api.jsp';

// POST /api/ezship/return - 申請退貨編號
router.post('/return', async (req, res) => {
  try {
    console.log('收到 ezShip 退貨請求：', req.body);
    
    // 驗證必要參數
    const { su_id, order_id, order_amount } = req.body;
    
    if (!su_id || !order_id || !order_amount) {
      return res.status(400).json({ 
        error: '缺少必要參數',
        required: ['su_id', 'order_id', 'order_amount']
      });
    }
    
    // 驗證金額範圍
    const amount = parseInt(order_amount);
    if (isNaN(amount) || amount < 0 || amount > 2000) {
      return res.status(400).json({ 
        error: '退貨金額必須在 0-2000 元之間'
      });
    }
    
    // 準備表單資料 - 確保正確的格式
    const formData = `su_id=${encodeURIComponent(su_id)}&order_id=${encodeURIComponent(order_id)}&order_amount=${encodeURIComponent(order_amount)}`;
    
    console.log('發送請求到 ezShip API...');
    console.log('表單資料：', formData);
    
    // 發送請求到 ezShip
    const response = await axios({
      method: 'POST',
      url: EZSHIP_API_URL,
      data: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      maxRedirects: 0,  // 不自動重定向
      timeout: 30000,
      validateStatus: (status) => true, // 接受所有狀態碼
      responseType: 'text',
      responseEncoding: 'binary' // 保留原始編碼
    });
    
    console.log('ezShip 回應狀態：', response.status);
    console.log('ezShip 回應 headers：', response.headers);
    
    // 嘗試偵測並轉換編碼
    let responseText = response.data;
    
    // 檢查是否為 HTML（錯誤情況）
    if (responseText.includes('<HTML>') || responseText.includes('<html>') || 
        responseText.includes('<!DOCTYPE') || responseText.includes('meta http-equiv')) {
      
      console.error('收到 HTML 回應而非 API 回應');
      
      // 提供診斷資訊
      return res.status(400).json({
        error: 'ezShip API 錯誤',
        message: '收到網頁回應而非 API 資料',
        diagnostic: {
          status: response.status,
          headers: response.headers,
          suggestion: [
            '1. 請確認 su_id 是否為正確的 ezShip 商家帳號',
            '2. 確認該帳號是否已開通 API 串接權限',
            '3. 可能需要先在 ezShip 後台進行相關設定',
            '4. 請參考 ezShip 文件確認 API 端點是否正確'
          ]
        }
      });
    }
    
    // 處理 302 重定向 - ezShip 使用重定向回傳結果
    if (response.status === 302 || response.status === 301) {
      const location = response.headers.location;
      console.log('收到重定向，目標：', location);
      
      // 解析重定向 URL 中的參數
      const url = new URL(location);
      const params = new URLSearchParams(url.search);
      
      const result = {
        order_id: params.get('order_id'),
        sn_id: params.get('sn_id'),
        order_status: params.get('order_status'),
        webPara: params.get('webPara'),
        http_code: response.status,
        timestamp: new Date().toISOString()
      };
      
      console.log('從重定向 URL 解析的結果：', result);
      
      // 這是 ezShip 的正常回應方式，直接回傳結果
      return res.json(result);
    }
    
    // 嘗試解析 API 回應
    let result = {};
    
    // 檢查是否為 key=value 格式
    if (responseText.includes('=') && responseText.includes('&')) {
      console.log('解析 key=value 格式回應...');
      const pairs = responseText.split('&');
      pairs.forEach(pair => {
        const [key, value] = pair.split('=');
        if (key && value) {
          // 解碼 URL 編碼的值
          result[key] = decodeURIComponent(value.trim());
        }
      });
    } else if (responseText.trim().startsWith('{')) {
      // 嘗試 JSON 解析
      try {
        result = JSON.parse(responseText);
      } catch (e) {
        console.log('JSON 解析失敗');
      }
    }
    
    // 如果沒有解析出 order_status，可能格式有問題
    if (!result.order_status) {
      console.log('無法解析出 order_status，原始回應：', responseText.substring(0, 200));
      
      return res.status(400).json({
        error: '回應格式無法解析',
        raw_response: responseText.substring(0, 500),
        message: '請聯繫 ezShip 技術支援確認 API 格式'
      });
    }
    
    // 加入額外資訊
    result.http_code = response.status;
    result.timestamp = new Date().toISOString();
    
    console.log('解析後的結果：', result);
    
    // 回傳結果
    res.json(result);
    
  } catch (error) {
    console.error('ezShip 代理錯誤：', error);
    
    // 處理網路錯誤
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return res.status(504).json({
        error: '無法連接到 ezShip 伺服器',
        code: error.code,
        message: '網路連線錯誤或 ezShip 伺服器無回應'
      });
    }
    
    // 其他錯誤
    res.status(500).json({
      error: '代理伺服器內部錯誤',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// GET /api/ezship/test - 測試端點
router.get('/test', (req, res) => {
  res.json({
    message: 'ezShip 代理服務運作正常',
    endpoints: {
      return: '/api/ezship/return',
      health: '/api/ezship/health'
    },
    required_params: ['su_id', 'order_id', 'order_amount'],
    api_url: EZSHIP_API_URL
  });
});

// GET /api/ezship/health - 健康檢查
router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'ezShip Proxy',
    endpoint: EZSHIP_API_URL,
    timestamp: new Date().toISOString()
  });
});

export default router;