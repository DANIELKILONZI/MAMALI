/**
 * Unit tests for Customer Lifetime Value (CLV) computation.
 *
 * CLV is defined as: total revenue / total unique customers
 * Additional metrics: repeat rate, average order value per customer,
 * segment distribution.
 *
 * All logic is tested in isolation — no database, no HTTP calls.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

interface CustomerRecord {
  phone: string;
  totalOrders: number;
  totalSpent: number;
  lastOrderAt: Date | null;
}

// ── Pure CLV helpers (mirror logic from routes/analytics.ts) ──────────────────

/**
 * Average Customer Lifetime Value.
 * = sum of all revenue across all paid customers / number of unique customers.
 */
function calcAvgCLV(records: CustomerRecord[]): number {
  if (records.length === 0) return 0;
  const totalRevenue = records.reduce((s, c) => s + c.totalSpent, 0);
  return Math.round((totalRevenue / records.length) * 100) / 100;
}

/**
 * Repeat rate (percentage of customers with 2+ orders).
 */
function calcRepeatRate(records: CustomerRecord[]): number {
  if (records.length === 0) return 0;
  const repeatCustomers = records.filter((c) => c.totalOrders >= 2).length;
  return Math.round((repeatCustomers / records.length) * 10000) / 100; // 2 decimal places
}

/**
 * Average order value = total revenue / total number of orders.
 */
function calcAvgOrderValue(records: CustomerRecord[]): number {
  const totalOrders = records.reduce((s, c) => s + c.totalOrders, 0);
  if (totalOrders === 0) return 0;
  const totalRevenue = records.reduce((s, c) => s + c.totalSpent, 0);
  return Math.round((totalRevenue / totalOrders) * 100) / 100;
}

/**
 * New customers in the last N days (customers whose first-and-only order
 * was within the window, i.e. totalOrders === 1 and recent lastOrderAt).
 */
function countNewCustomers(records: CustomerRecord[], windowDays: number): number {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  return records.filter(
    (c) => c.totalOrders === 1 && c.lastOrderAt !== null && c.lastOrderAt >= since
  ).length;
}

/**
 * Repeat customers in the last N days (customers with 2+ orders, last order
 * within the window).
 */
function countRepeatCustomers(records: CustomerRecord[], windowDays: number): number {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  return records.filter(
    (c) => c.totalOrders >= 2 && c.lastOrderAt !== null && c.lastOrderAt >= since
  ).length;
}

// ── Sample customer data ──────────────────────────────────────────────────────

const clvDaysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

const CUSTOMERS: CustomerRecord[] = [
  // VIP: 5 orders, KES 15 000
  { phone: '254700000001', totalOrders: 5,  totalSpent: 15000, lastOrderAt: clvDaysAgo(2)  },
  // Returning: 3 orders, KES 6 000
  { phone: '254700000002', totalOrders: 3,  totalSpent: 6000,  lastOrderAt: clvDaysAgo(10) },
  // New: 1 order, recent
  { phone: '254700000003', totalOrders: 1,  totalSpent: 1500,  lastOrderAt: clvDaysAgo(5)  },
  // New: 1 order, recent
  { phone: '254700000004', totalOrders: 1,  totalSpent: 2000,  lastOrderAt: clvDaysAgo(1)  },
  // Inactive returning: 2 orders, last was 90 days ago
  { phone: '254700000005', totalOrders: 2,  totalSpent: 3000,  lastOrderAt: clvDaysAgo(90) },
];

// ── calcAvgCLV ────────────────────────────────────────────────────────────────

describe('calcAvgCLV — average customer lifetime value', () => {
  it('returns 0 for an empty customer list', () => {
    expect(calcAvgCLV([])).toBe(0);
  });

  it('returns the only customers spend for a single-customer list', () => {
    expect(calcAvgCLV([CUSTOMERS[0]])).toBe(15000);
  });

  it('computes average across all customers', () => {
    // total = 15000 + 6000 + 1500 + 2000 + 3000 = 27500; / 5 = 5500
    expect(calcAvgCLV(CUSTOMERS)).toBe(5500);
  });

  it('rounds to 2 decimal places', () => {
    const records: CustomerRecord[] = [
      { phone: 'a', totalOrders: 1, totalSpent: 1000, lastOrderAt: null },
      { phone: 'b', totalOrders: 1, totalSpent: 1000, lastOrderAt: null },
      { phone: 'c', totalOrders: 1, totalSpent: 1001, lastOrderAt: null },
    ];
    // total = 3001 / 3 = 1000.333... → 1000.33
    expect(calcAvgCLV(records)).toBe(1000.33);
  });

  it('is not affected by customers with 0 spent', () => {
    const records: CustomerRecord[] = [
      { phone: 'a', totalOrders: 0, totalSpent: 0, lastOrderAt: null },
      { phone: 'b', totalOrders: 2, totalSpent: 4000, lastOrderAt: null },
    ];
    expect(calcAvgCLV(records)).toBe(2000); // (0 + 4000) / 2
  });
});

// ── calcRepeatRate ────────────────────────────────────────────────────────────

describe('calcRepeatRate — percentage of repeat buyers', () => {
  it('returns 0 for an empty list', () => {
    expect(calcRepeatRate([])).toBe(0);
  });

  it('returns 0 when all customers have exactly 1 order', () => {
    expect(calcRepeatRate([CUSTOMERS[2], CUSTOMERS[3]])).toBe(0);
  });

  it('returns 100 when all customers have 2+ orders', () => {
    expect(calcRepeatRate([CUSTOMERS[0], CUSTOMERS[1], CUSTOMERS[4]])).toBe(100);
  });

  it('computes a partial repeat rate correctly', () => {
    // 5 customers, 3 repeats → 60%
    expect(calcRepeatRate(CUSTOMERS)).toBe(60);
  });

  it('customer with exactly 2 orders counts as repeat', () => {
    const records: CustomerRecord[] = [
      { phone: 'a', totalOrders: 2, totalSpent: 2000, lastOrderAt: null },
      { phone: 'b', totalOrders: 1, totalSpent: 1000, lastOrderAt: null },
    ];
    expect(calcRepeatRate(records)).toBe(50);
  });
});

// ── calcAvgOrderValue ─────────────────────────────────────────────────────────

describe('calcAvgOrderValue — average order value', () => {
  it('returns 0 for an empty list', () => {
    expect(calcAvgOrderValue([])).toBe(0);
  });

  it('returns 0 when no orders have been placed', () => {
    const records: CustomerRecord[] = [
      { phone: 'a', totalOrders: 0, totalSpent: 0, lastOrderAt: null },
    ];
    expect(calcAvgOrderValue(records)).toBe(0);
  });

  it('computes correctly across multiple customers', () => {
    // total orders = 5+3+1+1+2 = 12; total spent = 27500; AOV = 27500/12 = 2291.67
    expect(calcAvgOrderValue(CUSTOMERS)).toBe(2291.67);
  });

  it('rounds correctly to 2 decimal places', () => {
    const records: CustomerRecord[] = [
      { phone: 'a', totalOrders: 3, totalSpent: 1000, lastOrderAt: null },
    ];
    // 1000 / 3 = 333.333... → 333.33
    expect(calcAvgOrderValue(records)).toBe(333.33);
  });
});

// ── countNewCustomers ─────────────────────────────────────────────────────────

describe('countNewCustomers — new customers within a window', () => {
  it('counts customers with 1 order within the last 30 days', () => {
    // CUSTOMERS[2]: 1 order, 5 days ago ✓
    // CUSTOMERS[3]: 1 order, 1 day ago  ✓
    expect(countNewCustomers(CUSTOMERS, 30)).toBe(2);
  });

  it('excludes repeat customers (totalOrders >= 2)', () => {
    const count = countNewCustomers(CUSTOMERS, 30);
    // VIP (5 orders), returning (3 orders), inactive-returning (2 orders) should NOT count
    expect(count).toBe(2);
  });

  it('returns 0 when no new customers within the window', () => {
    expect(countNewCustomers(CUSTOMERS, 0)).toBe(0);
  });

  it('excludes customers with null lastOrderAt', () => {
    const records: CustomerRecord[] = [
      { phone: 'a', totalOrders: 1, totalSpent: 500, lastOrderAt: null },
    ];
    expect(countNewCustomers(records, 30)).toBe(0);
  });
});

// ── countRepeatCustomers ──────────────────────────────────────────────────────

describe('countRepeatCustomers — repeat buyers within a window', () => {
  it('counts customers with 2+ orders whose last order is within 30 days', () => {
    // CUSTOMERS[0]: VIP, 2 days ago ✓
    // CUSTOMERS[1]: returning, 10 days ago ✓
    // CUSTOMERS[4]: inactive-returning, 90 days ago ✗ (outside window)
    expect(countRepeatCustomers(CUSTOMERS, 30)).toBe(2);
  });

  it('returns 0 when no repeat customers in window', () => {
    const records: CustomerRecord[] = [
      { phone: 'a', totalOrders: 1, totalSpent: 500, lastOrderAt: clvDaysAgo(1) },
    ];
    expect(countRepeatCustomers(records, 30)).toBe(0);
  });

  it('handles edge of window boundary', () => {
    // Customer with last order exactly 30 days ago (boundary inclusive with >=)
    const records: CustomerRecord[] = [
      { phone: 'a', totalOrders: 3, totalSpent: 6000, lastOrderAt: clvDaysAgo(30) },
    ];
    expect(countRepeatCustomers(records, 30)).toBe(1);
  });
});

// ── CLV in context of repeat rate ─────────────────────────────────────────────

describe('CLV + repeat rate combined analysis', () => {
  it('higher repeat rate correlates with higher per-customer revenue', () => {
    const lowRepeat: CustomerRecord[] = [
      { phone: 'a', totalOrders: 1, totalSpent: 500,  lastOrderAt: clvDaysAgo(5) },
      { phone: 'b', totalOrders: 1, totalSpent: 500,  lastOrderAt: clvDaysAgo(5) },
      { phone: 'c', totalOrders: 1, totalSpent: 500,  lastOrderAt: clvDaysAgo(5) },
      { phone: 'd', totalOrders: 1, totalSpent: 500,  lastOrderAt: clvDaysAgo(5) },
      { phone: 'e', totalOrders: 5, totalSpent: 5000, lastOrderAt: clvDaysAgo(1) },
    ];
    const highRepeat: CustomerRecord[] = [
      { phone: 'a', totalOrders: 4, totalSpent: 4000, lastOrderAt: clvDaysAgo(5) },
      { phone: 'b', totalOrders: 3, totalSpent: 3000, lastOrderAt: clvDaysAgo(5) },
      { phone: 'c', totalOrders: 2, totalSpent: 2000, lastOrderAt: clvDaysAgo(5) },
      { phone: 'd', totalOrders: 5, totalSpent: 5000, lastOrderAt: clvDaysAgo(1) },
      { phone: 'e', totalOrders: 2, totalSpent: 2500, lastOrderAt: clvDaysAgo(1) },
    ];

    const rateHigh = calcRepeatRate(highRepeat);
    const rateLow  = calcRepeatRate(lowRepeat);
    const clvHigh  = calcAvgCLV(highRepeat);
    const clvLow   = calcAvgCLV(lowRepeat);

    expect(rateHigh).toBeGreaterThan(rateLow);
    expect(clvHigh).toBeGreaterThan(clvLow);
  });
});
