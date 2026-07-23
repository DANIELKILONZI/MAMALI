import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import { authenticate, requirePermission } from '../middleware/auth';

const router = Router();

// Public: get homepage sections
router.get('/homepage/sections', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const sections = await prisma.homepageSection.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    res.json({ success: true, sections });
  } catch (err) {
    next(err);
  }
});

// Public: get content page by slug
router.get('/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = await prisma.contentPage.findUnique({
      where: { slug: String(req.params.slug), isActive: true },
    });
    if (!page) {
      res.status(404).json({ success: false, message: 'Page not found' });
      return;
    }
    res.json({ success: true, page });
  } catch (err) {
    next(err);
  }
});

// Admin routes
const adminContentRouter = Router();
const adminHomepageRouter = Router();

adminContentRouter.get('/', authenticate, requirePermission('content.manage'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const pages = await prisma.contentPage.findMany({ orderBy: { slug: 'asc' } });
    res.json({ success: true, pages });
  } catch (err) {
    next(err);
  }
});

adminContentRouter.get('/:slug', authenticate, requirePermission('content.manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = await prisma.contentPage.findUnique({ where: { slug: String(req.params.slug) } });
    if (!page) {
      res.status(404).json({ success: false, message: 'Page not found' });
      return;
    }
    res.json({ success: true, page });
  } catch (err) {
    next(err);
  }
});

adminContentRouter.put('/:slug', authenticate, requirePermission('content.manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = z.object({
      title: z.string().min(1).optional(),
      content: z.string().optional(),
      isActive: z.boolean().optional(),
    }).parse(req.body);

    const page = await prisma.contentPage.update({ where: { slug: String(req.params.slug) }, data });
    res.json({ success: true, page });
  } catch (err) {
    next(err);
  }
});

// ── Homepage sections (admin) ────────────────────────────────────────────────
// Section types the storefront knows how to render (frontend/app/page.tsx).
const HOMEPAGE_SECTION_TYPES = ['HERO', 'PROMOTIONS', 'CATEGORIES', 'FEATURED_PRODUCTS'] as const;

adminHomepageRouter.get('/', authenticate, requirePermission('content.manage'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const sections = await prisma.homepageSection.findMany({ orderBy: { sortOrder: 'asc' } });
    res.json({ success: true, sections });
  } catch (err) {
    next(err);
  }
});

// Declared BEFORE '/:id' so the literal path is not captured as an id.
adminHomepageRouter.put('/reorder', authenticate, requirePermission('content.manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids } = z.object({ ids: z.array(z.string()).min(1) }).parse(req.body);
    await prisma.$transaction(
      ids.map((id, index) =>
        prisma.homepageSection.update({ where: { id }, data: { sortOrder: index } })
      )
    );
    const sections = await prisma.homepageSection.findMany({ orderBy: { sortOrder: 'asc' } });
    res.json({ success: true, sections });
  } catch (err) {
    next(err);
  }
});

adminHomepageRouter.get('/:id', authenticate, requirePermission('content.manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const section = await prisma.homepageSection.findUnique({ where: { id: String(req.params.id) } });
    if (!section) {
      res.status(404).json({ success: false, message: 'Section not found' });
      return;
    }
    res.json({ success: true, section });
  } catch (err) {
    next(err);
  }
});

adminHomepageRouter.post('/', authenticate, requirePermission('content.manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = z.object({
      type: z.enum(HOMEPAGE_SECTION_TYPES),
      title: z.string().optional(),
      content: z.string().optional(),
      isActive: z.boolean().default(true),
      sortOrder: z.number().int().optional(),
    }).parse(req.body);

    // Append to the end unless an explicit position is given.
    const sortOrder =
      data.sortOrder ??
      ((await prisma.homepageSection.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1;

    const section = await prisma.homepageSection.create({ data: { ...data, sortOrder } });
    res.status(201).json({ success: true, section });
  } catch (err) {
    next(err);
  }
});

adminHomepageRouter.put('/:id', authenticate, requirePermission('content.manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = z.object({
      type: z.enum(HOMEPAGE_SECTION_TYPES).optional(),
      title: z.string().optional(),
      content: z.string().optional(),
      isActive: z.boolean().optional(),
      sortOrder: z.number().int().optional(),
    }).parse(req.body);

    const section = await prisma.homepageSection.update({ where: { id: String(req.params.id) }, data });
    res.json({ success: true, section });
  } catch (err) {
    next(err);
  }
});

adminHomepageRouter.delete('/:id', authenticate, requirePermission('content.manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.homepageSection.delete({ where: { id: String(req.params.id) } });
    res.json({ success: true, message: 'Section deleted' });
  } catch (err) {
    next(err);
  }
});

export { adminContentRouter, adminHomepageRouter };
export default router;
