import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

async function getOrCreateSettings() {
  const existing = await prisma.storeSettings.findFirst();
  if (existing) return existing;
  return prisma.storeSettings.create({ data: {} });
}

// Public: GET /api/settings — also served at GET /api/admin/settings
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await getOrCreateSettings();
    res.json({ success: true, settings });
  } catch (err) {
    next(err);
  }
});

const settingsSchema = z.object({
  businessName: z.string().min(1).optional(),
  currency: z.string().min(1).optional(),
  logoUrl: z.string().url().nullable().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  notificationsEnabled: z.boolean().optional(),
  whatsappEnabled: z.boolean().optional(),
  smsFallbackEnabled: z.boolean().optional(),
});

// Admin: PUT /api/admin/settings
router.put('/', authenticate, authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = settingsSchema.parse(req.body);
    const existing = await getOrCreateSettings();
    const settings = await prisma.storeSettings.update({
      where: { id: existing.id },
      data,
    });
    res.json({ success: true, settings });
  } catch (err) {
    next(err);
  }
});

export default router;
