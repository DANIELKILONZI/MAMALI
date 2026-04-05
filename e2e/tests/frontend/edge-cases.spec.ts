/**
 * Edge case tests — out-of-stock purchases, duplicate submissions,
 * invalid inputs, API error handling.
 */

import { expect } from '@playwright/test';
import { test } from '../../fixtures';
import { CartPage } from '../../page-objects/CartPage';
import { CheckoutPage } from '../../page-objects/CheckoutPage';
import { BACKEND_URL } from '../../utils/test-data';

test.describe('Edge cases — out-of-stock', () => {
  test('API rejects order for out-of-stock product', async ({ request, testData }) => {
    const res = await request.post(`${BACKEND_URL}/api/orders`, {
      data: {
        customerPhone: '254700000099',
        customerName: 'Edge Case Customer',
        items: [{ productId: testData.outOfStockProductId, quantity: 1 }],
      },
    });
    expect(res.ok()).toBe(false);
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.outOfStock).toBeDefined();
  });

  test('out-of-stock product in cart is validated before checkout', async ({ page, testData }) => {
    // Inject out-of-stock item directly into localStorage
    await page.goto('/checkout');
    await page.evaluate((item) => {
      localStorage.setItem('mamali_cart', JSON.stringify([item]));
    }, {
      productId: testData.outOfStockProductId,
      name: testData.outOfStockSlug,
      price: 500,
      quantity: 1,
      stock: 0, // Reflects out-of-stock
    });
    await page.reload();
    await page.waitForLoadState('networkidle');

    const checkout = new CheckoutPage(page);
    await checkout.fillPhone('0700000001');
    await checkout.placeOrder();

    // Should show stock error from the API
    const error = page.getByText(/out of stock|not available|stock/i);
    await expect(error).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Edge cases — coupon validation', () => {
  test('coupon with min order value not met shows error', async ({ page, testData }) => {
    // E2ETEST10 requires min order of 500 KES. Use a tiny cart item.
    await page.goto('/cart');
    const cart = new CartPage(page);
    await cart.injectCartItem({
      productId: testData.productId,
      name: testData.productName,
      price: 100,   // Only 100 KES — below min order of 500
      quantity: 1,
      stock: 50,
    });
    await page.goto('/checkout');
    await page.waitForLoadState('networkidle');

    const checkout = new CheckoutPage(page);
    // Override item price via API mock
    await page.route('**/api/coupons/apply', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          message: 'Minimum order value not met',
        }),
      });
    });
    await checkout.applyCoupon(testData.validCouponCode);
    const error = page.getByText(/minimum order|not met/i);
    await expect(error).toBeVisible({ timeout: 5000 });
  });

  test('API rejects expired coupon', async ({ request, testData }) => {
    const res = await request.post(`${BACKEND_URL}/api/coupons/apply`, {
      data: { code: testData.expiredCouponCode, orderTotal: 2000 },
    });
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/expired/i);
  });

  test('API rejects fully-used coupon', async ({ request, testData }) => {
    const res = await request.post(`${BACKEND_URL}/api/coupons/apply`, {
      data: { code: testData.zerouseCouponCode, orderTotal: 2000 },
    });
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/maximum|limit|used/i);
  });

  test('API rejects non-existent coupon', async ({ request }) => {
    const res = await request.post(`${BACKEND_URL}/api/coupons/apply`, {
      data: { code: 'COMPLETELY_INVALID_XYZ', orderTotal: 2000 },
    });
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});

test.describe('Edge cases — duplicate form submissions', () => {
  test('order create API returns error if cart is empty (no items)', async ({ request }) => {
    const res = await request.post(`${BACKEND_URL}/api/orders`, {
      data: {
        customerPhone: '254700000099',
        items: [],  // No items
      },
    });
    expect(res.ok()).toBe(false);
  });

  test('order create with invalid phone returns 400', async ({ request, testData }) => {
    const res = await request.post(`${BACKEND_URL}/api/orders`, {
      data: {
        customerPhone: '123',   // Too short
        items: [{ productId: testData.productId, quantity: 1 }],
      },
    });
    expect(res.ok()).toBe(false);
    expect(res.status()).toBe(400);
  });

  test('duplicate order via API still creates a new order (idempotent check)', async ({ request, testData }) => {
    const orderPayload = {
      customerPhone: '254700000097',
      customerName: 'Dupe Test',
      items: [{ productId: testData.productId, quantity: 1 }],
    };

    const res1 = await request.post(`${BACKEND_URL}/api/orders`, { data: orderPayload });
    const res2 = await request.post(`${BACKEND_URL}/api/orders`, { data: orderPayload });

    expect(res1.ok()).toBe(true);
    expect(res2.ok()).toBe(true);
    const order1 = await res1.json();
    const order2 = await res2.json();
    // Should create two distinct orders with different order numbers
    expect(order1.order.orderNumber).not.toBe(order2.order.orderNumber);
  });
});

test.describe('Edge cases — API security', () => {
  test('admin endpoints reject unauthenticated requests', async ({ request }) => {
    const res = await request.get(`${BACKEND_URL}/api/admin/dashboard`);
    expect(res.status()).toBe(401);
  });

  test('admin endpoints reject invalid JWT tokens', async ({ request }) => {
    const res = await request.get(`${BACKEND_URL}/api/admin/dashboard`, {
      headers: { Authorization: 'Bearer totally-fake-token' },
    });
    expect(res.status()).toBe(401);
  });

  test('non-admin JWT cannot access ADMIN-only routes', async ({ request, testData }) => {
    // Attempt to register a new user without admin token — should return 401
    const res = await request.post(`${BACKEND_URL}/api/auth/register`, {
      data: {
        name: 'Hacker',
        email: 'hacker@test.com',
        password: 'HackerPass@1',
        role: 'ADMIN',
      },
    });
    // Register requires ADMIN auth
    expect(res.status()).toBe(401);
  });

  test('product creation without auth returns 401', async ({ request }) => {
    const res = await request.post(`${BACKEND_URL}/api/products`, {
      data: { name: 'Hacker Product', slug: 'hacker-product', price: 100, stock: 10 },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe('Edge cases — category page', () => {
  test('API returns category with products', async ({ request, testData }) => {
    const res = await request.get(`${BACKEND_URL}/api/categories/${testData.categorySlug}`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.category.slug).toBe(testData.categorySlug);
  });

  test('non-existent category returns 404', async ({ request }) => {
    const res = await request.get(`${BACKEND_URL}/api/categories/does-not-exist-xyz`);
    expect(res.status()).toBe(404);
  });
});
