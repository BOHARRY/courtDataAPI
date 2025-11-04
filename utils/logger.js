// utils/logger.js
/**
 * 統一日誌工具 - 整合 Logz.io
 * 
 * 功能：
 * - 開發環境：輸出到 Console
 * - 生產環境：同時輸出到 Console 和 Logz.io
 * - 結構化日誌格式
 * - 自動添加服務元數據
 * 
 * 使用方式：
 * import logger from '../utils/logger.js';
 * 
 * logger.info('User logged in', { userId: '123', email: 'user@example.com' });
 * logger.error('Database connection failed', { error: err.message, stack: err.stack });
 * logger.warn('High memory usage', { usage: '85%' });
 */

import winston from 'winston';
import LogzioWinstonTransport from 'winston-logzio';

const { combine, timestamp, errors, json, printf, colorize } = winston.format;

// 環境變數
const NODE_ENV = process.env.NODE_ENV || 'development';
const LOG_LEVEL = process.env.LOG_LEVEL || (NODE_ENV === 'production' ? 'info' : 'debug');
const LOGZIO_TOKEN = process.env.LOGZIO_TOKEN;
const LOGZIO_HOST = process.env.LOGZIO_HOST || 'listener.logz.io';
const LOGZIO_TYPE = process.env.LOGZIO_TYPE || 'courtDataAPI';

// Console 格式化（開發環境友好）
const consoleFormat = printf(({ level, message, timestamp, service, ...metadata }) => {
  let msg = `${timestamp} [${level}] [${service || 'API'}] ${message}`;
  
  // 如果有額外的元數據，格式化輸出
  const metaKeys = Object.keys(metadata);
  if (metaKeys.length > 0) {
    // 過濾掉 Winston 內部欄位
    const filteredMeta = Object.keys(metadata)
      .filter(key => !['level', 'message', 'timestamp', 'service'].includes(key))
      .reduce((obj, key) => {
        obj[key] = metadata[key];
        return obj;
      }, {});
    
    if (Object.keys(filteredMeta).length > 0) {
      msg += `\n${JSON.stringify(filteredMeta, null, 2)}`;
    }
  }
  
  return msg;
});

// 創建 transports 陣列
const transports = [
  // Console Transport（所有環境都啟用）
  new winston.transports.Console({
    format: combine(
      colorize(),
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      consoleFormat
    )
  })
];

// 生產環境添加 Logz.io Transport
if (NODE_ENV === 'production' && LOGZIO_TOKEN) {
  try {
    console.log('🔧 Initializing Logz.io transport...');
    console.log(`   - Host: ${LOGZIO_HOST}`);
    console.log(`   - Type: ${LOGZIO_TYPE}`);
    console.log(`   - Token: ${LOGZIO_TOKEN.substring(0, 8)}...`);

    const logzioTransport = new LogzioWinstonTransport({
      level: 'info', // Logz.io 只記錄 info 以上級別
      name: 'winston_logzio',
      token: LOGZIO_TOKEN,
      host: LOGZIO_HOST,
      type: LOGZIO_TYPE,
      protocol: 'https',
      port: 8071,

      // 額外欄位（所有日誌都會包含）
      extraFields: {
        service: 'courtDataAPI',
        environment: NODE_ENV,
        version: '3.0',
        platform: 'render.com'
      },

      // 批次發送配置
      bufferSize: 100,
      sendIntervalMs: 2000,
      numberOfRetries: 3,

      // 調試模式（啟用以查看發送狀態）
      debug: true,

      // 添加 OpenTelemetry 上下文（如果有的話）
      addOtelContext: true
    });

    transports.push(logzioTransport);
    console.log('✅ Logz.io transport initialized successfully');
    console.log(`   - Transports count: ${transports.length}`);
  } catch (error) {
    console.error('❌ Failed to initialize Logz.io transport:', error.message);
    console.error('   - Stack:', error.stack);
  }
} else if (NODE_ENV === 'production' && !LOGZIO_TOKEN) {
  console.warn('⚠️  LOGZIO_TOKEN not found. Logz.io logging disabled.');
} else {
  console.log(`ℹ️  Logz.io disabled (NODE_ENV: ${NODE_ENV})`);
}

// 創建 Logger 實例
const logger = winston.createLogger({
  level: LOG_LEVEL,
  
  // 預設格式（用於 Logz.io）
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }), // 自動處理 Error 物件
    json() // JSON 格式
  ),
  
  // 預設元數據（所有日誌都會包含）
  defaultMeta: {
    service: 'courtDataAPI',
    environment: NODE_ENV,
    version: '3.0'
  },
  
  transports
});

/**
 * 輔助函數：格式化錯誤物件
 * @param {Error} error - 錯誤物件
 * @returns {Object} - 格式化的錯誤資訊
 */
function formatError(error) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
      name: error.name,
      ...(error.code && { code: error.code }),
      ...(error.statusCode && { statusCode: error.statusCode })
    };
  }
  return { error: String(error) };
}

/**
 * 擴展的 Logger 方法
 * 提供更友好的 API
 */
const enhancedLogger = {
  /**
   * Debug 級別日誌（僅開發環境）
   */
  debug: (message, meta = {}) => {
    logger.debug(message, meta);
  },
  
  /**
   * Info 級別日誌
   */
  info: (message, meta = {}) => {
    logger.info(message, meta);
  },
  
  /**
   * Warning 級別日誌
   */
  warn: (message, meta = {}) => {
    logger.warn(message, meta);
  },
  
  /**
   * Error 級別日誌
   * 自動處理 Error 物件
   */
  error: (message, errorOrMeta = {}) => {
    if (errorOrMeta instanceof Error) {
      logger.error(message, formatError(errorOrMeta));
    } else {
      logger.error(message, errorOrMeta);
    }
  },
  
  /**
   * HTTP 請求日誌
   * 專門用於記錄 API 請求
   */
  http: (message, meta = {}) => {
    logger.http(message, {
      type: 'http_request',
      ...meta
    });
  },
  
  /**
   * 業務日誌
   * 用於記錄重要的業務事件
   */
  business: (message, meta = {}) => {
    logger.info(message, {
      type: 'business_event',
      ...meta
    });
  },
  
  /**
   * 安全日誌
   * 用於記錄安全相關事件
   */
  security: (message, meta = {}) => {
    logger.warn(message, {
      type: 'security_event',
      ...meta
    });
  },
  
  /**
   * 性能日誌
   * 用於記錄性能指標
   */
  performance: (message, meta = {}) => {
    logger.info(message, {
      type: 'performance',
      ...meta
    });
  }
};

// 顯示配置資訊（所有環境）
console.log('📋 Logger Configuration:');
console.log(`  - Environment: ${NODE_ENV}`);
console.log(`  - Log Level: ${LOG_LEVEL}`);
console.log(`  - Logz.io: ${LOGZIO_TOKEN ? '✅ Enabled' : '❌ Disabled'}`);
console.log(`  - Transports: ${transports.length} (${transports.map(t => t.name || t.constructor.name).join(', ')})`);

// 生產環境發送測試日誌
if (NODE_ENV === 'production' && LOGZIO_TOKEN) {
  // 延遲發送，確保 transport 完全初始化
  setTimeout(() => {
    enhancedLogger.info('Logger initialized successfully', {
      timestamp: new Date().toISOString(),
      transports: transports.length,
      logLevel: LOG_LEVEL
    });
    console.log('📤 Test log sent to Logz.io');
  }, 1000);
}

export default enhancedLogger;

