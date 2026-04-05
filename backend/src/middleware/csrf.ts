import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

const CSRF_COOKIE = 'mamali_csrf';
const CSRF_HEADER = 'x-csrf-token';

function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Returns a CSRF token via a signed cookie and JSON response.
 * GET /api/csrf-token
 */
export function csrfTokenHandler(req: Request, res: Response): void {
  let token = req.cookies?.[CSRF_COOKIE] as string | undefined;
  if (!token) {
    token = generateCsrfToken();
    const secure = env.NODE_ENV === 'production';
    res.cookie(CSRF_COOKIE, token, { httpOnly: false, sameSite: 'strict', secure, path: '/' });
  }
  res.json({ success: true, csrfToken: token });
}

/**
 * Validates CSRF token on non-GET requests that use cookie auth.
 * Skips validation when using Bearer auth or for the M-Pesa callback.
 */
export function csrfProtect(req: Request, res: Response, next: NextFunction): void {
  // Skip safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }

  // Skip M-Pesa callback (no cookie auth)
  if (req.path === '/callback' || req.originalUrl.includes('/payments/callback')) {
    next();
    return;
  }

  // Skip if using Bearer auth — API clients don't need CSRF protection
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  // Only enforce if the request is using cookie auth
  if (!req.cookies?.mamali_access_token) {
    next();
    return;
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE] as string | undefined;
  const headerToken = req.headers[CSRF_HEADER] as string | undefined;

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    res.status(403).json({ success: false, message: 'Invalid CSRF token' });
    return;
  }

  next();
}
