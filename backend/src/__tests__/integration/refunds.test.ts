/**
 * Integration tests for refund transitions.
 *
 * Policy: refunds are ADMIN-only (admin verifies the M-Pesa reversal).
 * Refunding an unshipped (paid) order returns stock and the coupon slot;
 * refunding a shipped/delivered order leaves stock untouched.
 */

import jwt from 'jsonwebtoken';
import { seedIntegrationData, cleanIntegrationData, IntegrationFixtures } from '../helpers/setup';
import { startTestServer, TestServer } from '../helpers/testServer';
import { prisma } from '../../lib/prisma';

const PREFIX = 'INT_RFD_';
// Distinct phone per order so the 5-orders/phone/hour checkout limiter
// never trips across the suite; all share the 2547999070 prefix for cleanup.
const PHONE_PREFIX = '2547999070';
let phoneCounter = 0;
function nextPhone(): string {
  phoneCounter += 1;
  return `${PHONE_PREFIX}${String(phoneCounter).padStart(2, '0')}`;
}

let server: TestServer;
let BASE: string;
let fixtures: IntegrationFixtures;
let staffToken: string;

beforeAll(async () => {
  server = await startTestServer();
  BASE = server.baseUrl;
  fixtures = await seedIntegrationData(PREFIX);
  const secret = process.env.JWT_SECRET ?? 'test-secret-change-me';
  staffToken = jwt.sign({ id: 'staff-test-id', role: 'STAFF' }, secret, { expiresIn: '1h' });
}, 20000);

afterAll(async () => {
  const orders = await prisma.order.findMany({
    where: { customerPhone: { startsWith: PHONE_PREFIX } },
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

async function createOrderWithStatus(status: string): Promise<string> {
  const res = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerPhone: nextPhone(),
      items: [{ productId: fixtures.productId, quantity: 1 }],
    }),
  });
  expect(res.status).toBe(201);
  const body = await res.json() as { order: { id: string } };
  await prisma.order.update({ where: { id: body.order.id }, data: { status } });
  return body.order.id;
}

async function setStatus(orderId: string, status: string, token: string) {
  return fetch(`${BASE}/api/orders/${orderId}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status }),
  });
}

async function productStock(): Promise<number> {
  const p = await prisma.product.findUnique({ where: { id: fixtures.productId }, select: { stock: true } });
  return p!.stock;
}

describe('refund permissions', () => {
  it('staff cannot refund', async () => {
    const orderId = await createOrderWithStatus('paid');
    const res = await setStatus(orderId, 'refunded', staffToken);
    expect(res.status).toBe(403);
  });

  it('unauthenticated cannot refund', async () => {
    const orderId = await createOrderWithStatus('paid');
    const res = await fetch(`${BASE}/api/orders/${orderId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'refunded' }),
    });
    expect(res.status).toBe(401);
  });
});

describe('refund reachability and stock handling', () => {
  it('admin refunds a paid (unshipped) order — stock is returned', async () => {
    const orderId = await createOrderWithStatus('paid');
    const stockBefore = await productStock();

    const res = await setStatus(orderId, 'refunded', fixtures.adminToken);
    expect(res.status).toBe(200);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order!.status).toBe('refunded');
    expect(await productStock()).toBe(stockBefore + 1);
  });

  it('admin refunds a delivered order — stock is NOT returned', async () => {
    const orderId = await createOrderWithStatus('delivered');
    const stockBefore = await productStock();

    const res = await setStatus(orderId, 'refunded', fixtures.adminToken);
    expect(res.status).toBe(200);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order!.status).toBe('refunded');
    expect(await productStock()).toBe(stockBefore);
  });

  it('admin refunds a processing order — allowed, stock NOT returned', async () => {
    const orderId = await createOrderWithStatus('processing');
    const stockBefore = await productStock();

    const res = await setStatus(orderId, 'refunded', fixtures.adminToken);
    expect(res.status).toBe(200);
    expect(await productStock()).toBe(stockBefore);
  });

  it('pending order cannot be refunded (cancel instead)', async () => {
    const orderId = await createOrderWithStatus('pending');
    const res = await setStatus(orderId, 'refunded', fixtures.adminToken);
    expect(res.status).toBe(400);
  });
});
