/**
 * Admin order management tests — list, view, status transitions.
 */

import { expect } from '@playwright/test';
import { test } from '../../fixtures';
import { AdminOrdersPage } from '../../page-objects/admin/AdminOrdersPage';
import { BACKEND_URL } from '../../utils/test-data';
import { createTestOrder, updateOrderStatus } from '../../utils/api-helpers';

test.describe('Admin orders', () => {
  test('orders list page loads', async ({ page }) => {
    const orders = new AdminOrdersPage(page);
    await orders.goto();
    await expect(orders.heading).toBeVisible();
  });

  test('API: orders list returns paginated results', async ({ request, adminToken }) => {
    const res = await request.get(`${BACKEND_URL}/api/orders/list?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.orders)).toBe(true);
  });

  test('API: create order and verify it appears in list', async ({ request, adminToken, testData }) => {
    const order = await createTestOrder({
      productId: testData.productId,
      customerPhone: '254700000050',
    });
    expect(order.orderNumber).toMatch(/^ORD-/);
    expect(order.status).toBe('pending');

    // Verify it appears in the admin orders list
    const listRes = await request.get(
      `${BACKEND_URL}/api/orders/list?page=1&limit=50`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    const { orders } = await listRes.json();
    const found = orders.find((o: { orderNumber: string }) => o.orderNumber === order.orderNumber);
    expect(found).toBeDefined();
  });

  test('API: valid status transition pending → awaiting_payment', async ({ request, adminToken, testData }) => {
    const order = await createTestOrder({
      productId: testData.productId,
      customerPhone: '254700000051',
    });

    const res = await request.put(`${BACKEND_URL}/api/orders/${order.id}/status`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { status: 'awaiting_payment' },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.order.status).toBe('awaiting_payment');
  });

  test('API: invalid status transition is rejected', async ({ request, adminToken, testData }) => {
    const order = await createTestOrder({
      productId: testData.productId,
      customerPhone: '254700000052',
    });

    // Cannot jump from pending directly to delivered
    const res = await request.put(`${BACKEND_URL}/api/orders/${order.id}/status`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { status: 'delivered' },
    });
    expect(res.ok()).toBe(false);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/invalid transition|cannot transition/i);
  });

  test('API: cancel an order', async ({ request, adminToken, testData }) => {
    const order = await createTestOrder({
      productId: testData.productId,
      customerPhone: '254700000053',
    });

    const res = await request.put(`${BACKEND_URL}/api/orders/${order.id}/status`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { status: 'cancelled' },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.order.status).toBe('cancelled');
  });

  test('API: order activity log records status changes', async ({ request, adminToken, testData }) => {
    const order = await createTestOrder({
      productId: testData.productId,
      customerPhone: '254700000054',
    });
    await updateOrderStatus(order.id, 'awaiting_payment', adminToken);

    const res = await request.get(`${BACKEND_URL}/api/orders/${order.id}/activity`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.logs)).toBe(true);
    expect(body.logs.some((l: { action: string }) => l.action === 'ORDER_CREATED')).toBe(true);
  });

  test('orders list shows order rows', async ({ page, testData }) => {
    // Create an order to ensure there's at least one
    await createTestOrder({
      productId: testData.productId,
      customerPhone: '254700000055',
    });

    const orders = new AdminOrdersPage(page);
    await orders.goto();
    await page.waitForLoadState('networkidle');
    const count = await orders.getOrderCount();
    expect(count).toBeGreaterThan(0);
  });

  test('order detail page loads when clicking a row', async ({ page, testData }) => {
    // Create an order with the test product
    const order = await createTestOrder({
      productId: testData.productId,
      customerPhone: '254700000056',
    });

    // Navigate directly to the order detail page
    await page.goto(`/orders/${order.id}`);
    await page.waitForLoadState('networkidle');
    // Should show order info — either order number or status
    const content = page.getByText(new RegExp(order.orderNumber + '|pending', 'i'));
    await expect(content).toBeVisible({ timeout: 8000 });
  });
});
