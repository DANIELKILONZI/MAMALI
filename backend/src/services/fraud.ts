import { prisma } from '../lib/prisma';

export interface FraudAssessment {
  riskScore: number;
  flags: string[];
}

/**
 * Assess the fraud risk of a new order using velocity checks,
 * payment failure history, order amount thresholds, coupon abuse detection,
 * rapid checkout detection, and IP velocity.
 *
 * Risk score: 0–100 (0 = clean, 1–30 = low, 31–60 = medium, 61+ = high)
 */
export async function assessOrderRisk(params: {
  customerPhone: string;
  orderTotal: number;
  couponCode?: string;
  ipAddress?: string;
  userAgent?: string;
  firstViewedAt?: Date;
}): Promise<FraudAssessment> {
  const { customerPhone, orderTotal, couponCode, ipAddress, firstViewedAt } = params;
  const flags: string[] = [];
  let riskScore = 0;

  const tenSecondsAgo = new Date(Date.now() - 10 * 1000);
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

  // --- Rapid checkout: order placed < 10 seconds after first product view ---
  if (firstViewedAt && firstViewedAt >= tenSecondsAgo) {
    flags.push('RAPID_CHECKOUT');
    riskScore += 20;
  }

  // --- IP velocity: 5+ orders from same IP in the last hour ---
  if (ipAddress) {
    const ipOrderCount = await prisma.order.count({
      where: { ipAddress, createdAt: { gte: oneHourAgo } },
    });
    if (ipOrderCount >= 5) {
      flags.push('HIGH_IP_VELOCITY');
      riskScore += 35;
    } else if (ipOrderCount >= 3) {
      flags.push('ELEVATED_IP_VELOCITY');
      riskScore += 15;
    }
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

    // Single coupon used by 5+ different phones in last 24h → mass sharing
    const uniquePhones = await prisma.order.groupBy({
      by: ['customerPhone'],
      where: { couponCode: couponCode.toUpperCase(), createdAt: { gte: oneDayAgo } },
    });
    if (uniquePhones.length >= 5) {
      flags.push('COUPON_MASS_SHARING');
      riskScore += 20;
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
      ipAddress: true,
      createdAt: true,
    },
    orderBy: { riskScore: 'desc' },
    take: limit,
  });
}

