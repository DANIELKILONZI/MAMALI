import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, authorize } from '../middleware/auth';
import { getFraudAlerts } from '../services/fraud';
import { PAID_ORDER_STATUSES } from '../lib/constants';

const router = Router();

// GET /api/admin/analytics/revenue  — daily revenue for last 30 days
router.get('/revenue', authenticate, authorize('ADMIN'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const orders = await prisma.order.findMany({
      where: {
        status: { in: [...PAID_ORDER_STATUSES] },
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { total: true, discountAmount: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    // Bucket by date string (YYYY-MM-DD)
    const byDay: Record<string, { revenue: number; orders: number; discountGiven: number }> = {};
    for (const o of orders) {
      const day = o.createdAt.toISOString().slice(0, 10);
      if (!byDay[day]) byDay[day] = { revenue: 0, orders: 0, discountGiven: 0 };
      byDay[day].revenue += o.total;
      byDay[day].orders += 1;
      byDay[day].discountGiven += o.discountAmount;
    }

    // Fill in missing days with zeros
    const trend: { date: string; revenue: number; orders: number; discountGiven: number }[] = [];
    const cursor = new Date(thirtyDaysAgo);
    const today = new Date();
    while (cursor <= today) {
      const key = cursor.toISOString().slice(0, 10);
      trend.push({ date: key, ...(byDay[key] ?? { revenue: 0, orders: 0, discountGiven: 0 }) });
      cursor.setDate(cursor.getDate() + 1);
    }

    // Total revenue last 30 days
    const totalRevenue = trend.reduce((s, d) => s + d.revenue, 0);
    const totalOrders = trend.reduce((s, d) => s + d.orders, 0);

    res.json({ success: true, trend, totalRevenue: Math.round(totalRevenue * 100) / 100, totalOrders });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/analytics/products — per-product performance
router.get('/products', authenticate, authorize('ADMIN'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Sales per product (all time and last 30 days)
    const [allTimeItems, recentItems] = await Promise.all([
      prisma.orderItem.groupBy({
        by: ['productId', 'name'],
        where: { order: { status: { in: [...PAID_ORDER_STATUSES] } } },
        _sum: { quantity: true, total: true },
        _count: { orderId: true },
      }),
      prisma.orderItem.groupBy({
        by: ['productId'],
        where: {
          order: {
            status: { in: [...PAID_ORDER_STATUSES] },
            createdAt: { gte: thirtyDaysAgo },
          },
        },
        _sum: { quantity: true, total: true },
      }),
    ]);

    const recentMap = new Map(recentItems.map((i) => [i.productId, i]));

    // Views per product (last 30 days)
    const viewCounts = await prisma.productView.groupBy({
      by: ['productId'],
      where: { createdAt: { gte: thirtyDaysAgo } },
      _count: { id: true },
    });
    const viewMap = new Map(viewCounts.map((v) => [v.productId, v._count.id]));

    // Order count (distinct orders) per product in last 30 days
    const recentOrderCounts = await prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        order: {
          status: { in: [...PAID_ORDER_STATUSES] },
          createdAt: { gte: thirtyDaysAgo },
        },
      },
      _count: { orderId: true },
    });
    const recentOrderCountMap = new Map(recentOrderCounts.map((r) => [r.productId, r._count.orderId]));

    const products = allTimeItems.map((item) => {
      const recent = recentMap.get(item.productId);
      const views = viewMap.get(item.productId) ?? 0;
      const salesLast30 = recent?._sum.quantity ?? 0;
      const revenueLast30 = recent?._sum.total ?? 0;
      const ordersLast30 = recentOrderCountMap.get(item.productId) ?? 0;
      // Conversion = distinct orders last 30d / views last 30d (matching time windows)
      const conversionRate = views > 0 ? ((ordersLast30 / views) * 100) : null;
      return {
        productId: item.productId,
        name: item.name,
        totalUnits: item._sum.quantity ?? 0,
        totalRevenue: Math.round((item._sum.total ?? 0) * 100) / 100,
        totalOrders: item._count.orderId,
        unitsLast30: salesLast30,
        revenueLast30: Math.round((revenueLast30 ?? 0) * 100) / 100,
        viewsLast30: views,
        conversionRate: conversionRate !== null ? Math.round(conversionRate * 100) / 100 : null,
      };
    });

    // Sort by total revenue desc
    products.sort((a, b) => b.totalRevenue - a.totalRevenue);

    res.json({ success: true, products });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/analytics/funnel — checkout funnel & abandonment
router.get('/funnel', authenticate, authorize('ADMIN'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalCreated,
      paymentInitiated,
      paymentCompleted,
      delivered,
      cancelled,
    ] = await Promise.all([
      prisma.order.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.order.count({
        where: { createdAt: { gte: thirtyDaysAgo }, status: { in: ['awaiting_payment', 'paid', 'processing', 'delivered'] } },
      }),
      prisma.order.count({
        where: { createdAt: { gte: thirtyDaysAgo }, status: { in: [...PAID_ORDER_STATUSES] } },
      }),
      prisma.order.count({
        where: { createdAt: { gte: thirtyDaysAgo }, status: 'delivered' },
      }),
      prisma.order.count({
        where: { createdAt: { gte: thirtyDaysAgo }, status: 'cancelled' },
      }),
    ]);

    const abandonmentRate = totalCreated > 0
      ? Math.round(((totalCreated - paymentCompleted) / totalCreated) * 10000) / 100
      : 0;
    const paymentSuccessRate = paymentInitiated > 0
      ? Math.round((paymentCompleted / paymentInitiated) * 10000) / 100
      : 0;

    res.json({
      success: true,
      funnel: {
        ordersCreated: totalCreated,
        paymentInitiated,
        paymentCompleted,
        delivered,
        cancelled,
        abandonmentRate,
        paymentSuccessRate,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/analytics/coupons — coupon effectiveness
router.get('/coupons', authenticate, authorize('ADMIN'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const coupons = await prisma.coupon.findMany({
      orderBy: { usedCount: 'desc' },
    });

    // Revenue generated from coupon orders
    const couponStats = await Promise.all(
      coupons.map(async (coupon) => {
        const orders = await prisma.order.aggregate({
          where: { couponCode: coupon.code, status: { in: [...PAID_ORDER_STATUSES] } },
          _sum: { total: true, discountAmount: true },
          _count: { id: true },
        });
        return {
          id: coupon.id,
          code: coupon.code,
          description: coupon.description,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          isActive: coupon.isActive,
          usedCount: coupon.usedCount,
          maxUses: coupon.maxUses,
          expiresAt: coupon.expiresAt,
          revenueGenerated: Math.round((orders._sum.total ?? 0) * 100) / 100,
          totalDiscount: Math.round((orders._sum.discountAmount ?? 0) * 100) / 100,
          ordersWithCoupon: orders._count.id,
        };
      })
    );

    res.json({ success: true, coupons: couponStats });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/analytics/fraud — high-risk orders
router.get('/fraud', authenticate, authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const threshold = Math.max(0, parseInt((req.query.threshold as string) ?? '30', 10) || 30);
    const alerts = await getFraudAlerts(threshold, 50);
    res.json({ success: true, alerts });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/analytics/customers — customer intelligence (revenue per customer, repeat rate, CLV)
router.get('/customers', authenticate, authorize('ADMIN'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const PAID_STATUSES = PAID_ORDER_STATUSES;

    // Aggregate all-time orders per customer phone
    const allTimeCustomers = await prisma.order.groupBy({
      by: ['customerPhone'],
      where: { status: { in: [...PAID_STATUSES] } },
      _sum: { total: true, discountAmount: true },
      _count: { id: true },
      _max: { createdAt: true },
      orderBy: { _sum: { total: 'desc' } },
      take: 50,
    });

    // Get customer names (most recent name per phone)
    const phones = allTimeCustomers.map((c) => c.customerPhone);
    const latestOrders = await prisma.order.findMany({
      where: { customerPhone: { in: phones }, status: { in: [...PAID_STATUSES] } },
      select: { customerPhone: true, customerName: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    const nameMap = new Map<string, string>();
    for (const o of latestOrders) {
      if (!nameMap.has(o.customerPhone) && o.customerName) {
        nameMap.set(o.customerPhone, o.customerName);
      }
    }

    const topCustomers = allTimeCustomers.map((c) => ({
      phone: c.customerPhone,
      name: nameMap.get(c.customerPhone) ?? null,
      totalOrders: c._count.id,
      totalSpent: Math.round((c._sum.total ?? 0) * 100) / 100,
      totalDiscount: Math.round((c._sum.discountAmount ?? 0) * 100) / 100,
      avgOrderValue: c._count.id > 0
        ? Math.round(((c._sum.total ?? 0) / c._count.id) * 100) / 100
        : 0,
      lastOrderAt: c._max.createdAt,
      isRepeat: c._count.id >= 2,
    }));

    // Count unique customers and repeat customers (all-time)
    const [totalUniqueCustomers, repeatCustomers] = await Promise.all([
      prisma.order.groupBy({
        by: ['customerPhone'],
        where: { status: { in: [...PAID_STATUSES] } },
      }).then((r) => r.length),
      prisma.order.groupBy({
        by: ['customerPhone'],
        where: { status: { in: [...PAID_STATUSES] } },
        having: { customerPhone: { _count: { gte: 2 } } },
      }).then((r) => r.length),
    ]);

    // New vs repeat in last 30 days
    const [newCustomersLast30, allCustomersLast30] = await Promise.all([
      // New = phone had no paid order before 30 days ago
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT o.customerPhone) as count
        FROM "Order" o
        WHERE o.status IN ('paid', 'processing', 'delivered')
          AND o.createdAt >= ${thirtyDaysAgo}
          AND NOT EXISTS (
            SELECT 1 FROM "Order" o2
            WHERE o2.customerPhone = o.customerPhone
              AND o2.status IN ('paid', 'processing', 'delivered')
              AND o2.createdAt < ${thirtyDaysAgo}
          )
      `.then((r) => Number(r[0]?.count ?? 0)),
      prisma.order.groupBy({
        by: ['customerPhone'],
        where: { status: { in: [...PAID_STATUSES] }, createdAt: { gte: thirtyDaysAgo } },
      }).then((r) => r.length),
    ]);

    const repeatCustomersLast30 = allCustomersLast30 - newCustomersLast30;
    const repeatRate = allCustomersLast30 > 0
      ? Math.round((repeatCustomersLast30 / allCustomersLast30) * 10000) / 100
      : 0;

    // Customer lifetime value (average total spent per unique paying customer)
    const clvResult = await prisma.order.aggregate({
      where: { status: { in: [...PAID_STATUSES] } },
      _sum: { total: true },
      _count: { id: true },
    });
    const clv = totalUniqueCustomers > 0
      ? Math.round(((clvResult._sum.total ?? 0) / totalUniqueCustomers) * 100) / 100
      : 0;

    res.json({
      success: true,
      summary: {
        totalUniqueCustomers,
        repeatCustomers,
        repeatRate: totalUniqueCustomers > 0
          ? Math.round((repeatCustomers / totalUniqueCustomers) * 10000) / 100
          : 0,
        avgCustomerLifetimeValue: clv,
        newCustomersLast30,
        repeatCustomersLast30,
        repeatRateLast30: repeatRate,
      },
      topCustomers,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

