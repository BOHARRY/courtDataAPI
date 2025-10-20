// routes/auditLogs.js
import express from 'express';
import admin from 'firebase-admin';
import { verifyToken } from '../middleware/auth.js';
import { verifyAdmin } from '../middleware/adminAuth.js';

const router = express.Router();
const db = admin.firestore();

router.get('/', verifyToken, verifyAdmin, async (req, res, next) => {
  try {
    const { userId, email, limit = 20, startAfter } = req.query;

    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

    let resolvedUserId = (userId || '').trim();
    const resolvedEmail = (email || '').trim();

    if (!resolvedUserId && resolvedEmail) {
      const userSnapshot = await db
        .collection('users')
        .where('email', '==', resolvedEmail)
        .limit(1)
        .get();

      if (userSnapshot.empty) {
        return res.status(404).json({ error: '找不到對應 Email 的使用者' });
      }
      resolvedUserId = userSnapshot.docs[0].id;
    }

    let query = db.collection('auditLogs').orderBy('timestamp', 'desc');

    if (resolvedUserId) {
      query = query.where('userId', '==', resolvedUserId);
    }

    if (startAfter) {
      const startAfterDate = new Date(startAfter);
      if (!Number.isNaN(startAfterDate.getTime())) {
        query = query.startAfter(startAfterDate);
      }
    }

    const snapshot = await query.limit(parsedLimit).get();

    const logs = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        timestamp: data.timestamp?.toDate?.().toISOString?.() || null,
      };
    });

    res.json({
      data: logs,
      meta: {
        count: logs.length,
        hasMore: logs.length === parsedLimit,
        resolvedUserId: resolvedUserId || null,
        email: resolvedEmail || null,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
