// middleware/auditLogger.js
import admin from 'firebase-admin';

const db = admin.firestore();

// 高頻或無意義路徑白名單
const IGNORED_PATH_PREFIXES = [
  '/health',
  '/api/health',
  '/api/system/health',
  '/api/platform-status/database-stats', // 首頁狀態輪詢
];

const IGNORED_METHODS = new Set(['OPTIONS']);

const MAX_METADATA_KEYS = 8;

const inferResource = (originalUrl = '') => {
  const segments = originalUrl.split('?')[0].split('/').filter(Boolean);
  if (segments.length < 2) return segments[0] || 'root';
  // /api/workspaces/:id -> workspaces
  return segments[1];
};

const inferAction = (method) => {
  switch (method) {
    case 'GET':
      return 'VIEW';
    case 'POST':
      return 'CREATE';
    case 'PUT':
    case 'PATCH':
      return 'UPDATE';
    case 'DELETE':
      return 'DELETE';
    default:
      return 'UNKNOWN';
  }
};

const sanitizeMetadata = (req) => {
  const metadata = {};
  const collect = (source, label) => {
    if (!source || typeof source !== 'object') return;
    const keys = Object.keys(source).slice(0, MAX_METADATA_KEYS);
    if (!keys.length) return;
    metadata[label] = keys.reduce((acc, key) => {
      const value = source[key];
      acc[key] = value && typeof value === 'object' ? '[object]' : value;
      return acc;
    }, {});
  };

  collect(req.params, 'params');
  collect(req.query, 'query');
  if (req.body && typeof req.body === 'object') {
    collect(req.body, 'body');
  }

  return metadata;
};

export function auditLogger(req, res, next) {
  const startTime = Date.now();

  res.on('finish', () => {
    try {
      if (process.env.NODE_ENV === 'development') return;
      const { method, originalUrl } = req;

      if (IGNORED_METHODS.has(method)) return;
      if (IGNORED_PATH_PREFIXES.some(prefix => originalUrl.startsWith(prefix))) return;
      if (!req.user?.uid) return;

      const entry = {
        userId: req.user.uid,
        method,
        path: originalUrl.split('?')[0],
        action: inferAction(method),
        resource: inferResource(originalUrl),
        statusCode: res.statusCode,
        durationMs: Date.now() - startTime,
        ip:
          (req.headers['x-forwarded-for']?.split(',')[0]?.trim()) ||
          req.socket?.remoteAddress ||
          null,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        metadata: sanitizeMetadata(req),
      };

      db.collection('auditLogs').add(entry).catch((err) => {
        console.error('[AuditLogger] Failed to write log', err);
      });
    } catch (error) {
      console.error('[AuditLogger] Unexpected error', error);
    }
  });

  next();
}

export default auditLogger;
