import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// GET /api/admin/inventory/intelligence — fast movers, dead stock, reorder alerts
router.get('/intelligence', authenticate, authorize('ADMIN'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // --- Reorder alerts: active products at or below their reorder level ---
    // We can't do a column-to-column comparison in Prisma without raw SQL,
    // so we fetch all active products with stock <=20 and filter in JS.
    const candidateProducts = await prisma.product.findMany({
      where: { isActive: true, stock: { lte: 20 } },
      select: { id: true, name: true, slug: true, stock: true, reorderLevel: true },
    });
    const reorderAlerts = candidateProducts
      .filter((p) => p.stock <= p.reorderLevel)
      .sort((a, b) => a.stock - b.stock)
      .slice(0, 20);

    // --- Fast movers: highest units sold in last 7 days ---
    const fastMoversRaw = await prisma.orderItem.groupBy({
      by: ['productId', 'name'],
      where: {
        order: {
          status: { in: ['paid', 'processing', 'delivered'] },
          createdAt: { gte: sevenDaysAgo },
        },
      },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 10,
    });

    // Enrich fast movers with stock info
    const fastMoverIds = fastMoversRaw.map((f) => f.productId);
    const fastMoverProducts = await prisma.product.findMany({
      where: { id: { in: fastMoverIds } },
      select: { id: true, stock: true, reorderLevel: true },
    });
    const fastMoverStockMap = new Map(fastMoverProducts.map((p) => [p.id, p]));

    const fastMovers = fastMoversRaw.map((f) => ({
      productId: f.productId,
      name: f.name,
      unitsSoldLast7Days: f._sum.quantity ?? 0,
      currentStock: fastMoverStockMap.get(f.productId)?.stock ?? 0,
      reorderLevel: fastMoverStockMap.get(f.productId)?.reorderLevel ?? 5,
    }));

    // --- Dead stock: active products with stock > 0 and no sales in last 30 days ---
    const soldProductIds = await prisma.orderItem.findMany({
      where: {
        order: {
          status: { in: ['paid', 'processing', 'delivered'] },
          createdAt: { gte: thirtyDaysAgo },
        },
      },
      select: { productId: true },
      distinct: ['productId'],
    });
    const soldIds = new Set(soldProductIds.map((s) => s.productId));

    const deadStock = await prisma.product.findMany({
      where: {
        isActive: true,
        stock: { gt: 0 },
        id: { notIn: [...soldIds] },
      },
      select: { id: true, name: true, slug: true, stock: true, price: true, updatedAt: true },
      orderBy: { stock: 'desc' },
      take: 20,
    });

    // Tie-out: total inventory value of dead stock
    const deadStockValue = deadStock.reduce((sum, p) => sum + p.stock * p.price, 0);

    // --- Stock summary ---
    const [totalProducts, outOfStock, lowStock] = await Promise.all([
      prisma.product.count({ where: { isActive: true } }),
      prisma.product.count({ where: { isActive: true, stock: 0 } }),
      prisma.product.count({ where: { isActive: true, stock: { gt: 0, lte: 5 } } }),
    ]);

    res.json({
      success: true,
      summary: { totalProducts, outOfStock, lowStock },
      reorderAlerts,
      fastMovers,
      deadStock,
      deadStockValue: Math.round(deadStockValue * 100) / 100,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
