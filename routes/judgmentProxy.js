// routes/judgmentProxy.js

import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();

router.get('/', async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).send('缺少 id 參數');

  const url = `https://judgment.judicial.gov.tw/FJUD/data.aspx?ty=JD&id=${id}`;
  console.log(`嘗試訪問: ${url}`);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
        'Referer': 'https://judgment.judicial.gov.tw/',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    });
    
    console.log(`回應狀態碼: ${response.status}`);
    let html = await response.text();
    console.log(`返回內容長度: ${html.length} 字元`);

    // 修正所有相對路徑 - 擴展處理範圍
    html = html
      // 處理 /FJUD/ 開頭的路徑
      .replace(/src=\"\/(FJUD.*?)\"/g, 'src=\"https://judgment.judicial.gov.tw/$1\"')
      .replace(/href=\"\/(FJUD.*?)\"/g, 'href=\"https://judgment.judicial.gov.tw/$1\"')
      // 處理 /css/ 開頭的路徑
      .replace(/href=\"\/(css\/.*?)(\"|\?)/g, 'href=\"https://judgment.judicial.gov.tw/$1$2')
      // 處理 /js/ 開頭的路徑
      .replace(/src=\"\/(js\/.*?)(\"|\?)/g, 'src=\"https://judgment.judicial.gov.tw/$1$2')
      // 處理 /images/ 開頭的路徑
      .replace(/src=\"\/(images\/.*?)\"/g, 'src=\"https://judgment.judicial.gov.tw/$1\"')
      // 處理其他可能的相對路徑（如果有）
      .replace(/href=\"\/([^\"]*?)(\"|\?)/g, 'href=\"https://judgment.judicial.gov.tw/$1$2')
      .replace(/src=\"\/([^\"]*?)(\"|\?)/g, 'src=\"https://judgment.judicial.gov.tw/$1$2');

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('Proxy Error:', err);
    res.status(500).send(`擷取失敗: ${err.message}`);
  }
});

export default router;