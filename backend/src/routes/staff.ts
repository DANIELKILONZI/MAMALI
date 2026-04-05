import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

const createStaffSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['ADMIN', 'STAFF']).default('STAFF'),
});

const updateStaffSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  role: z.enum(['ADMIN', 'STAFF']).optional(),
  isActive: z.boolean().optional(),
});

router.get('/', authenticate, authorize('ADMIN'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const staff = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, staff });
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticate, authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createStaffSchema.parse(req.body);
    const exists = await prisma.user.findUnique({ where: { email: data.email } });
    if (exists) {
      res.status(409).json({ success: false, message: 'Email already in use' });
      return;
    }
    const hashed = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({
      data: { ...data, password: hashed },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    });
    res.status(201).json({ success: true, user });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', authenticate, authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateStaffSchema.parse(req.body);
    if (data.email) {
      const exists = await prisma.user.findFirst({
        where: { email: data.email, NOT: { id: String(req.params.id) } },
      });
      if (exists) {
        res.status(409).json({ success: false, message: 'Email already in use' });
        return;
      }
    }
    const user = await prisma.user.update({
      where: { id: String(req.params.id) },
      data,
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticate, authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
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
