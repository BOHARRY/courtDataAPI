// routes/judgmentProxy.js 修改版

import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();

router.get('/', async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).send('缺少 id 參數');

  const url = `https://judgment.judicial.gov.tw/FJUD/data.aspx?ty=JD&id=${id}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
        'Referer': 'https://judgment.judicial.gov.tw/',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    });
    
    let html = await response.text();

    // 1. 處理所有資源路徑
    html = html
      // 替換所有絕對路徑 (處理帶協議的URLs)
      .replace(/src=\"https?:\/\/judgment\.judicial\.gov\.tw\//g, 'src="https://judgment.judicial.gov.tw/')
      .replace(/href=\"https?:\/\/judgment\.judicial\.gov\.tw\//g, 'href="https://judgment.judicial.gov.tw/')
      
      // 處理相對路徑
      .replace(/src=\"\//g, 'src="https://judgment.judicial.gov.tw/')
      .replace(/href=\"\//g, 'href="https://judgment.judicial.gov.tw/')
      
      // 處理不帶斜線的相對路徑 (比如 "images/logo.png")
      .replace(/(src|href)=\"(?!https?:\/\/)(?!\/\/)([\w\-\.]+\/)/g, '$1="https://judgment.judicial.gov.tw/$2')
      
      // 處理 AJAX URLs (GetJudRelatedLaw.ashx 和 GetJudHistory.ashx 等)
      .replace(/url\s*:\s*['"]?(\/controls\/.*?)['"]?/g, 'url: "https://judgment.judicial.gov.tw$1"')
      .replace(/\$\.get\(['"]?(\/controls\/.*?)['"]?/g, '$.get("https://judgment.judicial.gov.tw$1"')
      .replace(/\$\.ajax\(\s*{\s*url\s*:\s*['"]?(\/controls\/.*?)['"]?/g, '$.ajax({ url: "https://judgment.judicial.gov.tw$1"')
      .replace(/\$\.post\(['"]?(\/controls\/.*?)['"]?/g, '$.post("https://judgment.judicial.gov.tw$1"');

    // 2. 注入一段攔截AJAX請求的代碼 (在頁面頂部)
    const ajaxInterceptScript = `
    <script>
      (function() {
        // 保存原始方法
        var originalOpen = XMLHttpRequest.prototype.open;
        
        // 覆蓋原始方法
        XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
          // 檢查URL是否為相對路徑或localhost
          if (url.startsWith('/') || url.indexOf('localhost') > -1) {
            // 將相對路徑轉換為絕對路徑
            url = 'https://judgment.judicial.gov.tw' + (url.startsWith('/') ? url : url.substring(url.indexOf('/', 8)));
          }
          
          // 調用原始方法
          return originalOpen.apply(this, arguments);
        };
        
        // 如果頁面使用jQuery，攔截jQuery的AJAX
        if (window.jQuery) {
          var originalAjax = jQuery.ajax;
          jQuery.ajax = function(options) {
            if (typeof options === 'string') {
              options = { url: options };
            }
            
            if (options.url && (options.url.startsWith('/') || options.url.indexOf('localhost') > -1)) {
              options.url = 'https://judgment.judicial.gov.tw' + (options.url.startsWith('/') ? options.url : options.url.substring(options.url.indexOf('/', 8)));
            }
            
            return originalAjax.apply(this, [options]);
          };
        }
      })();
    </script>
    `;
    
    // 3. 添加CSP (Content Security Policy) 和字體CORS處理
    const headTag = '<head>';
    const headReplacement = `<head>
    <meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval'; font-src * data: 'unsafe-inline';">
    ${ajaxInterceptScript}`;
    
    html = html.replace(headTag, headReplacement);
    
    // 4. 移除Google Analytics (可選)
    html = html.replace(/<script.*?google-analytics.*?<\/script>/gs, '');
    
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('Proxy Error:', err);
    res.status(500).send(`擷取失敗: ${err.message}`);
  }
});

// 新增處理其他資源的路由
router.get('/resources/*', async (req, res) => {
  const resourcePath = req.params[0];
  const url = `https://judgment.judicial.gov.tw/${resourcePath}`;
  
  try {
    const response = await fetch(url);
    const contentType = response.headers.get('content-type');
    const buffer = await response.buffer();
    
    res.set('Content-Type', contentType);
    res.send(buffer);
  } catch (err) {
    console.error(`Resource Proxy Error (${url}):`, err);
    res.status(404).send('Resource not found');
  }
});

export default router;