/**
 * Unit tests for order total calculation logic.
 *
 * Mirrors the math extracted from the order creation transaction in routes/orders.ts:
 *   subtotal = Σ (effectivePrice(product.price, product.discount) × quantity)
 *   discountAmount = calculated from coupon (percent or fixed, capped at subtotal)
 *   total = subtotal − discountAmount
 *
 * No database involved — pure function tests.
 */

// ── Types mirrored from the route ────────────────────────────────────────────

type DiscountType = 'percent' | 'fixed';

interface OrderItem {
  price: number;          // effective price (after product discount)
  quantity: number;
  total: number;          // price × quantity
}

interface CouponLike {
  discountType: DiscountType;
  discountValue: number;
  minOrderValue: number;
  maxUses: number | null;
  usedCount: number;
  isActive: boolean;
  expiresAt?: Date | null;
}

// ── Pure helpers (mirrored from routes/orders.ts) ────────────────────────────

function buildOrderItem(productPrice: number, productDiscount: number, quantity: number): OrderItem {
  const price = productPrice - (productPrice * productDiscount) / 100;
  return { price, quantity, total: price * quantity };
}

function computeSubtotal(items: OrderItem[]): number {
  return items.reduce((s, i) => s + i.total, 0);
}

function computeDiscount(coupon: CouponLike, subtotal: number): number {
  if (!coupon.isActive) return 0;
  if (coupon.expiresAt && coupon.expiresAt < new Date()) return 0;
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) return 0;
  if (subtotal < coupon.minOrderValue) return 0;

  let discountAmount: number;
  if (coupon.discountType === 'percent') {
    discountAmount = Math.min(subtotal, (subtotal * coupon.discountValue) / 100);
  } else {
    discountAmount = Math.min(subtotal, coupon.discountValue);
  }
  return Math.round(discountAmount * 100) / 100;
}

function computeOrderTotal(items: OrderItem[], coupon?: CouponLike): {
  subtotal: number;
  discountAmount: number;
  total: number;
} {
  const subtotal = computeSubtotal(items);
  const discountAmount = coupon ? computeDiscount(coupon, subtotal) : 0;
  return { subtotal, discountAmount, total: subtotal - discountAmount };
}

// ─────────────────────────────────────────────────────────────────────────────

const validCoupon10pct: CouponLike = {
  discountType: 'percent',
  discountValue: 10,
  minOrderValue: 500,
  maxUses: 100,
  usedCount: 0,
  isActive: true,
  expiresAt: null,
};

describe('buildOrderItem — effective price per line item', () => {
  it('computes line total at full price (no product discount)', () => {
    const item = buildOrderItem(1500, 0, 2);
    expect(item.price).toBe(1500);
    expect(item.total).toBe(3000);
  });

  it('applies product-level discount before computing line total', () => {
    const item = buildOrderItem(1000, 20, 3);
    expect(item.price).toBe(800);
    expect(item.total).toBe(2400);
  });

  it('handles a 100% product discount resulting in zero line total', () => {
    const item = buildOrderItem(500, 100, 5);
    expect(item.price).toBe(0);
    expect(item.total).toBe(0);
  });
});

describe('computeSubtotal — sum of all line item totals', () => {
  it('is zero for an empty cart', () => {
    expect(computeSubtotal([])).toBe(0);
  });

  it('equals item total for a single-item cart', () => {
    const item = buildOrderItem(1500, 0, 1);
    expect(computeSubtotal([item])).toBe(1500);
  });

  it('sums multiple items correctly', () => {
    const items = [
      buildOrderItem(1000, 0, 2),   // 2000
      buildOrderItem(500, 0, 3),    // 1500
      buildOrderItem(250, 20, 4),   // 200 × 4 = 800
    ];
    expect(computeSubtotal(items)).toBe(4300);
  });

  it('handles mixed discounted and full-price items', () => {
    const items = [
      buildOrderItem(2000, 50, 1),  // 1000
      buildOrderItem(1000, 0, 1),   // 1000
    ];
    expect(computeSubtotal(items)).toBe(2000);
  });
});

describe('computeDiscount — coupon discount against subtotal', () => {
  it('applies 10% percent coupon correctly', () => {
    expect(computeDiscount(validCoupon10pct, 1000)).toBe(100);
  });

  it('applies a fixed KES 200 coupon', () => {
    const fixed: CouponLike = {
      ...validCoupon10pct,
      discountType: 'fixed',
      discountValue: 200,
      minOrderValue: 300,
    };
    expect(computeDiscount(fixed, 1000)).toBe(200);
  });

  it('caps fixed discount at the subtotal', () => {
    const fixed: CouponLike = {
      ...validCoupon10pct,
      discountType: 'fixed',
      discountValue: 500,
      minOrderValue: 0,
    };
    // Subtotal is only 300 — discount cannot exceed subtotal
    expect(computeDiscount(fixed, 300)).toBe(300);
  });

  it('caps percent discount at the subtotal (100% coupon)', () => {
    const full: CouponLike = {
      ...validCoupon10pct,
      discountType: 'percent',
      discountValue: 100,
      minOrderValue: 0,
    };
    expect(computeDiscount(full, 750)).toBe(750);
  });

  it('returns 0 for inactive coupon', () => {
    const inactive = { ...validCoupon10pct, isActive: false };
    expect(computeDiscount(inactive, 1000)).toBe(0);
  });

  it('returns 0 for expired coupon', () => {
    const expired = { ...validCoupon10pct, expiresAt: new Date('2000-01-01') };
    expect(computeDiscount(expired, 1000)).toBe(0);
  });

  it('returns 0 when usage limit has been reached', () => {
    const maxed = { ...validCoupon10pct, maxUses: 5, usedCount: 5 };
    expect(computeDiscount(maxed, 1000)).toBe(0);
  });

  it('returns 0 when subtotal is below minimum order value', () => {
    expect(computeDiscount(validCoupon10pct, 400)).toBe(0); // min is 500
  });

  it('applies discount when subtotal equals minimum exactly', () => {
    expect(computeDiscount(validCoupon10pct, 500)).toBe(50);
  });

  it('allows unlimited-use coupon (maxUses = null) regardless of usedCount', () => {
    const unlimited = { ...validCoupon10pct, maxUses: null, usedCount: 9999 };
    expect(computeDiscount(unlimited, 1000)).toBeGreaterThan(0);
  });

  it('rounds discount to 2 decimal places', () => {
    // 10% of KES 333 = KES 33.3 → rounded to 33.3 (use zero minOrderValue)
    const noMin = { ...validCoupon10pct, minOrderValue: 0 };
    expect(computeDiscount(noMin, 333)).toBe(33.3);
  });
});

describe('computeOrderTotal — full order total pipeline', () => {
  it('calculates total without any coupon', () => {
    const items = [buildOrderItem(1500, 0, 2)]; // subtotal = 3000
    const result = computeOrderTotal(items);
    expect(result.subtotal).toBe(3000);
    expect(result.discountAmount).toBe(0);
    expect(result.total).toBe(3000);
  });

  it('calculates total with 10% percent coupon applied', () => {
    const items = [buildOrderItem(1500, 0, 1)]; // subtotal = 1500
    const result = computeOrderTotal(items, validCoupon10pct);
    expect(result.subtotal).toBe(1500);
    expect(result.discountAmount).toBe(150);
    expect(result.total).toBe(1350);
  });

  it('calculates total with fixed coupon applied', () => {
    const fixed: CouponLike = {
      ...validCoupon10pct,
      discountType: 'fixed',
      discountValue: 300,
      minOrderValue: 0,
    };
    const items = [buildOrderItem(1000, 0, 2)]; // subtotal = 2000
    const result = computeOrderTotal(items, fixed);
    expect(result.subtotal).toBe(2000);
    expect(result.discountAmount).toBe(300);
    expect(result.total).toBe(1700);
  });

  it('returns full subtotal as total when coupon is below minimum', () => {
    const items = [buildOrderItem(200, 0, 2)]; // subtotal = 400 < min 500
    const result = computeOrderTotal(items, validCoupon10pct);
    expect(result.discountAmount).toBe(0);
    expect(result.total).toBe(400);
  });

  it('handles product discount + coupon discount stacked correctly', () => {
    // Product: KES 1000 with 20% product discount → effective KES 800 × 2 = 1600
    const items = [buildOrderItem(1000, 20, 2)];
    // Coupon: 10% off min order 500 → 10% of 1600 = 160
    const result = computeOrderTotal(items, validCoupon10pct);
    expect(result.subtotal).toBe(1600);
    expect(result.discountAmount).toBe(160);
    expect(result.total).toBe(1440);
  });

  it('total is never negative even with a large coupon', () => {
    const bigCoupon: CouponLike = {
      ...validCoupon10pct,
      discountType: 'fixed',
      discountValue: 9999,
      minOrderValue: 0,
    };
    const items = [buildOrderItem(100, 0, 1)]; // subtotal = 100
    const result = computeOrderTotal(items, bigCoupon);
    expect(result.total).toBe(0);
    expect(result.discountAmount).toBe(100); // capped at subtotal
  });
});
