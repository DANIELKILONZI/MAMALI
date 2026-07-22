import { prisma } from '../lib/prisma';
import { logger, dbLog } from '../utils/logger';
import { verifyTransaction } from './mpesa';
import { transitionOrderToPaid, expireOrder } from './orderLifecycle';
import { retryFailedNotifications, sendOrderExpired, sendPaymentConfirmation } from './notifications';

export async function expireUnpaidOrders(): Promise<void> {
  try {
    const now = new Date();
    const expiredOrders = await prisma.order.findMany({
      where: {
        status: { in: ['pending', 'awaiting_payment'] },
        expiresAt: { lt: now },
      },
      select: { id: true, orderNumber: true, customerPhone: true, customerName: true, total: true, status: true },
    });

    for (const order of expiredOrders) {
      try {
        // Guarded: a payment callback may have flipped this order to paid
        // (or an admin cancelled it) after the snapshot above. expireOrder
        // only cancels + releases stock if the order is still unpaid.
        const expired = await expireOrder(order.id);
        if (!expired) continue;

        await prisma.activityLog.create({
          data: {
            orderId: order.id,
            action: 'ORDER_EXPIRED',
            details: JSON.stringify({ previousStatus: order.status }),
          },
        });

        await dbLog('info', 'ORDER', `Order ${order.orderNumber} expired and cancelled`, {
          orderId: order.id,
        });

        // Notify customer that their order expired (non-blocking)
        sendOrderExpired({
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerPhone: order.customerPhone,
          customerName: order.customerName,
          total: order.total,
        });
      } catch (err) {
        logger.error(`Failed to expire order ${order.id}`, err);
      }
    }

    if (expiredOrders.length > 0) {
      logger.info(`Expired ${expiredOrders.length} unpaid orders`);
    }
  } catch (err) {
    logger.error('Error in expireUnpaidOrders job', err);
  }
}

/** Guarded paid-transition for a payment confirmed out-of-band (recheck job). */
async function confirmOrderPaidFromJob(payment: { id: string; orderId: string }): Promise<void> {
  const result = await transitionOrderToPaid(payment.orderId);
  if (!result.ok) {
    // Payment completed but the order was already cancelled (e.g. expired).
    // Never resurrect — flag for manual refund.
    await dbLog('warn', 'PAYMENT', 'Payment completed for a non-payable order (manual refund needed)', {
      paymentId: payment.id,
      orderId: payment.orderId,
      orderStatus: result.currentStatus,
    });
    return;
  }
  logger.info(`Payment ${payment.id} confirmed via background job`);

  // Notify customer (non-blocking) — reconciliation path
  sendPaymentConfirmation({
    orderId: result.order.id,
    orderNumber: result.order.orderNumber,
    customerPhone: result.order.customerPhone,
    customerName: result.order.customerName,
    total: result.order.total,
  });
}

export async function recheckPendingPayments(): Promise<void> {
  try {
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
    const pendingPayments = await prisma.payment.findMany({
      where: {
        status: 'pending',
        createdAt: { gt: thirtyMinsAgo },
        checkoutRequestId: { not: null },
      },
    });

    for (const payment of pendingPayments) {
      try {
        const result = await verifyTransaction(payment.checkoutRequestId!);
        const r = result as Record<string, unknown>;
        const resultCode = r.ResultCode ?? r.ResponseCode;
        const newStatus = resultCode === '0' || resultCode === 0 ? 'completed' : 'failed';

        if (newStatus !== payment.status) {
          await prisma.payment.update({ where: { id: payment.id }, data: { status: newStatus } });
          if (newStatus === 'completed') {
            await confirmOrderPaidFromJob(payment);
          } else {
            await dbLog('warn', 'PAYMENT', 'Pending payment resolved as failed via background job', {
              paymentId: payment.id,
              orderId: payment.orderId,
            });
          }
        }
      } catch {
        // Silently skip individual payment verification errors
      }
    }
  } catch (err) {
    logger.error('Error in recheckPendingPayments job', err);
  }
}

async function retryNotifications(): Promise<void> {
  try {
    await retryFailedNotifications();
  } catch (err) {
    logger.error('Error in retryNotifications job', err);
  }
}

export function startBackgroundJobs(): void {
  // Expire unpaid orders every 5 minutes
  setInterval(expireUnpaidOrders, 5 * 60 * 1000);

  // Re-check pending payments every 10 minutes
  setInterval(recheckPendingPayments, 10 * 60 * 1000);

  // Retry failed WhatsApp / SMS notifications every 5 minutes
  setInterval(retryNotifications, 5 * 60 * 1000);

  logger.info('Background jobs started');
}

