/**
 * Unit tests for stock reduction and item price calculation logic.
 *
 * Mirrors the pure math extracted from the order creation transaction:
 *   price = product.price − (product.price × product.discount / 100)
 *   itemTotal = price × quantity
 *   stockAfter = stockBefore − quantity
 *
 * No database or HTTP layer involved.
 */

// ── Pure helpers (mirrored from routes/orders.ts) ────────────────────────────

function effectivePrice(price: number, discountPercent: number): number {
  return price - (price * discountPercent) / 100;
}

function itemTotal(price: number, discountPercent: number, quantity: number): number {
  return effectivePrice(price, discountPercent) * quantity;
}

function reduceStock(currentStock: number, quantity: number): number {
  if (quantity > currentStock) {
    throw Object.assign(new Error('Insufficient stock'), { statusCode: 400 });
  }
  return currentStock - quantity;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('effectivePrice — item price after product-level discount', () => {
  it('returns full price when discount is 0%', () => {
    expect(effectivePrice(1000, 0)).toBe(1000);
  });

  it('applies 10% discount correctly', () => {
    expect(effectivePrice(1000, 10)).toBe(900);
  });

  it('applies 50% discount correctly', () => {
    expect(effectivePrice(2000, 50)).toBe(1000);
  });

  it('applies 100% discount, resulting in 0', () => {
    expect(effectivePrice(500, 100)).toBe(0);
  });

  it('handles fractional discount percentages', () => {
    // 15.5% of KES 200 = KES 31 → effective = 169
    expect(effectivePrice(200, 15.5)).toBeCloseTo(169, 2);
  });

  it('handles zero price product', () => {
    expect(effectivePrice(0, 20)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('itemTotal — line item total (effective price × quantity)', () => {
  it('computes total for single unit with no discount', () => {
    expect(itemTotal(1500, 0, 1)).toBe(1500);
  });

  it('computes total for multiple units with no discount', () => {
    expect(itemTotal(1500, 0, 3)).toBe(4500);
  });

  it('computes total with product discount applied per unit', () => {
    // KES 1000 × (1 − 20%) = KES 800 × 2 = KES 1600
    expect(itemTotal(1000, 20, 2)).toBe(1600);
  });

  it('computes total for 10 units at full price', () => {
    expect(itemTotal(250, 0, 10)).toBe(2500);
  });

  it('computes total with large discount for many units', () => {
    // KES 500 × (1 − 50%) = KES 250 × 4 = KES 1000
    expect(itemTotal(500, 50, 4)).toBe(1000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('reduceStock — stock deduction on order creation', () => {
  it('deducts the ordered quantity from stock', () => {
    expect(reduceStock(20, 5)).toBe(15);
  });

  it('reduces stock to zero when ordering all remaining units', () => {
    expect(reduceStock(10, 10)).toBe(0);
  });

  it('deducts 1 unit correctly', () => {
    expect(reduceStock(100, 1)).toBe(99);
  });

  it('throws when quantity exceeds available stock', () => {
    expect(() => reduceStock(5, 6)).toThrow('Insufficient stock');
  });

  it('throws with statusCode 400 when out of stock', () => {
    try {
      reduceStock(2, 3);
      fail('should have thrown');
    } catch (err: unknown) {
      expect((err as { statusCode: number }).statusCode).toBe(400);
    }
  });

  it('does NOT throw when quantity equals exactly available stock', () => {
    expect(() => reduceStock(7, 7)).not.toThrow();
  });

  it('throws when stock is 0 and any quantity requested', () => {
    expect(() => reduceStock(0, 1)).toThrow('Insufficient stock');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('multi-item order stock reduction', () => {
  interface CartItem { productId: string; quantity: number }
  interface StockMap { [productId: string]: number }

  function reduceAllStock(cart: CartItem[], stock: StockMap): StockMap {
    // First pass: validate
    for (const item of cart) {
      const avail = stock[item.productId] ?? 0;
      if (avail < item.quantity) {
        throw Object.assign(
          new Error(`Insufficient stock for product ${item.productId}`),
          { statusCode: 400, productId: item.productId }
        );
      }
    }
    // Second pass: deduct
    const updated = { ...stock };
    for (const item of cart) {
      updated[item.productId] -= item.quantity;
    }
    return updated;
  }

  it('deducts stock for all items in a multi-product cart', () => {
    const stock = { A: 10, B: 5 };
    const result = reduceAllStock(
      [{ productId: 'A', quantity: 3 }, { productId: 'B', quantity: 2 }],
      stock
    );
    expect(result.A).toBe(7);
    expect(result.B).toBe(3);
  });

  it('throws if ANY product in the cart has insufficient stock', () => {
    const stock = { A: 10, B: 1 };
    expect(() =>
      reduceAllStock(
        [{ productId: 'A', quantity: 3 }, { productId: 'B', quantity: 2 }],
        stock
      )
    ).toThrow('Insufficient stock');
  });

  it('does not partially deduct when one item fails', () => {
    const stock = { A: 10, B: 1 };
    try {
      reduceAllStock(
        [{ productId: 'A', quantity: 3 }, { productId: 'B', quantity: 2 }],
        stock
      );
    } catch {
      // Stock A must NOT have been decremented
      expect(stock.A).toBe(10);
      expect(stock.B).toBe(1);
    }
  });
});
