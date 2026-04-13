/**
 * Real-time admin alert engine.
 *
 * GET /api/admin/alerts
 *
 * Returns a list of active operational alerts that ops/admin should be aware of:
 *
 *  1. HIGH_NOTIFICATION_FAILURE  — notification failure rate > 20% in last hour
 *  2. FRAUD_SCORE_SPIKE          — unusual spike in high-risk orders in last hour
 *  3. CONVERSION_DROP            — checkout-to-order ratio dropped > 50% vs 7-day avg
 *  4. HIGH_ABANDONED_CHECKOUTS   — abandonment rate > 60% in last hour
 *  5. PAYMENT_FAILURE_SPIKE      — payment failure rate > 30% in last hour
 *  6. LOW_STOCK_CRITICAL         — 1+ active products are completely out of stock
 *
 * Each alert has: type, severity (warning|critical), message, value, threshold, createdAt.
 *
 * Requires admin or staff authentication.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// ── Alert types ────────────────────────────────────────────────────────────

export type AlertSeverity = 'warning' | 'critical';

export interface Alert {
  type: string;
  severity: AlertSeverity;
  message: string;
  value: number;
  threshold: number;
  unit: string;
  generatedAt: string;
}

// ── Alert thresholds ────────────────────────────────────────────────────────

const NOTIFICATION_FAILURE_THRESHOLD_PCT = 20;
const FRAUD_SPIKE_MIN_RATE_PCT           = 30;
const FRAUD_SPIKE_BASELINE_MULTIPLIER    = 2;
const CONVERSION_DROP_THRESHOLD_PCT      = 50;
const ABANDONED_CHECKOUT_THRESHOLD_PCT   = 60;
const PAYMENT_FAILURE_THRESHOLD_PCT      = 30;

async function notificationFailureAlert(oneHourAgo: Date): Promise<Alert | null> {
  const [total, failed] = await Promise.all([
    prisma.notificationLog.count({ where: { createdAt: { gte: oneHourAgo } } }),
    prisma.notificationLog.count({ where: { createdAt: { gte: oneHourAgo }, status: 'failed' } }),
  ]);

  if (total === 0) return null;

  const rate = Math.round((failed / total) * 100);
  if (rate < NOTIFICATION_FAILURE_THRESHOLD_PCT) return null;

  return {
    type: 'HIGH_NOTIFICATION_FAILURE',
    severity: rate >= 50 ? 'critical' : 'warning',
    message: `Notification failure rate is ${rate}% in the last hour (${failed}/${total} failed)`,
    value: rate,
    threshold: NOTIFICATION_FAILURE_THRESHOLD_PCT,
    unit: '%',
    generatedAt: new Date().toISOString(),
  };
}

async function fraudSpikeAlert(oneHourAgo: Date, sevenDaysAgo: Date): Promise<Alert | null> {
  const [highRiskLastHour, totalLastHour, highRiskLast7d, totalLast7d] = await Promise.all([
    prisma.order.count({ where: { riskScore: { gte: 30 }, createdAt: { gte: oneHourAgo } } }),
    prisma.order.count({ where: { createdAt: { gte: oneHourAgo } } }),
    prisma.order.count({ where: { riskScore: { gte: 30 }, createdAt: { gte: sevenDaysAgo } } }),
    prisma.order.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
  ]);

  if (totalLastHour === 0) return null;

  const rateNow = (highRiskLastHour / totalLastHour) * 100;
  const rateBaseline = totalLast7d > 0 ? (highRiskLast7d / totalLast7d) * 100 : 0;

  // Alert if current rate is > 30% AND at least 2× the 7-day baseline
  const threshold = Math.max(FRAUD_SPIKE_MIN_RATE_PCT, rateBaseline * FRAUD_SPIKE_BASELINE_MULTIPLIER);
  if (rateNow < threshold) return null;

  return {
    type: 'FRAUD_SCORE_SPIKE',
    severity: rateNow >= 60 ? 'critical' : 'warning',
    message: `${Math.round(rateNow)}% of orders in the last hour are high-risk (7-day baseline: ${Math.round(rateBaseline)}%)`,
    value: Math.round(rateNow),
    threshold: Math.round(threshold),
    unit: '%',
    generatedAt: new Date().toISOString(),
  };
}

async function conversionDropAlert(oneHourAgo: Date, sevenDaysAgo: Date): Promise<Alert | null> {
  // Proxy for conversion: ratio of views to orders
  const [viewsLastHour, ordersLastHour, viewsLast7d, ordersLast7d] = await Promise.all([
    prisma.productView.count({ where: { createdAt: { gte: oneHourAgo } } }),
    prisma.order.count({ where: { createdAt: { gte: oneHourAgo } } }),
    prisma.productView.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.order.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
  ]);

  if (viewsLastHour < 10 || viewsLast7d === 0) return null;

  const conversionNow      = ordersLastHour / viewsLastHour;
  const conversionBaseline = ordersLast7d / viewsLast7d;

  if (conversionBaseline === 0) return null;

  const dropPct = Math.round(((conversionBaseline - conversionNow) / conversionBaseline) * 100);
  if (dropPct < CONVERSION_DROP_THRESHOLD_PCT) return null;

  return {
    type: 'CONVERSION_DROP',
    severity: dropPct >= 70 ? 'critical' : 'warning',
    message: `Conversion rate dropped ${dropPct}% in the last hour vs 7-day average (${(conversionNow * 100).toFixed(1)}% vs ${(conversionBaseline * 100).toFixed(1)}%)`,
    value: dropPct,
    threshold: CONVERSION_DROP_THRESHOLD_PCT,
    unit: '% drop',
    generatedAt: new Date().toISOString(),
  };
}

async function abandonedCheckoutsAlert(oneHourAgo: Date): Promise<Alert | null> {
  // Abandoned = orders stuck in pending/awaiting_payment for > 30 min
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
  const [abandoned, totalLastHour] = await Promise.all([
    prisma.order.count({
      where: {
        status: { in: ['pending', 'awaiting_payment'] },
        createdAt: { gte: oneHourAgo, lt: thirtyMinAgo },
      },
    }),
    prisma.order.count({ where: { createdAt: { gte: oneHourAgo } } }),
  ]);

  if (totalLastHour === 0) return null;

  const rate = Math.round((abandoned / totalLastHour) * 100);
  if (rate < ABANDONED_CHECKOUT_THRESHOLD_PCT) return null;

  return {
    type: 'HIGH_ABANDONED_CHECKOUTS',
    severity: rate >= 80 ? 'critical' : 'warning',
    message: `${rate}% of checkouts in the last hour are abandoned (${abandoned}/${totalLastHour} orders stuck without payment)`,
    value: rate,
    threshold: ABANDONED_CHECKOUT_THRESHOLD_PCT,
    unit: '%',
    generatedAt: new Date().toISOString(),
  };
}

async function paymentFailureSpikeAlert(oneHourAgo: Date): Promise<Alert | null> {
  const [total, failed] = await Promise.all([
    prisma.payment.count({ where: { createdAt: { gte: oneHourAgo } } }),
    prisma.payment.count({ where: { createdAt: { gte: oneHourAgo }, status: 'failed' } }),
  ]);

  if (total === 0) return null;

  const rate = Math.round((failed / total) * 100);
  if (rate < PAYMENT_FAILURE_THRESHOLD_PCT) return null;

  return {
    type: 'PAYMENT_FAILURE_SPIKE',
    severity: rate >= 60 ? 'critical' : 'warning',
    message: `Payment failure rate is ${rate}% in the last hour (${failed}/${total} failed)`,
    value: rate,
    threshold: PAYMENT_FAILURE_THRESHOLD_PCT,
    unit: '%',
    generatedAt: new Date().toISOString(),
  };
}

async function lowStockCriticalAlert(): Promise<Alert | null> {
  const outOfStock = await prisma.product.count({
    where: { stock: 0, isActive: true },
  });

  if (outOfStock === 0) return null;

  return {
    type: 'LOW_STOCK_CRITICAL',
    severity: outOfStock >= 5 ? 'critical' : 'warning',
    message: `${outOfStock} active product${outOfStock === 1 ? ' is' : 's are'} completely out of stock`,
    value: outOfStock,
    threshold: 1,
    unit: 'products',
    generatedAt: new Date().toISOString(),
  };
}

// ── Route ──────────────────────────────────────────────────────────────────

router.get(
  '/',
  authenticate,
  authorize('ADMIN', 'STAFF'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const oneHourAgo  = new Date(Date.now() - 60 * 60 * 1000);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const results = await Promise.allSettled([
        notificationFailureAlert(oneHourAgo),
        fraudSpikeAlert(oneHourAgo, sevenDaysAgo),
        conversionDropAlert(oneHourAgo, sevenDaysAgo),
        abandonedCheckoutsAlert(oneHourAgo),
        paymentFailureSpikeAlert(oneHourAgo),
        lowStockCriticalAlert(),
      ]);

      const alerts: Alert[] = results
        .filter((r): r is PromiseFulfilledResult<Alert | null> => r.status === 'fulfilled')
        .map((r) => r.value)
        .filter((a): a is Alert => a !== null);

      const criticalCount = alerts.filter((a) => a.severity === 'critical').length;
      const warningCount  = alerts.filter((a) => a.severity === 'warning').length;

      res.json({
        success: true,
        alerts,
        summary: {
          total: alerts.length,
          critical: criticalCount,
          warning: warningCount,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
