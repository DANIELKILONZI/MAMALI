import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import { authenticate, requirePermission } from '../middleware/auth';

const router = Router();

const categorySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  imageUrl: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(),
  sortOrder: z.number().int().default(0),
});

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await prisma.category.findMany({
      where: { parentId: null },
      include: {
        children: {
          include: { children: true },
          orderBy: { sortOrder: 'asc' },
        },
        _count: { select: { products: true } },
      },
      orderBy: { sortOrder: 'asc' },
    });
    res.json({ success: true, categories });
  } catch (err) {
    next(err);
  }
});

// Accepts a slug (storefront, SEO URLs) or an id (admin edit screens).
router.get('/:slugOrId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const key = String(req.params.slugOrId);
    const category = await prisma.category.findFirst({
      where: { OR: [{ slug: key }, { id: key }] },
      include: {
        children: true,
        products: {
          where: { isActive: true },
          include: { category: { select: { id: true, name: true, slug: true } } },
          take: 20,
        },
      },
    });
    if (!category) {
      res.status(404).json({ success: false, message: 'Category not found' });
      return;
    }
    res.json({
      success: true,
      category: {
        ...category,
        products: category.products.map((p) => ({ ...p, images: JSON.parse(p.images) })),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticate, requirePermission('categories.manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = categorySchema.parse(req.body);
    const exists = await prisma.category.findUnique({ where: { slug: data.slug } });
    if (exists) {
      res.status(409).json({ success: false, message: 'Category slug already in use' });
      return;
    }
    const category = await prisma.category.create({ data });
    res.status(201).json({ success: true, category });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', authenticate, requirePermission('categories.manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = categorySchema.partial().parse(req.body);
    if (data.slug) {
      const exists = await prisma.category.findFirst({
        where: { slug: data.slug, NOT: { id: String(req.params.id) } },
      });
      if (exists) {
        res.status(409).json({ success: false, message: 'Slug already in use' });
        return;
      }
    }
    const category = await prisma.category.update({ where: { id: String(req.params.id) }, data });
    res.json({ success: true, category });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticate, requirePermission('categories.manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Move products to uncategorized
    await prisma.product.updateMany({ where: { categoryId: String(req.params.id) }, data: { categoryId: null } });
    await prisma.category.delete({ where: { id: String(req.params.id) } });
    res.json({ success: true, message: 'Category deleted' });
  } catch (err) {
    next(err);
  }
});

export default router;
