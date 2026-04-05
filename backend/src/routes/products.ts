import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

const productSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  price: z.number().positive(),
  discount: z.number().min(0).max(100).default(0),
  discountEndsAt: z.string().datetime().nullable().optional(),
  stock: z.number().int().min(0).default(0),
  reorderLevel: z.number().int().min(0).default(5),
  images: z.array(z.string()).default([]),
  categoryId: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  boostScore: z.number().int().min(0).default(0),
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { category, search, minPrice, maxPrice, page = '1', limit = '20', featured } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    const where: Record<string, unknown> = { isActive: true };
    if (category) {
      const cat = await prisma.category.findUnique({ where: { slug: category as string } });
      if (cat) where.categoryId = cat.id;
    }
    if (search) where.name = { contains: search as string };
    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) (where.price as Record<string, unknown>).gte = parseFloat(minPrice as string);
      if (maxPrice) (where.price as Record<string, unknown>).lte = parseFloat(maxPrice as string);
    }
    if (featured === 'true') where.isFeatured = true;

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take,
        include: { category: { select: { id: true, name: true, slug: true } } },
        orderBy: [{ boostScore: 'desc' }, { createdAt: 'desc' }],
      }),
      prisma.product.count({ where }),
    ]);

    res.json({
      success: true,
      products: products.map((p) => ({ ...p, images: JSON.parse(p.images) })),
      pagination: { total, page: parseInt(page as string), limit: take, pages: Math.ceil(total / take) },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const product = await prisma.product.findUnique({
      where: { slug: String(req.params.slug) },
      include: { category: { select: { id: true, name: true, slug: true } } },
    });
    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }
    res.json({ success: true, product: { ...product, images: JSON.parse(product.images) } });
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticate, authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = productSchema.parse(req.body);
    const exists = await prisma.product.findUnique({ where: { slug: data.slug } });
    if (exists) {
      res.status(409).json({ success: false, message: 'Product slug already in use' });
      return;
    }
    const product = await prisma.product.create({
      data: {
        ...data,
        images: JSON.stringify(data.images),
        discountEndsAt: data.discountEndsAt ? new Date(data.discountEndsAt) : null,
      },
      include: { category: { select: { id: true, name: true, slug: true } } },
    });
    res.status(201).json({ success: true, product: { ...product, images: JSON.parse(product.images) } });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', authenticate, authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = productSchema.partial().parse(req.body);
    if (data.slug) {
      const exists = await prisma.product.findFirst({
        where: { slug: data.slug, NOT: { id: String(req.params.id) } },
      });
      if (exists) {
        res.status(409).json({ success: false, message: 'Slug already in use' });
        return;
      }
    }
    const updateData: Record<string, unknown> = { ...data };
    if (data.images) updateData.images = JSON.stringify(data.images);
    if (data.discountEndsAt !== undefined) {
      updateData.discountEndsAt = data.discountEndsAt ? new Date(data.discountEndsAt) : null;
    }
    const product = await prisma.product.update({
      where: { id: String(req.params.id) },
      data: updateData,
      include: { category: { select: { id: true, name: true, slug: true } } },
    });
    res.json({ success: true, product: { ...product, images: JSON.parse(product.images) } });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticate, authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.product.update({ where: { id: String(req.params.id) }, data: { isActive: false } });
    res.json({ success: true, message: 'Product deactivated' });
  } catch (err) {
    next(err);
  }
});

// Public: record a product view (fire-and-forget by clients)
router.post('/:slug/view', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const product = await prisma.product.findUnique({
      where: { slug: String(req.params.slug) },
      select: { id: true },
    });
    if (product) {
      await prisma.productView.create({ data: { productId: product.id } });
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
