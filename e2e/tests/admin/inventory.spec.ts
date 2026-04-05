/**
 * Admin inventory intelligence tests — reorder alerts, fast movers,
 * dead stock, and stock summary cards.
 */

import { expect } from '@playwright/test';
import { test } from '../../fixtures';
import { AdminInventoryPage } from '../../page-objects/admin/AdminInventoryPage';
import { BACKEND_URL } from '../../utils/test-data';

test.describe('Admin inventory intelligence', () => {
  test('inventory page loads with all sections visible', async ({ page }) => {
    const inventory = new AdminInventoryPage(page);
    await inventory.goto();
    await expect(inventory.heading).toBeVisible();
    await expect(page.getByText(/reorder alert/i)).toBeVisible();
    await expect(page.getByText(/fast mover/i)).toBeVisible();
    await expect(page.getByText(/dead stock/i)).toBeVisible();
  });

  test('summary cards show total products, out-of-stock, low-stock counts', async ({ page }) => {
    const inventory = new AdminInventoryPage(page);
    await inventory.goto();
    await expect(page.getByText(/active products/i)).toBeVisible();
    await expect(page.getByText(/out of stock/i)).toBeVisible();
    await expect(page.getByText(/low stock/i)).toBeVisible();
  });

  test('out-of-stock seeded product appears in reorder alerts', async ({ page, testData }) => {
    const inventory = new AdminInventoryPage(page);
    await inventory.goto();
    // E2E Out-of-Stock Product has stock=0, reorderLevel=5 → should appear
    await expect(page.getByText(/e2e out-of-stock/i)).toBeVisible({ timeout: 10_000 });
  });

  test('API: inventory intelligence endpoint returns correct structure', async ({ request, adminToken }) => {
    const res = await request.get(`${BACKEND_URL}/api/admin/inventory/intelligence`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body).toHaveProperty('summary');
    expect(body).toHaveProperty('reorderAlerts');
    expect(body).toHaveProperty('fastMovers');
    expect(body).toHaveProperty('deadStock');
    expect(body).toHaveProperty('deadStockValue');
    expect(typeof body.summary.totalProducts).toBe('number');
    expect(typeof body.summary.outOfStock).toBe('number');
    expect(typeof body.summary.lowStock).toBe('number');
  });

  test('API: out-of-stock product is in reorder alerts', async ({ request, adminToken, testData }) => {
    const res = await request.get(`${BACKEND_URL}/api/admin/inventory/intelligence`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const body = await res.json();
    const alertIds = body.reorderAlerts.map((a: { id: string }) => a.id);
    expect(alertIds).toContain(testData.outOfStockProductId);
  });

  test('API: reorder alerts have required fields', async ({ request, adminToken }) => {
    const res = await request.get(`${BACKEND_URL}/api/admin/inventory/intelligence`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const body = await res.json();
    if (body.reorderAlerts.length > 0) {
      const alert = body.reorderAlerts[0];
      expect(alert).toHaveProperty('id');
      expect(alert).toHaveProperty('name');
      expect(alert).toHaveProperty('slug');
      expect(alert).toHaveProperty('stock');
      expect(alert).toHaveProperty('reorderLevel');
      expect(alert.stock).toBeLessThanOrEqual(alert.reorderLevel);
    }
  });

  test('inventory page does not show loading spinner after data loads', async ({ page }) => {
    const inventory = new AdminInventoryPage(page);
    await inventory.goto();
    // After networkidle, spinner should be gone
    const spinner = page.getByText(/loading/i);
    if (await spinner.isVisible()) {
      await expect(spinner).not.toBeVisible({ timeout: 10_000 });
    }
  });
});
