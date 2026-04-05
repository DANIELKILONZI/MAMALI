/**
 * Unit tests for the fraud risk scoring service.
 *
 * All Prisma calls are mocked so these tests run without a database.
 * Each test exercises one scoring rule in isolation.
 */

import { assessOrderRisk } from '../../services/fraud';

// ── Mock Prisma client ────────────────────────────────────────────────────────

// We need to mock BEFORE importing the service module that calls prisma.
// Jest module factory hoisting handles this automatically.
jest.mock('../../lib/prisma', () => ({
  prisma: {
    order: {
      count: jest.fn(),
      findMany: jest.fn(),
      groupBy: jest.fn(),
    },
    payment: {
      count: jest.fn(),
    },
  },
}));

import { prisma } from '../../lib/prisma';

const mockOrder = (prisma.order as unknown) as {
  count: jest.Mock;
  findMany: jest.Mock;
  groupBy: jest.Mock;
};
const mockPayment = (prisma.payment as unknown) as {
  count: jest.Mock;
};

// ── Helper to reset all mocks to clean (no activity) state ───────────────────

function clearActivity() {
  mockOrder.count.mockResolvedValue(0);
  mockOrder.findMany.mockResolvedValue([]);
  mockOrder.groupBy.mockResolvedValue([]);
  mockPayment.count.mockResolvedValue(0);
}

// ── Base params shared across most tests ─────────────────────────────────────

const baseParams = {
  customerPhone: '254700000001',
  orderTotal: 1500,
};

// ─────────────────────────────────────────────────────────────────────────────

describe('assessOrderRisk — clean order', () => {
  beforeEach(() => clearActivity());

  it('returns riskScore=0 and empty flags for a perfectly clean order', async () => {
    const result = await assessOrderRisk(baseParams);
    expect(result.riskScore).toBe(0);
    expect(result.flags).toHaveLength(0);
  });
});

// ── Phone velocity ────────────────────────────────────────────────────────────

describe('assessOrderRisk — phone velocity', () => {
  beforeEach(() => clearActivity());

  it('adds ELEVATED_ORDER_VELOCITY (+15) when 2 orders in last hour', async () => {
    // First .count call is for ordersLastHour
    mockOrder.count
      .mockResolvedValueOnce(2)  // ordersLastHour
      .mockResolvedValue(0);     // remaining counts (IP velocity, etc.)

    const result = await assessOrderRisk(baseParams);
    expect(result.flags).toContain('ELEVATED_ORDER_VELOCITY');
    expect(result.riskScore).toBeGreaterThanOrEqual(15);
  });

  it('adds HIGH_ORDER_VELOCITY (+40) when 3+ orders in last hour', async () => {
    mockOrder.count
      .mockResolvedValueOnce(3)
      .mockResolvedValue(0);

    const result = await assessOrderRisk(baseParams);
    expect(result.flags).toContain('HIGH_ORDER_VELOCITY');
    expect(result.riskScore).toBeGreaterThanOrEqual(40);
  });

  it('does NOT add velocity flag for first order', async () => {
    const result = await assessOrderRisk(baseParams);
    expect(result.flags).not.toContain('HIGH_ORDER_VELOCITY');
    expect(result.flags).not.toContain('ELEVATED_ORDER_VELOCITY');
  });
});

// ── Rapid checkout ────────────────────────────────────────────────────────────

describe('assessOrderRisk — rapid checkout', () => {
  beforeEach(() => clearActivity());

  it('adds RAPID_CHECKOUT (+20) when firstViewedAt is within last 10 seconds', async () => {
    const firstViewedAt = new Date(Date.now() - 5000); // 5 seconds ago
    const result = await assessOrderRisk({ ...baseParams, firstViewedAt });
    expect(result.flags).toContain('RAPID_CHECKOUT');
    expect(result.riskScore).toBeGreaterThanOrEqual(20);
  });

  it('does NOT add RAPID_CHECKOUT when firstViewedAt is > 10 seconds ago', async () => {
    const firstViewedAt = new Date(Date.now() - 15000); // 15 seconds ago
    const result = await assessOrderRisk({ ...baseParams, firstViewedAt });
    expect(result.flags).not.toContain('RAPID_CHECKOUT');
  });

  it('does NOT add RAPID_CHECKOUT when firstViewedAt is not provided', async () => {
    const result = await assessOrderRisk(baseParams);
    expect(result.flags).not.toContain('RAPID_CHECKOUT');
  });
});

// ── IP velocity ───────────────────────────────────────────────────────────────

describe('assessOrderRisk — IP velocity', () => {
  beforeEach(() => clearActivity());

  it('adds ELEVATED_IP_VELOCITY (+15) when 3-4 orders from same IP last hour', async () => {
    mockOrder.count
      .mockResolvedValueOnce(0)  // ordersLastHour (phone)
      .mockResolvedValueOnce(3); // ipOrderCount
    mockOrder.findMany.mockResolvedValue([]);

    const result = await assessOrderRisk({ ...baseParams, ipAddress: '1.2.3.4' });
    expect(result.flags).toContain('ELEVATED_IP_VELOCITY');
  });

  it('adds HIGH_IP_VELOCITY (+35) when 5+ orders from same IP last hour', async () => {
    mockOrder.count
      .mockResolvedValueOnce(0)  // ordersLastHour (phone)
      .mockResolvedValueOnce(5); // ipOrderCount
    mockOrder.findMany.mockResolvedValue([]);

    const result = await assessOrderRisk({ ...baseParams, ipAddress: '1.2.3.4' });
    expect(result.flags).toContain('HIGH_IP_VELOCITY');
    expect(result.riskScore).toBeGreaterThanOrEqual(35);
  });

  it('ignores IP velocity when ipAddress is not provided', async () => {
    const result = await assessOrderRisk(baseParams);
    expect(result.flags).not.toContain('HIGH_IP_VELOCITY');
    expect(result.flags).not.toContain('ELEVATED_IP_VELOCITY');
  });
});

// ── Failed payments ───────────────────────────────────────────────────────────

describe('assessOrderRisk — failed payment history', () => {
  beforeEach(() => clearActivity());

  it('adds REPEATED_FAILED_PAYMENTS (+15) when 2 failed payments in 24h', async () => {
    mockOrder.findMany.mockResolvedValue([{ id: 'o1' }, { id: 'o2' }]);
    mockPayment.count.mockResolvedValue(2);

    const result = await assessOrderRisk(baseParams);
    expect(result.flags).toContain('REPEATED_FAILED_PAYMENTS');
    expect(result.riskScore).toBeGreaterThanOrEqual(15);
  });

  it('adds MULTIPLE_FAILED_PAYMENTS (+30) when 3+ failed payments in 24h', async () => {
    mockOrder.findMany.mockResolvedValue([{ id: 'o1' }, { id: 'o2' }]);
    mockPayment.count.mockResolvedValue(3);

    const result = await assessOrderRisk(baseParams);
    expect(result.flags).toContain('MULTIPLE_FAILED_PAYMENTS');
    expect(result.riskScore).toBeGreaterThanOrEqual(30);
  });
});

// ── High order amounts ────────────────────────────────────────────────────────

describe('assessOrderRisk — high order amount thresholds', () => {
  beforeEach(() => clearActivity());

  it('adds HIGH_ORDER_AMOUNT (+10) for orders between 20 001 and 50 000', async () => {
    const result = await assessOrderRisk({ ...baseParams, orderTotal: 25000 });
    expect(result.flags).toContain('HIGH_ORDER_AMOUNT');
    expect(result.riskScore).toBeGreaterThanOrEqual(10);
  });

  it('adds VERY_HIGH_ORDER_AMOUNT (+20) for orders above 50 000', async () => {
    const result = await assessOrderRisk({ ...baseParams, orderTotal: 60000 });
    expect(result.flags).toContain('VERY_HIGH_ORDER_AMOUNT');
    expect(result.riskScore).toBeGreaterThanOrEqual(20);
  });

  it('does NOT add amount flag for normal order (KES 1 500)', async () => {
    const result = await assessOrderRisk(baseParams);
    expect(result.flags).not.toContain('HIGH_ORDER_AMOUNT');
    expect(result.flags).not.toContain('VERY_HIGH_ORDER_AMOUNT');
  });
});

// ── Coupon abuse ──────────────────────────────────────────────────────────────

describe('assessOrderRisk — coupon abuse', () => {
  beforeEach(() => clearActivity());

  it('adds COUPON_ABUSE_SUSPECTED (+25) when phone used coupons 3+ times in 7 days', async () => {
    // couponOrderCount query
    mockOrder.count.mockResolvedValueOnce(0).mockResolvedValueOnce(3);
    mockOrder.groupBy.mockResolvedValue([]); // mass sharing check
    mockOrder.findMany.mockResolvedValue([]);

    const result = await assessOrderRisk({ ...baseParams, couponCode: 'SAVE10' });
    expect(result.flags).toContain('COUPON_ABUSE_SUSPECTED');
  });

  it('adds COUPON_MASS_SHARING (+20) when same coupon used by 5+ phones in 24h', async () => {
    mockOrder.count.mockResolvedValue(0);
    mockOrder.findMany.mockResolvedValue([]);
    // groupBy returns 5 unique phones
    mockOrder.groupBy.mockResolvedValue([
      { customerPhone: '254700000001' },
      { customerPhone: '254700000002' },
      { customerPhone: '254700000003' },
      { customerPhone: '254700000004' },
      { customerPhone: '254700000005' },
    ]);

    const result = await assessOrderRisk({ ...baseParams, couponCode: 'VIRAL10' });
    expect(result.flags).toContain('COUPON_MASS_SHARING');
    expect(result.riskScore).toBeGreaterThanOrEqual(20);
  });

  it('does NOT add coupon flags when no coupon is provided', async () => {
    const result = await assessOrderRisk(baseParams);
    expect(result.flags).not.toContain('COUPON_ABUSE_SUSPECTED');
    expect(result.flags).not.toContain('COUPON_MASS_SHARING');
  });
});

// ── Score cap ─────────────────────────────────────────────────────────────────

describe('assessOrderRisk — score capped at 100', () => {
  beforeEach(() => clearActivity());

  it('caps riskScore at 100 even with many simultaneous flags', async () => {
    // Trigger many flags at once
    mockOrder.count
      .mockResolvedValueOnce(3)  // HIGH_ORDER_VELOCITY (+40)
      .mockResolvedValueOnce(5)  // HIGH_IP_VELOCITY (+35)
      .mockResolvedValueOnce(0);
    mockOrder.findMany.mockResolvedValue([{ id: 'o1' }]);
    mockPayment.count.mockResolvedValue(3);  // MULTIPLE_FAILED_PAYMENTS (+30)
    mockOrder.groupBy.mockResolvedValue([]);

    const result = await assessOrderRisk({
      customerPhone: '254700000001',
      orderTotal: 60000,  // VERY_HIGH_ORDER_AMOUNT (+20)
      ipAddress: '1.2.3.4',
      couponCode: 'SAVE10',
      firstViewedAt: new Date(Date.now() - 3000),  // RAPID_CHECKOUT (+20)
    });

    expect(result.riskScore).toBeLessThanOrEqual(100);
    expect(result.flags.length).toBeGreaterThan(3);
  });
});
