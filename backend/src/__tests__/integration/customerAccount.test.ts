/**
 * Integration tests for optional customer accounts (/api/customer).
 *
 * Verifies registration, login, profile, and order history — and that
 * order placement stays open to guests (no account required).
 */

import { seedIntegrationData, cleanIntegrationData, IntegrationFixtures } from '../helpers/setup';
import { startTestServer, TestServer } from '../helpers/testServer';
import { prisma } from '../../lib/prisma';

const PREFIX = 'INT_CACC_';
const PHONE_LOCAL = '0733001122';
const PHONE_NORMALIZED = '254733001122';
const PASSWORD = 'Secret@123';

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
    where: { customerPhone: PHONE_NORMALIZED },
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
  await prisma.customer.deleteMany({ where: { phone: PHONE_NORMALIZED } });
  await cleanIntegrationData(PREFIX);
  await server.close();
  await prisma.$disconnect();
}, 20000);

async function post(path: string, body: unknown, token?: string) {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function get(path: string, token?: string) {
  return fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

describe('POST /api/customer/register', () => {
  it('creates an account from a local-format phone and returns a token', async () => {
    const res = await post('/api/customer/register', {
      phone: PHONE_LOCAL,
      name: 'Acc Test',
      password: PASSWORD,
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { success: boolean; token: string; customer: { phone: string } };
    expect(body.success).toBe(true);
    expect(body.token).toBeTruthy();
    expect(body.customer.phone).toBe(PHONE_NORMALIZED);
  });

  it('rejects a duplicate phone with 409', async () => {
    const res = await post('/api/customer/register', { phone: PHONE_NORMALIZED, password: PASSWORD });
    expect(res.status).toBe(409);
  });

  it('rejects an invalid phone', async () => {
    const res = await post('/api/customer/register', { phone: '123456789', password: PASSWORD });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/customer/login', () => {
  it('logs in with correct credentials', async () => {
    const res = await post('/api/customer/login', { phone: PHONE_LOCAL, password: PASSWORD });
    expect(res.status).toBe(200);
    const body = await res.json() as { token: string };
    expect(body.token).toBeTruthy();
  });

  it('rejects a wrong password', async () => {
    const res = await post('/api/customer/login', { phone: PHONE_LOCAL, password: 'WrongPass1' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/customer/me and /me/orders', () => {
  let token: string;

  beforeAll(async () => {
    const res = await post('/api/customer/login', { phone: PHONE_LOCAL, password: PASSWORD });
    token = ((await res.json()) as { token: string }).token;
  });

  it('requires authentication', async () => {
    expect((await get('/api/customer/me')).status).toBe(401);
    expect((await get('/api/customer/me/orders')).status).toBe(401);
  });

  it('rejects an admin token on customer endpoints', async () => {
    const res = await get('/api/customer/me', fixtures.adminToken);
    expect(res.status).toBe(403);
  });

  it('returns the profile without the password hash', async () => {
    const res = await get('/api/customer/me', token);
    expect(res.status).toBe(200);
    const body = await res.json() as { customer: Record<string, unknown> };
    expect(body.customer.phone).toBe(PHONE_NORMALIZED);
    expect(body.customer.passwordHash).toBeUndefined();
  });

  it('lists orders placed with the account phone — including guest orders', async () => {
    // Guest checkout: no token involved, same phone
    const orderRes = await post('/api/orders', {
      customerPhone: PHONE_NORMALIZED,
      items: [{ productId: fixtures.productId, quantity: 1 }],
    });
    expect(orderRes.status).toBe(201);

    const res = await get('/api/customer/me/orders', token);
    expect(res.status).toBe(200);
    const body = await res.json() as { orders: { orderNumber: string }[] };
    expect(body.orders.length).toBeGreaterThanOrEqual(1);
  });
});

describe('guest checkout stays open', () => {
  it('creates an order with no Authorization header at all', async () => {
    const res = await post('/api/orders', {
      customerPhone: PHONE_NORMALIZED,
      items: [{ productId: fixtures.productId, quantity: 1 }],
    });
    expect(res.status).toBe(201);
  });
});
