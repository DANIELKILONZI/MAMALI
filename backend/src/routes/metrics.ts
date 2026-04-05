import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, authorize('ADMIN'), async (_req: Request, res: Response, next: NextFunction) => {
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
      const hour = new Date(order.createdAt);
      hour.setMinutes(0, 0, 0);
      const key = hour.toISOString();
      ordersPerHour[key] = (ordersPerHour[key] ?? 0) + 1;
    }

    // Payment success rate — last 7 days
    const [completedPayments, totalPayments] = await Promise.all([
      prisma.payment.count({ where: { createdAt: { gte: sevenDaysAgo }, status: 'completed' } }),
      prisma.payment.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    ]);
    const paymentSuccessRate = totalPayments > 0 ? (completedPayments / totalPayments) * 100 : 0;

    // Average API response time from recent SystemLogs
    const slowLogs = await prisma.systemLog.findMany({
      where: { category: 'API', level: 'warn', createdAt: { gte: oneDayAgo } },
      select: { details: true },
      take: 100,
    });
    let avgResponseTime: number | null = null;
    if (slowLogs.length > 0) {
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
      if (durations.length > 0) {
        avgResponseTime = durations.reduce((a, b) => a + b, 0) / durations.length;
      }
    }

    // Order status breakdown
    const allOrders = await prisma.order.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const orderStatusBreakdown = Object.fromEntries(allOrders.map((o) => [o.status, o._count._all]));

    // Low stock count (products with stock <= 5)
    const lowStockCount = await prisma.product.count({ where: { stock: { lte: 5 }, isActive: true } });

    res.json({
      success: true,
      metrics: {
        ordersPerHour,
        paymentSuccessRate: Math.round(paymentSuccessRate * 100) / 100,
        avgResponseTimeMs: avgResponseTime ? Math.round(avgResponseTime) : null,
        orderStatusBreakdown,
        lowStockCount,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
