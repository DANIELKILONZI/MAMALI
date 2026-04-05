/**
 * Admin analytics tests — revenue, product stats, funnel, coupons, fraud.
 */

import { expect } from '@playwright/test';
import { test } from '../../fixtures';
import { BACKEND_URL } from '../../utils/test-data';

test.describe('Admin analytics', () => {
  test('analytics page loads with section headings', async ({ page }) => {
    await page.goto('/analytics');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /analytics/i })).toBeVisible();
    await expect(page.getByText(/revenue|sales/i)).toBeVisible();
  });

  test('analytics page shows revenue trend section', async ({ page }) => {
    await page.goto('/analytics');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/30-day|revenue trend/i)).toBeVisible();
  });

  test('analytics page shows product performance section', async ({ page }) => {
    await page.goto('/analytics');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/product performance|conversion rate/i)).toBeVisible();
  });

  test('analytics page shows checkout funnel section', async ({ page }) => {
    await page.goto('/analytics');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/checkout funnel|funnel/i)).toBeVisible();
  });

  test('API: /api/admin/analytics/revenue returns 30-day data', async ({ request, adminToken }) => {
    const res = await request.get(`${BACKEND_URL}/api/admin/analytics/revenue`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.days)).toBe(true);
    expect(body.days.length).toBe(30);
    if (body.days.length > 0) {
      expect(body.days[0]).toHaveProperty('date');
      expect(body.days[0]).toHaveProperty('revenue');
      expect(body.days[0]).toHaveProperty('orders');
    }
    expect(typeof body.totalRevenue).toBe('number');
    expect(typeof body.totalOrders).toBe('number');
  });

  test('API: /api/admin/analytics/products returns product stats', async ({ request, adminToken }) => {
    const res = await request.get(`${BACKEND_URL}/api/admin/analytics/products`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.products)).toBe(true);
    if (body.products.length > 0) {
      const p = body.products[0];
      expect(p).toHaveProperty('productId');
      expect(p).toHaveProperty('totalRevenue');
      expect(p).toHaveProperty('viewsLast30');
    }
  });

  test('API: /api/admin/analytics/funnel returns checkout funnel data', async ({ request, adminToken }) => {
    const res = await request.get(`${BACKEND_URL}/api/admin/analytics/funnel`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body).toHaveProperty('created');
    expect(body).toHaveProperty('paid');
    expect(body).toHaveProperty('delivered');
    expect(typeof body.abandonmentRate).toBe('number');
    expect(typeof body.paymentSuccessRate).toBe('number');
  });

  test('API: /api/admin/analytics/coupons returns coupon effectiveness', async ({ request, adminToken }) => {
    const res = await request.get(`${BACKEND_URL}/api/admin/analytics/coupons`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.coupons)).toBe(true);
  });

  test('API: /api/admin/analytics/fraud returns fraud alerts', async ({ request, adminToken }) => {
    const res = await request.get(`${BACKEND_URL}/api/admin/analytics/fraud?threshold=30`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.alerts)).toBe(true);
    expect(typeof body.threshold).toBe('number');
  });

  test('analytics endpoints require authentication', async ({ request }) => {
    const res = await request.get(`${BACKEND_URL}/api/admin/analytics/revenue`);
    expect(res.status()).toBe(401);
  });
});
