import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

const adSchema = z.object({
  title: z.string().min(1),
  type: z.enum(['BANNER', 'FEATURED', 'PROMOTION']),
  placement: z.enum(['HOMEPAGE', 'CATEGORY', 'PRODUCT']),
  imageUrl: z.string().optional().nullable(),
  linkUrl: z.string().optional().nullable(),
  content: z.string().optional().nullable(),
  isActive: z.boolean().default(false),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  sortOrder: z.number().int().default(0),
});

// Public: get active ads by placement
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { placement } = req.query;
    const now = new Date();
    const where: Record<string, unknown> = {
      isActive: true,
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
    };
    const endWhere: Record<string, unknown>[] = [{ endsAt: null }, { endsAt: { gte: now } }];
    where.AND = [{ OR: endWhere }];
    if (placement) where.placement = placement;

    const ads = await prisma.advertisement.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
    });
    res.json({ success: true, advertisements: ads });
  } catch (err) {
    next(err);
  }
});

// Admin routes
const adminRouter = Router();

adminRouter.get('/', authenticate, authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ads = await prisma.advertisement.findMany({ orderBy: { sortOrder: 'asc' } });
    res.json({ success: true, advertisements: ads });
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/:id', authenticate, authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ad = await prisma.advertisement.findUnique({ where: { id: String(req.params.id) } });
    if (!ad) {
      res.status(404).json({ success: false, message: 'Advertisement not found' });
      return;
    }
    res.json({ success: true, advertisement: ad });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/', authenticate, authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = adSchema.parse(req.body);
    const ad = await prisma.advertisement.create({ data: {
      ...data,
      startsAt: data.startsAt ? new Date(data.startsAt) : null,
      endsAt: data.endsAt ? new Date(data.endsAt) : null,
    }});
    res.status(201).json({ success: true, advertisement: ad });
  } catch (err) {
    next(err);
  }
});

adminRouter.put('/:id', authenticate, authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = adSchema.partial().parse(req.body);
    const ad = await prisma.advertisement.update({
      where: { id: String(req.params.id) },
      data: {
        ...data,
        startsAt: data.startsAt !== undefined ? (data.startsAt ? new Date(data.startsAt) : null) : undefined,
        endsAt: data.endsAt !== undefined ? (data.endsAt ? new Date(data.endsAt) : null) : undefined,
      },
    });
    res.json({ success: true, advertisement: ad });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete('/:id', authenticate, authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.advertisement.delete({ where: { id: String(req.params.id) } });
    res.json({ success: true, message: 'Advertisement deleted' });
  } catch (err) {
    next(err);
  }
});

export { adminRouter as advertisementsAdminRouter };
export default router;
