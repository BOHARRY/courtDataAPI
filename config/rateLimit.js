// config/rateLimit.js
import rateLimit from 'express-rate-limit';

const windowMinutes = parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES || '1', 10);
const maxRequests = parseInt(process.env.RATE_LIMIT_MAX || '120', 10);
const sensitiveMax = parseInt(process.env.RATE_LIMIT_SENSITIVE_MAX || '60', 10);

export const apiLimiter = rateLimit({
  windowMs: windowMinutes * 60 * 1000,
  limit: maxRequests,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

export const sensitiveLimiter = rateLimit({
  windowMs: windowMinutes * 60 * 1000,
  limit: sensitiveMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests to this endpoint. Please slow down.' }
});

