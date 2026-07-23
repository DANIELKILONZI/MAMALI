import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requirePermission } from '../middleware/auth';
import { countLowStockProducts } from '../services/inventory';

const router = Router();

router.get('/', authenticate, requirePermission('analytics.view'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Orders per hour — last 24 hours
    const recentOrders = await prisma.order.findMany({
      where: { createdAt: { gte: oneDayAgo } },
      select: { createdAt: true },
    });

    const ordersPerHour: Record<string, number> = {};
    for (const order of recentOrders) {
      // Truncate to the hour in UTC — mixing local-time truncation with a
      // UTC key shifted buckets by the server's timezone offset.
      const key = new Date(Math.floor(order.createdAt.getTime() / 3_600_000) * 3_600_000).toISOString();
      ordersPerHour[key] = (ordersPerHour[key] ?? 0) + 1;
    }

    // Payment success rate — last 7 days
    const [completedPayments, totalPayments] = await Promise.all([
      prisma.payment.count({ where: { createdAt: { gte: sevenDaysAgo }, status: 'completed' } }),
      prisma.payment.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    ]);
    const paymentSuccessRate = totalPayments > 0 ? (completedPayments / totalPayments) * 100 : 0;

    // Only requests slower than the threshold are persisted (requestLogger),
    // so this is the average of SLOW requests, not all traffic — exposed
    // under an honest name with its sample size rather than mislabeled as
    // overall average response time.
    const slowLogs = await prisma.systemLog.findMany({
      where: { category: 'API', level: 'warn', createdAt: { gte: oneDayAgo } },
      select: { details: true },
      take: 100,
    });
    const durations = slowLogs
      .map((l) => {
        try {
          const d = JSON.parse(l.details ?? '{}') as { duration?: number };
          return d.duration ?? null;
        } catch {
          return null;
        }
      })
      .filter((d): d is number => d !== null);
    const avgSlowRequest = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : null;

    // Order status breakdown
    const allOrders = await prisma.order.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const orderStatusBreakdown = Object.fromEntries(allOrders.map((o) => [o.status, o._count._all]));

    // Low stock count = active products at/below their own reorder level
    const lowStockCount = await countLowStockProducts();

    res.json({
      success: true,
      metrics: {
        ordersPerHour,
        paymentSuccessRate: Math.round(paymentSuccessRate * 100) / 100,
        // Slow requests only (> requestLogger threshold), with sample size
        avgSlowRequestMs: avgSlowRequest ? Math.round(avgSlowRequest) : null,
        slowRequestSample: durations.length,
        orderStatusBreakdown,
        lowStockCount,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
