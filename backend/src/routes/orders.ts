import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth';
import { checkoutRateLimiter } from '../middleware/rateLimiter';
import { logger } from '../utils/logger';
import { assessOrderRisk } from '../services/fraud';
import { sendOrderConfirmation, sendOrderCancellation } from '../services/notifications';

const router = Router();

function generateOrderNumber(): string {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD-${dateStr}-${suffix}`;
}

const createOrderSchema = z.object({
  customerPhone: z.string().min(9),
  customerName: z.string().optional(),
  notes: z.string().optional(),
  couponCode: z.string().optional(),
  items: z.array(
    z.object({
      productId: z.string(),
      quantity: z.number().int().positive(),
    })
  ).min(1),
});

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['awaiting_payment', 'cancelled'],
  awaiting_payment: ['paid', 'cancelled'],
  paid: ['processing', 'refunded'],
  processing: ['delivered'],
  delivered: [],
  cancelled: [],
  refunded: [],
};

const STAFF_ALLOWED_TRANSITIONS: Record<string, string[]> = {
  paid: ['processing'],
  processing: ['delivered'],
};

router.post('/', checkoutRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createOrderSchema.parse(req.body);
    const ipAddress = (req.ip ?? req.socket?.remoteAddress ?? '').replace('::ffff:', '');
    const userAgent = req.headers['user-agent'] ?? '';

    const order = await prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({
        where: { id: { in: data.items.map((i) => i.productId) }, isActive: true },
      });
      if (products.length !== data.items.length) {
        throw Object.assign(new Error('One or more products not found or inactive'), { statusCode: 400 });
      }

      // Check availability within transaction
      const outOfStock: string[] = [];
      for (const item of data.items) {
        const product = products.find((p) => p.id === item.productId);
        if (!product || product.stock < item.quantity) {
          outOfStock.push(item.productId);
        }
      }
      if (outOfStock.length > 0) {
        throw Object.assign(new Error('Insufficient stock'), { statusCode: 400, outOfStock });
      }

      // Reserve stock within transaction
      for (const item of data.items) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product || product.stock < item.quantity) {
          throw Object.assign(new Error(`Insufficient stock for product ${item.productId}`), { statusCode: 400 });
        }
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
      }

      const orderItems = data.items.map((item) => {
        const product = products.find((p) => p.id === item.productId)!;
        const price = product.price - (product.price * product.discount) / 100;
        return { productId: item.productId, name: product.name, price, quantity: item.quantity, total: price * item.quantity };
      });

      const subtotal = orderItems.reduce((s, i) => s + i.total, 0);

      // Apply coupon if provided
      let discountAmount = 0;
      let resolvedCouponCode: string | undefined;
      if (data.couponCode) {
        const coupon = await tx.coupon.findUnique({ where: { code: data.couponCode.toUpperCase() } });
        if (coupon && coupon.isActive && (!coupon.expiresAt || coupon.expiresAt >= new Date()) &&
            subtotal >= coupon.minOrderValue) {
          // Atomically increment usedCount only if still under the limit.
          // Using updateMany with usedCount < maxUses in the WHERE clause ensures
          // the check-and-increment is a single atomic database operation.
          const usedCountWhere = coupon.maxUses !== null
            ? { usedCount: { lt: coupon.maxUses } }
            : {};
          const updated = await tx.coupon.updateMany({
            where: { id: coupon.id, isActive: true, ...usedCountWhere },
            data: { usedCount: { increment: 1 } },
          });
          if (updated.count > 0) {
            discountAmount = coupon.discountType === 'percent'
              ? Math.min(subtotal, (subtotal * coupon.discountValue) / 100)
              : Math.min(subtotal, coupon.discountValue);
            discountAmount = Math.round(discountAmount * 100) / 100;
            resolvedCouponCode = coupon.code;
          }
        }
      }

      const total = subtotal - discountAmount;
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      const created = await tx.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          customerPhone: data.customerPhone,
          customerName: data.customerName,
          notes: data.notes,
          subtotal,
          discountAmount,
          couponCode: resolvedCouponCode,
          total,
          expiresAt,
          ipAddress: ipAddress || null,
          userAgent: userAgent || null,
          items: { create: orderItems },
        },
        include: { items: { include: { product: { select: { id: true, name: true, slug: true } } } } },
      });

      await tx.activityLog.create({
        data: {
          orderId: created.id,
          action: 'ORDER_CREATED',
          details: JSON.stringify({ total, itemCount: orderItems.length }),
          ipAddress: ipAddress || null,
        },
      });

      return created;
    });

    // Assess fraud risk after order is committed (non-blocking)
    // Resolve the earliest product view time for rapid-checkout detection
    const firstView = await prisma.productView.findFirst({
      where: { productId: { in: data.items.map((i) => i.productId) } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });

    assessOrderRisk({
      customerPhone: data.customerPhone,
      orderTotal: order.total,
      couponCode: data.couponCode,
      ipAddress: ipAddress || undefined,
      userAgent: userAgent || undefined,
      firstViewedAt: firstView?.createdAt,
    }).then(async ({ riskScore, flags }) => {
      if (riskScore > 0) {
        await prisma.order.update({
          where: { id: order.id },
          data: { riskScore, riskFlags: JSON.stringify(flags) },
        });
        if (riskScore >= 30) {
          logger.warn('High-risk order detected', { orderNumber: order.orderNumber, riskScore, flags });
        }
      }
    }).catch((err) => {
      logger.error('Fraud assessment failed', err);
    });

    // Fire order-confirmation notification (non-blocking)
    sendOrderConfirmation({
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerPhone: order.customerPhone,
      customerName: order.customerName,
      total: order.total,
    });

    res.status(201).json({ success: true, order });
  } catch (err: unknown) {
    const e = err as { statusCode?: number; outOfStock?: string[]; message?: string };
    if (e.statusCode === 400) {
      res.status(400).json({ success: false, message: e.message, outOfStock: e.outOfStock });
      return;
    }
    next(err);
  }
});

router.get('/list', authenticate, authorize('ADMIN', 'STAFF'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, page = '1', limit = '20', search } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { orderNumber: { contains: search as string } },
        { customerName: { contains: search as string } },
        { customerPhone: { contains: search as string } },
      ];
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take,
        include: {
          items: true,
          payment: true,
          assignedTo: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.order.count({ where }),
    ]);

    res.json({
      success: true,
      orders,
      pagination: { total, page: parseInt(page as string), limit: take, pages: Math.ceil(total / take) },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:orderNumber', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await prisma.order.findUnique({
      where: { orderNumber: String(req.params.orderNumber) },
      include: {
        items: { include: { product: { select: { id: true, name: true, slug: true, images: true } } } },
        payment: true,
      },
    });
    if (!order) {
      res.status(404).json({ success: false, message: 'Order not found' });
      return;
    }
    res.json({ success: true, order });
  } catch (err) {
    next(err);
  }
});

router.put('/:id/status', authenticate, authorize('ADMIN', 'STAFF'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = z.object({ status: z.string() }).parse(req.body);
    const order = await prisma.order.findUnique({ where: { id: String(req.params.id) } });
    if (!order) {
      res.status(404).json({ success: false, message: 'Order not found' });
      return;
    }
    const allowed = VALID_TRANSITIONS[order.status] || [];
    if (!allowed.includes(status)) {
      res.status(400).json({ success: false, message: `Cannot transition from ${order.status} to ${status}` });
      return;
    }
    if (req.user!.role === 'STAFF') {
      const staffAllowed = STAFF_ALLOWED_TRANSITIONS[order.status] || [];
      if (!staffAllowed.includes(status)) {
        res.status(403).json({ success: false, message: 'Staff cannot perform this transition' });
        return;
      }
    }

    // If cancelling, release stock
    if (status === 'cancelled' && ['pending', 'awaiting_payment'].includes(order.status)) {
      const items = await prisma.orderItem.findMany({ where: { orderId: order.id } });
      const { releaseStock } = await import('../services/inventory');
      await releaseStock(items.map((i) => ({ productId: i.productId, quantity: i.quantity })));
    }

    const updated = await prisma.order.update({ where: { id: String(req.params.id) }, data: { status } });

    await prisma.activityLog.create({
      data: {
        userId: req.user!.id,
        orderId: order.id,
        action: 'STATUS_CHANGED',
        details: JSON.stringify({ from: order.status, to: status }),
        ipAddress: req.ip,
      },
    });

    logger.info(`Order ${order.orderNumber} status changed`, { from: order.status, to: status });

    // Fire customer notification for cancellations (non-blocking)
    if (status === 'cancelled') {
      sendOrderCancellation({
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerPhone: order.customerPhone,
        customerName: order.customerName,
        total: order.total,
      });
    }

    res.json({ success: true, order: updated });
  } catch (err) {
    next(err);
  }
});

router.put('/:id/assign', authenticate, authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { staffId } = z.object({ staffId: z.string() }).parse(req.body);
    const staff = await prisma.user.findUnique({ where: { id: staffId } });
    if (!staff || !staff.isActive) {
      res.status(400).json({ success: false, message: 'Staff member not found or inactive' });
      return;
    }
    const order = await prisma.order.update({
      where: { id: String(req.params.id) },
      data: { assignedToId: staffId },
      include: { assignedTo: { select: { id: true, name: true, email: true } } },
    });
    await prisma.activityLog.create({
      data: {
        userId: req.user!.id,
        orderId: String(req.params.id),
        action: 'ORDER_ASSIGNED',
        details: JSON.stringify({ assignedToId: staffId, assignedToName: staff.name }),
        ipAddress: req.ip,
      },
    });
    res.json({ success: true, order });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/activity', authenticate, authorize('ADMIN', 'STAFF'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const logs = await prisma.activityLog.findMany({
      where: { orderId: String(req.params.id) },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, logs });
  } catch (err) {
    next(err);
  }
});

export default router;
