import { prisma } from '../lib/prisma';
import { logger, dbLog } from '../utils/logger';
import { verifyTransaction } from './mpesa';
import { releaseStock } from './inventory';

async function expireUnpaidOrders(): Promise<void> {
  try {
    const now = new Date();
    const expiredOrders = await prisma.order.findMany({
      where: {
        status: { in: ['pending', 'awaiting_payment'] },
        expiresAt: { lt: now },
      },
      include: { items: true },
    });

    for (const order of expiredOrders) {
      try {
        await prisma.order.update({ where: { id: order.id }, data: { status: 'cancelled' } });

        await releaseStock(order.items.map((i) => ({ productId: i.productId, quantity: i.quantity })));

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

async function recheckPendingPayments(): Promise<void> {
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
            await prisma.order.update({ where: { id: payment.orderId }, data: { status: 'paid' } });
            logger.info(`Payment ${payment.id} confirmed via background job`);
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

export function startBackgroundJobs(): void {
  // Expire unpaid orders every 5 minutes
  setInterval(expireUnpaidOrders, 5 * 60 * 1000);

  // Re-check pending payments every 10 minutes
  setInterval(recheckPendingPayments, 10 * 60 * 1000);

  logger.info('Background jobs started');
}
