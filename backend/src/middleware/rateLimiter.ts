import rateLimit from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';
import { normalizePhone } from '../utils/phone';

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts, please try again later.' },
});

// Separate instance so customer register/login doesn't share (or drain)
// the stricter admin login budget.
export const customerAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts, please try again later.' },
});

// Coupon preview is public and reveals whether a code is valid/expired/
// exhausted — throttle per IP to blunt code enumeration/brute-force.
export const couponPreviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many coupon attempts, please try again later.' },
});

/**
 * Per-phone checkout rate limiter.
 *
 * Limits a single phone number to 5 order attempts per hour.
 * Uses an in-memory Map (sufficient for single-node deployments;
 * replace with Redis for multi-instance setups).
 */
const phoneOrderCounts = new Map<string, { count: number; resetAt: number }>();

// Clean up stale entries every 15 minutes to prevent memory growth.
// unref() so this housekeeping timer never keeps the process alive.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of phoneOrderCounts.entries()) {
    if (entry.resetAt <= now) phoneOrderCounts.delete(key);
  }
}, 15 * 60 * 1000).unref();

const MAX_ORDERS_PER_HOUR = 5;
const CHECKOUT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export function checkoutRateLimiter(req: Request, res: Response, next: NextFunction): void {

  const phone: string | undefined = req.body?.customerPhone;
  if (!phone) {
    next();
    return;
  }

  const now = Date.now();
  // Canonical form so 0712…, +254712…, and 254712… share one bucket;
  // unparseable input falls back to digits-only (the handler rejects it anyway).
  const key = normalizePhone(phone) ?? phone.replace(/\D/g, '');
  const entry = phoneOrderCounts.get(key);

  if (!entry || entry.resetAt <= now) {
    phoneOrderCounts.set(key, { count: 1, resetAt: now + CHECKOUT_WINDOW_MS });
    next();
    return;
  }

  if (entry.count >= MAX_ORDERS_PER_HOUR) {
    res.status(429).json({
      success: false,
      message: 'Too many order attempts from this phone number. Please wait before trying again.',
    });
    return;
  }

  entry.count += 1;
  next();
}

