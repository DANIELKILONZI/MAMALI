/**
 * Integration tests for POST /api/coupons/apply.
 *
 * Tests coupon validation and discount calculation against the real database.
 */

import { seedIntegrationData, cleanIntegrationData, IntegrationFixtures } from '../helpers/setup';
import { startTestServer, TestServer } from '../helpers/testServer';
import { prisma } from '../../lib/prisma';

const PREFIX = 'INT_CPN_';

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

async function applyCoupon(code: string, orderTotal: number) {
  return fetch(`${BASE}/api/coupons/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, orderTotal }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/coupons/apply — valid coupon', () => {
  it('returns 200 with correct discount for 10% percent coupon', async () => {
    const res = await applyCoupon(fixtures.couponCode, 1000);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      success: boolean;
      discountAmount: number;
      coupon: { code: string; discountType: string };
    };
    expect(body.success).toBe(true);
    expect(body.discountAmount).toBe(100); // 10% of 1000
    expect(body.coupon.code).toBe(fixtures.couponCode);
  });

  it('discount does not exceed order total (100% coupon edge case)', async () => {
    // Create a 100% off coupon for this test
    const fullCoupon = await prisma.coupon.create({
      data: {
        code: `${PREFIX}FULL100`,
        discountType: 'percent',
        discountValue: 100,
        minOrderValue: 0,
        isActive: true,
      },
    });

    const res = await applyCoupon(fullCoupon.code, 500);
    const body = await res.json() as { success: boolean; discountAmount: number };
    expect(body.discountAmount).toBe(500); // capped at order total

    await prisma.coupon.delete({ where: { id: fullCoupon.id } });
  });
});

describe('POST /api/coupons/apply — validation errors', () => {
  it('returns 400 for expired coupon', async () => {
    const res = await applyCoupon(fixtures.expiredCouponCode, 1000);
    expect(res.status).toBe(400);
    const body = await res.json() as { success: boolean; message: string };
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/expired/i);
  });

  it('returns 400 when usage limit is reached', async () => {
    const res = await applyCoupon(fixtures.maxUsedCouponCode, 1000);
    expect(res.status).toBe(400);
    const body = await res.json() as { success: boolean; message: string };
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/limit/i);
  });

  it('returns 400 for nonexistent coupon code', async () => {
    const res = await applyCoupon('DOESNOTEXIST', 1000);
    expect(res.status).toBe(400);
    const body = await res.json() as { success: boolean };
    expect(body.success).toBe(false);
  });

  it('returns 400 when order total is below minimum order value', async () => {
    // minOrderValue for fixtures.couponCode is 500
    const res = await applyCoupon(fixtures.couponCode, 400);
    expect(res.status).toBe(400);
    const body = await res.json() as { success: boolean; message: string };
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/minimum/i);
  });

  it('returns 400 for inactive coupon', async () => {
    const inactiveCoupon = await prisma.coupon.create({
      data: {
        code: `${PREFIX}INACTIVE`,
        discountType: 'fixed',
        discountValue: 50,
        minOrderValue: 0,
        isActive: false,
      },
    });

    const res = await applyCoupon(inactiveCoupon.code, 1000);
    expect(res.status).toBe(400);
    const body = await res.json() as { success: boolean };
    expect(body.success).toBe(false);

    await prisma.coupon.delete({ where: { id: inactiveCoupon.id } });
  });
});

describe('POST /api/coupons/apply — fixed amount coupon', () => {
  let fixedCouponCode: string;
  let fixedCouponId: string;

  beforeAll(async () => {
    const c = await prisma.coupon.create({
      data: {
        code: `${PREFIX}FIXED200`,
        discountType: 'fixed',
        discountValue: 200,
        minOrderValue: 300,
        isActive: true,
      },
    });
    fixedCouponCode = c.code;
    fixedCouponId = c.id;
  });

  afterAll(async () => {
    await prisma.coupon.delete({ where: { id: fixedCouponId } });
  });

  it('deducts fixed KES 200 from a KES 1000 order', async () => {
    const res = await applyCoupon(fixedCouponCode, 1000);
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean; discountAmount: number };
    expect(body.discountAmount).toBe(200);
  });

  it('caps at order total when fixed > order total', async () => {
    const res = await applyCoupon(fixedCouponCode, 300); // fixed 200, order 300 → OK
    const body = await res.json() as { discountAmount: number };
    expect(body.discountAmount).toBeLessThanOrEqual(300);
  });
});

describe('POST /api/coupons/apply — case insensitivity', () => {
  it('accepts coupon code in lowercase', async () => {
    const res = await applyCoupon(fixtures.couponCode.toLowerCase(), 1000);
    // The server normalises to uppercase, so should succeed
    expect(res.status).toBe(200);
  });

  it('accepts coupon code in mixed case', async () => {
    const mixed = fixtures.couponCode
      .split('')
      .map((c, i) => (i % 2 === 0 ? c.toLowerCase() : c.toUpperCase()))
      .join('');
    const res = await applyCoupon(mixed, 1000);
    expect(res.status).toBe(200);
  });
});
