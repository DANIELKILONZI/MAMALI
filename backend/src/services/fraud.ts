import { prisma } from '../lib/prisma';

export interface FraudAssessment {
  riskScore: number;
  flags: string[];
}

/**
 * Assess the fraud risk of a new order using velocity checks,
 * payment failure history, order amount thresholds, and coupon abuse detection.
 *
 * Risk score: 0–100 (0 = clean, 1–30 = low, 31–60 = medium, 61+ = high)
 */
export async function assessOrderRisk(params: {
  customerPhone: string;
  orderTotal: number;
  couponCode?: string;
}): Promise<FraudAssessment> {
  const { customerPhone, orderTotal, couponCode } = params;
  const flags: string[] = [];
  let riskScore = 0;

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // --- Velocity: orders from same phone ---
  const ordersLastHour = await prisma.order.count({
    where: { customerPhone, createdAt: { gte: oneHourAgo } },
  });
  if (ordersLastHour >= 3) {
    flags.push('HIGH_ORDER_VELOCITY');
    riskScore += 40;
  } else if (ordersLastHour >= 2) {
    flags.push('ELEVATED_ORDER_VELOCITY');
    riskScore += 15;
  }

  // --- Repeated failed payments in last 24h for this phone ---
  const recentOrders = await prisma.order.findMany({
    where: { customerPhone, createdAt: { gte: oneDayAgo } },
    select: { id: true },
  });
  if (recentOrders.length > 0) {
    const failedPayments = await prisma.payment.count({
      where: { orderId: { in: recentOrders.map((o) => o.id) }, status: 'failed' },
    });
    if (failedPayments >= 3) {
      flags.push('MULTIPLE_FAILED_PAYMENTS');
      riskScore += 30;
    } else if (failedPayments >= 2) {
      flags.push('REPEATED_FAILED_PAYMENTS');
      riskScore += 15;
    }
  }

  // --- High order amount thresholds ---
  if (orderTotal > 50000) {
    flags.push('VERY_HIGH_ORDER_AMOUNT');
    riskScore += 20;
  } else if (orderTotal > 20000) {
    flags.push('HIGH_ORDER_AMOUNT');
    riskScore += 10;
  }

  // --- Coupon abuse: phone used coupons 3+ times in 7 days ---
  if (couponCode) {
    const couponOrderCount = await prisma.order.count({
      where: {
        customerPhone,
        couponCode: { not: null },
        createdAt: { gte: sevenDaysAgo },
      },
    });
    if (couponOrderCount >= 3) {
      flags.push('COUPON_ABUSE_SUSPECTED');
      riskScore += 25;
    }
  }

  return { riskScore: Math.min(riskScore, 100), flags };
}

/**
 * Returns orders with riskScore >= threshold, for the fraud alerts panel.
 */
export async function getFraudAlerts(threshold = 30, limit = 20) {
  return prisma.order.findMany({
    where: { riskScore: { gte: threshold } },
    select: {
      id: true,
      orderNumber: true,
      customerPhone: true,
      customerName: true,
      status: true,
      total: true,
      riskScore: true,
      riskFlags: true,
      createdAt: true,
    },
    orderBy: { riskScore: 'desc' },
    take: limit,
  });
}
