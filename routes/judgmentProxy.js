// routes/judgmentProxy.js 完整版本

import express from 'express';
import fetch from 'node-fetch';
import { URL } from 'url';

const router = express.Router();
const JUDICIAL_BASE = 'https://judgment.judicial.gov.tw';

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
    
    // 1. 替換所有資源URL為我們的代理URL
    
    // 處理 src 屬性
    html = html.replace(/src=['"](https?:\/\/judgment\.judicial\.gov\.tw)?\/([^'"]+)['"]/g, 
                        `src="${baseUrl}/proxy/$2"`);
    
    // 處理 href 屬性
    html = html.replace(/href=['"](https?:\/\/judgment\.judicial\.gov\.tw)?\/([^'"]+)['"]/g, 
                        `href="${baseUrl}/proxy/$2"`);
    
    // 處理內聯JavaScript中的URL
    html = html.replace(/url\s*:\s*['"](\/[^'"]+)['"]/g, `url: "${baseUrl}/proxy$1"`);
    html = html.replace(/\$\.get\(['"](\/)([^'"]+)['"]/g, `$.get("${baseUrl}/proxy/$2"`);
    html = html.replace(/\$\.post\(['"](\/)([^'"]+)['"]/g, `$.post("${baseUrl}/proxy/$2"`);
    
    // 2. 注入JavaScript以攔截動態生成的AJAX請求
    const interceptScript = `
    <script>
      (function() {
        // 記錄我們的代理基礎URL
        const PROXY_BASE = "${baseUrl}/proxy";
        const ORIG_BASE = "${JUDICIAL_BASE}";
        
        // 攔截XMLHttpRequest
        const origXHROpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
          // 重寫URL
          let newUrl = url;
          
          // 處理相對URL (以 / 開頭)
          if (url.startsWith('/')) {
            newUrl = PROXY_BASE + url;
          } 
          // 處理包含localhost的URL
          else if (url.includes('localhost')) {
            const path = url.substring(url.indexOf('/', 8));
            newUrl = PROXY_BASE + path;
          }
          // 處理指向原始站點的URL
          else if (url.includes('judicial.gov.tw')) {
            const urlObj = new URL(url);
            const path = urlObj.pathname + urlObj.search;
            newUrl = PROXY_BASE + path;
          }
          
          console.log('XHR Intercepted:', url, '->', newUrl);
          return origXHROpen.call(this, method, newUrl, async, user, password);
        };
        
        // 攔截fetch API
        const origFetch = window.fetch;
        window.fetch = function(input, init) {
          if (typeof input === 'string') {
            // 處理相對URL (以 / 開頭)
            if (input.startsWith('/')) {
              input = PROXY_BASE + input;
            }
            // 處理包含localhost的URL
            else if (input.includes('localhost')) {
              const path = input.substring(input.indexOf('/', 8));
              input = PROXY_BASE + path;
            }
            // 處理指向原始站點的URL
            else if (input.includes('judicial.gov.tw')) {
              const urlObj = new URL(input);
              const path = urlObj.pathname + urlObj.search;
              input = PROXY_BASE + path;
            }
            console.log('Fetch Intercepted:', input);
          }
          return origFetch.call(this, input, init);
        };
        
        // 攔截jQuery AJAX (如果存在)
        if (window.jQuery) {
          const origAjax = jQuery.ajax;
          jQuery.ajax = function(options) {
            if (typeof options === 'string') {
              options = { url: options };
            }
            
            if (options.url) {
              // 處理相對URL (以 / 開頭)
              if (options.url.startsWith('/')) {
                options.url = PROXY_BASE + options.url;
              }
              // 處理包含localhost的URL
              else if (options.url.includes('localhost')) {
                const path = options.url.substring(options.url.indexOf('/', 8));
                options.url = PROXY_BASE + path;
              }
              // 處理指向原始站點的URL
              else if (options.url.includes('judicial.gov.tw')) {
                const urlObj = new URL(options.url);
                const path = urlObj.pathname + urlObj.search;
                options.url = PROXY_BASE + path;
              }
              console.log('jQuery AJAX Intercepted:', options.url);
            }
            
            return origAjax.apply(jQuery, [options]);
          };
          
          // 攔截jQuery的簡便方法
          ['get', 'post'].forEach(function(method) {
            const orig = jQuery[method];
            jQuery[method] = function(url, data, callback, type) {
              // 處理相對URL (以 / 開頭)
              if (url.startsWith('/')) {
                url = PROXY_BASE + url;
              }
              // 處理包含localhost的URL
              else if (url.includes('localhost')) {
                const path = url.substring(url.indexOf('/', 8));
                url = PROXY_BASE + path;
              }
              // 處理指向原始站點的URL
              else if (url.includes('judicial.gov.tw')) {
                const urlObj = new URL(url);
                const path = urlObj.pathname + urlObj.search;
                url = PROXY_BASE + path;
              }
              console.log('jQuery ' + method + ' Intercepted:', url);
              return orig.call(jQuery, url, data, callback, type);
            };
          });
        }
        
        console.log('💉 AJAX Interception initialized');
      })();
    </script>
    `;
    
    // 3. 添加CSP頭和攔截腳本
    const headTag = '<head>';
    const headReplacement = `<head>
    <meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval'; font-src * data: 'unsafe-inline';">
    ${interceptScript}`;
    
    html = html.replace(headTag, headReplacement);
    
    // 4. 停用第三方分析腳本
    html = html.replace(/<script.*?google-analytics.*?<\/script>/gs, '<!-- Google Analytics Removed -->');
    html = html.replace(/<script.*?googletagmanager.*?<\/script>/gs, '<!-- Google Tag Manager Removed -->');
    
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('Proxy Error:', err);
    res.status(500).send(`擷取失敗: ${err.message}`);
  }
});

// 通用代理路由 - 處理所有資源
router.get('/proxy/*', async (req, res) => {
  // 獲取原始路徑 (去掉 /proxy 前綴)
  let originalPath = req.params[0] || '';
  
  // 處理查詢參數
  if (req.url.includes('?')) {
    originalPath += req.url.substring(req.url.indexOf('?'));
  }
  
  // 構建完整URL
  const url = `${JUDICIAL_BASE}/${originalPath}`;
  console.log(`代理資源請求: ${url}`);
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
        'Referer': JUDICIAL_BASE,
        'Origin': JUDICIAL_BASE
      }
    });
    
    if (!response.ok) {
      console.error(`資源代理錯誤: ${url} 狀態碼: ${response.status}`);
      return res.status(response.status).send(`資源加載失敗: ${response.statusText}`);
    }
    
    // 獲取原始內容類型並設置相同的響應頭
    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.set('Content-Type', contentType);
    }
    
    // 設置CORS頭
    res.set('Access-Control-Allow-Origin', '*');
    
    // 複製其他相關頭
    const headers = ['content-length', 'cache-control', 'expires'];
    headers.forEach(header => {
      const value = response.headers.get(header);
      if (value) {
        res.set(header, value);
      }
    });
    
    // 對於二進制資源使用buffer，對於文本使用text
    if (contentType && (contentType.includes('text/') || contentType.includes('application/javascript') || contentType.includes('application/json'))) {
      let text = await response.text();
      
      // 如果是CSS或JS文件，替換裡面的URL
      if (contentType.includes('text/css')) {
        // 在CSS中替換URL
        const baseUrl = req.protocol + '://' + req.get('host') + '/api/judgment-proxy';
        text = text.replace(/url\(['"]?(\/[^'"\)]+)['"]?\)/g, `url(${baseUrl}/proxy$1)`);
      }
      
      res.send(text);
    } else {
      // 二進制數據
      const buffer = await response.buffer();
      res.send(buffer);
    }
  } catch (err) {
    console.error(`資源代理錯誤: ${url}`, err);
    res.status(500).send(`資源加載失敗: ${err.message}`);
  }
});

export default router;