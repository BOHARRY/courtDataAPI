// test-logger.js
/**
 * Logger 測試腳本
 * 用於驗證 Logz.io 集成是否正常工作
 * 
 * 使用方式：
 * node test-logger.js
 */

import logger from './utils/logger.js';

console.log('🧪 開始測試 Logger...\n');

// 測試 1: Info 級別日誌
console.log('📝 測試 1: Info 級別日誌');
logger.info('Test info message', {
  testId: 'test-001',
  timestamp: new Date().toISOString(),
  data: { key: 'value' }
});

// 測試 2: Warning 級別日誌
console.log('\n📝 測試 2: Warning 級別日誌');
logger.warn('Test warning message', {
  testId: 'test-002',
  warningType: 'high_memory_usage',
  usage: '85%'
});

// 測試 3: Error 級別日誌
console.log('\n📝 測試 3: Error 級別日誌');
const testError = new Error('Test error message');
testError.code = 'TEST_ERROR';
logger.error('Test error occurred', testError);

// 測試 4: Business 日誌
console.log('\n📝 測試 4: Business 日誌');
logger.business('User completed purchase', {
  userId: 'test-user-123',
  orderId: 'order-456',
  amount: 1000,
  currency: 'TWD'
});

// 測試 5: Security 日誌
console.log('\n📝 測試 5: Security 日誌');
logger.security('Suspicious login attempt detected', {
  userId: 'test-user-789',
  ip: '192.168.1.100',
  reason: 'multiple_failed_attempts'
});

// 測試 6: Performance 日誌
console.log('\n📝 測試 6: Performance 日誌');
logger.performance('API response time', {
  endpoint: '/api/search',
  duration: 1234,
  statusCode: 200
});

// 測試 7: HTTP 日誌
console.log('\n📝 測試 7: HTTP 日誌');
logger.http('Incoming request', {
  method: 'POST',
  url: '/api/judgments/search',
  ip: '127.0.0.1',
  userAgent: 'Mozilla/5.0'
});

// 測試 8: Debug 日誌（僅開發環境）
console.log('\n📝 測試 8: Debug 日誌');
logger.debug('Debug information', {
  variable: 'test',
  value: 123,
  stack: new Error().stack
});

console.log('\n✅ Logger 測試完成！');
console.log('\n📊 檢查結果：');
console.log('1. 開發環境：所有日誌應該顯示在 Console');
console.log('2. 生產環境：日誌應該同時發送到 Console 和 Logz.io');
console.log('3. 請登入 Logz.io Dashboard 確認日誌是否成功送達');
console.log('\n🔗 Logz.io Dashboard: https://app.logz.io');

// 給 Logz.io 一些時間發送日誌
setTimeout(() => {
  console.log('\n⏳ 等待日誌發送完成...');
  process.exit(0);
}, 3000);

