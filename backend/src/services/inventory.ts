import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';

type TransactionClient = Prisma.TransactionClient;


interface StockItem {
  productId: string;
  quantity: number;
}

export async function checkAvailability(items: StockItem[]): Promise<{ available: boolean; outOfStock: string[] }> {
  const products = await prisma.product.findMany({
    where: { id: { in: items.map((i) => i.productId) } },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));
  const outOfStock: string[] = [];
  for (const item of items) {
    const product = productMap.get(item.productId);
    if (!product || !product.isActive || product.stock < item.quantity) {
      outOfStock.push(item.productId);
    }
  }
  return { available: outOfStock.length === 0, outOfStock };
}

export async function reserveStock(items: StockItem[]): Promise<void> {
  await prisma.$transaction(async (tx: TransactionClient) => {
    for (const item of items) {
      // Atomic check-and-decrement: the stock >= quantity guard in the WHERE
      // prevents concurrent reservations from driving stock negative.
      const reserved = await tx.product.updateMany({
        where: { id: item.productId, stock: { gte: item.quantity } },
        data: { stock: { decrement: item.quantity } },
      });
      if (reserved.count === 0) {
        throw new Error(`Insufficient stock for product ${item.productId}`);
      }
    }
  });
  logger.info('Stock reserved', { items });
}

export async function releaseStock(items: StockItem[]): Promise<void> {
  await prisma.$transaction(async (tx: TransactionClient) => {
    for (const item of items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity } },
      });
    }
  });
  logger.info('Stock released', { items });
}
