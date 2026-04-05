/**
 * Admin notifications management endpoints.
 *
 * GET  /api/admin/notifications          — paginated NotificationLog list
 * POST /api/admin/notifications/:id/resend — resend a specific notification
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, authorize } from '../middleware/auth';
import { sendNotification } from '../services/notifications';

const router = Router();

// GET /api/admin/notifications
router.get(
  '/',
  authenticate,
  authorize('ADMIN', 'STAFF'),
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
  authorize('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const log = await prisma.notificationLog.findUnique({
        where: { id: String(req.params.id) },
      });

      if (!log) {
        res.status(404).json({ success: false, message: 'Notification not found' });
        return;
      }

      // Fire resend (non-blocking) using the unified notification service
      sendNotification({
        orderId: log.orderId ?? undefined,
        recipient: log.recipient,
        messageType: log.messageType as Parameters<typeof sendNotification>[0]['messageType'],
        templateData: {
          orderNumber: log.orderId ?? 'N/A',
          total: 0,
        },
      }).catch(() => {});

      // Mark as pending so the retry job can confirm delivery
      await prisma.notificationLog.update({
        where: { id: log.id },
        data: { status: 'pending', error: null, retryCount: { increment: 1 } },
      });

      res.json({ success: true, message: 'Resend queued' });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
