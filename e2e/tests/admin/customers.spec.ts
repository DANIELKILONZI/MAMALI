/**
 * Admin customer management E2E tests.
 *
 * Tests the /customers admin page and the customer block/unblock API.
 */

import { expect } from '@playwright/test';
import { test } from '../../fixtures';
import { BACKEND_URL } from '../../utils/test-data';

const CUSTOMER_PHONE = '254700008001';

test.describe('Admin customers page', () => {
  test('customers page loads and shows the heading', async ({ page }) => {
    await page.goto('/customers');
    await expect(page.getByRole('heading', { name: /customers/i })).toBeVisible();
  });

  test('customers page has segment filter tabs', async ({ page }) => {
    await page.goto('/customers');
    await expect(page.getByRole('button', { name: /all/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /vip/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /returning/i })).toBeVisible();
  });

  test('search box is present', async ({ page }) => {
    await page.goto('/customers');
    const searchBox = page.getByPlaceholder(/search by phone/i);
    await expect(searchBox).toBeVisible();
  });

  test('API: customers list returns correct structure', async ({ request, adminToken }) => {
    const res = await request.get(`${BACKEND_URL}/api/admin/customers?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.customers)).toBe(true);
    expect(body.pagination).toBeDefined();
    expect(body.pagination.page).toBe(1);
  });

  test('API: segment=vip filter returns only VIP customers', async ({ request, adminToken }) => {
    const res = await request.get(`${BACKEND_URL}/api/admin/customers?segment=vip`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    for (const c of body.customers) {
      expect(c.segment).toBe('vip');
    }
  });
});

test.describe('Admin customer block/unblock — API', () => {
  test.afterEach(async ({ request, adminToken }) => {
    // Ensure cleanup even if test fails
    await request.delete(
      `${BACKEND_URL}/api/admin/customers/${encodeURIComponent(CUSTOMER_PHONE)}/block`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    ).catch(() => {});
  });

  test('can block a customer', async ({ request, adminToken }) => {
    const res = await request.post(
      `${BACKEND_URL}/api/admin/customers/${encodeURIComponent(CUSTOMER_PHONE)}/block`,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { reason: 'E2E admin test block' },
      }
    );
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.blocked.phone).toBe(CUSTOMER_PHONE);
  });

  test('can unblock a previously blocked customer', async ({ request, adminToken }) => {
    // Block first
    await request.post(
      `${BACKEND_URL}/api/admin/customers/${encodeURIComponent(CUSTOMER_PHONE)}/block`,
      { headers: { Authorization: `Bearer ${adminToken}` }, data: {} }
    );

    // Unblock
    const res = await request.delete(
      `${BACKEND_URL}/api/admin/customers/${encodeURIComponent(CUSTOMER_PHONE)}/block`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('requires authentication', async ({ request }) => {
    const res = await request.post(
      `${BACKEND_URL}/api/admin/customers/${encodeURIComponent(CUSTOMER_PHONE)}/block`,
      { data: { reason: 'no auth' } }
    );
    expect(res.status()).toBe(401);
  });
});

test.describe('Admin customer detail API', () => {
  test('returns customer details with orders array', async ({ request, adminToken, testData }) => {
    // Create a test order for the customer
    const orderRes = await request.post(`${BACKEND_URL}/api/orders`, {
      data: {
        customerPhone: CUSTOMER_PHONE,
        customerName: 'Detail Test Customer',
        items: [{ productId: testData.productId, quantity: 1 }],
      },
    });
    expect(orderRes.ok()).toBeTruthy();

    const res = await request.get(
      `${BACKEND_URL}/api/admin/customers/${encodeURIComponent(CUSTOMER_PHONE)}`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.customer.phone).toBe(CUSTOMER_PHONE);
    expect(Array.isArray(body.orders)).toBe(true);
  });
});
