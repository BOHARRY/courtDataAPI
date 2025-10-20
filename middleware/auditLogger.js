// middleware/auditLogger.js
import admin from 'firebase-admin';

const db = admin.firestore();

const IGNORED_PATH_PREFIXES = [
  '/health',
  '/api/health',
  '/api/system/health',
  '/api/platform-status/database-stats',
];

const IGNORED_METHODS = new Set(['OPTIONS']);
const MAX_METADATA_KEYS = 8;

const RESOURCE_LABELS = {
  workspaces: '工作區',
  judgments: '判決資料',
  users: '使用者資料',
  auditLogs: '操作紀錄',
};

const SUMMARIES = [
  { match: ({ method, segments }) => method === 'GET' && segments[1] === 'workspaces' && segments.length === 2, text: '查看工作區列表' },
  { match: ({ method, segments }) => method === 'GET' && segments[1] === 'workspaces' && segments.length === 4 && segments[3] === 'manifest', text: '載入工作區 Canvas 組態' },
  { match: ({ method, segments }) => method === 'POST' && segments[1] === 'workspaces' && segments.includes('nodes') && segments.includes('batch'), text: '批次建立節點' },
  { match: ({ method, segments }) => method === 'PUT' && segments[1] === 'workspaces' && segments.length === 3, text: '更新工作區設定' },
  { match: ({ method, segments }) => method === 'PUT' && segments[1] === 'workspaces' && segments.includes('nodes') && segments.includes('batch'), text: '批次更新節點資料' },
  { match: ({ method, segments }) => method === 'PUT' && segments[1] === 'workspaces' && segments.includes('canvas') && segments.includes('manifest'), text: '更新 Canvas 組態' },
  { match: ({ method, segments }) => method === 'PATCH' && segments[1] === 'workspaces' && segments.includes('nodes') && segments.includes('content'), text: '更新節點內容' },
  { match: ({ method, segments }) => method === 'PATCH' && segments[1] === 'workspaces' && segments.includes('canvas') && segments.includes('viewport'), text: '更新 Canvas 視窗位置' },
  { match: ({ method, segments }) => method === 'GET' && segments[1] === 'judgments', text: '查詢判決資料' },
  { match: ({ method, segments }) => method === 'POST' && segments[1] === 'judgments' && segments.includes('batch'), text: '批次下載判決資料' },
  { match: ({ method, segments }) => method === 'GET' && segments[1] === 'users' && segments.length === 2, text: '查詢使用者列表' },
];

const inferResource = (originalUrl = '') => {
  const segments = originalUrl.split('?')[0].split('/').filter(Boolean);
  if (segments.length < 2) return segments[0] || 'root';
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

const describeRequest = (method, path) => {
  const segments = path.split('?')[0].split('/').filter(Boolean);
  const key = { method, segments };
  for (const { match, text } of SUMMARIES) {
    try {
      if (match(key)) {
        return { summary: text, resourceLabel: RESOURCE_LABELS[segments[1]] || segments[1] || '未知資源' };
      }
    } catch (error) {
      // ignore matching errors
    }
  }
  const resourceLabel = RESOURCE_LABELS[segments[1]] || segments[1] || '未知資源';
  const rest = segments.length > 1 ? segments.slice(1).join('/') : '/';
  return { summary: method + ' ' + rest, resourceLabel };
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

      const path = originalUrl.split('?')[0];
      const { summary, resourceLabel } = describeRequest(method, path);

      const entry = {
        userId: req.user.uid,
        method,
        path,
        action: inferAction(method),
        resource: inferResource(originalUrl),
        resourceLabel,
        summary,
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
