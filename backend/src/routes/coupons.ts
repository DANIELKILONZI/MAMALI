import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Public: POST /api/coupons/apply — validate a coupon code against an order total
router.post('/apply', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code, orderTotal } = z.object({
      code: z.string().min(1),
      orderTotal: z.number().positive(),
    }).parse(req.body);

    const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
    if (!coupon || !coupon.isActive) {
      res.status(400).json({ success: false, message: 'Invalid or inactive coupon code' });
      return;
    }
    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      res.status(400).json({ success: false, message: 'Coupon has expired' });
      return;
    }
    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      res.status(400).json({ success: false, message: 'Coupon usage limit reached' });
      return;
    }
    if (orderTotal < coupon.minOrderValue) {
      res.status(400).json({
        success: false,
        message: `Minimum order value of KSh ${coupon.minOrderValue.toLocaleString()} required`,
      });
      return;
    }

    let discountAmount: number;
    if (coupon.discountType === 'percent') {
      discountAmount = Math.min(orderTotal, (orderTotal * coupon.discountValue) / 100);
    } else {
      discountAmount = Math.min(orderTotal, coupon.discountValue);
    }

    res.json({
      success: true,
      coupon: { id: coupon.id, code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue },
      discountAmount: Math.round(discountAmount * 100) / 100,
    });
  } catch (err) {
    next(err);
  }
});

// Admin: get single coupon
router.get('/:id', authenticate, authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const coupon = await prisma.coupon.findUnique({ where: { id: String(req.params.id) } });
    if (!coupon) {
      res.status(404).json({ success: false, message: 'Coupon not found' });
      return;
    }
    res.json({ success: true, coupon });
  } catch (err) {
    next(err);
  }
});

// Admin: list coupons
router.get('/', authenticate, authorize('ADMIN'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ success: true, coupons });
  } catch (err) {
    next(err);
  }
});

const couponSchema = z.object({
  code: z.string().min(1).transform((s) => s.toUpperCase()),
  description: z.string().optional(),
  discountType: z.enum(['percent', 'fixed']).default('percent'),
  discountValue: z.number().positive(),
  minOrderValue: z.number().min(0).default(0),
  maxUses: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().default(true),
  expiresAt: z.string().datetime().nullable().optional(),
});

// Admin: create coupon
router.post('/', authenticate, authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = couponSchema.parse(req.body);
    const exists = await prisma.coupon.findUnique({ where: { code: data.code } });
    if (exists) {
      res.status(409).json({ success: false, message: 'Coupon code already exists' });
      return;
    }
    const coupon = await prisma.coupon.create({
      data: {
        ...data,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      },
    });
    res.status(201).json({ success: true, coupon });
  } catch (err) {
    next(err);
  }
});

// Admin: update coupon
router.put('/:id', authenticate, authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = couponSchema.partial().parse(req.body);
    if (data.code) {
      const exists = await prisma.coupon.findFirst({
        where: { code: data.code, NOT: { id: String(req.params.id) } },
      });
      if (exists) {
        res.status(409).json({ success: false, message: 'Coupon code already in use' });
        return;
      }
    }
    const coupon = await prisma.coupon.update({
      where: { id: String(req.params.id) },
      data: {
        ...data,
        expiresAt: data.expiresAt !== undefined ? (data.expiresAt ? new Date(data.expiresAt) : null) : undefined,
      },
    });
    res.json({ success: true, coupon });
  } catch (err) {
    next(err);
  }
});

// Admin: delete coupon
router.delete('/:id', authenticate, authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.coupon.delete({ where: { id: String(req.params.id) } });
    res.json({ success: true, message: 'Coupon deleted' });
  } catch (err) {
    next(err);
  }
});

export default router;
