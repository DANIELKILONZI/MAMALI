/**
 * Admin notifications management endpoints.
 *
 * GET  /api/admin/notifications          — paginated NotificationLog list
 * POST /api/admin/notifications/:id/resend — resend a specific notification
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requirePermission } from '../middleware/auth';
import { retryNotificationLog } from '../services/notifications';

const router = Router();

// GET /api/admin/notifications
router.get(
  '/',
  authenticate,
  requirePermission('notifications.manage'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? '20', 10)));
      const status = (req.query.status as string) ?? 'all';
      const channel = (req.query.channel as string) ?? 'all';

      const where: Record<string, unknown> = {};
      if (status !== 'all') where.status = status;
      if (channel !== 'all') where.channel = channel;

      const [logs, total] = await Promise.all([
        prisma.notificationLog.findMany({
          where,
          include: {
            order: { select: { orderNumber: true, customerName: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.notificationLog.count({ where }),
      ]);

      // Summary counts
      const [totalSent, totalFailed, totalPending] = await Promise.all([
        prisma.notificationLog.count({ where: { status: 'sent' } }),
        prisma.notificationLog.count({ where: { status: 'failed' } }),
        prisma.notificationLog.count({ where: { status: 'pending' } }),
      ]);

      res.json({
        success: true,
        logs,
        summary: { totalSent, totalFailed, totalPending },
        pagination: { total, page, limit, pages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/admin/notifications/:id/resend
router.post(
  '/:id/resend',
  authenticate,
  requirePermission('notifications.manage'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const log = await prisma.notificationLog.findUnique({
        where: { id: String(req.params.id) },
      });

      if (!log) {
        res.status(404).json({ success: false, message: 'Notification not found' });
        return;
      }

      // Re-deliver the ORIGINAL message body and update the same log row —
      // rebuilding the message here previously sent wrong content (internal
      // id as order number, KES 0) and created a duplicate log entry.
      const status = await retryNotificationLog(log);

      res.json({
        success: true,
        status,
        message: status === 'sent' ? 'Notification resent' : 'Resend attempted but delivery failed',
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
