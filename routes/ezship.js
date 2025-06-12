//這是EZSHIP拿來退換貨的代理路由，和律師工具無關，測試用的
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
    
    // 準備表單資料
    const params = new URLSearchParams();
    params.append('su_id', su_id);
    params.append('order_id', order_id);
    params.append('order_amount', order_amount);
    
    console.log('發送請求到 ezShip API...');
    
    // 發送請求到 ezShip
    const response = await axios.post(EZSHIP_API_URL, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (compatible; ezShip-Proxy/1.0)'
      },
      maxRedirects: 5,  // 自動處理重定向
      timeout: 30000,
      validateStatus: function (status) {
        return status >= 200 && status < 500; // 接受所有 2xx, 3xx, 4xx 狀態碼
      }
    });
    
    console.log('ezShip 回應狀態：', response.status);
    console.log('ezShip 原始回應：', response.data);
    
    // 解析回應
    let result = {};
    const responseData = response.data;
    
    if (typeof responseData === 'string' && responseData.includes('=')) {
      // 解析 key=value&key=value 格式
      const pairs = responseData.split('&');
      pairs.forEach(pair => {
        const [key, value] = pair.split('=');
        if (key && value) {
          result[key] = decodeURIComponent(value);
        }
      });
    } else if (typeof responseData === 'object') {
      result = responseData;
    } else {
      // 如果無法解析，返回原始資料
      result = { raw_response: responseData };
    }
    
    // 加入額外資訊
    result.http_code = response.status;
    result.timestamp = new Date().toISOString();
    
    console.log('解析後的結果：', result);
    
    // 回傳結果
    res.json(result);
    
  } catch (error) {
    console.error('ezShip 代理錯誤：', error);
    
    // 處理 axios 錯誤
    if (error.response) {
      // ezShip 伺服器回應了錯誤狀態
      res.status(error.response.status).json({
        error: 'ezShip API 錯誤',
        message: error.message,
        ezship_response: error.response.data,
        status: error.response.status
      });
    } else if (error.request) {
      // 請求已發送但沒有收到回應
      res.status(504).json({
        error: '無法連接到 ezShip 伺服器',
        message: '請求超時或網路錯誤'
      });
    } else {
      // 其他錯誤
      res.status(500).json({
        error: '代理伺服器內部錯誤',
        message: error.message
      });
    }
  }
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