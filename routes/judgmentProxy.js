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
    
    // 1. 確保jQuery首先加載
    const jqueryScript = `<script src="${baseUrl}/proxy/js/jquery-3.6.0.min.js"></script>`;
    html = html.replace('</head>', `${jqueryScript}</head>`);
    
    // 2. 替換所有絕對和相對路徑
    html = html
      // 替換具體的src和href
      .replace(/src=["'](https?:\/\/judgment\.judicial\.gov\.tw)?\/([^"']+)["']/g, 
              `src="${baseUrl}/proxy/$2"`)
      .replace(/href=["'](https?:\/\/judgment\.judicial\.gov\.tw)?\/([^"']+)["']/g, 
              `href="${baseUrl}/proxy/$2"`)
      
      // 在CSS和JavaScript中替換URL
      .replace(/url\(["']?(\/[^"'\)]+)["']?\)/g, `url(${baseUrl}/proxy$1)`)
      
      // 處理內聯JavaScript中的URL模式
      .replace(/url\s*:\s*["'](\/[^"']+)["']/g, `url: "${baseUrl}/proxy$1"`)
      .replace(/\$\.get\(["'](\/[^"']+)["']/g, `$.get("${baseUrl}/proxy$1"`)
      .replace(/\$\.post\(["'](\/[^"']+)["']/g, `$.post("${baseUrl}/proxy$1"`)
      .replace(/ajax\(\s*{\s*url\s*:\s*["'](\/[^"']+)["']/g, `ajax({ url: "${baseUrl}/proxy$1"`)
      
      // 處理特殊情況：以http開頭但沒有domain的路徑
      .replace(/(src|href)=["'](\/\/[^"']+)["']/g, `$1="${baseUrl}/proxy-absolute/$2"`)
      
      // 處理絕對路徑但沒有協議的情況
      .replace(/(src|href)=["'](\/\/[^"']+)["']/g, `$1="${baseUrl}/proxy-absolute/$2"`);

    // 3. 添加AJAX請求攔截器
    const interceptScript = `
    <script>
      (function() {
        // 代理基礎URL
        const PROXY_BASE = "${baseUrl}/proxy";
        
        // 處理URL轉換的通用函數
        function rewriteUrl(url) {
          // 如果是絕對URL
          if (url.startsWith('http')) {
            if (url.includes('judgment.judicial.gov.tw')) {
              try {
                const urlObj = new URL(url);
                return PROXY_BASE + urlObj.pathname + urlObj.search;
              } catch (e) {
                return url;
              }
            }
            return url;
          }
          
          // 處理相對URL以/開頭
          if (url.startsWith('/')) {
            return PROXY_BASE + url;
          }
          
          // 處理localhost URLs
          if (url.includes('localhost')) {
            const path = url.substring(url.indexOf('/', 8));
            return PROXY_BASE + path;
          }
          
          return url;
        }
        
        // 攔截XMLHttpRequest
        const origOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url, async, user, pass) {
          const newUrl = rewriteUrl(url);
          console.log('XHR Intercepted:', url, '->', newUrl);
          return origOpen.call(this, method, newUrl, async, user, pass);
        };
        
        // 攔截jQuery AJAX (如果jQuery存在)
        if (window.jQuery) {
          const origAjax = jQuery.ajax;
          jQuery.ajax = function(options) {
            if (typeof options === 'string') {
              options = { url: options };
            }
            
            if (options.url) {
              options.url = rewriteUrl(options.url);
            }
            
            return origAjax.apply(jQuery, [options]);
          };
          
          // 攔截jQuery的get和post方法
          ['get', 'post'].forEach(function(method) {
            const orig = jQuery[method];
            jQuery[method] = function(url, data, callback, type) {
              url = rewriteUrl(url);
              return orig.call(jQuery, url, data, callback, type);
            };
          });
          
          console.log('jQuery AJAX interception initialized');
        } else {
          console.warn('jQuery not found for AJAX interception');
        }
        
        // 攔截所有的<a>元素點擊
        document.addEventListener('click', function(e) {
          if (e.target.tagName === 'A' && e.target.href) {
            // 判斷是否需要攔截
            if (e.target.href.includes('judgment.judicial.gov.tw') || 
                e.target.href.startsWith('/') ||
                e.target.href.includes('localhost')) {
              e.preventDefault();
              e.target.href = rewriteUrl(e.target.href);
              window.location.href = e.target.href;
            }
          }
        }, true);
        
        console.log('✅ URL rewriting and AJAX interception initialized');
      })();
    </script>
    `;
    
    // 注入攔截腳本和CSP
    const headClosing = '</head>';
    html = html.replace(headClosing, `
    <meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval'; font-src * data:; img-src * data:;">
    ${interceptScript}
    ${headClosing}`);
    
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('Proxy Error:', err);
    res.status(500).send(`擷取失敗: ${err.message}`);
  }
});

// 處理以//開頭的URL (沒有協議的絕對URL)
router.get('/proxy-absolute/*', async (req, res) => {
  let path = req.params[0] || '';
  const url = `https:${path}`;
  
  try {
    const response = await fetch(url);
    const contentType = response.headers.get('content-type') || getMimeType(path);
    const buffer = await response.buffer();
    
    res.set('Content-Type', contentType);
    res.send(buffer);
  } catch (err) {
    console.error(`無法獲取絕對資源: ${url}`, err);
    res.status(404).send('資源未找到');
  }
});

// 資源代理路由，設置正確的MIME類型
router.get('/proxy/*', async (req, res) => {
  let resourcePath = req.params[0] || '';
  
  // 處理查詢參數
  if (req.url.includes('?')) {
    resourcePath += req.url.substring(req.url.indexOf('?'));
  }
  
  const url = `${JUDICIAL_BASE}/${resourcePath}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
        'Referer': JUDICIAL_BASE
      }
    });
    
    if (!response.ok) {
      console.warn(`資源回應非200狀態碼: ${url} - ${response.status}`);
    }
    
    // 根據文件路徑判斷MIME類型
    const mimeType = getMimeType(resourcePath);
    
    // 設置正確的內容類型
    res.set('Content-Type', mimeType);
    
    // 簡化：所有資源都用buffer處理
    const buffer = await response.buffer();
    res.send(buffer);
  } catch (err) {
    console.error(`資源代理錯誤: ${url}`, err);
    res.status(404).send(`資源未找到: ${err.message}`);
  }
});

export default router;