/**
 * Integration tests for POST /api/orders.
 *
 * Uses the real SQLite database + the real Express app.
 * Seeds test data before all tests and cleans up after all tests.
 */

import app from '../../index';
import { prisma } from '../../lib/prisma';
import { seedIntegrationData, cleanIntegrationData, IntegrationFixtures } from '../helpers/setup';

// All tests call the running server via fetch (localhost:5000).
// The app import keeps the module graph intact for Jest environment setup.
void app;

const PREFIX = 'INT_ORD_';
const TEST_PHONE = '254999901001';

const BASE = 'http://localhost:5000';

let fixtures: IntegrationFixtures;

beforeAll(async () => {
  fixtures = await seedIntegrationData(PREFIX);
}, 20000);

afterAll(async () => {
  await cleanIntegrationData(PREFIX);
  await prisma.$disconnect();
}, 20000);

// ── Helper ────────────────────────────────────────────────────────────────────

async function createOrder(body: Record<string, unknown>) {
  return fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/orders — validation', () => {
  it('returns 400 when items array is empty', async () => {
    const res = await createOrder({
      customerPhone: TEST_PHONE,
      items: [],
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when customerPhone is missing', async () => {
    const res = await createOrder({ items: [{ productId: fixtures.productId, quantity: 1 }] });
    expect(res.status).toBe(400);
  });

  it('returns 400 when product does not exist', async () => {
    const res = await createOrder({
      customerPhone: TEST_PHONE,
      items: [{ productId: 'nonexistent-id', quantity: 1 }],
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/orders — blocked customer', () => {
  beforeAll(async () => {
    await prisma.blockedCustomer.upsert({
      where: { phone: '254999901099' },
      update: {},
      create: { phone: '254999901099', reason: 'Integration test block' },
    });
  });

  afterAll(async () => {
    await prisma.blockedCustomer.deleteMany({ where: { phone: '254999901099' } });
  });

  it('returns 403 for a blocked customer phone', async () => {
    const res = await createOrder({
      customerPhone: '254999901099',
      items: [{ productId: fixtures.productId, quantity: 1 }],
    });
    expect(res.status).toBe(403);
    const body = await res.json() as { success: boolean; message: string };
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/not allowed/i);
  });
});

describe('POST /api/orders — successful creation', () => {
  let orderId: string;

  afterAll(async () => {
    if (orderId) {
      await prisma.activityLog.deleteMany({ where: { orderId } });
      await prisma.notificationLog.deleteMany({ where: { orderId } });
      await prisma.payment.deleteMany({ where: { orderId } });
      await prisma.orderItem.deleteMany({ where: { orderId } });
      await prisma.order.delete({ where: { id: orderId } }).catch(() => {});
    }
  });

  it('creates an order with status=pending and deducts stock', async () => {
    const stockBefore = await prisma.product.findUnique({
      where: { id: fixtures.productId },
      select: { stock: true },
    });

    const res = await createOrder({
      customerPhone: TEST_PHONE,
      customerName: 'Integration Tester',
      items: [{ productId: fixtures.productId, quantity: 2 }],
    });

    expect(res.status).toBe(201);
    const body = await res.json() as { success: boolean; order: { id: string; status: string; total: number } };
    expect(body.success).toBe(true);
    expect(body.order.status).toBe('pending');
    expect(body.order.total).toBe(3000); // 2 × KES 1500

    orderId = body.order.id;

    const stockAfter = await prisma.product.findUnique({
      where: { id: fixtures.productId },
      select: { stock: true },
    });

    expect(stockAfter!.stock).toBe(stockBefore!.stock - 2);
  });

  it('records riskScore and riskFlags on the created order', async () => {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { riskScore: true, riskFlags: true },
    });
    expect(order).not.toBeNull();
    expect(typeof order!.riskScore).toBe('number');
    expect(order!.riskScore).toBeGreaterThanOrEqual(0);
    expect(order!.riskScore).toBeLessThanOrEqual(100);
  });
});

describe('POST /api/orders — coupon application', () => {
  let orderId: string;

  afterAll(async () => {
    if (orderId) {
      await prisma.activityLog.deleteMany({ where: { orderId } });
      await prisma.notificationLog.deleteMany({ where: { orderId } });
      await prisma.payment.deleteMany({ where: { orderId } });
      await prisma.orderItem.deleteMany({ where: { orderId } });
      await prisma.order.delete({ where: { id: orderId } }).catch(() => {});
      // Reset coupon usedCount
      await prisma.coupon.update({
        where: { id: fixtures.couponId },
        data: { usedCount: 0 },
      });
    }
  });

  it('applies valid 10% coupon and reduces total', async () => {
    const res = await createOrder({
      customerPhone: TEST_PHONE,
      customerName: 'Coupon Tester',
      items: [{ productId: fixtures.productId, quantity: 1 }],
      couponCode: fixtures.couponCode,
    });

    expect(res.status).toBe(201);
    const body = await res.json() as {
      success: boolean;
      order: { id: string; total: number; discountAmount: number; couponCode: string };
    };
    expect(body.success).toBe(true);
    orderId = body.order.id;

    // Product price is 1500, 10% off = 150 discount → total = 1350
    expect(body.order.discountAmount).toBe(150);
    expect(body.order.total).toBe(1350);
    expect(body.order.couponCode).toBe(fixtures.couponCode);
  });
});

describe('POST /api/orders — insufficient stock', () => {
  it('returns 400 when requesting more units than in stock', async () => {
    const res = await createOrder({
      customerPhone: TEST_PHONE,
      items: [{ productId: fixtures.productId, quantity: 9999 }],
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { success: boolean };
    expect(body.success).toBe(false);
  });
});
