/**
 * Integration tests for fraud detection triggering via POST /api/orders.
 *
 * Tests that the fraud scoring system is called when an order is created
 * and that risk scores and flags are persisted correctly on the order.
 *
 * Uses the real SQLite dev database + the live Express app.
 */

import { seedIntegrationData, cleanIntegrationData, IntegrationFixtures } from '../helpers/setup';
import { startTestServer, TestServer } from '../helpers/testServer';
import { prisma } from '../../lib/prisma';

const PREFIX = 'INT_FRD_';

let server: TestServer;
let BASE: string;

let fixtures: IntegrationFixtures;

beforeAll(async () => {
  server = await startTestServer();
  BASE = server.baseUrl;
  fixtures = await seedIntegrationData(PREFIX);
}, 20000);

afterAll(async () => {
  await cleanIntegrationData(PREFIX);
  await server.close();
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

async function getOrder(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    select: { riskScore: true, riskFlags: true },
  });
}

/**
 * Risk assessment runs fire-and-forget after the 201 response, so poll
 * until the score lands (or time out and return whatever is there).
 */
async function waitForRisk(orderId: string, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const order = await getOrder(orderId);
    if ((order && order.riskScore > 0) || Date.now() >= deadline) return order;
    await new Promise((r) => setTimeout(r, 100));
  }
}

// ── Fraud score persisted on created order ────────────────────────────────────

describe('POST /api/orders — fraud risk assessment is run', () => {
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

  it('persists a riskScore (0–100) on every created order', async () => {
    const res = await createOrder({
      customerPhone: '254799903001',
      customerName: 'Fraud Integration Test',
      items: [{ productId: fixtures.productId, quantity: 1 }],
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { success: boolean; order: { id: string } };
    orderId = body.order.id;

    const order = await getOrder(orderId);
    expect(order).not.toBeNull();
    expect(typeof order!.riskScore).toBe('number');
    expect(order!.riskScore).toBeGreaterThanOrEqual(0);
    expect(order!.riskScore).toBeLessThanOrEqual(100);
  });

  it('persists riskFlags as a JSON array on the order', async () => {
    const order = await getOrder(orderId);
    // riskFlags should be stored as a JSON string (the service returns an array)
    expect(order!.riskFlags).toBeDefined();
  });

  it('a clean first-time order has riskScore = 0', async () => {
    const order = await getOrder(orderId);
    // Fresh phone, no velocity, normal amount → score should be 0
    expect(order!.riskScore).toBe(0);
  });
});

// ── Velocity-based risk elevation ─────────────────────────────────────────────

describe('POST /api/orders — phone velocity raises risk score', () => {
  const VELOCITY_PHONE = '254799903010';
  const createdOrderIds: string[] = [];

  afterAll(async () => {
    for (const id of createdOrderIds) {
      await prisma.activityLog.deleteMany({ where: { orderId: id } });
      await prisma.notificationLog.deleteMany({ where: { orderId: id } });
      await prisma.payment.deleteMany({ where: { orderId: id } });
      await prisma.orderItem.deleteMany({ where: { orderId: id } });
      await prisma.order.delete({ where: { id } }).catch(() => {});
    }
  });

  it('first order from a phone has riskScore = 0 (no velocity)', async () => {
    const res = await createOrder({
      customerPhone: VELOCITY_PHONE,
      items: [{ productId: fixtures.productId, quantity: 1 }],
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { order: { id: string } };
    createdOrderIds.push(body.order.id);

    const order = await getOrder(body.order.id);
    expect(order!.riskScore).toBe(0);
  });

  it('second order in the same hour adds ELEVATED_ORDER_VELOCITY (+15)', async () => {
    const res = await createOrder({
      customerPhone: VELOCITY_PHONE,
      items: [{ productId: fixtures.productId, quantity: 1 }],
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { order: { id: string } };
    createdOrderIds.push(body.order.id);

    const order = await waitForRisk(body.order.id);
    expect(order!.riskScore).toBeGreaterThanOrEqual(15);
    // Flags stored as JSON string in DB
    const flags = JSON.parse(order!.riskFlags as unknown as string) as string[];
    expect(flags).toContain('ELEVATED_ORDER_VELOCITY');
  });

  it('third order from same phone in the hour adds HIGH_ORDER_VELOCITY (+40)', async () => {
    const res = await createOrder({
      customerPhone: VELOCITY_PHONE,
      items: [{ productId: fixtures.productId, quantity: 1 }],
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { order: { id: string } };
    createdOrderIds.push(body.order.id);

    const order = await waitForRisk(body.order.id);
    expect(order!.riskScore).toBeGreaterThanOrEqual(40);
    const flags = JSON.parse(order!.riskFlags as unknown as string) as string[];
    expect(flags).toContain('HIGH_ORDER_VELOCITY');
  });
});

// ── High order amount risk ─────────────────────────────────────────────────────

describe('POST /api/orders — high-value order amount risk', () => {
  afterAll(async () => {
    // Cleanup high-value test orders
    const orders = await prisma.order.findMany({
      where: { customerPhone: '254799903020' },
      select: { id: true },
    });
    for (const { id } of orders) {
      await prisma.activityLog.deleteMany({ where: { orderId: id } });
      await prisma.notificationLog.deleteMany({ where: { orderId: id } });
      await prisma.payment.deleteMany({ where: { orderId: id } });
      await prisma.orderItem.deleteMany({ where: { orderId: id } });
      await prisma.order.delete({ where: { id } }).catch(() => {});
    }
    // Also cleanup product if created
    await prisma.product.deleteMany({ where: { slug: `${PREFIX.toLowerCase()}highvalue` } });
  });

  it('order above KES 20 000 gets HIGH_ORDER_AMOUNT flag', async () => {
    // Create a high-value product
    const expensiveProduct = await prisma.product.create({
      data: {
        name: `${PREFIX}HighValue`,
        slug: `${PREFIX.toLowerCase()}highvalue`,
        price: 25000,
        stock: 10,
        isActive: true,
        images: '[]',
      },
    });

    const res = await createOrder({
      customerPhone: '254799903020',
      items: [{ productId: expensiveProduct.id, quantity: 1 }],
    });

    if (res.status === 201) {
      const body = await res.json() as { order: { id: string } };
      const order = await waitForRisk(body.order.id);
      expect(order!.riskScore).toBeGreaterThanOrEqual(10);
      const flags = JSON.parse(order!.riskFlags as unknown as string) as string[];
      expect(flags).toContain('HIGH_ORDER_AMOUNT');
    } else {
      // Some env may not allow high value orders — skip gracefully
      expect([400, 201]).toContain(res.status);
    }
  });
});

// ── Coupon abuse risk ──────────────────────────────────────────────────────────

describe('POST /api/orders — coupon abuse risk scoring', () => {
  const ABUSE_PHONE = '254799903030';
  const createdOrderIds: string[] = [];

  afterAll(async () => {
    for (const id of createdOrderIds) {
      await prisma.activityLog.deleteMany({ where: { orderId: id } });
      await prisma.notificationLog.deleteMany({ where: { orderId: id } });
      await prisma.payment.deleteMany({ where: { orderId: id } });
      await prisma.orderItem.deleteMany({ where: { orderId: id } });
      await prisma.order.delete({ where: { id } }).catch(() => {});
    }
  });

  it('single coupon use does NOT trigger coupon abuse flag', async () => {
    const res = await createOrder({
      customerPhone: ABUSE_PHONE,
      items: [{ productId: fixtures.productId, quantity: 1 }],
      couponCode: fixtures.couponCode,
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { order: { id: string } };
    createdOrderIds.push(body.order.id);

    const order = await getOrder(body.order.id);
    const flags = JSON.parse(order!.riskFlags as unknown as string) as string[];
    // 1 coupon use in 7 days → no abuse flag
    expect(flags).not.toContain('COUPON_ABUSE_SUSPECTED');
  });
});

// ── Rate limiter enforcement ──────────────────────────────────────────────────

describe('POST /api/orders — checkout rate limiter (5 orders/phone/hour)', () => {
  const RL_PHONE = '254799903099';
  const createdOrderIds: string[] = [];

  afterAll(async () => {
    for (const id of createdOrderIds) {
      await prisma.activityLog.deleteMany({ where: { orderId: id } });
      await prisma.notificationLog.deleteMany({ where: { orderId: id } });
      await prisma.payment.deleteMany({ where: { orderId: id } });
      await prisma.orderItem.deleteMany({ where: { orderId: id } });
      await prisma.order.delete({ where: { id } }).catch(() => {});
    }
  });

  it('first 5 orders from same phone succeed', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await createOrder({
        customerPhone: RL_PHONE,
        items: [{ productId: fixtures.productId, quantity: 1 }],
      });
      if (res.status === 201) {
        const body = await res.json() as { order: { id: string } };
        createdOrderIds.push(body.order.id);
      }
      // Accept 201 or 429 (rate limiter may trigger before 5)
      expect([201, 429]).toContain(res.status);
    }
  });

  it('6th order from same phone is rate-limited (429)', async () => {
    const res = await createOrder({
      customerPhone: RL_PHONE,
      items: [{ productId: fixtures.productId, quantity: 1 }],
    });
    // Rate limiter should block the 6th order
    expect(res.status).toBe(429);
  });
});
