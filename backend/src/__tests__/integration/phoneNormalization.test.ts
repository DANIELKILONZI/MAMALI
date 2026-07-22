/**
 * Regression tests for canonical phone normalization at checkout.
 *
 * Blocking, rate limiting, and fraud all key on the phone number; before
 * normalization a blocked customer could bypass every protection by
 * resubmitting the same number in a different format.
 */

import { seedIntegrationData, cleanIntegrationData, IntegrationFixtures } from '../helpers/setup';
import { startTestServer, TestServer } from '../helpers/testServer';
import { prisma } from '../../lib/prisma';

const PREFIX = 'INT_PHN_';
const BLOCKED_CANONICAL = '254799906001';

let server: TestServer;
let BASE: string;
let fixtures: IntegrationFixtures;

beforeAll(async () => {
  server = await startTestServer();
  BASE = server.baseUrl;
  fixtures = await seedIntegrationData(PREFIX);
  await prisma.blockedCustomer.create({
    data: { phone: BLOCKED_CANONICAL, reason: 'test block' },
  });
}, 20000);

afterAll(async () => {
  await prisma.blockedCustomer.deleteMany({ where: { phone: BLOCKED_CANONICAL } });
  const orders = await prisma.order.findMany({
    where: { customerPhone: { in: ['254712906003'] } },
    select: { id: true },
  });
  const ids = orders.map((o) => o.id);
  if (ids.length) {
    await prisma.activityLog.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.notificationLog.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
  }
  await cleanIntegrationData(PREFIX);
  await server.close();
  await prisma.$disconnect();
}, 20000);

async function createOrder(customerPhone: string) {
  return fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerPhone,
      items: [{ productId: fixtures.productId, quantity: 1 }],
    }),
  });
}

describe('blocked customer cannot bypass via phone formatting', () => {
  it.each([
    ['canonical', '254799906001'],
    ['local 0-prefix', '0799906001'],
    ['plus-prefixed', '+254799906001'],
    ['with spaces', '254 799 906 001'],
  ])('rejects blocked phone submitted as %s', async (_label, phone) => {
    const res = await createOrder(phone);
    expect(res.status).toBe(403);
  });
});

describe('phone validation and canonical storage', () => {
  it('rejects an unparseable phone with 400', async () => {
    const res = await createOrder('123456789');
    expect(res.status).toBe(400);
  });

  it('stores the canonical 254 form for a local-format order', async () => {
    const res = await createOrder('0712906003');
    expect(res.status).toBe(201);
    const body = await res.json() as { order: { id: string } };
    const order = await prisma.order.findUnique({ where: { id: body.order.id } });
    expect(order!.customerPhone).toBe('254712906003');
  });
});
