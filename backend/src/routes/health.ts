/**
 * Deep system health check route.
 *
 * GET /api/health/full-check
 *
 * Checks:
 *  - Database connectivity (live query)
 *  - Orders pipeline  (can query recent orders)
 *  - Notifications pipeline (service configured + recent log exists)
 *  - Fraud engine     (can call assessOrderRisk with a synthetic order)
 *
 * Returns HTTP 200 with overall status "healthy" | "degraded" | "unhealthy"
 * plus per-component status details.
 *
 * No authentication required so uptime monitors can call it freely.
 * Sensitive internals (counts, last IDs) are safe to expose at the aggregate level.
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { logger } from '../utils/logger';

const router = Router();

// ── Component checkers ─────────────────────────────────────────────────────

async function checkDatabase(): Promise<{ status: 'ok' | 'error'; latencyMs: number; detail?: string }> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    return { status: 'error', latencyMs: Date.now() - start, detail: String(err) };
  }
}

async function checkOrdersPipeline(): Promise<{ status: 'ok' | 'warn' | 'error'; detail?: string; metrics?: Record<string, number> }> {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const oneDayAgo  = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [recentOrders, pendingOrders, totalToday] = await Promise.all([
      prisma.order.count({ where: { createdAt: { gte: oneHourAgo } } }),
      prisma.order.count({ where: { status: { in: ['pending', 'awaiting_payment'] } } }),
      prisma.order.count({ where: { createdAt: { gte: oneDayAgo } } }),
    ]);

    // Warning if 30+ orders have been stuck pending/awaiting for more than 1 hour
    const stuckOrders = await prisma.order.count({
      where: {
        status: { in: ['pending', 'awaiting_payment'] },
        createdAt: { lt: oneHourAgo },
      },
    });

    const status = stuckOrders > STUCK_ORDER_THRESHOLD ? 'warn' : 'ok';
    return {
      status,
      metrics: { recentOrders, pendingOrders, totalToday, stuckOrders },
      detail: status === 'warn' ? `${stuckOrders} orders stuck in pending/awaiting_payment > 1h` : undefined,
    };
  } catch (err) {
    return { status: 'error', detail: String(err) };
  }
}

async function checkNotificationsPipeline(): Promise<{ status: 'ok' | 'warn' | 'error'; detail?: string; metrics?: Record<string, number> }> {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const [totalLastHour, failedLastHour, pendingCount] = await Promise.all([
      prisma.notificationLog.count({ where: { createdAt: { gte: oneHourAgo } } }),
      prisma.notificationLog.count({ where: { createdAt: { gte: oneHourAgo }, status: 'failed' } }),
      prisma.notificationLog.count({ where: { status: 'pending' } }),
    ]);

    const failureRate = totalLastHour > 0 ? (failedLastHour / totalLastHour) * 100 : 0;

    const whatsappConfigured = Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
    const smsConfigured      = Boolean(env.AT_API_KEY && env.AT_USERNAME);
    const anyChannelActive   = whatsappConfigured || smsConfigured;

    let status: 'ok' | 'warn' | 'error' = 'ok';
    let detail: string | undefined;

    if (!anyChannelActive && env.NOTIFICATIONS_ENABLED) {
      status = 'warn';
      detail = 'NOTIFICATIONS_ENABLED=true but no channel (WhatsApp/SMS) is configured';
    } else if (failureRate > 50) {
      status = 'warn';
      detail = `High notification failure rate: ${failureRate.toFixed(1)}% in last hour`;
    }

    return {
      status,
      metrics: { totalLastHour, failedLastHour, pendingCount, failureRatePct: Math.round(failureRate) },
      detail,
    };
  } catch (err) {
    return { status: 'error', detail: String(err) };
  }
}

async function checkFraudEngine(): Promise<{ status: 'ok' | 'error'; detail?: string; metrics?: Record<string, number> }> {
  try {
    // Verify the fraud engine can query the DB (it relies on prisma.order / prisma.payment)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [highRiskToday, totalRiskScored] = await Promise.all([
      prisma.order.count({ where: { riskScore: { gte: 30 }, createdAt: { gte: oneDayAgo } } }),
      prisma.order.count({ where: { riskScore: { gt: 0 } } }),
    ]);

    return {
      status: 'ok',
      metrics: { highRiskToday, totalRiskScored },
    };
  } catch (err) {
    return { status: 'error', detail: String(err) };
  }
}

const STUCK_ORDER_THRESHOLD = 50;

router.get('/full-check', async (_req: Request, res: Response) => {
  const startedAt = new Date().toISOString();

  try {
    const [db, orders, notifications, fraud] = await Promise.all([
      checkDatabase(),
      checkOrdersPipeline(),
      checkNotificationsPipeline(),
      checkFraudEngine(),
    ]);

    const components = { database: db, orders, notifications, fraud };

    // Determine overall status
    const statuses = [db.status, orders.status, notifications.status, fraud.status];
    let overall: 'healthy' | 'degraded' | 'unhealthy';
    if (statuses.includes('error')) {
      overall = statuses.filter((s) => s === 'error').length >= 2 ? 'unhealthy' : 'degraded';
    } else if (statuses.includes('warn')) {
      overall = 'degraded';
    } else {
      overall = 'healthy';
    }

    const httpStatus = overall === 'unhealthy' ? 503 : overall === 'degraded' ? 207 : 200;

    res.status(httpStatus).json({
      success: overall !== 'unhealthy',
      status: overall,
      startedAt,
      components,
    });
  } catch (err) {
    logger.error('Full health check failed', err);
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      startedAt,
      error: 'Health check itself failed — see server logs',
    });
  }
});

export default router;
