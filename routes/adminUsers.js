import express from 'express';
import admin from 'firebase-admin';
import { verifyToken } from '../middleware/auth.js';
import { verifyAdmin } from '../middleware/adminAuth.js';

const router = express.Router();
const db = admin.firestore();
const MAX_LIMIT = 100;

const toISO = (timestamp) => {
  if (!timestamp) return null;
  try {
    return typeof timestamp.toDate === 'function' ? timestamp.toDate().toISOString() : null;
  } catch (error) {
    return null;
  }
};

const getLastOperation = async (uid) => {
  const snapshot = await db
    .collection('auditLogs')
    .where('userId', '==', uid)
    .orderBy('timestamp', 'desc')
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  const data = doc.data();

  return {
    id: doc.id,
    timestamp: toISO(data.timestamp),
    summary: data.summary || null,
    resource: data.resource || null,
    resourceLabel: data.resourceLabel || null,
    method: data.method || null,
    action: data.action || null,
    path: data.path || null,
    statusCode: data.statusCode || null,
  };
};

router.get('/overview', verifyToken, verifyAdmin, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), MAX_LIMIT);

    const usersSnapshot = await db
      .collection('users')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    const users = await Promise.all(usersSnapshot.docs.map(async (doc) => {
      const data = doc.data();
      const lastOperation = await getLastOperation(doc.id);

      return {
        uid: doc.id,
        email: data.email || null,
        displayName: data.displayName || null,
        level: data.level || null,
        credits: data.credits ?? null,
        createdAt: toISO(data.createdAt),
        lastActivityAt: toISO(data.lastActivityAt),
        lastOperation,
      };
    }));

    users.sort((a, b) => {
      const timeA = new Date(a.lastActivityAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.lastActivityAt || b.createdAt || 0).getTime();
      return timeB - timeA;
    });

    res.json({
      data: users,
      meta: {
        count: users.length,
        limit,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
