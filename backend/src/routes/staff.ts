import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { authenticate, requireOwner } from '../middleware/auth';
import {
  DELEGATABLE_PERMISSIONS,
  sanitizeGrant,
  parsePermissions,
  isOwnerRole,
} from '../lib/permissions';

const router = Router();

// Only OWNER/STAFF are assignable. Owner-only permissions are stripped from
// any grant via sanitizeGrant, so they can never be delegated to an employee.
const createStaffSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['OWNER', 'STAFF']).default('STAFF'),
  permissions: z.array(z.string()).optional(),
});

const updateStaffSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  role: z.enum(['OWNER', 'STAFF']).optional(),
  permissions: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

const staffSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  permissions: true,
  isActive: true,
  createdAt: true,
} as const;

interface StaffRow {
  role: string;
  permissions: string;
}

/** Owners implicitly hold every permission; expose that to the UI. */
function effectivePermissions(row: StaffRow): string[] {
  return isOwnerRole(row.role) ? [...DELEGATABLE_PERMISSIONS] : parsePermissions(row.permissions);
}

router.get('/', authenticate, requireOwner, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await prisma.user.findMany({ select: staffSelect, orderBy: { createdAt: 'desc' } });
    const staff = rows.map((s) => ({ ...s, permissions: effectivePermissions(s) }));
    res.json({ success: true, staff });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', authenticate, requireOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const s = await prisma.user.findUnique({ where: { id: String(req.params.id) }, select: staffSelect });
    if (!s) {
      res.status(404).json({ success: false, message: 'Staff member not found' });
      return;
    }
    res.json({ success: true, staff: { ...s, permissions: effectivePermissions(s) } });
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticate, requireOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createStaffSchema.parse(req.body);
    const exists = await prisma.user.findUnique({ where: { email: data.email } });
    if (exists) {
      res.status(409).json({ success: false, message: 'Email already in use' });
      return;
    }
    const hashed = await bcrypt.hash(data.password, 10);
    // Owners hold all permissions implicitly; store an empty grant for them.
    const permissions = data.role === 'OWNER' ? [] : sanitizeGrant(data.permissions);
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashed,
        role: data.role,
        permissions: JSON.stringify(permissions),
      },
      select: staffSelect,
    });
    res.status(201).json({ success: true, user: { ...user, permissions: effectivePermissions(user) } });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', authenticate, requireOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateStaffSchema.parse(req.body);
    const target = await prisma.user.findUnique({ where: { id: String(req.params.id) }, select: { role: true } });
    if (!target) {
      res.status(404).json({ success: false, message: 'Staff member not found' });
      return;
    }

    if (data.email) {
      const clash = await prisma.user.findFirst({
        where: { email: data.email, NOT: { id: String(req.params.id) } },
      });
      if (clash) {
        res.status(409).json({ success: false, message: 'Email already in use' });
        return;
      }
    }

    // Resolve the role after this update to decide how permissions are stored.
    const nextRole = data.role ?? target.role;
    const update: Record<string, unknown> = {};
    if (data.name !== undefined) update.name = data.name;
    if (data.email !== undefined) update.email = data.email;
    if (data.role !== undefined) update.role = data.role;
    if (data.isActive !== undefined) update.isActive = data.isActive;
    if (data.permissions !== undefined || data.role !== undefined) {
      update.permissions = JSON.stringify(
        isOwnerRole(nextRole) ? [] : sanitizeGrant(data.permissions ?? [])
      );
    }

    const user = await prisma.user.update({
      where: { id: String(req.params.id) },
      data: update,
      select: staffSelect,
    });
    res.json({ success: true, user: { ...user, permissions: effectivePermissions(user) } });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticate, requireOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.params.id === req.user!.id) {
      res.status(400).json({ success: false, message: 'Cannot deactivate your own account' });
      return;
    }
    const user = await prisma.user.update({
      where: { id: String(req.params.id) },
      data: { isActive: false },
      select: { id: true, name: true, email: true, isActive: true },
    });
    res.json({ success: true, user, message: 'Staff member deactivated' });
  } catch (err) {
    next(err);
  }
});

export default router;
