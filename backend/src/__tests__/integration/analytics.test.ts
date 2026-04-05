/**
 * Integration tests for the customer analytics API.
 *
 * Tests GET /api/admin/analytics/customers:
 *   - Returns summary KPIs (totalUniqueCustomers, repeatRate, avgCustomerLifetimeValue,
 *     newCustomersLast30, repeatRateLast30)
 *   - topCustomers list has the expected shape
 *   - A VIP customer seeded with paid orders shows up with correct spend totals
 *
 * Requires the backend server to be running at BASE_URL (http://localhost:5000).
 */

import { seedIntegrationData, cleanIntegrationData, IntegrationFixtures } from '../helpers/setup';
import { prisma } from '../../lib/prisma';

const PREFIX = 'INT_ANA_';
const BASE = 'http://localhost:5000';
const ANALYTICS_PHONE = '254999903001';

let fixtures: IntegrationFixtures;

beforeAll(async () => {
  fixtures = await seedIntegrationData(PREFIX);

  // Seed 3 paid orders for our analytics customer so they become a top customer
  for (let i = 0; i < 3; i++) {
    await prisma.order.create({
      data: {
        orderNumber: `ORD-ANA-${PREFIX}-${i}`,
        customerPhone: ANALYTICS_PHONE,
        customerName: 'Analytics VIP',
        status: 'delivered',
        subtotal: 2000,
        discountAmount: 0,
        total: 2000,
        items: {
          create: [{
            productId: fixtures.productId,
            name: 'Analytics Product',
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
  const orders = await prisma.order.findMany({
    where: { customerPhone: ANALYTICS_PHONE },
    select: { id: true },
  });
  if (orders.length > 0) {
    const ids = orders.map((o) => o.id);
    await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
  }
  await cleanIntegrationData(PREFIX);
  await prisma.$disconnect();
}, 20000);

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/admin/analytics/customers — auth', () => {
  it('returns 401 without a token', async () => {
    const res = await fetch(`${BASE}/api/admin/analytics/customers`);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/admin/analytics/customers — response shape', () => {
  let body: {
    success: boolean;
    topCustomers: {
      phone: string;
      name: string | null;
      totalOrders: number;
      totalSpent: number;
      totalDiscount: number;
      avgOrderValue: number;
      lastOrderAt: string;
      isRepeat: boolean;
    }[];
    summary: {
      totalUniqueCustomers: number;
      repeatRate: number;
      avgCustomerLifetimeValue: number;
      newCustomersLast30: number;
      repeatRateLast30: number;
    };
  };

  beforeAll(async () => {
    const res = await fetch(`${BASE}/api/admin/analytics/customers`, {
      headers: authHeader(fixtures.adminToken),
    });
    expect(res.status).toBe(200);
    body = await res.json() as typeof body;
  });

  it('response has success: true', () => {
    expect(body.success).toBe(true);
  });

  it('topCustomers is an array', () => {
    expect(Array.isArray(body.topCustomers)).toBe(true);
  });

  it('each topCustomer entry has required fields', () => {
    if (body.topCustomers.length === 0) return; // no data yet, skip shape check
    const c = body.topCustomers[0];
    expect(c).toHaveProperty('phone');
    expect(c).toHaveProperty('totalOrders');
    expect(c).toHaveProperty('totalSpent');
    expect(c).toHaveProperty('avgOrderValue');
    expect(c).toHaveProperty('lastOrderAt');
    expect(c).toHaveProperty('isRepeat');
  });

  it('summary contains all expected KPI fields', () => {
    expect(body.summary).toHaveProperty('totalUniqueCustomers');
    expect(body.summary).toHaveProperty('repeatRate');
    expect(body.summary).toHaveProperty('avgCustomerLifetimeValue');
    expect(body.summary).toHaveProperty('newCustomersLast30');
    expect(body.summary).toHaveProperty('repeatRateLast30');
  });

  it('summary.totalUniqueCustomers is a non-negative integer', () => {
    expect(typeof body.summary.totalUniqueCustomers).toBe('number');
    expect(body.summary.totalUniqueCustomers).toBeGreaterThanOrEqual(0);
  });

  it('summary.repeatRate is between 0 and 100', () => {
    expect(body.summary.repeatRate).toBeGreaterThanOrEqual(0);
    expect(body.summary.repeatRate).toBeLessThanOrEqual(100);
  });

  it('summary.avgCustomerLifetimeValue is non-negative', () => {
    expect(body.summary.avgCustomerLifetimeValue).toBeGreaterThanOrEqual(0);
  });
});

describe('GET /api/admin/analytics/customers — seeded VIP customer', () => {
  it('analytics customer appears in topCustomers list', async () => {
    const res = await fetch(`${BASE}/api/admin/analytics/customers`, {
      headers: authHeader(fixtures.adminToken),
    });
    const body = await res.json() as {
      topCustomers: { phone: string; totalOrders: number; totalSpent: number; isRepeat: boolean }[];
    };

    const found = body.topCustomers.find((c) => c.phone === ANALYTICS_PHONE);
    expect(found).toBeDefined();
    expect(found!.totalOrders).toBe(3);
    expect(found!.totalSpent).toBe(6000); // 3 × KES 2000
    expect(found!.isRepeat).toBe(true);
  });

  it('avgOrderValue is correct for the seeded customer', async () => {
    const res = await fetch(`${BASE}/api/admin/analytics/customers`, {
      headers: authHeader(fixtures.adminToken),
    });
    const body = await res.json() as {
      topCustomers: { phone: string; avgOrderValue: number }[];
    };

    const found = body.topCustomers.find((c) => c.phone === ANALYTICS_PHONE);
    expect(found).toBeDefined();
    expect(found!.avgOrderValue).toBe(2000); // 6000 / 3
  });

  it('summary.totalUniqueCustomers includes the seeded customer', async () => {
    const res = await fetch(`${BASE}/api/admin/analytics/customers`, {
      headers: authHeader(fixtures.adminToken),
    });
    const body = await res.json() as {
      summary: { totalUniqueCustomers: number };
    };
    expect(body.summary.totalUniqueCustomers).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /api/admin/analytics/revenue — shape check', () => {
  it('returns revenue trend array for last 30 days', async () => {
    const res = await fetch(`${BASE}/api/admin/analytics/revenue`, {
      headers: authHeader(fixtures.adminToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as {
      success: boolean;
      trend: { date: string; revenue: number; orders: number; discountGiven: number }[];
      totalRevenue: number;
      totalOrders: number;
    };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.trend)).toBe(true);
    // Should have ~30 days of entries
    expect(body.trend.length).toBeGreaterThanOrEqual(30);
    // Each entry should have required fields
    const day = body.trend[0];
    expect(day).toHaveProperty('date');
    expect(day).toHaveProperty('revenue');
    expect(day).toHaveProperty('orders');
    expect(day).toHaveProperty('discountGiven');
    expect(body).toHaveProperty('totalRevenue');
    expect(body).toHaveProperty('totalOrders');
  });

  it('returns 401 without auth', async () => {
    const res = await fetch(`${BASE}/api/admin/analytics/revenue`);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/admin/analytics/fraud — fraud alerts', () => {
  it('returns an array of fraud alerts (may be empty)', async () => {
    const res = await fetch(`${BASE}/api/admin/analytics/fraud`, {
      headers: authHeader(fixtures.adminToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean; alerts: unknown[] };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.alerts)).toBe(true);
  });

  it('each alert entry has required fields', async () => {
    const res = await fetch(`${BASE}/api/admin/analytics/fraud`, {
      headers: authHeader(fixtures.adminToken),
    });
    const body = await res.json() as {
      alerts: { id: string; orderNumber: string; customerPhone: string; riskScore: number; riskFlags: string }[];
    };
    if (body.alerts.length === 0) return; // No high-risk orders yet, skip shape check
    const alert = body.alerts[0];
    expect(alert).toHaveProperty('id');
    expect(alert).toHaveProperty('orderNumber');
    expect(alert).toHaveProperty('customerPhone');
    expect(alert).toHaveProperty('riskScore');
    expect(alert).toHaveProperty('riskFlags');
  });
});
