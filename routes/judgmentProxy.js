import express from 'express';
import fetch from 'node-fetch';
import { URL } from 'url';
import path from 'path';

const router = express.Router();
const JUDICIAL_BASE = 'https://judgment.judicial.gov.tw';
const REQUEST_TIMEOUT = 10000; // 10 秒超時
const MAX_RETRIES = 3; // 最大重試次數

// 判斷 MIME 類型的輔助函數
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

// 帶重試的 fetch 函數
async function fetchWithRetry(url, options, retries = MAX_RETRIES) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, {
                ...options,
                timeout: REQUEST_TIMEOUT
            });
            return response;
        } catch (err) {
            if (i === retries - 1) throw err;
            console.warn(`Fetch 重試 ${i + 1}/${retries} 失敗: ${url}, 錯誤: ${err.message}`);
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
    }
}

// 主頁面代理路由
router.options('/', (req, res) => {
    res.set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.sendStatus(204);
});

router.get('/', async (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).send('缺少 id 參數');

    const decodedId = decodeURIComponent(id);
    const url = `${JUDICIAL_BASE}/FJUD/data.aspx?ty=JD&id=${encodeURIComponent(decodedId)}`;

    console.log(`請求 URL: ${url}`);

    try {
        const response = await fetchWithRetry(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                'Referer': JUDICIAL_BASE,
                'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Connection': 'keep-alive',
                'Accept-Encoding': 'gzip, deflate, br'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        let html = await response.text();
        const baseUrl = req.protocol + '://' + req.get('host') + '/api/judgment-proxy';

        // 1. 注入 jQuery 和 fancybox，保持 jQuery.noConflict
        html = html.replace(/<script.*jquery.*?\.js.*?<\/script>/gi, '');
        const scripts = `
  <script src="${baseUrl}/proxy/js/jquery-3.6.0.min.js"></script>
  <script>
    // 保持 noConflict 以避免衝突
    jQuery.noConflict();
  </script>
  <script src="${baseUrl}/proxy/js/jquery.fancybox.min.js"></script>
  <link rel="stylesheet" href="${baseUrl}/proxy/css/jquery.fancybox.min.css">
  <!-- 模擬 subset 為函數 -->
  <script>
    window.subset = window.subset || function() {
      console.log("Mock subset function called with:", arguments);
      return ""; // 返回空字串避免出現 undefined
    };
    console.log("Defined dummy subset function to prevent ReferenceError");
  </script>
`;
        html = html.replace('<head>', `<head>${scripts}`);

        // 2. 替換所有 URL，忽略字體相關資源
        html = html
            .replace(/src=["'](https?:\/\/judgment\.judicial\.gov\.tw)?\/([^"']+)["']/g,
                `src="${baseUrl}/proxy/$2"`)
            .replace(/href=["'](https?:\/\/judgment\.judicial\.gov\.tw)?\/([^"']+)["']/g,
                `href="${baseUrl}/proxy/$2"`)
            .replace(/url\s*:\s*["'](\/[^"']+)["']/g, `url: "${baseUrl}/proxy$1"`)
            .replace(/\$\.get\(["'](\/[^"']+)["']/g, `$.get("${baseUrl}/proxy$1"`)
            .replace(/\$\.post\(["'](\/[^"']+)["']/g, `$.post("${baseUrl}/proxy$1"`)
            .replace(/ajax\(\s*{\s*url\s*:\s*["'](\/[^"']+)["']/g, `ajax({ url: "${baseUrl}/proxy$1"`)
            .replace(/(src|href)=["'](\/\/[^"']+)["']/g, `$1="https:$2"`)
            // 移除字體相關腳本和資源
            .replace(/<script.*tpjwebfont2\.judicial\.gov\.tw.*?<\/script>/gi, '<!-- Webfont Removed -->')
            .replace(/<link.*fontawesome.*?\.css.*?>/gi, '<!-- FontAwesome CSS Removed -->')
            .replace(/<script.*fontawesome.*?\.js.*?>/gi, '<!-- FontAwesome JS Removed -->');

        // 在 URL 替換部分之後，添加 terms-tooltip 的特殊處理
        html = html.replace(
            /<script.*?terms-tooltip\.js.*?><\/script>/g,
            `<script>
    // 使用匿名函數創建獨立作用域
    (function() {
      // 先確保 CSS 載入
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.type = 'text/css';
      css.href = "${baseUrl}/proxy/css/terms-tooltip.css";
      document.head.appendChild(css);
      
      // 等待 jQuery 加載完成
      var checkJQuery = setInterval(function() {
        if (window.jQuery) {
          clearInterval(checkJQuery);
          console.log("jQuery 已就緒，載入 terms-tooltip 插件...");
          
          // 創建臨時的 $ 引用
          var _$ = window.jQuery;
          
          // 載入 terms-tooltip.js
          var script = document.createElement('script');
          script.src = "${baseUrl}/proxy/js/terms-tooltip.js";
          script.onload = function() {
            console.log("terms-tooltip.js 已載入，嘗試初始化...");
            
            setTimeout(function() {
              try {
                // 手動初始化 term_tooltip
                if (typeof _$.fn.term_tooltip === 'function') {
                  _$('.TooltipTarget').term_tooltip();
                  console.log("terms-tooltip 已手動初始化");
                } else {
                  console.error("terms-tooltip 插件未正確定義");
                }
              } catch(e) {
                console.error("初始化 terms-tooltip 時出錯:", e);
              }
            }, 1000); // 給足夠時間讓插件註冊
          };
          document.head.appendChild(script);
        }
      }, 100);
    })();
  </script>`
        );

        // 3. 添加攔截所有 AJAX 請求的代碼，包含防抖邏輯
        const interceptScript = `
    <script>
      (function() {
        const PROXY_BASE = "${baseUrl}/proxy";
        const JUDICIAL_BASE = "${JUDICIAL_BASE}";
        let lastAjaxCall = 0;
        const debounceDelay = 500; // 500ms 防抖
        
        function rewriteUrl(url) {
          console.log("Original URL:", url);
          
          // 處理以 '../' 開頭的相對路徑
          if (url.startsWith('../')) {
            return PROXY_BASE + '/' + url.substring(3);
          }
          
          // 處理絕對路徑
          if (url.startsWith('http')) {
            if (url.includes('judgment.judicial.gov.tw')) {
              try {
                const urlObj = new URL(url);
                return PROXY_BASE + urlObj.pathname + urlObj.search;
              } catch (e) {
                console.error("URL 解析錯誤:", e);
                return url;
              }
            }
            // 忽略字體相關域名
            if (url.includes('tpjwebfont2.judicial.gov.tw') || url.includes('fontawesome')) {
              console.log("Ignoring webfont/fontawesome URL:", url);
              return url;
            }
            return url;
          }
          
          // 處理相對路徑
          if (url.startsWith('/')) {
            return PROXY_BASE + url;
          }
          
          // 處理不帶斜線的相對路徑
          if (!url.startsWith('http') && !url.startsWith('/') && !url.startsWith('data:')) {
            return PROXY_BASE + '/' + url;
          }
          
          return url;
        }
        
        // 阻止頁面重新加載
        const origReload = window.location.reload;
        window.location.reload = function() {
          console.warn("Prevented page reload to avoid NS_BINDING_ABORTED");
        };
        
        // 攔截 XHR 請求
        const origXHROpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url, async, user, pass) {
          console.log("Original XHR URL:", url);
          const newUrl = rewriteUrl(url);
          console.log("Rewritten XHR URL:", newUrl);
          return origXHROpen.call(this, method, newUrl, async, user, pass);
        };
        
        // 攔截 Fetch 請求
        const origFetch = window.fetch;
        window.fetch = function(input, init) {
          console.log("Original Fetch URL:", input);
          const newInput = typeof input === 'string' ? rewriteUrl(input) : input;
          console.log("Rewritten Fetch URL:", newInput);
          return origFetch.call(window, newInput, init);
        };
        
        // 延遲攔截 jQuery AJAX
        setTimeout(function() {
  if (window.jQuery) {
    console.log("jQuery found, intercepting AJAX...");
    
    // 確保 $ 變數也能訪問 jQuery
    if (!window.$) {
      window.$ = window.jQuery;
      console.log("重新設置 $ 變數以供腳本使用");
    }
    
    // 攔截 jQuery.ajax
    const origAjax = jQuery.ajax;
    jQuery.ajax = function(options) {
      const now = Date.now();
      if (now - lastAjaxCall < debounceDelay) {
        console.log("Debouncing AJAX call:", options.url);
        return;
      }
      lastAjaxCall = now;
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
    
    // 攔截 jQuery 的 get 和 post 方法
    ['get', 'post'].forEach(function(method) {
      const orig = jQuery[method];
      jQuery[method] = function(url, data, callback, type) {
        console.log("Original jQuery." + method + " URL:", url);
        url = rewriteUrl(url);
        console.log("Rewritten jQuery." + method + " URL:", url);
        return orig.call(jQuery, url, data, callback, type);
      };
      
      // 如果 $ 存在且不等於 jQuery，也攔截 $.method
      if (window.$ && window.$ !== jQuery) {
        const origDollar = $[method];
        $[method] = function(url, data, callback, type) {
          console.log("Original $." + method + " URL:", url);
          url = rewriteUrl(url);
          console.log("Rewritten $." + method + " URL:", url);
          return origDollar.call($, url, data, callback, type);
        };
      }
    });
    
    // 攔截 jQuery.getScript
    const origGetScript = jQuery.getScript;
    jQuery.getScript = function(url, callback) {
      console.log("Original getScript URL:", url);
      url = rewriteUrl(url);
      console.log("Rewritten getScript URL:", url);
      return origGetScript.call(jQuery, url, callback);
    };
    
    // 如果 $ 存在且不等於 jQuery，也攔截 $.getScript
    if (window.$ && window.$ !== jQuery) {
      const origDollarGetScript = $.getScript;
      $.getScript = function(url, callback) {
        console.log("Original $.getScript URL:", url);
        url = rewriteUrl(url);
        console.log("Rewritten $.getScript URL:", url);
        return origDollarGetScript.call($, url, callback);
      };
    }
    
    // 攔截 $.ajax (如果 $ 存在且不等於 jQuery)
    if (window.$ && window.$ !== jQuery) {
      const origDollarAjax = $.ajax;
      $.ajax = function(options) {
        const now = Date.now();
        if (now - lastAjaxCall < debounceDelay) {
          console.log("Debouncing $.ajax call:", options.url);
          return;
        }
        lastAjaxCall = now;
        if (typeof options === 'string') {
          options = { url: options };
        }
        if (options.url) {
          console.log("Original $.ajax URL:", options.url);
          options.url = rewriteUrl(options.url);
          console.log("Rewritten $.ajax URL:", options.url);
        }
        return origDollarAjax.apply($, [options]);
      };
    }
    
    console.log("jQuery AJAX interception complete ✓");
  } else {
    console.warn("jQuery not available for interception!");
  }
}, 1000);
        
        console.log("AJAX Interception initialized ✓");
      })();
    </script>
    `;



        // 4. 添加簡化的 CSP，忽略字體
        html = html.replace('</head>', `
    <meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; img-src * data:; script-src * 'unsafe-inline' 'unsafe-eval'; style-src * 'unsafe-inline'; connect-src *;">
    ${interceptScript}
    </head>`);

        // 5. 設置基底路徑
        html = html.replace(/<base.*?>/g, '');
        html = html.replace('<head>', `<head><base href="${JUDICIAL_BASE}/FJUD/">`);

        // 6. 阻止第三方追蹤腳本
        html = html.replace(/<script.*?google-analytics.*?<\/script>/g, '<!-- Google Analytics Removed -->');
        html = html.replace(/<script.*?googletagmanager.*?<\/script>/g, '<!-- Google Tag Manager Removed -->');

        // 7. 添加非常簡單的 Fancybox 檢測和初始化腳本，避免過多干預
        const fancyboxInitScript = `
<script>
  window.addEventListener('load', function() {
    console.log("頁面載入完成，確保 jQuery 和 Fancybox 可用...");
    
    // 確保 $ 變數可用
    if (window.jQuery && !window.$) {
      window.$ = window.jQuery;
      console.log("在頁面載入後重新設置 $ 變數");
    }
    
    setTimeout(function() {
      if (window.jQuery) {
        // 檢查 fancybox 是否可用
        if (jQuery.fancybox) {
          console.log("Fancybox 插件已載入 ✓");
          
          // 嘗試初始化可能的 fancybox 元素
          try {
            jQuery('[data-fancybox], .fancybox').fancybox();
            console.log("已初始化找到的 fancybox 元素");
          } catch(e) {
            console.warn("初始化 fancybox 元素時出錯:", e);
          }
        } else {
          console.warn("Fancybox 插件未找到!");
        }
      }
    }, 2000);
  });
</script>
`;
        html = html.replace('</body>', `${fancyboxInitScript}</body>`);

        // 8. 添加 CORS 頭
        res.set({
            'Content-Type': 'text/html; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.send(html);
    } catch (err) {
        console.error('Proxy Error:', err.message, err.stack);
        res.status(500).send('伺服器錯誤，請稍後重試');
    }
});

// 特別處理 GetJudTerms.ashx 路由
router.options('/proxy/controls/GetJudTerms.ashx', (req, res) => {
    res.set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With, Authorization'
    });
    res.sendStatus(204);
});

router.get('/proxy/controls/GetJudTerms.ashx', async (req, res) => {
    const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    const url = `${JUDICIAL_BASE}/FJUD/controls/GetJudTerms.ashx${queryString}`;

    console.log(`處理特殊 GetJudTerms 請求: ${url}`);

    try {
        const response = await fetchWithRetry(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                'Referer': JUDICIAL_BASE + '/FJUD/',
                'Accept': '*/*',
                'Connection': 'keep-alive',
                'Accept-Encoding': 'gzip, deflate, br'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        let contentType = response.headers.get('content-type') || 'application/json';

        // 設置必要的跨域頭
        res.set({
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With, Authorization',
            'Access-Control-Max-Age': '86400' // 24小時
        });

        const buffer = await response.buffer();
        res.send(buffer);
    } catch (err) {
        console.error(`GetJudTerms 請求錯誤: ${url}`, err.message, err.stack);
        res.status(500).send('請求失敗');
    }
});

// 處理 controls 請求
router.options('/proxy/controls/*', (req, res) => {
    res.set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With, Authorization',
        'Access-Control-Max-Age': '86400' // 24小時
    });
    res.sendStatus(204);
});

router.get('/proxy/controls/*', async (req, res) => {
    const resourcePath = req.params[0] || '';
    const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    const url = `${JUDICIAL_BASE}/FJUD/controls/${resourcePath}${queryString}`;

    console.log(`處理 controls 請求: ${url}`);

    try {
        const response = await fetchWithRetry(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                'Referer': JUDICIAL_BASE + '/FJUD/',
                'Accept': '*/*',
                'Connection': 'keep-alive',
                'Accept-Encoding': 'gzip, deflate, br'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        let contentType = response.headers.get('content-type') || getMimeType(resourcePath);
        res.set({
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With, Authorization',
            'Cache-Control': 'no-cache'
        });

        const buffer = await response.buffer();
        res.send(buffer);
    } catch (err) {
        console.error(`Controls 路徑代理錯誤: ${url}`, err.message, err.stack);
        res.status(404).send('資源未找到');
    }
});

// 通用資源代理路由
router.options('/proxy/*', (req, res) => {
    res.set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.sendStatus(204);
});

router.get('/proxy/*', async (req, res) => {
    const resourcePath = req.params[0] || '';
    const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    const url = `${JUDICIAL_BASE}/${resourcePath}${queryString}`;

    console.log(`處理通用資源請求: ${url}`);

    try {
        const response = await fetchWithRetry(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                'Referer': JUDICIAL_BASE,
                'Accept': '*/*',
                'Connection': 'keep-alive',
                'Accept-Encoding': 'gzip, deflate, br'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        let contentType = response.headers.get('content-type') || getMimeType(resourcePath);
        res.set({
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });

        const buffer = await response.buffer();
        res.send(buffer);
    } catch (err) {
        console.error(`資源代理錯誤: ${url}`, err.message, err.stack);
        res.status(404).send('資源未找到');
    }
});

export default router;