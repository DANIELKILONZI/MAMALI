/**
 * Admin dashboard tests — verifies key stats cards and navigation.
 */

import { expect } from '@playwright/test';
import { test } from '../../fixtures';
import { AdminDashboardPage } from '../../page-objects/admin/AdminDashboardPage';

test.describe('Admin dashboard', () => {
  test('dashboard loads and shows key stat cards', async ({ page }) => {
    const dashboard = new AdminDashboardPage(page);
    await dashboard.goto();
    await expect(dashboard.heading).toBeVisible();
    await expect(dashboard.totalRevenueCard).toBeVisible();
    await expect(dashboard.totalOrdersCard).toBeVisible();
  });

  test('navigation sidebar links are present', async ({ page }) => {
    const dashboard = new AdminDashboardPage(page);
    await dashboard.goto();
    await expect(dashboard.navProducts).toBeVisible();
    await expect(dashboard.navOrders).toBeVisible();
    await expect(dashboard.navCoupons).toBeVisible();
    await expect(dashboard.navSettings).toBeVisible();
    await expect(dashboard.navAnalytics).toBeVisible();
    await expect(dashboard.navInventory).toBeVisible();
  });

  test('navigating to Products via sidebar reaches /products', async ({ page }) => {
    const dashboard = new AdminDashboardPage(page);
    await dashboard.goto();
    await dashboard.navigateTo('products');
    await expect(page).toHaveURL(/\/products/);
  });

  test('navigating to Analytics reaches /analytics', async ({ page }) => {
    const dashboard = new AdminDashboardPage(page);
    await dashboard.goto();
    await dashboard.navigateTo('analytics');
    await expect(page).toHaveURL(/\/analytics/);
    await expect(page.getByRole('heading', { name: /analytics/i })).toBeVisible();
  });

  test('navigating to Inventory reaches /inventory', async ({ page }) => {
    const dashboard = new AdminDashboardPage(page);
    await dashboard.goto();
    await dashboard.navigateTo('inventory');
    await expect(page).toHaveURL(/\/inventory/);
  });

  test('unauthenticated user is redirected to /login', async ({ browser }) => {
    // Open a fresh context WITHOUT the saved storage state
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/dashboard');
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });

  test('admin API /api/admin/dashboard returns data', async ({ request, adminToken }) => {
    const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
    const res = await request.get(`${BACKEND_URL}/api/admin/dashboard`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty('ordersByStatus');
  });
});
