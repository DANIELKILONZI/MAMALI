import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import {
  isOwnerRole,
  hasPermission,
  parsePermissions,
  type Permission,
} from '../lib/permissions';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  // Primary: Bearer token
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (req.cookies?.mamali_access_token) {
    // Fallback: HTTP-only cookie
    token = req.cookies.mamali_access_token as string;
  }

  if (!token) {
    res.status(401).json({ success: false, message: 'No token provided' });
    return;
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthUser;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

export function authorize(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }
    // The owner supersedes every role-based check.
    if (isOwnerRole(req.user.role)) {
      next();
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ success: false, message: 'Insufficient permissions' });
      return;
    }
    next();
  };
}

/**
 * Loads the account's current role/permissions/isActive from the DB so
 * that role changes, permission grants, and deactivations take effect
 * immediately — not only after the JWT expires.
 */
async function loadAccount(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: { role: true, permissions: true, isActive: true },
  });
}

/** Requires the caller to be the owner (or a legacy ADMIN). */
export async function requireOwner(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Not authenticated' });
    return;
  }
  const account = await loadAccount(req.user.id);
  if (!account?.isActive) {
    res.status(403).json({ success: false, message: 'Account is not active' });
    return;
  }
  if (!isOwnerRole(account.role)) {
    res.status(403).json({ success: false, message: 'Only the owner can perform this action' });
    return;
  }
  req.user.role = account.role;
  next();
}

/**
 * Requires a specific delegated permission. The owner passes automatically;
 * a staff member must have been granted the permission by the owner.
 */
export function requirePermission(permission: Permission) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }
    const account = await loadAccount(req.user.id);
    if (!account?.isActive) {
      res.status(403).json({ success: false, message: 'Account is not active' });
      return;
    }
    if (!hasPermission(account.role, parsePermissions(account.permissions), permission)) {
      res.status(403).json({ success: false, message: 'You do not have permission to perform this action' });
      return;
    }
    req.user.role = account.role;
    next();
  };
}

