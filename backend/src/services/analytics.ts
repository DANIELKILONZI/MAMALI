import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function getDashboardStats() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  const [
    totalRevenue,
    monthRevenue,
    lastMonthRevenue,
    totalOrders,
    pendingOrders,
    processingOrders,
    topProducts,
    lowStockProducts,
    recentOrders,
  ] = await Promise.all([
    prisma.order.aggregate({
      where: { status: { in: ['paid', 'processing', 'delivered'] } },
      _sum: { total: true },
    }),
    prisma.order.aggregate({
      where: { status: { in: ['paid', 'processing', 'delivered'] }, createdAt: { gte: startOfMonth } },
      _sum: { total: true },
    }),
    prisma.order.aggregate({
      where: {
        status: { in: ['paid', 'processing', 'delivered'] },
        createdAt: { gte: startOfLastMonth, lte: endOfLastMonth },
      },
      _sum: { total: true },
    }),
    prisma.order.count(),
    prisma.order.count({ where: { status: 'pending' } }),
    prisma.order.count({ where: { status: 'processing' } }),
    prisma.orderItem.groupBy({
      by: ['productId', 'name'],
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
  ]);

  const monthRevenueVal = monthRevenue._sum.total || 0;
  const lastMonthRevenueVal = lastMonthRevenue._sum.total || 0;
  const revenueGrowth =
    lastMonthRevenueVal === 0 && monthRevenueVal === 0
      ? 0
      : lastMonthRevenueVal === 0
      ? 100
      : ((monthRevenueVal - lastMonthRevenueVal) / lastMonthRevenueVal) * 100;

  return {
    revenue: {
      total: totalRevenue._sum.total || 0,
      thisMonth: monthRevenueVal,
      lastMonth: lastMonthRevenueVal,
      growth: Math.round(revenueGrowth * 100) / 100,
    },
    orders: {
      total: totalOrders,
      pending: pendingOrders,
      processing: processingOrders,
    },
    topProducts,
    lowStockAlerts: lowStockProducts,
    recentOrders,
  };
}
