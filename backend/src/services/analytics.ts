import { prisma } from '../lib/prisma';
import { PAID_ORDER_STATUSES } from '../lib/constants';

export async function getDashboardStats() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const PAID = PAID_ORDER_STATUSES;

  const [
    totalRevenueAgg,
    monthRevenue,
    lastMonthRevenue,
    totalOrders,
    pendingOrders,
    processingOrders,
    paidOrdersAgg,
    topProducts,
    lowStockProducts,
    recentOrders,
    abandonedCount,
    ordersByStatus,
  ] = await Promise.all([
    prisma.order.aggregate({
      where: { status: { in: [...PAID] } },
      _sum: { total: true },
    }),
    prisma.order.aggregate({
      where: { status: { in: [...PAID] }, createdAt: { gte: startOfMonth } },
      _sum: { total: true },
    }),
    prisma.order.aggregate({
      where: {
        status: { in: [...PAID] },
        createdAt: { gte: startOfLastMonth, lte: endOfLastMonth },
      },
      _sum: { total: true },
    }),
    prisma.order.count(),
    prisma.order.count({ where: { status: 'pending' } }),
    prisma.order.count({ where: { status: 'processing' } }),
    // For AOV calculation
    prisma.order.aggregate({
      where: { status: { in: [...PAID] } },
      _sum: { total: true },
      _count: { id: true },
    }),
    prisma.orderItem.groupBy({
      by: ['productId', 'name'],
      where: { order: { status: { in: [...PAID] } } },
      _sum: { quantity: true, total: true },
      orderBy: { _sum: { total: 'desc' } },
      take: 5,
    }),
    prisma.product.findMany({
      where: { stock: { lte: 5 }, isActive: true },
      select: { id: true, name: true, stock: true, slug: true },
      orderBy: { stock: 'asc' },
      take: 10,
    }),
    prisma.order.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        customerPhone: true,
        status: true,
        total: true,
        createdAt: true,
      },
    }),
    // Abandoned = orders expired (cancelled) in last 24h that were pending/awaiting_payment
    prisma.order.count({
      where: {
        status: 'cancelled',
        expiresAt: { not: null, lt: now },
        createdAt: { gte: last24h },
      },
    }),
    // All statuses count for the dashboard breakdown
    prisma.order.groupBy({
      by: ['status'],
      _count: { id: true },
    }),
  ]);

  const monthRevenueVal = monthRevenue._sum.total || 0;
  const lastMonthRevenueVal = lastMonthRevenue._sum.total || 0;
  const revenueGrowth =
    lastMonthRevenueVal === 0 && monthRevenueVal === 0
      ? 0
      : lastMonthRevenueVal === 0
      ? 100
      : ((monthRevenueVal - lastMonthRevenueVal) / lastMonthRevenueVal) * 100;

  const totalPaidCount = paidOrdersAgg._count.id;
  const totalRevenue = totalRevenueAgg._sum.total || 0;
  const aov = totalPaidCount > 0 ? Math.round((totalRevenue / totalPaidCount) * 100) / 100 : 0;

  const statusBreakdown: Record<string, number> = {};
  for (const row of ordersByStatus) {
    statusBreakdown[row.status] = row._count.id;
  }

  return {
    revenue: {
      total: totalRevenue,
      thisMonth: monthRevenueVal,
      lastMonth: lastMonthRevenueVal,
      growth: Math.round(revenueGrowth * 100) / 100,
    },
    orders: {
      total: totalOrders,
      pending: pendingOrders,
      processing: processingOrders,
    },
    aov,
    abandonedLast24h: abandonedCount,
    ordersByStatus: statusBreakdown,
    topProducts,
    lowStockAlerts: lowStockProducts,
    recentOrders,
  };
}
