import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import { initiateSTKPush, verifyTransaction } from '../services/mpesa';
import { generateIdempotencyKey, isRequestProcessed, markRequestProcessed } from '../utils/idempotency';
import { logger, dbLog } from '../utils/logger';
import { authenticate, requirePermission } from '../middleware/auth';
import { sendPaymentConfirmation } from '../services/notifications';
import { transitionOrderToPaid } from '../services/orderLifecycle';

const router = Router();

const initiateSchema = z.object({
  orderId: z.string(),
  phoneNumber: z.string().min(9),
});

router.post('/initiate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orderId, phoneNumber } = initiateSchema.parse(req.body);
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payment: true } });
    if (!order) {
      res.status(404).json({ success: false, message: 'Order not found' });
      return;
    }
    if (!['pending', 'awaiting_payment'].includes(order.status)) {
      res.status(400).json({ success: false, message: 'Order cannot accept payment in current status' });
      return;
    }

    // Check order expiry
    if (order.expiresAt && order.expiresAt < new Date()) {
      res.status(400).json({ success: false, message: 'Order has expired' });
      return;
    }

    // Duplicate STK push prevention: pending payment in last 2 minutes
    const twoMinsAgo = new Date(Date.now() - 2 * 60 * 1000);
    const recentPending = await prisma.payment.findFirst({
      where: { orderId, status: 'pending', createdAt: { gte: twoMinsAgo } },
    });
    if (recentPending) {
      res.json({ success: true, payment: recentPending, message: 'Payment already in progress, check your phone' });
      return;
    }

    const idempotencyKey = generateIdempotencyKey({ orderId, phoneNumber, amount: order.total });
    if (isRequestProcessed(idempotencyKey)) {
      res.json({ success: true, message: 'Payment already initiated', cached: true });
      return;
    }

    // Check if payment already exists with this key
    const existingPayment = await prisma.payment.findUnique({ where: { idempotencyKey } });
    if (existingPayment && existingPayment.status !== 'failed') {
      res.json({ success: true, payment: existingPayment, message: 'Payment already initiated' });
      return;
    }

    const stkResult = await initiateSTKPush(phoneNumber, order.total, order.orderNumber);

    // Key the upsert on orderId (Payment.orderId is unique — one payment row
    // per order). Keying on idempotencyKey instead meant a retry with a
    // different phone produced a new key, so the create path collided with
    // the existing row's unique orderId and 500'd. Updating by orderId lets
    // a customer retry with a corrected phone number.
    const payment = await prisma.payment.upsert({
      where: { orderId },
      update: {
        merchantRequestId: stkResult.merchantRequestId,
        checkoutRequestId: stkResult.checkoutRequestId,
        phoneNumber,
        amount: order.total,
        status: 'pending',
        idempotencyKey,
      },
      create: {
        orderId,
        merchantRequestId: stkResult.merchantRequestId,
        checkoutRequestId: stkResult.checkoutRequestId,
        phoneNumber,
        amount: order.total,
        status: 'pending',
        idempotencyKey,
      },
    });

    await prisma.order.update({ where: { id: orderId }, data: { status: 'awaiting_payment' } });

    await prisma.activityLog.create({
      data: {
        orderId,
        action: 'PAYMENT_INITIATED',
        details: JSON.stringify({ checkoutRequestId: stkResult.checkoutRequestId }),
      },
    });

    markRequestProcessed(idempotencyKey, payment);
    res.json({ success: true, payment, message: stkResult.customerMessage });
  } catch (err) {
    next(err);
  }
});

router.post('/callback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    logger.info('M-Pesa callback received', req.body);
    const { Body } = req.body;
    if (!Body?.stkCallback) {
      res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
      return;
    }

    const { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = Body.stkCallback;

    const payment = await prisma.payment.findUnique({ where: { checkoutRequestId: CheckoutRequestID } });
    if (!payment) {
      logger.warn('Payment not found for callback', { CheckoutRequestID });
      res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
      return;
    }

    // Safaricom retries callbacks; a payment that already reached a final
    // state must not be reprocessed (duplicate confirmations/logs).
    if (payment.status === 'completed') {
      res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
      return;
    }

    let mpesaReceiptNumber: string | undefined;
    let paidAmount: number | undefined;
    if (ResultCode === 0 && CallbackMetadata?.Item) {
      const items = CallbackMetadata.Item as Array<{ Name: string; Value: unknown }>;
      mpesaReceiptNumber = items.find((i) => i.Name === 'MpesaReceiptNumber')?.Value as string;
      const amt = items.find((i) => i.Name === 'Amount')?.Value;
      if (typeof amt === 'number') paidAmount = amt;
    }

    // Flag if the customer paid a different amount than we recorded — the
    // funds are captured either way, but a mismatch needs manual review.
    if (paidAmount !== undefined && Math.round(paidAmount) !== Math.round(payment.amount)) {
      await dbLog('warn', 'PAYMENT', 'M-Pesa paid amount does not match recorded amount', {
        orderId: payment.orderId,
        recordedAmount: payment.amount,
        paidAmount,
        mpesaReceiptNumber,
      });
    }

    const status = ResultCode === 0 ? 'completed' : 'failed';

    await prisma.payment.update({
      where: { checkoutRequestId: CheckoutRequestID },
      data: {
        status,
        resultCode: String(ResultCode),
        resultDesc: ResultDesc,
        merchantRequestId: MerchantRequestID,
        mpesaReceiptNumber,
      },
    });

    if (status === 'completed') {
      // Guarded: never resurrect an order the expiry job (or an admin)
      // already cancelled — its stock is gone. Flag for manual refund.
      const result = await transitionOrderToPaid(payment.orderId);
      if (!result.ok) {
        await prisma.activityLog.create({
          data: {
            orderId: payment.orderId,
            action: 'PAYMENT_AFTER_CANCEL',
            details: JSON.stringify({ mpesaReceiptNumber, amount: payment.amount, orderStatus: result.currentStatus }),
          },
        });
        await dbLog('warn', 'PAYMENT', 'Payment completed for a non-payable order (manual refund needed)', {
          orderId: payment.orderId,
          orderStatus: result.currentStatus,
          mpesaReceiptNumber,
        });
        res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
        return;
      }

      await prisma.activityLog.create({
        data: {
          orderId: payment.orderId,
          action: 'PAYMENT_CONFIRMED',
          details: JSON.stringify({ mpesaReceiptNumber, amount: payment.amount }),
        },
      });

      // Fire payment-confirmation notification (non-blocking)
      sendPaymentConfirmation({
        orderId: result.order.id,
        orderNumber: result.order.orderNumber,
        customerPhone: result.order.customerPhone,
        customerName: result.order.customerName,
        total: result.order.total,
        mpesaReceiptNumber,
      });
    } else {
      await prisma.activityLog.create({
        data: {
          orderId: payment.orderId,
          action: 'PAYMENT_FAILED',
          details: JSON.stringify({ resultCode: ResultCode, resultDesc: ResultDesc }),
        },
      });
      await dbLog('warn', 'PAYMENT', 'M-Pesa payment failed via callback', {
        orderId: payment.orderId,
        resultCode: ResultCode,
        resultDesc: ResultDesc,
      });
    }

    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (err) {
    logger.error('Error processing M-Pesa callback', err);
    // Always return ResultCode 0 (success) to Safaricom even on internal errors.
    // If we return a non-zero code, Safaricom will retry the callback repeatedly,
    // which can cause duplicate processing. Instead we log the error and rely on
    // the /payments/:orderId/status query endpoint (via verifyTransaction) for
    // recovery when the customer polls for their payment result.
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }
});

router.get('/:orderId/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payment = await prisma.payment.findUnique({ where: { orderId: String(req.params.orderId) } });
    if (!payment) {
      res.status(404).json({ success: false, message: 'Payment not found' });
      return;
    }
    if (payment.status === 'pending' && payment.checkoutRequestId) {
      try {
        const queryResult = await verifyTransaction(payment.checkoutRequestId);
        res.json({ success: true, payment, mpesaStatus: queryResult });
        return;
      } catch {
        // fallthrough
      }
    }
    res.json({ success: true, payment });
  } catch (err) {
    next(err);
  }
});

const reconcileSchema = z.object({
  orderIds: z.array(z.string()).optional(),
});

router.post('/reconcile', authenticate, requirePermission('orders.manage'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orderIds } = reconcileSchema.parse(req.body);

    const where: Record<string, unknown> = { status: 'pending' };
    if (orderIds && orderIds.length > 0) {
      where.orderId = { in: orderIds };
    }

    const pendingPayments = await prisma.payment.findMany({
      where: { ...where, checkoutRequestId: { not: null } },
    });

    const results: { paymentId: string; orderId: string; status: string; action: string }[] = [];

    for (const payment of pendingPayments) {
      try {
        const mpesaResult = await verifyTransaction(payment.checkoutRequestId!);
        const result = mpesaResult as Record<string, unknown>;
        const resultCode = result.ResultCode ?? result.ResponseCode;
        const newStatus = resultCode === '0' || resultCode === 0 ? 'completed' : 'failed';

        if (newStatus !== payment.status) {
          await prisma.payment.update({
            where: { id: payment.id },
            data: { status: newStatus, resultCode: String(resultCode) },
          });
          if (newStatus === 'completed') {
            const transition = await transitionOrderToPaid(payment.orderId);
            if (!transition.ok) {
              await dbLog('warn', 'PAYMENT', 'Payment completed for a non-payable order (manual refund needed)', {
                paymentId: payment.id,
                orderId: payment.orderId,
                orderStatus: transition.currentStatus,
              });
              results.push({ paymentId: payment.id, orderId: payment.orderId, status: newStatus, action: 'payment_after_cancel' });
              continue;
            }
            // Notify customer (non-blocking) — parity with the callback path
            sendPaymentConfirmation({
              orderId: transition.order.id,
              orderNumber: transition.order.orderNumber,
              customerPhone: transition.order.customerPhone,
              customerName: transition.order.customerName,
              total: transition.order.total,
            });
          }
          results.push({ paymentId: payment.id, orderId: payment.orderId, status: newStatus, action: 'updated' });
        } else {
          results.push({ paymentId: payment.id, orderId: payment.orderId, status: payment.status, action: 'unchanged' });
        }
      } catch (err) {
        logger.error(`Reconciliation failed for payment ${payment.id}`, err);
        results.push({ paymentId: payment.id, orderId: payment.orderId, status: payment.status, action: 'error' });
      }
    }

    res.json({ success: true, reconciled: results.length, results });
  } catch (err) {
    next(err);
  }
});

export default router;
