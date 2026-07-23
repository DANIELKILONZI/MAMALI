import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z } from 'zod';
import { authenticate, requireOwner } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimiter';
import { env } from '../config/env';
import { dbLog } from '../utils/logger';
import { DELEGATABLE_PERMISSIONS, parsePermissions, isOwnerRole } from '../lib/permissions';

const router = Router();

const strongPassword = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Must contain uppercase letter')
  .regex(/[a-z]/, 'Must contain lowercase letter')
  .regex(/[0-9]/, 'Must contain a number')
  .regex(/[^A-Za-z0-9]/, 'Must contain a special character');

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: strongPassword,
  role: z.enum(['ADMIN', 'STAFF']).default('STAFF'),
});

const updateProfileSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: strongPassword,
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

function issueRefreshToken(): { raw: string; expiresAt: Date } {
  const raw = crypto.randomBytes(48).toString('hex');
  const days = parseInt(env.REFRESH_TOKEN_EXPIRES_IN) || 30;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return { raw, expiresAt };
}

router.post('/login', authLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const ip = req.ip;

    // Check for too many recent failed attempts
    const since = new Date(Date.now() - 15 * 60 * 1000);
    const failedCount = await prisma.loginAttempt.count({
      where: { email, success: false, createdAt: { gte: since } },
    });
    if (failedCount >= 10) {
      await dbLog('warn', 'AUTH', 'Account temporarily locked due to failed attempts', { email }, undefined, ip ?? undefined);
      res.status(429).json({ success: false, message: 'Too many failed login attempts. Try again in 15 minutes.' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      await prisma.loginAttempt.create({ data: { email, ip, success: false } });
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      await prisma.loginAttempt.create({ data: { email, ip, success: false } });
      await dbLog('warn', 'AUTH', 'Failed login attempt', { email }, undefined, ip ?? undefined);
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }

    await prisma.loginAttempt.create({ data: { email, ip, success: true } });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions
    );

    // Issue refresh token
    const { raw: refreshTokenRaw, expiresAt } = issueRefreshToken();
    await prisma.refreshToken.create({
      data: { userId: user.id, token: refreshTokenRaw, expiresAt },
    });

    const useCookies = req.headers['x-use-cookies'] === 'true';
    if (useCookies) {
      const secure = env.NODE_ENV === 'production';
      res.cookie('mamali_access_token', token, { httpOnly: true, sameSite: 'lax', secure, path: '/' });
      res.cookie('mamali_refresh_token', refreshTokenRaw, { httpOnly: true, sameSite: 'lax', secure, path: '/' });
    }

    const permissions = isOwnerRole(user.role)
      ? [...DELEGATABLE_PERMISSIONS]
      : parsePermissions(user.permissions);
    res.json({
      success: true,
      token,
      refreshToken: refreshTokenRaw,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, permissions },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);

    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!stored || stored.isRevoked || stored.expiresAt < new Date()) {
      res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user || !user.isActive) {
      res.status(401).json({ success: false, message: 'User not found or inactive' });
      return;
    }

    // Rotate: revoke old, issue new
    await prisma.refreshToken.update({ where: { id: stored.id }, data: { isRevoked: true } });

    const newAccessToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions
    );
    const { raw: newRefreshRaw, expiresAt } = issueRefreshToken();
    await prisma.refreshToken.create({ data: { userId: user.id, token: newRefreshRaw, expiresAt } });

    const useCookies = req.headers['x-use-cookies'] === 'true';
    if (useCookies) {
      const secure = env.NODE_ENV === 'production';
      res.cookie('mamali_access_token', newAccessToken, { httpOnly: true, sameSite: 'lax', secure, path: '/' });
      res.cookie('mamali_refresh_token', newRefreshRaw, { httpOnly: true, sameSite: 'lax', secure, path: '/' });
    }

    res.json({ success: true, token: newAccessToken, refreshToken: newRefreshRaw });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    await prisma.refreshToken.updateMany({ where: { token: refreshToken }, data: { isRevoked: true } });
    res.clearCookie('mamali_access_token');
    res.clearCookie('mamali_refresh_token');
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/register',
  authenticate,
  requireOwner,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = registerSchema.parse(req.body);
      const exists = await prisma.user.findUnique({ where: { email: data.email } });
      if (exists) {
        res.status(409).json({ success: false, message: 'Email already in use' });
        return;
      }
      const hashed = await bcrypt.hash(data.password, 10);
      const user = await prisma.user.create({
        data: { ...data, password: hashed },
        select: { id: true, name: true, email: true, role: true, createdAt: true },
      });
      res.status(201).json({ success: true, user });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, name: true, email: true, role: true, permissions: true, isActive: true, createdAt: true },
    });
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }
    // Owners implicitly hold every permission; expose the effective set so
    // the admin UI can gate navigation and controls.
    const permissions = isOwnerRole(user.role)
      ? [...DELEGATABLE_PERMISSIONS]
      : parsePermissions(user.permissions);
    res.json({ success: true, user: { ...user, permissions } });
  } catch (err) {
    next(err);
  }
});

router.put('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateProfileSchema.parse(req.body);
    if (data.email) {
      const exists = await prisma.user.findFirst({
        where: { email: data.email, NOT: { id: req.user!.id } },
      });
      if (exists) {
        res.status(409).json({ success: false, message: 'Email already in use' });
        return;
      }
    }
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data,
      select: { id: true, name: true, email: true, role: true },
    });
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
});

router.put('/change-password', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      res.status(400).json({ success: false, message: 'Current password is incorrect' });
      return;
    }
    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: req.user!.id }, data: { password: hashed } });
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;

