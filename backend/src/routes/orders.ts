import crypto from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import { authenticate, requirePermission } from '../middleware/auth';
import { checkoutRateLimiter } from '../middleware/rateLimiter';
import { logger, dbLog } from '../utils/logger';
import { assessOrderRisk } from '../services/fraud';
import { sendOrderConfirmation, sendOrderCancellation, sendOrderShipped, sendOrderDelivered } from '../services/notifications';
import { normalizePhone } from '../utils/phone';
import { releaseCouponSlot } from '../services/orderLifecycle';
import { HIGH_RISK_SCORE_THRESHOLD } from '../lib/constants';

const router = Router();

function generateOrderNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  // 3 random bytes → 6 hex chars → 16^6 = 16.7M combos per date prefix
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
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

// Refunds are ADMIN-only (enforced via STAFF_ALLOWED_TRANSITIONS below):
// the admin verifies the M-Pesa reversal before marking an order refunded.
const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['awaiting_payment', 'cancelled'],
  awaiting_payment: ['paid', 'cancelled'],
  paid: ['processing', 'refunded'],
  processing: ['delivered', 'refunded'],
  delivered: ['refunded'],
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

    // Canonicalize the phone before it is used as an identity key
    // (blocking, fraud velocity, coupon abuse, rate limiting all key on it).
    const normalizedPhone = normalizePhone(data.customerPhone);
    if (!normalizedPhone) {
      res.status(400).json({ success: false, message: 'Enter a valid Kenyan phone number (07XXXXXXXX or 2547XXXXXXXX)' });
      return;
    }
    data.customerPhone = normalizedPhone;

    // Reject orders from blocked customers
    const blocked = await prisma.blockedCustomer.findUnique({ where: { phone: data.customerPhone } });
    if (blocked) {
      res.status(403).json({ success: false, message: 'This phone number is not allowed to place orders.' });
      return;
    }

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

      // Reserve stock within the transaction. The stock >= quantity guard in
      // the WHERE makes the check-and-decrement atomic — the snapshot check
      // above gives friendly errors, but only this guard prevents two
      // concurrent orders from overselling the last unit (SQLite serializes
      // writers, PostgreSQL under Read Committed does not).
      for (const item of data.items) {
        const reserved = await tx.product.updateMany({
          where: { id: item.productId, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } },
        });
        if (reserved.count === 0) {
          throw Object.assign(new Error('Insufficient stock'), { statusCode: 400, outOfStock: [item.productId] });
        }
      }

      const orderItems = data.items.map((item) => {
        const product = products.find((p) => p.id === item.productId)!;
        // Money is whole shillings (KES): M-Pesa transacts whole shillings and
        // this eliminates floating-point drift in stored amounts.
        const price = Math.round(product.price - (product.price * product.discount) / 100);
        return { productId: item.productId, name: product.name, price, quantity: item.quantity, total: price * item.quantity };
      });

      const subtotal = orderItems.reduce((s, i) => s + i.total, 0);

      // Apply coupon if provided. Any failed re-validation is a hard 400 —
      // silently creating the order at full price after the customer saw a
      // discount at preview would be a silent overcharge.
      let discountAmount = 0;
      let resolvedCouponCode: string | undefined;
      if (data.couponCode) {
        const couponError = (message: string) =>
          Object.assign(new Error(message), { statusCode: 400 });

        const coupon = await tx.coupon.findUnique({ where: { code: data.couponCode.toUpperCase() } });
        if (!coupon || !coupon.isActive) {
          throw couponError('This coupon is not valid');
        }
        if (coupon.expiresAt && coupon.expiresAt < new Date()) {
          throw couponError('This coupon has expired');
        }
        if (subtotal < coupon.minOrderValue) {
          throw couponError(`This coupon requires a minimum order of KSh ${coupon.minOrderValue}`);
        }

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
        if (updated.count === 0) {
          throw couponError('This coupon has reached its usage limit');
        }

        discountAmount = coupon.discountType === 'percent'
          ? Math.min(subtotal, (subtotal * coupon.discountValue) / 100)
          : Math.min(subtotal, coupon.discountValue);
        discountAmount = Math.round(discountAmount); // whole shillings
        resolvedCouponCode = coupon.code;
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
    assessOrderRisk({
      customerPhone: data.customerPhone,
      orderTotal: order.total,
      couponCode: data.couponCode,
      ipAddress: ipAddress || undefined,
      userAgent: userAgent || undefined,
    }).then(async ({ riskScore, flags }) => {
      if (riskScore > 0) {
        await prisma.order.update({
          where: { id: order.id },
          data: { riskScore, riskFlags: JSON.stringify(flags) },
        });
        if (riskScore >= HIGH_RISK_SCORE_THRESHOLD) {
          logger.warn('High-risk order detected', { orderNumber: order.orderNumber, riskScore, flags });
          dbLog('warn', 'FRAUD', 'fraud.flagged', {
            orderId: order.id,
            orderNumber: order.orderNumber,
            customerPhone: order.customerPhone,
            riskScore,
            flags,
          }).catch(() => {});
        }
      }
    }).catch((err) => {
      logger.error('Fraud assessment failed', err);
    });

    // Structured event log: order.created
    dbLog('info', 'ORDER', 'order.created', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerPhone: order.customerPhone,
      total: order.total,
      itemCount: order.items?.length ?? 0,
      couponCode: order.couponCode ?? undefined,
      ipAddress: ipAddress || undefined,
    }).catch(() => {});

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

router.get('/list', authenticate, requirePermission('orders.manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, page: pageParam = '1', limit: limitParam = '20', search } = req.query;
    const page = Math.max(1, parseInt(pageParam as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(limitParam as string, 10) || 1));
    const skip = (page - 1) * limit;

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
        take: limit,
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
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// Accepts an order number (customer tracking links) or an id (admin detail).
router.get('/:orderNumberOrId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const key = String(req.params.orderNumberOrId);
    const order = await prisma.order.findFirst({
      where: { OR: [{ orderNumber: key }, { id: key }] },
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

router.put('/:id/status', authenticate, requirePermission('orders.manage'), async (req: Request, res: Response, next: NextFunction) => {
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

    // If cancelling, atomically release stock and update status in a single transaction
    // to prevent a race condition where two concurrent requests both read status='pending'
    // and both release stock, resulting in a double stock-release.
    let updated;
    if (status === 'cancelled' && ['pending', 'awaiting_payment'].includes(order.status)) {
      updated = await prisma.$transaction(async (tx) => {
        // Re-read status inside the transaction (ACID guarantee: no concurrent release possible)
        const current = await tx.order.findUnique({ where: { id: order.id }, select: { status: true } });
        if (!current || !['pending', 'awaiting_payment'].includes(current.status)) {
          // Already cancelled or advanced concurrently — return current state
          return tx.order.findUnique({ where: { id: order.id } });
        }
        const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
        for (const item of items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
        }
        await releaseCouponSlot(tx, order.id);
        return tx.order.update({ where: { id: order.id }, data: { status: 'cancelled' } });
      });
    } else if (status === 'refunded' && order.status === 'paid') {
      // Refund BEFORE shipment: the goods never left, so return stock and
      // the coupon slot (same guarded pattern as cancellation). Refunds
      // from processing/delivered leave stock untouched — the goods are
      // with the customer and any return is handled manually.
      updated = await prisma.$transaction(async (tx) => {
        const current = await tx.order.findUnique({ where: { id: order.id }, select: { status: true } });
        if (!current || current.status !== 'paid') {
          return tx.order.findUnique({ where: { id: order.id } });
        }
        const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
        for (const item of items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
        }
        await releaseCouponSlot(tx, order.id);
        return tx.order.update({ where: { id: order.id }, data: { status: 'refunded' } });
      });
    } else {
      updated = await prisma.order.update({ where: { id: String(req.params.id) }, data: { status } });
    }

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

    // Fire customer notifications for status milestones (non-blocking)
    const notificationData = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerPhone: order.customerPhone,
      customerName: order.customerName,
      total: order.total,
    };
    if (status === 'cancelled') {
      sendOrderCancellation(notificationData);
    } else if (status === 'processing') {
      sendOrderShipped(notificationData);
    } else if (status === 'delivered') {
      sendOrderDelivered(notificationData);
    }

    res.json({ success: true, order: updated });
  } catch (err) {
    next(err);
  }
});

router.put('/:id/assign', authenticate, requirePermission('orders.manage'), async (req: Request, res: Response, next: NextFunction) => {
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

router.get('/:id/activity', authenticate, requirePermission('orders.manage'), async (req: Request, res: Response, next: NextFunction) => {
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
