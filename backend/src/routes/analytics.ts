import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, authorize } from '../middleware/auth';
import { getFraudAlerts } from '../services/fraud';

const router = Router();

// GET /api/admin/analytics/revenue  — daily revenue for last 30 days
router.get('/revenue', authenticate, authorize('ADMIN'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const orders = await prisma.order.findMany({
      where: {
        status: { in: ['paid', 'processing', 'delivered'] },
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
        _sum: { quantity: true, total: true },
        _count: { orderId: true },
      }),
      prisma.orderItem.groupBy({
        by: ['productId'],
        where: {
          order: {
            status: { in: ['paid', 'processing', 'delivered'] },
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
          status: { in: ['paid', 'processing', 'delivered'] },
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
        where: { createdAt: { gte: thirtyDaysAgo }, status: { in: ['paid', 'processing', 'delivered'] } },
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
          where: { couponCode: coupon.code, status: { in: ['paid', 'processing', 'delivered'] } },
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
    const threshold = parseInt((req.query.threshold as string) ?? '30', 10);
    const alerts = await getFraudAlerts(threshold, 50);
    res.json({ success: true, alerts });
  } catch (err) {
    next(err);
  }
});

export default router;
