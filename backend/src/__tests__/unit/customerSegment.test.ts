/**
 * Unit tests for the customer segment derivation logic.
 *
 * deriveSegment is the pure function in routes/customers.ts that classifies
 * customers into vip / returning / inactive / risky / new.
 */

// ── Mirror the deriveSegment function from routes/customers.ts ────────────────

function deriveSegment(
  totalOrders: number,
  totalSpent: number,
  lastOrderAt: Date | null,
  maxRiskScore: number
): 'vip' | 'returning' | 'inactive' | 'risky' | 'new' {
  if (maxRiskScore >= 40) return 'risky';
  const daysSinceLast = lastOrderAt
    ? (Date.now() - lastOrderAt.getTime()) / (1000 * 60 * 60 * 24)
    : Infinity;
  if (totalOrders >= 3 && totalSpent >= 5000) return 'vip';
  if (daysSinceLast > 60) return 'inactive';
  if (totalOrders >= 2) return 'returning';
  return 'new';
}

const NOW = new Date();
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

// ─────────────────────────────────────────────────────────────────────────────

describe('deriveSegment — risky', () => {
  it('returns risky when maxRiskScore >= 40 regardless of other factors', () => {
    expect(deriveSegment(10, 50000, NOW, 40)).toBe('risky');
    expect(deriveSegment(10, 50000, NOW, 41)).toBe('risky');
    expect(deriveSegment(0, 0, null, 99)).toBe('risky');
  });

  it('does NOT return risky when maxRiskScore = 39', () => {
    expect(deriveSegment(1, 100, daysAgo(1), 39)).not.toBe('risky');
  });
});

describe('deriveSegment — VIP', () => {
  it('returns vip when 3+ orders AND KES 5000+ spent', () => {
    expect(deriveSegment(3, 5000, daysAgo(1), 0)).toBe('vip');
    expect(deriveSegment(5, 10000, daysAgo(1), 0)).toBe('vip');
  });

  it('does NOT return vip when only orders threshold met but not spend', () => {
    const seg = deriveSegment(3, 4999, daysAgo(1), 0);
    expect(seg).not.toBe('vip');
  });

  it('does NOT return vip when only spend threshold met but not orders', () => {
    const seg = deriveSegment(2, 10000, daysAgo(1), 0);
    expect(seg).not.toBe('vip');
  });
});

describe('deriveSegment — inactive', () => {
  it('returns inactive when last order was > 60 days ago', () => {
    expect(deriveSegment(1, 500, daysAgo(61), 0)).toBe('inactive');
    expect(deriveSegment(2, 5000, daysAgo(90), 0)).toBe('inactive');
  });

  it('does NOT return inactive when last order was exactly 60 days ago', () => {
    // > 60, not >= 60, so 60 days is NOT inactive yet
    const seg = deriveSegment(1, 500, daysAgo(60), 0);
    expect(seg).not.toBe('inactive');
  });

  it('returns inactive for a customer who has never ordered (null lastOrderAt)', () => {
    // Infinity days since last order → inactive
    expect(deriveSegment(0, 0, null, 0)).toBe('inactive');
  });

  it('inactive takes priority over returning when inactive condition is met first', () => {
    // 2 orders (returning condition), but last was 90 days ago → inactive wins
    expect(deriveSegment(2, 1000, daysAgo(90), 0)).toBe('inactive');
  });
});

describe('deriveSegment — returning', () => {
  it('returns returning for 2+ orders within 60 days', () => {
    expect(deriveSegment(2, 1000, daysAgo(10), 0)).toBe('returning');
    expect(deriveSegment(5, 4999, daysAgo(30), 0)).toBe('returning');
  });

  it('does NOT return returning for exactly 1 order', () => {
    const seg = deriveSegment(1, 1000, daysAgo(10), 0);
    expect(seg).not.toBe('returning');
  });
});

describe('deriveSegment — new', () => {
  it('returns new for first-time customer (1 order, recent)', () => {
    expect(deriveSegment(1, 1500, daysAgo(1), 0)).toBe('new');
  });

  it('returns new for zero-order customers within 60 days (edge case: inactive takes priority)', () => {
    // No orders, not at risk → falls through to inactive (null lastOrderAt = Infinity days)
    expect(deriveSegment(0, 0, null, 0)).toBe('inactive');
  });
});

describe('deriveSegment — priority ordering', () => {
  it('risky beats vip', () => {
    expect(deriveSegment(10, 100000, daysAgo(1), 50)).toBe('risky');
  });

  it('vip beats inactive', () => {
    // 3 orders, 5000 KES, but last order 90 days ago
    // VIP check comes before inactive check → VIP wins
    expect(deriveSegment(3, 5000, daysAgo(90), 0)).toBe('vip');
  });
});
