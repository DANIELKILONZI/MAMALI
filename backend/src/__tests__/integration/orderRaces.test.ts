/**
 * Regression tests for the async state-transition races between the
 * expiry job, the M-Pesa callback, and manual cancellation.
 *
 * The invariants under test:
 *  1. The expiry job never cancels (or releases stock for) a paid order.
 *  2. A payment callback never resurrects a cancelled order.
 *  3. Duplicate success callbacks are processed exactly once.
 *  4. Expiry cancels an unpaid order exactly once (no double stock release).
 */

import { seedIntegrationData, cleanIntegrationData, IntegrationFixtures } from '../helpers/setup';
import { startTestServer, TestServer } from '../helpers/testServer';
import { prisma } from '../../lib/prisma';
import { expireUnpaidOrders } from '../../services/jobs';
import { expireOrder } from '../../services/orderLifecycle';

const PREFIX = 'INT_RACE_';
const PHONE = '254799905001';

let server: TestServer;
let BASE: string;
let fixtures: IntegrationFixtures;

beforeAll(async () => {
  server = await startTestServer();
  BASE = server.baseUrl;
  fixtures = await seedIntegrationData(PREFIX);
}, 20000);

afterAll(async () => {
  const orders = await prisma.order.findMany({
    where: { customerPhone: PHONE },
    select: { id: true },
  });
  const ids = orders.map((o) => o.id);
  if (ids.length) {
    await prisma.activityLog.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.notificationLog.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
  }
  await cleanIntegrationData(PREFIX);
  await server.close();
  await prisma.$disconnect();
}, 20000);

async function createOrder(): Promise<{ id: string; orderNumber: string }> {
  const res = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerPhone: PHONE,
      items: [{ productId: fixtures.productId, quantity: 1 }],
    }),
  });
  expect(res.status).toBe(201);
  const body = await res.json() as { order: { id: string; orderNumber: string } };
  return body.order;
}

async function productStock(): Promise<number> {
  const p = await prisma.product.findUnique({ where: { id: fixtures.productId }, select: { stock: true } });
  return p!.stock;
}

async function postCallback(checkoutRequestId: string, resultCode = 0) {
  return fetch(`${BASE}/api/payments/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Body: {
        stkCallback: {
          MerchantRequestID: `MR-${checkoutRequestId}`,
          CheckoutRequestID: checkoutRequestId,
          ResultCode: resultCode,
          ResultDesc: resultCode === 0 ? 'Success' : 'Failed',
          CallbackMetadata: resultCode === 0
            ? { Item: [{ Name: 'MpesaReceiptNumber', Value: `RCPT-${checkoutRequestId}` }] }
            : undefined,
        },
      },
    }),
  });
}

async function createPaymentRow(orderId: string, checkoutRequestId: string) {
  return prisma.payment.create({
    data: {
      orderId,
      checkoutRequestId,
      phoneNumber: PHONE,
      amount: 1000,
      status: 'pending',
      idempotencyKey: `${PREFIX}${checkoutRequestId}`,
    },
  });
}

describe('expiry vs payment race', () => {
  it('expiry job does not cancel a paid order or release its stock', async () => {
    const order = await createOrder();
    const stockAfterOrder = await productStock();

    // Simulate: order expired on paper, but the customer paid
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'paid', expiresAt: new Date(Date.now() - 60_000) },
    });

    await expireUnpaidOrders();

    const after = await prisma.order.findUnique({ where: { id: order.id } });
    expect(after!.status).toBe('paid');
    expect(await productStock()).toBe(stockAfterOrder); // stock NOT released
  });

  it('expireOrder is a guarded no-op on a paid order', async () => {
    const order = await createOrder();
    const stockAfterOrder = await productStock();
    await prisma.order.update({ where: { id: order.id }, data: { status: 'paid' } });

    const expired = await expireOrder(order.id);

    expect(expired).toBe(false);
    expect((await prisma.order.findUnique({ where: { id: order.id } }))!.status).toBe('paid');
    expect(await productStock()).toBe(stockAfterOrder);
  });

  it('expiry cancels an unpaid order exactly once (no double release)', async () => {
    const order = await createOrder();
    const stockAfterOrder = await productStock();
    await prisma.order.update({
      where: { id: order.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    await expireUnpaidOrders();
    await expireUnpaidOrders(); // second run must be a no-op

    const after = await prisma.order.findUnique({ where: { id: order.id } });
    expect(after!.status).toBe('cancelled');
    expect(await productStock()).toBe(stockAfterOrder + 1); // released exactly once
  });
});

describe('callback vs cancelled order', () => {
  it('a success callback does not resurrect a cancelled order', async () => {
    const order = await createOrder();
    const crq = `${PREFIX}CRQ_CANCELLED`;
    await createPaymentRow(order.id, crq);

    // Order gets cancelled (e.g. by expiry) before the callback lands
    await expireOrder(order.id);
    const stockAfterCancel = await productStock();

    const res = await postCallback(crq);
    expect(res.status).toBe(200);

    const after = await prisma.order.findUnique({ where: { id: order.id } });
    expect(after!.status).toBe('cancelled'); // NOT resurrected to paid

    // Payment itself is recorded as completed, and flagged for follow-up
    const payment = await prisma.payment.findUnique({ where: { checkoutRequestId: crq } });
    expect(payment!.status).toBe('completed');
    const flag = await prisma.activityLog.findFirst({
      where: { orderId: order.id, action: 'PAYMENT_AFTER_CANCEL' },
    });
    expect(flag).not.toBeNull();
    expect(await productStock()).toBe(stockAfterCancel); // stock untouched
  });

  it('duplicate success callbacks are processed exactly once', async () => {
    const order = await createOrder();
    const crq = `${PREFIX}CRQ_DUP`;
    await createPaymentRow(order.id, crq);

    expect((await postCallback(crq)).status).toBe(200);
    expect((await postCallback(crq)).status).toBe(200); // retry from Safaricom

    const after = await prisma.order.findUnique({ where: { id: order.id } });
    expect(after!.status).toBe('paid');

    const confirmations = await prisma.activityLog.count({
      where: { orderId: order.id, action: 'PAYMENT_CONFIRMED' },
    });
    expect(confirmations).toBe(1);
  });
});
