/**
 * Checkout flow tests — form validation, coupon application,
 * M-Pesa payment initiation (mocked), and payment status polling.
 */

import { expect } from '@playwright/test';
import { test } from '../../fixtures';
import { CartPage } from '../../page-objects/CartPage';
import { CheckoutPage } from '../../page-objects/CheckoutPage';
import { BACKEND_URL, TEST_PHONE } from '../../utils/test-data';

/** Inject a cart item + navigate to checkout */
async function setupCartAndCheckout(page: import('@playwright/test').Page, testData: import('../../global-setup').TestData) {
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
}

test.describe('Checkout — form validation', () => {
  test('checkout page loads with the cart summary visible', async ({ page, testData }) => {
    await setupCartAndCheckout(page, testData);
    const checkout = new CheckoutPage(page);
    await expect(checkout.placeOrderBtn).toBeVisible();
    await expect(page.getByText(testData.productName)).toBeVisible();
  });

  test('empty phone number shows validation error', async ({ page, testData }) => {
    await setupCartAndCheckout(page, testData);
    const checkout = new CheckoutPage(page);
    await checkout.placeOrder();
    // HTML5 validation or app-level validation
    const isInvalid = await checkout.phoneInput.evaluate((el: HTMLInputElement) => !el.validity.valid);
    expect(isInvalid).toBe(true);
  });

  test('invalid phone number shows error', async ({ page, testData }) => {
    await setupCartAndCheckout(page, testData);
    const checkout = new CheckoutPage(page);
    await checkout.fillPhone('12345'); // too short
    await checkout.placeOrder();
    const error = page.getByText(/invalid phone|valid kenyan/i);
    await expect(error).toBeVisible({ timeout: 5000 });
  });

  test('valid 07XXXXXXXX phone is accepted', async ({ page, testData, request }) => {
    // We mock the M-Pesa initiate endpoint so we don't hit Safaricom
    await page.route('**/api/payments/initiate', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          payment: { id: 'mock-pay-id', status: 'pending', checkoutRequestId: 'mock-req-id' },
          message: 'Check your phone for M-Pesa prompt',
        }),
      });
    });

    await setupCartAndCheckout(page, testData);
    const checkout = new CheckoutPage(page);
    await checkout.fillPhone(TEST_PHONE);
    await checkout.fillName('E2E Customer');
    await checkout.placeOrder();
    // Should reach pending payment screen
    await checkout.waitForPaymentPending();
  });

  test('redirects to checkout when cart is empty', async ({ page }) => {
    await page.evaluate(() => localStorage.removeItem('mamali_cart'));
    const checkout = new CheckoutPage(page);
    await checkout.goto();
    // Empty cart should redirect away or show a message
    const emptyMsg = page.getByText(/cart is empty|no items|add items/i);
    const isOnCheckout = page.url().includes('/checkout');
    if (isOnCheckout) {
      await expect(emptyMsg).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('Checkout — coupon application', () => {
  test('valid coupon applies discount to total', async ({ page, testData }) => {
    await setupCartAndCheckout(page, testData);
    const checkout = new CheckoutPage(page);
    await checkout.applyCoupon(testData.validCouponCode);
    // Discount row should appear
    await expect(checkout.discountRow).toBeVisible({ timeout: 5000 });
    const discountText = await checkout.getDiscountText();
    expect(discountText).toMatch(/discount/i);
  });

  test('expired coupon shows error message', async ({ page, testData }) => {
    await setupCartAndCheckout(page, testData);
    const checkout = new CheckoutPage(page);
    await checkout.applyCoupon(testData.expiredCouponCode);
    const errorMsg = page.getByText(/expired|invalid coupon/i);
    await expect(errorMsg).toBeVisible({ timeout: 5000 });
  });

  test('max-used coupon shows error message', async ({ page, testData }) => {
    await setupCartAndCheckout(page, testData);
    const checkout = new CheckoutPage(page);
    await checkout.applyCoupon(testData.zerouseCouponCode);
    const errorMsg = page.getByText(/maximum uses|no longer valid|invalid/i);
    await expect(errorMsg).toBeVisible({ timeout: 5000 });
  });

  test('non-existent coupon code shows error', async ({ page, testData }) => {
    await setupCartAndCheckout(page, testData);
    const checkout = new CheckoutPage(page);
    await checkout.applyCoupon('NOTACOUPON999');
    const errorMsg = page.getByText(/invalid|not found|coupon/i);
    await expect(errorMsg).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Checkout — full M-Pesa payment flow (mocked)', () => {
  test('complete checkout creates order and shows payment pending', async ({ page, testData }) => {
    // Mock M-Pesa STK push
    await page.route('**/api/payments/initiate', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          payment: {
            id: 'mock-payment-id',
            status: 'pending',
            checkoutRequestId: 'mock-checkout-req-id',
            orderId: 'mock-order-id',
          },
          message: 'Check your phone for M-Pesa prompt',
        }),
      });
    });

    // Mock payment status polling to return "completed" after first poll
    let pollCount = 0;
    await page.route('**/api/payments/*/status', async (route) => {
      pollCount++;
      const status = pollCount >= 2 ? 'completed' : 'pending';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          payment: {
            id: 'mock-payment-id',
            status,
            mpesaReceiptNumber: status === 'completed' ? 'LGR5MOCK123' : null,
          },
        }),
      });
    });

    await setupCartAndCheckout(page, testData);
    const checkout = new CheckoutPage(page);
    await checkout.fillPhone(TEST_PHONE);
    await checkout.fillName('E2E Test Customer');
    await checkout.placeOrder();

    // Wait for pending screen
    await checkout.waitForPaymentPending();
    await expect(page.getByText(/check your phone|m-pesa|waiting/i)).toBeVisible();
  });

  test('API POST /api/orders creates an order without payment', async ({ request, testData }) => {
    const res = await request.post(`${BACKEND_URL}/api/orders`, {
      data: {
        customerPhone: '254700999001',
        customerName: 'API Test Customer',
        items: [{ productId: testData.productId, quantity: 1 }],
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.order.orderNumber).toMatch(/^ORD-/);
    expect(body.order.status).toBe('pending');
    expect(body.order.total).toBe(1500);
  });

  test('API order creation with valid coupon applies discount', async ({ request, testData }) => {
    const res = await request.post(`${BACKEND_URL}/api/orders`, {
      data: {
        customerPhone: '254700999002',
        customerName: 'Coupon API Customer',
        items: [{ productId: testData.productId, quantity: 1 }],
        couponCode: testData.validCouponCode,
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.order.discountAmount).toBeGreaterThan(0);
    expect(body.order.couponCode).toBe(testData.validCouponCode);
    // 10% of 1500 = 150 discount → total = 1350
    expect(body.order.total).toBe(1350);
  });

  test('phone number is remembered across sessions (localStorage)', async ({ page, testData }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('mamali_last_phone', '0700000001'));

    const cart = new CartPage(page);
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
    // Phone should be pre-filled from localStorage
    const phoneValue = await checkout.phoneInput.inputValue();
    expect(phoneValue).toBeTruthy();
  });
});

test.describe('Order tracking', () => {
  test('API GET /api/orders/:orderNumber returns order details', async ({ request, testData }) => {
    // Create an order first
    const createRes = await request.post(`${BACKEND_URL}/api/orders`, {
      data: {
        customerPhone: '254700999003',
        customerName: 'Tracking Customer',
        items: [{ productId: testData.productId, quantity: 1 }],
      },
    });
    const orderBody = await createRes.json();
    const orderNumber = orderBody.order.orderNumber;

    // Now look it up
    const trackRes = await request.get(`${BACKEND_URL}/api/orders/${orderNumber}`);
    expect(trackRes.ok()).toBe(true);
    const trackBody = await trackRes.json();
    expect(trackBody.order.orderNumber).toBe(orderNumber);
    expect(trackBody.order.status).toBe('pending');
  });

  test('order tracking page shows order details', async ({ page, request, testData }) => {
    // Create an order
    const createRes = await request.post(`${BACKEND_URL}/api/orders`, {
      data: {
        customerPhone: '254700999004',
        customerName: 'Track Page Customer',
        items: [{ productId: testData.productId, quantity: 1 }],
      },
    });
    const orderBody = await createRes.json();
    const { orderNumber } = orderBody.order;

    await page.goto(`/orders/${orderNumber}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(orderNumber)).toBeVisible();
  });
});
