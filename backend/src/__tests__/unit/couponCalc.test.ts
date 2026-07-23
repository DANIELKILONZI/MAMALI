/**
 * Unit tests for coupon discount calculation logic.
 *
 * These test the pure math: given a coupon definition and an order total,
 * does the discount amount come out correctly?
 *
 * No database is involved — we extract the calculation inline.
 */

// ── Pure discount calculator (extracted from coupons.ts) ─────────────────────
// Mirror the same logic from the route so we can unit-test it independently

function calculateDiscount(
  coupon: {
    discountType: 'percent' | 'fixed';
    discountValue: number;
  },
  orderTotal: number
): number {
  let discountAmount: number;
  if (coupon.discountType === 'percent') {
    discountAmount = Math.min(orderTotal, (orderTotal * coupon.discountValue) / 100);
  } else {
    discountAmount = Math.min(orderTotal, coupon.discountValue);
  }
  return Math.round(discountAmount); // whole shillings (KES)
}

// ── Coupon validation helpers ─────────────────────────────────────────────────

interface CouponData {
  isActive: boolean;
  expiresAt: Date | null;
  maxUses: number | null;
  usedCount: number;
  minOrderValue: number;
}

function validateCoupon(
  coupon: CouponData,
  orderTotal: number,
  now: Date = new Date()
): { valid: boolean; message?: string } {
  if (!coupon.isActive) return { valid: false, message: 'Invalid or inactive coupon code' };
  if (coupon.expiresAt && coupon.expiresAt < now) return { valid: false, message: 'Coupon has expired' };
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses)
    return { valid: false, message: 'Coupon usage limit reached' };
  if (orderTotal < coupon.minOrderValue)
    return {
      valid: false,
      message: `Minimum order value of KSh ${coupon.minOrderValue.toLocaleString()} required`,
    };
  return { valid: true };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Coupon — percent discount', () => {
  it('calculates 10% off correctly', () => {
    const discount = calculateDiscount({ discountType: 'percent', discountValue: 10 }, 1000);
    expect(discount).toBe(100);
  });

  it('calculates 25% off correctly', () => {
    const discount = calculateDiscount({ discountType: 'percent', discountValue: 25 }, 2000);
    expect(discount).toBe(500);
  });

  it('rounds to whole shillings', () => {
    // 33.33% of 1000 = 333.3 → rounds to 333 KES
    const discount = calculateDiscount({ discountType: 'percent', discountValue: 33.33 }, 1000);
    expect(discount).toBe(333);
  });

  it('cannot exceed order total (100% coupon on any order)', () => {
    const discount = calculateDiscount({ discountType: 'percent', discountValue: 100 }, 500);
    expect(discount).toBe(500); // capped at orderTotal
  });

  it('calculates small fractional percent correctly', () => {
    const discount = calculateDiscount({ discountType: 'percent', discountValue: 5 }, 3000);
    expect(discount).toBe(150);
  });
});

describe('Coupon — fixed amount discount', () => {
  it('deducts fixed amount when order total > discount value', () => {
    const discount = calculateDiscount({ discountType: 'fixed', discountValue: 200 }, 1000);
    expect(discount).toBe(200);
  });

  it('caps discount at order total when fixed amount > order total', () => {
    const discount = calculateDiscount({ discountType: 'fixed', discountValue: 500 }, 300);
    expect(discount).toBe(300); // cannot give more than order value
  });

  it('handles exact match (discount = order total)', () => {
    const discount = calculateDiscount({ discountType: 'fixed', discountValue: 1000 }, 1000);
    expect(discount).toBe(1000);
  });
});

describe('Coupon — validation', () => {
  const validCoupon: CouponData = {
    isActive: true,
    expiresAt: null,
    maxUses: null,
    usedCount: 0,
    minOrderValue: 500,
  };

  it('passes for a valid coupon with sufficient order total', () => {
    const result = validateCoupon(validCoupon, 600);
    expect(result.valid).toBe(true);
  });

  it('rejects an inactive coupon', () => {
    const result = validateCoupon({ ...validCoupon, isActive: false }, 600);
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/inactive/i);
  });

  it('rejects an expired coupon', () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // yesterday
    const result = validateCoupon({ ...validCoupon, expiresAt: pastDate }, 600);
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/expired/i);
  });

  it('accepts a coupon that expires in the future', () => {
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // tomorrow
    const result = validateCoupon({ ...validCoupon, expiresAt: futureDate }, 600);
    expect(result.valid).toBe(true);
  });

  it('rejects when usage limit is exactly reached', () => {
    const result = validateCoupon({ ...validCoupon, maxUses: 10, usedCount: 10 }, 600);
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/limit/i);
  });

  it('accepts when usage is below limit', () => {
    const result = validateCoupon({ ...validCoupon, maxUses: 10, usedCount: 9 }, 600);
    expect(result.valid).toBe(true);
  });

  it('rejects when order total is below minimum', () => {
    const result = validateCoupon(validCoupon, 499); // minOrderValue is 500
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/minimum/i);
  });

  it('accepts when order total equals exactly the minimum', () => {
    const result = validateCoupon(validCoupon, 500);
    expect(result.valid).toBe(true);
  });

  it('accepts unlimited-use coupon (maxUses = null) regardless of usedCount', () => {
    const result = validateCoupon({ ...validCoupon, maxUses: null, usedCount: 9999 }, 600);
    expect(result.valid).toBe(true);
  });
});
