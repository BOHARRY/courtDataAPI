// routes/judgmentProxy.js 修訂版

import express from 'express';
import fetch from 'node-fetch';
import { URL } from 'url';
import path from 'path';

const router = express.Router();
const JUDICIAL_BASE = 'https://judgment.judicial.gov.tw';

// 判斷MIME類型的輔助函數
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.eot': 'application/vnd.ms-fontobject'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// 主頁面代理路由
router.get('/', async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).send('缺少 id 參數');

  const url = `${JUDICIAL_BASE}/FJUD/data.aspx?ty=JD&id=${id}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
        'Referer': JUDICIAL_BASE,
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    let html = await response.text();
    const baseUrl = req.protocol + '://' + req.get('host') + '/api/judgment-proxy';
    
    // 1. 移除現有的jQuery (如果有)，然後在頂部添加jQuery
    html = html.replace(/<script.*jquery.*?<\/script>/gi, '');
    const jqueryScript = `<script src="${baseUrl}/proxy/js/jquery-3.6.0.min.js"></script>`;
    html = html.replace('<head>', `<head>${jqueryScript}`);
    
    // 2. 替換所有URL
    html = html
      // 替換src和href屬性中的URL
      .replace(/src=["'](https?:\/\/judgment\.judicial\.gov\.tw)?\/([^"']+)["']/g, 
              `src="${baseUrl}/proxy/$2"`)
      .replace(/href=["'](https?:\/\/judgment\.judicial\.gov\.tw)?\/([^"']+)["']/g, 
              `href="${baseUrl}/proxy/$2"`)
      
      // 處理內聯JavaScript中的URL
      .replace(/url\s*:\s*["'](\/[^"']+)["']/g, `url: "${baseUrl}/proxy$1"`)
      .replace(/\$\.get\(["'](\/[^"']+)["']/g, `$.get("${baseUrl}/proxy$1"`)
      .replace(/\$\.post\(["'](\/[^"']+)["']/g, `$.post("${baseUrl}/proxy$1"`)
      .replace(/ajax\(\s*{\s*url\s*:\s*["'](\/[^"']+)["']/g, `ajax({ url: "${baseUrl}/proxy$1"`)
      
      // 處理以//開頭的URL (沒有協議的絕對URL)
      .replace(/(src|href)=["'](\/\/[^"']+)["']/g, `$1="https:$2"`);

    // 3. 添加攔截所有AJAX請求的代碼
    const interceptScript = `
    <script>
      (function() {
        // 代理設置
        const PROXY_BASE = "${baseUrl}/proxy";
        const JUDICIAL_BASE = "${JUDICIAL_BASE}";
        
        // URL重寫函數
        function rewriteUrl(url) {
          console.log("Original URL:", url);
          
          // 處理特殊情況 - 以 '../' 開頭的相對路徑
          if (url.startsWith('../')) {
            return PROXY_BASE + '/controls/' + url.substring(3);
          }
          
          // 處理絕對路徑
          if (url.startsWith('http')) {
            if (url.includes('judgment.judicial.gov.tw')) {
              try {
                const urlObj = new URL(url);
                return PROXY_BASE + urlObj.pathname + urlObj.search;
              } catch (e) {
                console.error("URL解析錯誤:", e);
                return url;
              }
            }
            return url;
          }
          
          // 處理相對路徑
          if (url.startsWith('/')) {
            return PROXY_BASE + url;
          }
          
          // 處理localhost URLs
          if (url.includes('localhost')) {
            try {
              const urlObj = new URL(url);
              return PROXY_BASE + urlObj.pathname + urlObj.search;
            } catch (e) {
              console.error("localhost URL解析錯誤:", e);
              return url;
            }
          }
          
          // 處理不帶斜線的相對路徑
          if (!url.startsWith('http') && !url.startsWith('/') && !url.startsWith('data:')) {
            // 假設這些是相對於當前路徑的
            return PROXY_BASE + '/controls/' + url;
          }
          
          return url;
        }
        
        // 監聽所有XHR請求
        const origXHROpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url, async, user, pass) {
          console.log("Original XHR URL:", url);
          const newUrl = rewriteUrl(url);
          console.log("Rewritten XHR URL:", newUrl);
          return origXHROpen.call(this, method, newUrl, async, user, pass);
        };
        
        // 延遲一點時間去攔截jQuery
        setTimeout(function() {
          if (window.jQuery) {
            console.log("jQuery found, intercepting AJAX...");
            
            // 攔截jQuery AJAX
            const origAjax = jQuery.ajax;
            jQuery.ajax = function(options) {
              if (typeof options === 'string') {
                options = { url: options };
              }
              
              if (options.url) {
                console.log("Original AJAX URL:", options.url);
                options.url = rewriteUrl(options.url);
                console.log("Rewritten AJAX URL:", options.url);
              }
              
              return origAjax.apply(jQuery, [options]);
            };
            
            // 攔截get和post方法
            ['get', 'post'].forEach(function(method) {
              const orig = jQuery[method];
              jQuery[method] = function(url, data, callback, type) {
                console.log("Original jQuery." + method + " URL:", url);
                url = rewriteUrl(url);
                console.log("Rewritten jQuery." + method + " URL:", url);
                return orig.call(jQuery, url, data, callback, type);
              };
            });
            
            // 替換jQuery的getScript方法
            const origGetScript = jQuery.getScript;
            jQuery.getScript = function(url, callback) {
              console.log("Original getScript URL:", url);
              url = rewriteUrl(url);
              console.log("Rewritten getScript URL:", url);
              return origGetScript.call(jQuery, url, callback);
            };
            
            console.log("jQuery AJAX interception complete ✓");
          } else {
            console.warn("jQuery not available for interception!");
          }
        }, 1000);
        
        console.log("AJAX Interception initialized ✓");
      })();
    </script>
    `;
    
    // 添加內容安全策略和攔截腳本
    html = html.replace('</head>', `
    <meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; font-src * data:; img-src * data:;">
    ${interceptScript}
    </head>`);
    
    // 4. 修復 "controls" 相對路徑請求問題 - 添加基本路徑
    html = html.replace(/<base.*?>/g, ''); // 移除任何現有的base標籤
    html = html.replace('<head>', `<head><base href="${JUDICIAL_BASE}/FJUD/">`);
    
    // 5. 阻止Google Analytics和其他第三方請求
    html = html.replace(/<script.*?google-analytics.*?<\/script>/g, '<!-- Google Analytics Removed -->');
    html = html.replace(/<script.*?googletagmanager.*?<\/script>/g, '<!-- Google Tag Manager Removed -->');
    
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('Proxy Error:', err);
    res.status(500).send(`擷取失敗: ${err.message}`);
  }
});

// 處理到 /controls 的請求 - 特殊處理相對路徑
router.get('/proxy/controls/*', async (req, res) => {
  const resourcePath = req.params[0] || '';
  const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  const url = `${JUDICIAL_BASE}/FJUD/controls/${resourcePath}${queryString}`;
  
  console.log(`處理controls請求: ${url}`);
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
        'Referer': JUDICIAL_BASE + '/FJUD/',
        'Accept': '*/*'
      }
    });
    
    // 獲取內容類型
    let contentType = response.headers.get('content-type');
    if (!contentType) {
      contentType = getMimeType(resourcePath);
    }
    
    // 設置響應頭
    res.set('Content-Type', contentType);
    
    // 返回資源內容
    const buffer = await response.buffer();
    res.send(buffer);
  } catch (err) {
    console.error(`Controls路徑代理錯誤: ${url}`, err);
    res.status(404).send('資源未找到');
  }
});

// 通用資源代理路由
router.get('/proxy/*', async (req, res) => {
  let resourcePath = req.params[0] || '';
  const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  const url = `${JUDICIAL_BASE}/${resourcePath}${queryString}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
        'Referer': JUDICIAL_BASE,
        'Accept': '*/*'
      }
    });
    
    // 嘗試獲取內容類型，或根據文件擴展名確定
    let contentType = response.headers.get('content-type');
    if (!contentType || contentType === 'application/octet-stream' || contentType === 'text/html') {
      contentType = getMimeType(resourcePath);
    }
    
    // 設置響應頭
    res.set('Content-Type', contentType);
    
    // 返回資源內容
    const buffer = await response.buffer();
    res.send(buffer);
  } catch (err) {
    console.error(`資源代理錯誤: ${url}`, err);
    res.status(404).send('資源未找到');
  }
});

export default router;