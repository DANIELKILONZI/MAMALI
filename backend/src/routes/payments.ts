import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { initiateSTKPush, verifyTransaction } from '../services/mpesa';
import { generateIdempotencyKey, isRequestProcessed, markRequestProcessed } from '../utils/idempotency';
import { logger } from '../utils/logger';

const router = Router();
const prisma = new PrismaClient();

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

    const payment = await prisma.payment.upsert({
      where: { idempotencyKey },
      update: {
        merchantRequestId: stkResult.merchantRequestId,
        checkoutRequestId: stkResult.checkoutRequestId,
        status: 'pending',
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

    let mpesaReceiptNumber: string | undefined;
    if (ResultCode === 0 && CallbackMetadata?.Item) {
      const items = CallbackMetadata.Item as Array<{ Name: string; Value: unknown }>;
      mpesaReceiptNumber = items.find((i) => i.Name === 'MpesaReceiptNumber')?.Value as string;
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
      await prisma.order.update({ where: { id: payment.orderId }, data: { status: 'paid' } });
      await prisma.activityLog.create({
        data: {
          orderId: payment.orderId,
          action: 'PAYMENT_CONFIRMED',
          details: JSON.stringify({ mpesaReceiptNumber, amount: payment.amount }),
        },
      });
    } else {
      await prisma.activityLog.create({
        data: {
          orderId: payment.orderId,
          action: 'PAYMENT_FAILED',
          details: JSON.stringify({ resultCode: ResultCode, resultDesc: ResultDesc }),
        },
      });
    }

    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (err) {
    logger.error('Error processing M-Pesa callback', err);
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' }); // Always return success to M-Pesa
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

export default router;
