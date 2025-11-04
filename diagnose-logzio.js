// diagnose-logzio.js
/**
 * Logz.io 連接診斷工具
 * 用於測試 Logz.io 連接和配置
 */

import https from 'https';

const LOGZIO_TOKEN = process.env.LOGZIO_TOKEN;
const LOGZIO_HOST = process.env.LOGZIO_HOST || 'listener.logz.io';

console.log('🔍 Logz.io 連接診斷工具\n');

// 檢查 1: 環境變數
console.log('📋 Step 1: 檢查環境變數');
console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
console.log(`   LOGZIO_TOKEN: ${LOGZIO_TOKEN ? `${LOGZIO_TOKEN.substring(0, 8)}... (${LOGZIO_TOKEN.length} chars)` : '❌ NOT SET'}`);
console.log(`   LOGZIO_HOST: ${LOGZIO_HOST}`);

if (!LOGZIO_TOKEN) {
  console.error('\n❌ LOGZIO_TOKEN 未設置！請在環境變數中設置。');
  process.exit(1);
}

// 檢查 2: 測試直接 HTTPS 連接
console.log('\n📡 Step 2: 測試 HTTPS 連接到 Logz.io');

const testLog = {
  message: 'Test log from diagnose script',
  '@timestamp': new Date().toISOString(),
  type: 'courtDataAPI',
  service: 'courtDataAPI',
  environment: process.env.NODE_ENV || 'development',
  test: true
};

const postData = JSON.stringify(testLog);

const options = {
  hostname: LOGZIO_HOST,
  port: 8071,
  path: `/?token=${LOGZIO_TOKEN}`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

console.log(`   - Sending to: https://${LOGZIO_HOST}:8071`);
console.log(`   - Payload size: ${Buffer.byteLength(postData)} bytes`);

const req = https.request(options, (res) => {
  console.log(`\n✅ Response received:`);
  console.log(`   - Status Code: ${res.statusCode}`);
  console.log(`   - Status Message: ${res.statusMessage}`);
  console.log(`   - Headers:`, JSON.stringify(res.headers, null, 2));

  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    if (data) {
      console.log(`   - Response Body: ${data}`);
    }

    if (res.statusCode === 200) {
      console.log('\n🎉 成功！日誌已發送到 Logz.io');
      console.log('\n📊 下一步：');
      console.log('   1. 等待 1-2 分鐘讓日誌被索引');
      console.log('   2. 登入 Logz.io Dashboard: https://app.logz.io');
      console.log('   3. 搜尋: service:courtDataAPI AND test:true');
      console.log('   4. 如果看到日誌，表示連接正常！');
    } else {
      console.log('\n⚠️  收到非 200 響應，可能有問題');
    }
  });
});

req.on('error', (error) => {
  console.error('\n❌ 連接失敗:', error.message);
  console.error('   - Error Code:', error.code);
  console.error('   - Stack:', error.stack);
  
  console.log('\n🔧 可能的原因：');
  console.log('   1. LOGZIO_TOKEN 不正確');
  console.log('   2. LOGZIO_HOST 不正確（檢查你的 Logz.io 區域）');
  console.log('   3. 網路連接問題');
  console.log('   4. 防火牆阻擋');
  
  console.log('\n📍 Logz.io 區域對應的 Host：');
  console.log('   - US East (美國東部): listener.logz.io');
  console.log('   - EU West (歐洲西部): listener-eu.logz.io');
  console.log('   - UK (英國): listener-uk.logz.io');
  console.log('   - AU (澳洲): listener-au.logz.io');
  console.log('   - CA (加拿大): listener-ca.logz.io');
  console.log('   - WA (美國西部): listener-wa.logz.io');
  
  console.log('\n💡 請檢查你的 Logz.io 帳號區域，並設置正確的 LOGZIO_HOST');
});

req.write(postData);
req.end();

console.log('\n⏳ 等待響應...');

