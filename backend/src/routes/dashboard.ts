import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { getDashboardStats } from '../services/analytics';

const router = Router();

router.get('/', authenticate, authorize('ADMIN'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await getDashboardStats();
    res.json({ success: true, ...stats });
  } catch (err) {
    next(err);
  }
});

export default router;
