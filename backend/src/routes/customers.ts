/**
 * Admin customer management endpoints.
 *
 * GET  /api/admin/customers          — paginated list with CLV, segment, search
 * GET  /api/admin/customers/:phone   — single customer + order history
 * POST /api/admin/customers/:phone/block   — block a customer
 * DELETE /api/admin/customers/:phone/block — unblock a customer
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import { authenticate, requirePermission } from '../middleware/auth';
import { PAID_ORDER_STATUSES, HIGH_RISK_SCORE_THRESHOLD } from '../lib/constants';
import { normalizePhone } from '../utils/phone';

const router = Router();

/** Derive a customer segment from their stats. */
function deriveSegment(
  totalOrders: number,
  totalSpent: number,
  lastOrderAt: Date | null,
  maxRiskScore: number
): 'vip' | 'returning' | 'inactive' | 'risky' | 'new' {
  if (maxRiskScore >= HIGH_RISK_SCORE_THRESHOLD) return 'risky';
  const daysSinceLast = lastOrderAt
    ? (Date.now() - lastOrderAt.getTime()) / (1000 * 60 * 60 * 24)
    : Infinity;
  if (totalOrders >= 3 && totalSpent >= 5000) return 'vip';
  if (daysSinceLast > 60) return 'inactive';
  if (totalOrders >= 2) return 'returning';
  return 'new';
}

// GET /api/admin/customers
router.get(
  '/',
  authenticate,
  requirePermission('customers.manage'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? '20', 10)));
      const segment = (req.query.segment as string) ?? 'all';
      const search = ((req.query.search as string) ?? '').trim();

      const raw = await prisma.order.groupBy({
        by: ['customerPhone'],
        where: {
          status: { in: [...PAID_ORDER_STATUSES] },
          ...(search
            ? {
                OR: [
                  { customerPhone: { contains: search } },
                  { customerName: { contains: search } },
                ],
              }
            : {}),
        },
        _sum: { total: true, discountAmount: true },
        _count: { id: true },
        _max: { createdAt: true, riskScore: true },
        orderBy: { _sum: { total: 'desc' } },
      });

      // Fetch latest names per phone
      const phones = raw.map((r) => r.customerPhone);
      const nameRows = await prisma.order.findMany({
        where: { customerPhone: { in: phones } },
        select: { customerPhone: true, customerName: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      });
      const nameMap = new Map<string, string>();
      for (const row of nameRows) {
        if (!nameMap.has(row.customerPhone) && row.customerName) {
          nameMap.set(row.customerPhone, row.customerName);
        }
      }

      // Fetch blocked phones
      const blockedRows = await prisma.blockedCustomer.findMany({
        where: { phone: { in: phones } },
        select: { phone: true },
      });
      const blockedSet = new Set(blockedRows.map((b) => b.phone));

      // Build customer list + apply segment filter
      const customers = raw.map((r) => {
        const totalSpent = r._sum.total ?? 0;
        const totalOrders = r._count.id;
        const lastOrderAt = r._max.createdAt;
        const maxRisk = r._max.riskScore ?? 0;
        const seg = deriveSegment(totalOrders, totalSpent, lastOrderAt, maxRisk);
        return {
          phone: r.customerPhone,
          name: nameMap.get(r.customerPhone) ?? null,
          totalOrders,
          totalSpent: Math.round(totalSpent * 100) / 100,
          totalDiscount: Math.round((r._sum.discountAmount ?? 0) * 100) / 100,
          avgOrderValue: totalOrders > 0 ? Math.round((totalSpent / totalOrders) * 100) / 100 : 0,
          lastOrderAt,
          maxRiskScore: maxRisk,
          segment: seg,
          isBlocked: blockedSet.has(r.customerPhone),
        };
      });

      const filtered =
        segment === 'all' ? customers : customers.filter((c) => c.segment === segment);

      const total = filtered.length;
      const paginated = filtered.slice((page - 1) * limit, page * limit);

      res.json({
        success: true,
        customers: paginated,
        pagination: { total, page, limit, pages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/admin/customers/:phone
router.get(
  '/:phone',
  authenticate,
  requirePermission('customers.manage'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const phone = decodeURIComponent(String(req.params.phone));

      const [orders, blocked] = await Promise.all([
        prisma.order.findMany({
          where: { customerPhone: phone },
          include: {
            items: { select: { id: true, name: true, quantity: true, price: true, total: true } },
            payment: { select: { status: true, mpesaReceiptNumber: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        prisma.blockedCustomer.findUnique({ where: { phone } }),
      ]);

      const paidOrders = orders.filter((o) => PAID_ORDER_STATUSES.includes(o.status as typeof PAID_ORDER_STATUSES[number]));
      const totalSpent = paidOrders.reduce((s, o) => s + o.total, 0);
      const totalOrders = paidOrders.length;
      const lastOrderAt = orders[0]?.createdAt ?? null;
      const maxRisk = Math.max(0, ...orders.map((o) => o.riskScore));

      res.json({
        success: true,
        customer: {
          phone,
          name: orders[0]?.customerName ?? null,
          totalOrders,
          totalSpent: Math.round(totalSpent * 100) / 100,
          avgOrderValue: totalOrders > 0 ? Math.round((totalSpent / totalOrders) * 100) / 100 : 0,
          lastOrderAt,
          maxRiskScore: maxRisk,
          segment: deriveSegment(totalOrders, totalSpent, lastOrderAt, maxRisk),
          isBlocked: !!blocked,
          blockedReason: blocked?.reason ?? null,
        },
        orders,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/admin/customers/:phone/block
router.post(
  '/:phone/block',
  authenticate,
  requirePermission('customers.manage'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawPhone = decodeURIComponent(String(req.params.phone));
      const phone = normalizePhone(rawPhone) ?? rawPhone;
      const { reason } = z.object({ reason: z.string().optional() }).parse(req.body);

      const blocked = await prisma.blockedCustomer.upsert({
        where: { phone },
        update: { reason: reason ?? null, blockedBy: req.user!.id },
        create: { phone, reason: reason ?? null, blockedBy: req.user!.id },
      });

      res.json({ success: true, blocked });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/admin/customers/:phone/block
router.delete(
  '/:phone/block',
  authenticate,
  requirePermission('customers.manage'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawPhone = decodeURIComponent(String(req.params.phone));
      // Delete both canonical and legacy raw-format rows
      const phones = [rawPhone, normalizePhone(rawPhone)].filter((p): p is string => p !== null);
      await prisma.blockedCustomer.deleteMany({ where: { phone: { in: phones } } });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
