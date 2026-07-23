import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import { authenticate, requirePermission } from '../middleware/auth';

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
    const { category, search, minPrice, maxPrice, page: pageParam = '1', limit: limitParam = '20', featured } = req.query;
    const page = Math.max(1, parseInt(pageParam as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(limitParam as string, 10) || 1));
    const skip = (page - 1) * limit;

    // Validate numeric price filters — return 400 rather than silently sending NaN to Prisma
    const minPriceVal = minPrice ? parseFloat(minPrice as string) : undefined;
    const maxPriceVal = maxPrice ? parseFloat(maxPrice as string) : undefined;
    if (minPriceVal !== undefined && isNaN(minPriceVal)) {
      res.status(400).json({ success: false, message: 'minPrice must be a valid number' });
      return;
    }
    if (maxPriceVal !== undefined && isNaN(maxPriceVal)) {
      res.status(400).json({ success: false, message: 'maxPrice must be a valid number' });
      return;
    }

    const where: Record<string, unknown> = { isActive: true };
    if (category) {
      const cat = await prisma.category.findUnique({ where: { slug: category as string } });
      if (cat) where.categoryId = cat.id;
    }
    if (search) where.name = { contains: search as string };
    if (minPriceVal !== undefined || maxPriceVal !== undefined) {
      where.price = {
        ...(minPriceVal !== undefined ? { gte: minPriceVal } : {}),
        ...(maxPriceVal !== undefined ? { lte: maxPriceVal } : {}),
      };
    }
    if (featured === 'true') where.isFeatured = true;

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        include: { category: { select: { id: true, name: true, slug: true } } },
        orderBy: [{ boostScore: 'desc' }, { createdAt: 'desc' }],
      }),
      prisma.product.count({ where }),
    ]);

    res.json({
      success: true,
      products: products.map((p) => ({ ...p, images: JSON.parse(p.images) })),
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
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

router.post('/', authenticate, requirePermission('products.manage'), async (req: Request, res: Response, next: NextFunction) => {
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

router.put('/:id', authenticate, requirePermission('products.manage'), async (req: Request, res: Response, next: NextFunction) => {
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

router.delete('/:id', authenticate, requirePermission('products.manage'), async (req: Request, res: Response, next: NextFunction) => {
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
