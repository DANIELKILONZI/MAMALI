import { prisma } from '../lib/prisma';

/**
 * Guarded order state transitions shared by the payment callback, the
 * reconcile endpoint, and background jobs.
 *
 * Async paths (M-Pesa callbacks, expiry job) race each other: a callback
 * can land while the expiry job holds a stale snapshot, and vice versa.
 * Every transition here is a conditional write — the status filter in the
 * WHERE clause makes the transition a no-op when another path won the
 * race, instead of clobbering its result.
 */

const PAYABLE_STATUSES = ['pending', 'awaiting_payment'];

export interface PaidOrderSummary {
  id: string;
  orderNumber: string;
  customerPhone: string;
  customerName: string | null;
  total: number;
}

export type PaidTransitionResult =
  | { ok: true; order: PaidOrderSummary }
  | { ok: false; currentStatus: string | undefined };

/**
 * Flips an order to `paid` only if it is still payable.
 * Returns `ok: false` with the order's current status when the order was
 * already cancelled/paid/advanced — callers must NOT resurrect it; a
 * completed payment against a dead order needs manual follow-up (refund).
 */
export async function transitionOrderToPaid(orderId: string): Promise<PaidTransitionResult> {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: { id: orderId, status: { in: PAYABLE_STATUSES } },
      data: { status: 'paid' },
    });
    if (updated.count === 0) {
      const current = await tx.order.findUnique({
        where: { id: orderId },
        select: { status: true },
      });
      return { ok: false as const, currentStatus: current?.status };
    }
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { id: true, orderNumber: true, customerPhone: true, customerName: true, total: true },
    });
    return { ok: true as const, order: order! };
  });
}

/**
 * Cancels an unpaid order and returns its stock, atomically.
 * Returns false (and touches nothing) when the order was paid or already
 * cancelled in the meantime — preventing both the "cancel a paid order"
 * and the "double stock release" races.
 */
export async function expireOrder(orderId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: { id: orderId, status: { in: PAYABLE_STATUSES } },
      data: { status: 'cancelled' },
    });
    if (updated.count === 0) return false;

    const items = await tx.orderItem.findMany({ where: { orderId } });
    for (const item of items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity } },
      });
    }

    await releaseCouponSlot(tx, orderId);
    return true;
  });
}

/**
 * Returns a coupon usage slot consumed by an order that never completed.
 * usedCount is incremented at order creation, so a cancelled/expired order
 * would otherwise permanently burn a limited coupon's slot.
 */
export async function releaseCouponSlot(
  tx: Pick<typeof prisma, 'order' | 'coupon'>,
  orderId: string
): Promise<void> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { couponCode: true },
  });
  if (!order?.couponCode) return;
  await tx.coupon.updateMany({
    where: { code: order.couponCode, usedCount: { gt: 0 } },
    data: { usedCount: { decrement: 1 } },
  });
}
