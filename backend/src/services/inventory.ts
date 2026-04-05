import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

interface StockItem {
  productId: string;
  quantity: number;
}

export async function checkAvailability(items: StockItem[]): Promise<{ available: boolean; outOfStock: string[] }> {
  const outOfStock: string[] = [];
  for (const item of items) {
    const product = await prisma.product.findUnique({ where: { id: item.productId } });
    if (!product || !product.isActive || product.stock < item.quantity) {
      outOfStock.push(item.productId);
    }
  }
  return { available: outOfStock.length === 0, outOfStock };
}

export async function reserveStock(items: StockItem[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const item of items) {
      const product = await tx.product.findUnique({ where: { id: item.productId } });
      if (!product || product.stock < item.quantity) {
        throw new Error(`Insufficient stock for product ${item.productId}`);
      }
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });
    }
  });
  logger.info('Stock reserved', { items });
}

export async function releaseStock(items: StockItem[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const item of items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity } },
      });
    }
  });
  logger.info('Stock released', { items });
}
