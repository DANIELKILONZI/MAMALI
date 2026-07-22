/**
 * Integration tests for customer management API.
 *
 * Tests block/unblock endpoints and verifies that the customer list API
 * correctly derives customer segments from real order data.
 */

import { seedIntegrationData, cleanIntegrationData, IntegrationFixtures } from '../helpers/setup';
import { startTestServer, TestServer } from '../helpers/testServer';
import { prisma } from '../../lib/prisma';

const PREFIX = 'INT_CST_';
const TEST_PHONE_BLOCK = '254999902001';
const TEST_PHONE_VIP = '254999902002';

let server: TestServer;
let BASE: string;

let fixtures: IntegrationFixtures;

beforeAll(async () => {
  server = await startTestServer();
  BASE = server.baseUrl;
  fixtures = await seedIntegrationData(PREFIX);

  // Seed a "VIP" customer: 3 paid orders totalling > KES 5000
  for (let i = 0; i < 3; i++) {
    const order = await prisma.order.create({
      data: {
        orderNumber: `ORD-VIP-${PREFIX}-${i}`,
        customerPhone: TEST_PHONE_VIP,
        customerName: 'VIP Customer',
        status: 'delivered',
        subtotal: 2000,
        discountAmount: 0,
        total: 2000,
        items: {
          create: [{
            productId: fixtures.productId,
            name: 'VIP Product',
            quantity: 1,
            price: 2000,
            total: 2000,
          }],
        },
      },
    });
  }
}, 20000);

afterAll(async () => {
  // Clean up VIP customer orders
  const orders = await prisma.order.findMany({
    where: { customerPhone: { in: [TEST_PHONE_VIP, TEST_PHONE_BLOCK] } },
    select: { id: true },
  });
  if (orders.length > 0) {
    const ids = orders.map((o) => o.id);
    await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.blockedCustomer.deleteMany({
    where: { phone: { in: [TEST_PHONE_BLOCK, TEST_PHONE_VIP] } },
  });

  await cleanIntegrationData(PREFIX);
  await server.close();
  await prisma.$disconnect();
}, 20000);

// ── Helpers ───────────────────────────────────────────────────────────────────

function authHeader() {
  return { Authorization: `Bearer ${fixtures.adminToken}` };
}

async function blockCustomer(phone: string, reason?: string) {
  return fetch(`${BASE}/api/admin/customers/${encodeURIComponent(phone)}/block`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ reason }),
  });
}

async function unblockCustomer(phone: string) {
  return fetch(`${BASE}/api/admin/customers/${encodeURIComponent(phone)}/block`, {
    method: 'DELETE',
    headers: { ...authHeader() },
  });
}

async function listCustomers(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  return fetch(`${BASE}/api/admin/customers${qs ? `?${qs}` : ''}`, {
    headers: { ...authHeader() },
  });
}

async function getCustomer(phone: string) {
  return fetch(`${BASE}/api/admin/customers/${encodeURIComponent(phone)}`, {
    headers: { ...authHeader() },
  });
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Customer block/unblock', () => {
  afterEach(async () => {
    // Ensure clean state between tests
    await prisma.blockedCustomer.deleteMany({ where: { phone: TEST_PHONE_BLOCK } });
  });

  it('blocks a customer successfully', async () => {
    const res = await blockCustomer(TEST_PHONE_BLOCK, 'Suspected fraud');
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean; blocked: { phone: string } };
    expect(body.success).toBe(true);
    expect(body.blocked.phone).toBe(TEST_PHONE_BLOCK);
  });

  it('persists the block reason in the database', async () => {
    await blockCustomer(TEST_PHONE_BLOCK, 'Coupon abuse');
    const record = await prisma.blockedCustomer.findUnique({ where: { phone: TEST_PHONE_BLOCK } });
    expect(record).not.toBeNull();
    expect(record!.reason).toBe('Coupon abuse');
  });

  it('unblocks a previously blocked customer', async () => {
    await blockCustomer(TEST_PHONE_BLOCK);
    const unblockRes = await unblockCustomer(TEST_PHONE_BLOCK);
    expect(unblockRes.status).toBe(200);

    const record = await prisma.blockedCustomer.findUnique({ where: { phone: TEST_PHONE_BLOCK } });
    expect(record).toBeNull();
  });

  it('blocking twice (upsert) does not create duplicates', async () => {
    await blockCustomer(TEST_PHONE_BLOCK, 'First reason');
    await blockCustomer(TEST_PHONE_BLOCK, 'Updated reason');

    const count = await prisma.blockedCustomer.count({ where: { phone: TEST_PHONE_BLOCK } });
    expect(count).toBe(1);

    const record = await prisma.blockedCustomer.findUnique({ where: { phone: TEST_PHONE_BLOCK } });
    expect(record!.reason).toBe('Updated reason');
  });
});

describe('Customer list API — requires auth', () => {
  it('returns 401 without a token', async () => {
    const res = await fetch(`${BASE}/api/admin/customers`);
    expect(res.status).toBe(401);
  });

  it('returns paginated customer list', async () => {
    const res = await listCustomers({ page: '1', limit: '10' });
    expect(res.status).toBe(200);
    const body = await res.json() as {
      success: boolean;
      customers: unknown[];
      pagination: { total: number; page: number; limit: number; pages: number };
    };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.customers)).toBe(true);
    expect(body.pagination).toHaveProperty('total');
    expect(body.pagination).toHaveProperty('pages');
  });
});

describe('Customer detail API', () => {
  it('returns customer detail with order history', async () => {
    const res = await getCustomer(TEST_PHONE_VIP);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      success: boolean;
      customer: {
        phone: string;
        totalOrders: number;
        totalSpent: number;
        segment: string;
        isBlocked: boolean;
      };
      orders: unknown[];
    };
    expect(body.success).toBe(true);
    expect(body.customer.phone).toBe(TEST_PHONE_VIP);
    // 3 delivered orders at KES 2000 each
    expect(body.customer.totalOrders).toBe(3);
    expect(body.customer.totalSpent).toBe(6000);
    expect(body.customer.segment).toBe('vip');
    expect(body.customer.isBlocked).toBe(false);
    expect(Array.isArray(body.orders)).toBe(true);
    expect(body.orders.length).toBe(3);
  });

  it('reflects blocked status on customer detail', async () => {
    await prisma.blockedCustomer.upsert({
      where: { phone: TEST_PHONE_VIP },
      update: { reason: 'test' },
      create: { phone: TEST_PHONE_VIP, reason: 'test' },
    });

    const res = await getCustomer(TEST_PHONE_VIP);
    const body = await res.json() as { customer: { isBlocked: boolean } };
    expect(body.customer.isBlocked).toBe(true);

    await prisma.blockedCustomer.delete({ where: { phone: TEST_PHONE_VIP } });
  });
});

describe('Customer segmentation via list API', () => {
  it('VIP segment includes the VIP customer', async () => {
    const res = await listCustomers({ segment: 'vip' });
    const body = await res.json() as { customers: { phone: string }[] };
    const phones = body.customers.map((c) => c.phone);
    expect(phones).toContain(TEST_PHONE_VIP);
  });

  it('non-vip segments do NOT include the VIP customer', async () => {
    for (const seg of ['new', 'inactive', 'risky']) {
      const res = await listCustomers({ segment: seg });
      const body = await res.json() as { customers: { phone: string }[] };
      const phones = body.customers.map((c) => c.phone);
      expect(phones).not.toContain(TEST_PHONE_VIP);
    }
  });
});
