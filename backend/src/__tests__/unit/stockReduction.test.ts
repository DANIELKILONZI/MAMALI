/**
 * Unit tests for stock reduction logic and order total calculations.
 *
 * Tests the pure math extracted from the orders route:
 *  - effective item price after product-level discount
 *  - order subtotal aggregation
 *  - stock sufficiency check
 *  - net order total after coupon discount
 *
 * No database is involved — all functions are tested in isolation.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProductInput {
  id: string;
  price: number;
  discount: number; // percentage (0–100)
  stock: number;
  isActive: boolean;
}

interface OrderItemInput {
  productId: string;
  quantity: number;
}

interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  total: number;
}

// ── Pure helpers (mirror logic from routes/orders.ts) ─────────────────────────

/** Effective price after product-level percentage discount. */
function effectivePrice(product: Pick<ProductInput, 'price' | 'discount'>): number {
  return product.price - (product.price * product.discount) / 100;
}

/** Build order items array from product catalogue + requested items. */
function buildOrderItems(
  products: ProductInput[],
  items: OrderItemInput[]
): OrderItem[] {
  return items.map((item) => {
    const product = products.find((p) => p.id === item.productId)!;
    const price = effectivePrice(product);
    return {
      productId: item.productId,
      name: product.id, // using id as name proxy in tests
      price,
      quantity: item.quantity,
      total: price * item.quantity,
    };
  });
}

/** Sum of all order item totals. */
function calcSubtotal(orderItems: OrderItem[]): number {
  return orderItems.reduce((s, i) => s + i.total, 0);
}

/**
 * Check whether all requested items can be fulfilled given current stock.
 * Returns the list of product IDs with insufficient stock (empty = all OK).
 */
function checkStock(products: ProductInput[], items: OrderItemInput[]): string[] {
  const outOfStock: string[] = [];
  for (const item of items) {
    const product = products.find((p) => p.id === item.productId);
    if (!product || product.stock < item.quantity) {
      outOfStock.push(item.productId);
    }
  }
  return outOfStock;
}

/** Simulate atomic stock decrement (returns new stock map). */
function decrementStock(
  stocks: Map<string, number>,
  items: OrderItemInput[]
): { success: boolean; newStocks: Map<string, number>; oversold: string[] } {
  const newStocks = new Map(stocks);
  const oversold: string[] = [];

  for (const item of items) {
    const current = newStocks.get(item.productId) ?? 0;
    if (current < item.quantity) {
      oversold.push(item.productId);
    } else {
      newStocks.set(item.productId, current - item.quantity);
    }
  }

  return { success: oversold.length === 0, newStocks, oversold };
}

/** Net order total after coupon discount is applied. */
function calcOrderTotal(subtotal: number, discountAmount: number): number {
  return Math.max(0, subtotal - discountAmount);
}

// ── Sample data ───────────────────────────────────────────────────────────────

const PRODUCTS: ProductInput[] = [
  { id: 'p1', price: 1000, discount: 0,  stock: 10, isActive: true },
  { id: 'p2', price: 2000, discount: 10, stock: 5,  isActive: true },
  { id: 'p3', price: 500,  discount: 0,  stock: 0,  isActive: true },  // out of stock
  { id: 'p4', price: 3000, discount: 25, stock: 3,  isActive: true },
];

// ── effectivePrice ────────────────────────────────────────────────────────────

describe('effectivePrice — product-level discount', () => {
  it('returns full price when discount is 0', () => {
    expect(effectivePrice({ price: 1000, discount: 0 })).toBe(1000);
  });

  it('applies 10% product discount correctly', () => {
    expect(effectivePrice({ price: 2000, discount: 10 })).toBe(1800);
  });

  it('applies 25% product discount correctly', () => {
    expect(effectivePrice({ price: 3000, discount: 25 })).toBe(2250);
  });

  it('100% discount results in price of 0', () => {
    expect(effectivePrice({ price: 500, discount: 100 })).toBe(0);
  });

  it('fractional discount is computed accurately', () => {
    // 15% of 1200 = 180, effective = 1020
    expect(effectivePrice({ price: 1200, discount: 15 })).toBe(1020);
  });
});

// ── buildOrderItems ───────────────────────────────────────────────────────────

describe('buildOrderItems — line item totals', () => {
  it('computes correct total for a single item with no discount', () => {
    const items = buildOrderItems(PRODUCTS, [{ productId: 'p1', quantity: 3 }]);
    expect(items[0].total).toBe(3000); // 1000 × 3
  });

  it('applies product-level discount before computing total', () => {
    const items = buildOrderItems(PRODUCTS, [{ productId: 'p2', quantity: 2 }]);
    expect(items[0].price).toBe(1800); // 2000 - 10%
    expect(items[0].total).toBe(3600); // 1800 × 2
  });

  it('handles multiple line items', () => {
    const items = buildOrderItems(PRODUCTS, [
      { productId: 'p1', quantity: 1 },
      { productId: 'p2', quantity: 1 },
    ]);
    expect(items).toHaveLength(2);
    expect(items[0].total).toBe(1000);
    expect(items[1].total).toBe(1800);
  });
});

// ── calcSubtotal ──────────────────────────────────────────────────────────────

describe('calcSubtotal — order subtotal aggregation', () => {
  it('sums all line item totals', () => {
    const items = buildOrderItems(PRODUCTS, [
      { productId: 'p1', quantity: 2 },
      { productId: 'p2', quantity: 1 },
    ]);
    expect(calcSubtotal(items)).toBe(3800); // 2000 + 1800
  });

  it('returns 0 for an empty items list', () => {
    expect(calcSubtotal([])).toBe(0);
  });

  it('handles single item', () => {
    const items = buildOrderItems(PRODUCTS, [{ productId: 'p4', quantity: 1 }]);
    expect(calcSubtotal(items)).toBe(2250); // 3000 - 25%
  });
});

// ── checkStock ────────────────────────────────────────────────────────────────

describe('checkStock — availability validation', () => {
  it('returns empty array when all items are available', () => {
    const out = checkStock(PRODUCTS, [
      { productId: 'p1', quantity: 5 },
      { productId: 'p2', quantity: 2 },
    ]);
    expect(out).toHaveLength(0);
  });

  it('flags an out-of-stock product', () => {
    const out = checkStock(PRODUCTS, [{ productId: 'p3', quantity: 1 }]);
    expect(out).toContain('p3');
  });

  it('flags a product when quantity requested exceeds stock', () => {
    const out = checkStock(PRODUCTS, [{ productId: 'p1', quantity: 11 }]);
    expect(out).toContain('p1');
  });

  it('does NOT flag a product when quantity equals exactly the available stock', () => {
    const out = checkStock(PRODUCTS, [{ productId: 'p1', quantity: 10 }]);
    expect(out).toHaveLength(0);
  });

  it('returns all failing products when multiple items are out of stock', () => {
    const out = checkStock(PRODUCTS, [
      { productId: 'p3', quantity: 1 },   // stock = 0
      { productId: 'p1', quantity: 999 }, // stock = 10
    ]);
    expect(out).toContain('p3');
    expect(out).toContain('p1');
  });

  it('flags a non-existent product id', () => {
    const out = checkStock(PRODUCTS, [{ productId: 'does-not-exist', quantity: 1 }]);
    expect(out).toContain('does-not-exist');
  });
});

// ── decrementStock ────────────────────────────────────────────────────────────

describe('decrementStock — atomic stock deduction', () => {
  function makeStocks(): Map<string, number> {
    return new Map([['p1', 10], ['p2', 5], ['p3', 0]]);
  }

  it('decrements stock for a valid order', () => {
    const { success, newStocks } = decrementStock(makeStocks(), [
      { productId: 'p1', quantity: 3 },
    ]);
    expect(success).toBe(true);
    expect(newStocks.get('p1')).toBe(7);
  });

  it('allows buying the last unit (stock goes to 0)', () => {
    const { success, newStocks } = decrementStock(makeStocks(), [
      { productId: 'p2', quantity: 5 },
    ]);
    expect(success).toBe(true);
    expect(newStocks.get('p2')).toBe(0);
  });

  it('rejects order when stock would go negative', () => {
    const { success, oversold } = decrementStock(makeStocks(), [
      { productId: 'p1', quantity: 11 },
    ]);
    expect(success).toBe(false);
    expect(oversold).toContain('p1');
  });

  it('rejects out-of-stock item (stock = 0)', () => {
    const { success, oversold } = decrementStock(makeStocks(), [
      { productId: 'p3', quantity: 1 },
    ]);
    expect(success).toBe(false);
    expect(oversold).toContain('p3');
  });

  it('processes multiple items atomically — all-or-nothing detection', () => {
    // p1 ok, p3 fails → both tracked in oversold
    const { success, oversold } = decrementStock(makeStocks(), [
      { productId: 'p1', quantity: 2 },
      { productId: 'p3', quantity: 1 },
    ]);
    expect(success).toBe(false);
    expect(oversold).toContain('p3');
    expect(oversold).not.toContain('p1');
  });

  it('leaves stock map unchanged for failed items', () => {
    const stocks = makeStocks();
    const { newStocks } = decrementStock(stocks, [
      { productId: 'p1', quantity: 2 },  // succeeds
      { productId: 'p3', quantity: 1 },  // fails
    ]);
    // p1 WAS decremented (partial success tracked per item)
    // oversold list signals the caller to roll back
    expect(newStocks.get('p3')).toBe(0); // unchanged
  });
});

// ── calcOrderTotal ────────────────────────────────────────────────────────────

describe('calcOrderTotal — net total after discount', () => {
  it('subtracts coupon discount from subtotal', () => {
    expect(calcOrderTotal(1500, 150)).toBe(1350);
  });

  it('returns subtotal unchanged when discount is 0', () => {
    expect(calcOrderTotal(2000, 0)).toBe(2000);
  });

  it('returns 0 when discount equals the subtotal', () => {
    expect(calcOrderTotal(1000, 1000)).toBe(0);
  });

  it('never returns a negative total (discount > subtotal edge case)', () => {
    expect(calcOrderTotal(500, 600)).toBe(0);
  });

  it('handles decimal amounts correctly', () => {
    expect(calcOrderTotal(1333.33, 133.33)).toBeCloseTo(1200, 1);
  });
});

// ── End-to-end order total computation ───────────────────────────────────────

describe('Full order total pipeline', () => {
  it('computes the correct net total for a mixed order with discount', () => {
    // p1: 1000 × 2 = 2000
    // p4: 3000 * (1-0.25) = 2250 × 1 = 2250
    // subtotal = 4250
    // coupon 10% off = 425
    // net = 3825
    const orderItems = buildOrderItems(PRODUCTS, [
      { productId: 'p1', quantity: 2 },
      { productId: 'p4', quantity: 1 },
    ]);
    const subtotal = calcSubtotal(orderItems);
    const discount = Math.round(subtotal * 0.1 * 100) / 100; // 10% coupon
    const net = calcOrderTotal(subtotal, discount);

    expect(subtotal).toBe(4250);
    expect(discount).toBe(425);
    expect(net).toBe(3825);
  });
});
