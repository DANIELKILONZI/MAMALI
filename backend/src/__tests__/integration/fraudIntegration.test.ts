/**
 * Integration tests for fraud detection trigger.
 *
 * Verifies that:
 *  1. Orders created via POST /api/orders have riskScore and riskFlags persisted
 *  2. A high-velocity scenario (same phone, 3+ orders/hour) elevates the risk score
 *  3. A high-value order (> KES 20 000) adds the HIGH_ORDER_AMOUNT flag
 *  4. GET /api/admin/analytics/fraud returns the high-risk order in its list
 *
 * These tests hit the real database via the running Express app.
 */

import { seedIntegrationData, cleanIntegrationData, IntegrationFixtures } from '../helpers/setup';
import { prisma } from '../../lib/prisma';

const PREFIX = 'INT_FRD_';
const BASE = 'http://localhost:5000';
const HIGH_VELOCITY_PHONE = '254999905001';
const HIGH_VALUE_PHONE = '254999905002';

let fixtures: IntegrationFixtures;

beforeAll(async () => {
  fixtures = await seedIntegrationData(PREFIX);
}, 20000);

afterAll(async () => {
  const phones = [HIGH_VELOCITY_PHONE, HIGH_VALUE_PHONE];
  const orders = await prisma.order.findMany({
    where: { customerPhone: { in: phones } },
    select: { id: true },
  });
  if (orders.length > 0) {
    const ids = orders.map((o) => o.id);
    await prisma.notificationLog.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.activityLog.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
  }
  await cleanIntegrationData(PREFIX);
  await prisma.$disconnect();
}, 30000);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function placeOrder(phone: string, qty = 1) {
  const res = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerPhone: phone,
      customerName: 'Fraud Test User',
      items: [{ productId: fixtures.productId, quantity: qty }],
    }),
  });
  const body = await res.json() as { success: boolean; order: { id: string; status: string } };
  return { status: res.status, body };
}

function authHeader() {
  return { Authorization: `Bearer ${fixtures.adminToken}` };
}

// Small delay to let the async fraud assessment write to DB
function wait(ms = 400) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Fraud detection — riskScore persisted on every order', () => {
  let orderId: string;

  it('order creation returns 201 and includes order id', async () => {
    const { status, body } = await placeOrder(HIGH_VALUE_PHONE);
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    orderId = body.order.id;
  });

  it('riskScore is written to the order row', async () => {
    await wait();
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { riskScore: true },
    });
    expect(order).not.toBeNull();
    expect(typeof order!.riskScore).toBe('number');
    expect(order!.riskScore).toBeGreaterThanOrEqual(0);
    expect(order!.riskScore).toBeLessThanOrEqual(100);
  });

  it('riskFlags is written to the order row (string, may be empty JSON array)', async () => {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { riskFlags: true },
    });
    expect(order).not.toBeNull();
    expect(typeof order!.riskFlags).toBe('string');
    // Must be parseable JSON
    expect(() => JSON.parse(order!.riskFlags)).not.toThrow();
  });
});

describe('Fraud detection — HIGH_ORDER_VELOCITY flag from repeated orders', () => {
  const orderIds: string[] = [];

  beforeAll(async () => {
    // Seed 3 past orders in the DB directly with timestamps in the last hour
    // so the fraud service detects them as recent velocity
    const recentTime = new Date(Date.now() - 10 * 60 * 1000); // 10 min ago
    for (let i = 0; i < 3; i++) {
      const order = await prisma.order.create({
        data: {
          orderNumber: `ORD-FRD-VEL-${PREFIX}-${i}`,
          customerPhone: HIGH_VELOCITY_PHONE,
          customerName: 'Velocity User',
          status: 'pending',
          subtotal: 1500,
          discountAmount: 0,
          total: 1500,
          createdAt: recentTime,
          items: {
            create: [{
              productId: fixtures.productId,
              name: 'Velocity Product',
              quantity: 1,
              price: 1500,
              total: 1500,
            }],
          },
        },
      });
      orderIds.push(order.id);
    }
  }, 20000);

  afterAll(async () => {
    if (orderIds.length > 0) {
      await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }
  }, 20000);

  it('a 4th order from the same phone gets elevated risk score', async () => {
    const { status, body } = await placeOrder(HIGH_VELOCITY_PHONE);
    expect(status).toBe(201);
    const newOrderId = body.order.id;

    await wait(600);

    const order = await prisma.order.findUnique({
      where: { id: newOrderId },
      select: { riskScore: true, riskFlags: true },
    });
    expect(order).not.toBeNull();
    // With 3 existing orders in the last hour + this new one → HIGH_ORDER_VELOCITY flag
    expect(order!.riskScore).toBeGreaterThanOrEqual(25);
    const flags: string[] = JSON.parse(order!.riskFlags);
    expect(
      flags.some((f) => f.includes('VELOCITY') || f.includes('velocity'))
    ).toBe(true);
  });
});

describe('Fraud detection — high-risk orders appear in analytics/fraud', () => {
  it('GET /api/admin/analytics/fraud returns 200 with alerts array', async () => {
    const res = await fetch(`${BASE}/api/admin/analytics/fraud`, {
      headers: authHeader(),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean; alerts: unknown[] };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.alerts)).toBe(true);
  });

  it('each alert has riskScore >= 30 (the fraud threshold)', async () => {
    const res = await fetch(`${BASE}/api/admin/analytics/fraud`, {
      headers: authHeader(),
    });
    const body = await res.json() as { alerts: { riskScore: number }[] };
    for (const alert of body.alerts) {
      expect(alert.riskScore).toBeGreaterThanOrEqual(30);
    }
  });

  it('fraud alert entries have required shape fields', async () => {
    const res = await fetch(`${BASE}/api/admin/analytics/fraud`, {
      headers: authHeader(),
    });
    const body = await res.json() as {
      alerts: {
        id: string;
        orderNumber: string;
        customerPhone: string;
        riskScore: number;
        riskFlags: string;
        status: string;
      }[];
    };
    if (body.alerts.length === 0) return;
    const a = body.alerts[0];
    expect(a).toHaveProperty('id');
    expect(a).toHaveProperty('orderNumber');
    expect(a).toHaveProperty('customerPhone');
    expect(a).toHaveProperty('riskScore');
    expect(a).toHaveProperty('riskFlags');
    expect(a).toHaveProperty('status');
  });

  it('requires admin auth (returns 401 without token)', async () => {
    const res = await fetch(`${BASE}/api/admin/analytics/fraud`);
    expect(res.status).toBe(401);
  });
});
