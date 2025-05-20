// routes/judgmentProxy.js

import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();

router.get('/', async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).send('缺少 id 參數');

  const url = `https://judgment.judicial.gov.tw/FJUD/data.aspx?ty=JD&id=${id}`;

  try {
    const response = await fetch(url);
    let html = await response.text();

    // 修正 CSS 和 JS 相對路徑
    html = html.replace(/src=\"\/(FJUD.*?)\"/g, 'src=\"https://judgment.judicial.gov.tw/$1\"')
           .replace(/href=\"\/(FJUD.*?)\"/g, 'href=\"https://judgment.judicial.gov.tw/$1\"');

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('Proxy Error:', err);
    res.status(500).send('擷取失敗');
  }
});

export default router;
