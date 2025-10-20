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
  judges: '法官資料',
  lawyers: '律師資料',
  search: '判決搜尋',
  'semantic-search': '語意搜尋',
  'ai-agent': 'AI 對話',
  'law-search': '法條查詢',
  citation: '引用判決',
  mcp: 'MCP 工具',
  ai: 'AI 分析',
  complaint: '訴狀分析',
  payment: '付款',
  intake: '案件接案',
};

const SUMMARIES = [
  // 工作區相關
  { match: ({ method, segments }) => method === 'GET' && segments[1] === 'workspaces' && segments.length === 2, text: '查看工作區列表' },
  { match: ({ method, segments }) => method === 'GET' && segments[1] === 'workspaces' && segments.length === 4 && segments[3] === 'manifest', text: '載入工作區 Canvas 組態' },
  { match: ({ method, segments }) => method === 'POST' && segments[1] === 'workspaces' && segments.includes('nodes') && segments.includes('batch'), text: '批次建立節點' },
  { match: ({ method, segments }) => method === 'PUT' && segments[1] === 'workspaces' && segments.length === 3, text: '更新工作區設定' },
  { match: ({ method, segments }) => method === 'PUT' && segments[1] === 'workspaces' && segments.includes('nodes') && segments.includes('batch'), text: '批次更新節點資料' },
  { match: ({ method, segments }) => method === 'PUT' && segments[1] === 'workspaces' && segments.includes('canvas') && segments.includes('manifest'), text: '更新 Canvas 組態' },
  { match: ({ method, segments }) => method === 'PATCH' && segments[1] === 'workspaces' && segments.includes('nodes') && segments.includes('content'), text: '更新節點內容' },
  { match: ({ method, segments }) => method === 'PATCH' && segments[1] === 'workspaces' && segments.includes('canvas') && segments.includes('viewport'), text: '更新 Canvas 視窗位置' },

  // 判決資料相關
  { match: ({ method, segments }) => method === 'GET' && segments[1] === 'judgments' && segments.length === 3, text: '查詢單一判決詳情' },
  { match: ({ method, segments }) => method === 'POST' && segments[1] === 'judgments' && segments.includes('batch'), text: '批次下載判決資料' },

  // 法官相關
  { match: ({ method, segments }) => method === 'GET' && segments[1] === 'judges' && segments.length === 3, text: '查詢法官分析' },
  { match: ({ method, segments }) => method === 'GET' && segments[1] === 'judges' && segments[3] === 'analysis-status', text: '查詢法官AI分析狀態' },
  { match: ({ method, segments }) => method === 'POST' && segments[1] === 'judges' && segments[3] === 'reanalyze', text: '觸發法官重新分析' },

  // 律師相關
  { match: ({ method, segments }) => method === 'GET' && segments[1] === 'lawyers' && segments.length === 3, text: '查詢律師基本資料' },
  { match: ({ method, segments }) => method === 'GET' && segments[1] === 'lawyers' && segments[3] === 'cases-distribution', text: '查詢律師案件分布' },
  { match: ({ method, segments }) => method === 'GET' && segments[1] === 'lawyers' && segments[3] === 'analysis', text: '查詢律師優劣勢分析' },

  // 搜尋相關
  { match: ({ method, segments }) => method === 'GET' && segments[1] === 'search', text: '搜尋判決書' },
  { match: ({ method, segments }) => method === 'GET' && segments[1] === 'semantic-search', text: '語意搜尋判決書' },

  // AI 相關
  { match: ({ method, segments }) => method === 'POST' && segments[1] === 'ai-agent' && segments[2] === 'chat', text: 'AI 對話查詢' },
  { match: ({ method, segments }) => method === 'POST' && segments[1] === 'ai' && segments[2] === 'analyze-success-factors', text: 'AI 勝訴關鍵分析' },
  { match: ({ method, segments }) => method === 'POST' && segments[1] === 'ai' && segments[2] === 'summarize-common-points', text: 'AI 歸納判例共同點' },
  { match: ({ method, segments }) => method === 'POST' && segments[1] === 'ai' && segments[2] === 'citation-analysis', text: 'AI 引用分析' },
  { match: ({ method, segments }) => method === 'POST' && segments[1] === 'ai' && segments[2] === 'writing-assistant', text: 'AI 寫作助手' },
  { match: ({ method, segments }) => method === 'POST' && segments[1] === 'ai' && segments[2] === 'pleading-generation', text: 'AI 訴狀生成' },

  // 法條查詢
  { match: ({ method, segments }) => method === 'GET' && segments[1] === 'law-search', text: '查詢法條' },

  // 引用判決
  { match: ({ method, segments }) => method === 'POST' && segments[1] === 'citation' && segments[2] === 'query', text: '查詢引用判決' },

  // 訴狀分析
  { match: ({ method, segments }) => method === 'POST' && segments[1] === 'complaint' && segments[2] === 'validate-text', text: '驗證訴狀文本' },
  { match: ({ method, segments }) => method === 'POST' && segments[1] === 'complaint' && segments[2] === 'check-judge', text: '檢驗法官是否存在' },
  { match: ({ method, segments }) => method === 'POST' && segments[1] === 'complaint' && segments[2] === 'analyze-judge-match', text: '分析訴狀與法官匹配度' },

  // 使用者相關
  { match: ({ method, segments }) => method === 'GET' && segments[1] === 'users' && segments.length === 2, text: '查詢使用者列表' },
  { match: ({ method, segments }) => method === 'GET' && segments[1] === 'users' && segments[2] === 'credit-history', text: '查詢積分變動歷史' },
  { match: ({ method, segments }) => method === 'GET' && segments[1] === 'users' && segments[2] === 'lawyer-search-history', text: '查詢律師搜尋歷史' },

  // 付款相關
  { match: ({ method, segments }) => method === 'POST' && segments[1] === 'payment' && segments[2] === 'create-order', text: '建立付款訂單' },
  { match: ({ method, segments }) => method === 'POST' && segments[1] === 'payment' && segments[2] === 'notify', text: '付款通知回調' },
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

/**
 * 解碼 URL 編碼的字串（例如法官、律師名字）
 */
const decodeUrlSegment = (segment) => {
  try {
    return decodeURIComponent(segment);
  } catch (error) {
    return segment; // 如果解碼失敗，返回原始字串
  }
};

/**
 * 描述請求操作，生成人類可讀的摘要
 */
const describeRequest = (method, path) => {
  const segments = path.split('?')[0].split('/').filter(Boolean);
  const key = { method, segments };

  // 嘗試匹配預定義的摘要規則
  for (const { match, text } of SUMMARIES) {
    try {
      if (match(key)) {
        // 如果是法官或律師查詢，附加解碼後的名字
        let summary = text;
        if (segments[1] === 'judges' && segments[2]) {
          const judgeName = decodeUrlSegment(segments[2]);
          summary = `${text} (${judgeName})`;
        } else if (segments[1] === 'lawyers' && segments[2]) {
          const lawyerName = decodeUrlSegment(segments[2]);
          summary = `${text} (${lawyerName})`;
        }

        return {
          summary,
          resourceLabel: RESOURCE_LABELS[segments[1]] || segments[1] || '未知資源'
        };
      }
    } catch (error) {
      // ignore matching errors
    }
  }

  // 如果沒有匹配到規則，生成通用描述
  const resourceLabel = RESOURCE_LABELS[segments[1]] || segments[1] || '未知資源';

  // 解碼路徑中的所有片段
  const decodedSegments = segments.slice(1).map(seg => decodeUrlSegment(seg));
  const rest = decodedSegments.length > 0 ? decodedSegments.join('/') : '/';

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
