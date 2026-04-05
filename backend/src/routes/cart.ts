import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();

const validateCartSchema = z.object({
  items: z.array(
    z.object({
      productId: z.string(),
      quantity: z.number().int().positive(),
    })
  ).min(1),
});

router.post('/validate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items } = validateCartSchema.parse(req.body);
    const productIds = items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true },
    });

    const validatedItems = items.map((item) => {
      const product = products.find((p) => p.id === item.productId);
      if (!product) {
        return { ...item, valid: false, reason: 'Product not found or inactive', product: null };
      }
      if (product.stock < item.quantity) {
        return {
          ...item,
          valid: false,
          reason: `Only ${product.stock} units available`,
          availableStock: product.stock,
          product: { id: product.id, name: product.name, price: product.price, discount: product.discount, stock: product.stock },
        };
      }
      const price = product.price - (product.price * product.discount) / 100;
      return {
        ...item,
        valid: true,
        price,
        total: price * item.quantity,
        product: { id: product.id, name: product.name, price: product.price, discount: product.discount, stock: product.stock, images: JSON.parse(product.images) },
      };
    });

    const allValid = validatedItems.every((i) => i.valid);
    const subtotal = validatedItems.filter((i) => i.valid).reduce((s, i) => s + ((i as { total?: number }).total || 0), 0);

    res.json({ success: true, valid: allValid, items: validatedItems, subtotal, total: subtotal });
  } catch (err) {
    next(err);
  }
});

export default router;
