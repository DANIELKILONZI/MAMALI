/**
 * E2E tests for blocked customer checkout rejection.
 *
 * These tests:
 *  1. Block a customer via the admin API
 *  2. Verify the checkout endpoint returns 403
 *  3. Clean up the block afterwards
 *
 * Because blocked customer enforcement happens at the API level (not UI),
 * most assertions here are via direct request calls.
 */

import { expect } from '@playwright/test';
import { test } from '../../fixtures';
import { CartPage } from '../../page-objects/CartPage';
import { CheckoutPage } from '../../page-objects/CheckoutPage';
import { BACKEND_URL } from '../../utils/test-data';

const BLOCKED_PHONE = '254700009901';

test.describe('Blocked customer — API level rejection', () => {
  test.beforeAll(async ({ request, adminToken: _token }) => {
    // Block the phone via admin API
    // We use request.post but need the admin token from the fixture; 
    // access it by using a test-level hook instead.
  });

  test('blocked customer API call returns 403', async ({ request, testData, adminToken }) => {
    // 1. Block the phone
    const blockRes = await request.post(
      `${BACKEND_URL}/api/admin/customers/${encodeURIComponent(BLOCKED_PHONE)}/block`,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { reason: 'E2E test block' },
      }
    );
    expect(blockRes.ok()).toBe(true);

    // 2. Attempt to place an order
    const orderRes = await request.post(`${BACKEND_URL}/api/orders`, {
      data: {
        customerPhone: BLOCKED_PHONE,
        customerName: 'Blocked Customer',
        items: [{ productId: testData.productId, quantity: 1 }],
      },
    });
    expect(orderRes.status()).toBe(403);
    const body = await orderRes.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/not allowed/i);

    // 3. Unblock the phone (cleanup)
    await request.delete(
      `${BACKEND_URL}/api/admin/customers/${encodeURIComponent(BLOCKED_PHONE)}/block`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
  });

  test('unblocked customer can place an order again', async ({ request, testData, adminToken }) => {
    const phone = '254700009902';

    // Block then immediately unblock
    await request.post(
      `${BACKEND_URL}/api/admin/customers/${encodeURIComponent(phone)}/block`,
      { headers: { Authorization: `Bearer ${adminToken}` }, data: { reason: 'temp block' } }
    );
    await request.delete(
      `${BACKEND_URL}/api/admin/customers/${encodeURIComponent(phone)}/block`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    // Now ordering should work
    const orderRes = await request.post(`${BACKEND_URL}/api/orders`, {
      data: {
        customerPhone: phone,
        customerName: 'Previously Blocked Customer',
        items: [{ productId: testData.productId, quantity: 1 }],
      },
    });
    // Should NOT be 403
    expect(orderRes.status()).not.toBe(403);
  });
});

test.describe('Blocked customer — UI checkout rejection', () => {
  test('checkout page shows error when blocked customer submits', async ({
    page,
    testData,
    adminToken,
    request,
  }) => {
    const phone = '0700009903'; // local format
    const phoneMpesa = '254700009903';

    // Block the phone
    await request.post(
      `${BACKEND_URL}/api/admin/customers/${encodeURIComponent(phoneMpesa)}/block`,
      { headers: { Authorization: `Bearer adminToken` }, data: { reason: 'UI test block' } }
    );

    // Mock the payment endpoint so we can test to order submission (not M-Pesa)
    await page.route('**/api/payments/initiate', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, payment: { id: 'x', status: 'pending', checkoutRequestId: 'x' } }),
      });
    });

    // Build cart
    const cart = new CartPage(page);
    await page.goto('/cart');
    await cart.injectCartItem({
      productId: testData.productId,
      name: testData.productName,
      price: 1500,
      quantity: 1,
      stock: 50,
    });
    await page.goto('/checkout');
    await page.waitForLoadState('networkidle');

    const checkout = new CheckoutPage(page);
    await checkout.fillPhone(phone);
    await checkout.fillName('Blocked Person');

    // Intercept the actual order POST and return 403
    await page.route('**/api/orders', async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: 'This phone number is not allowed to place orders.' }),
      });
    });

    await checkout.placeOrder();

    // The frontend should display the error
    const error = page.getByText(/not allowed|blocked/i);
    await expect(error).toBeVisible({ timeout: 8000 });

    // Cleanup
    await request.delete(
      `${BACKEND_URL}/api/admin/customers/${encodeURIComponent(phoneMpesa)}/block`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
  });
});
