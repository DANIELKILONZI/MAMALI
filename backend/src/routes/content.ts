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

adminHomepageRouter.put('/:id', authenticate, requirePermission('content.manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = z.object({
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

export { adminContentRouter, adminHomepageRouter };
export default router;
