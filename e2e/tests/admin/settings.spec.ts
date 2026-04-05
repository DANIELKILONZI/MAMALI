/**
 * Admin store settings tests — read and update store configuration.
 */

import { expect } from '@playwright/test';
import { test } from '../../fixtures';
import { AdminSettingsPage } from '../../page-objects/admin/AdminSettingsPage';
import { BACKEND_URL } from '../../utils/test-data';

test.describe('Admin store settings', () => {
  test('settings page loads', async ({ page }) => {
    const settings = new AdminSettingsPage(page);
    await settings.goto();
    await expect(settings.heading).toBeVisible();
  });

  test('settings form shows existing values', async ({ page }) => {
    const settings = new AdminSettingsPage(page);
    await settings.goto();
    // businessName should be pre-filled
    const businessName = await settings.getBusinessName();
    expect(businessName).toBeTruthy();
  });

  test('updating business name persists the change', async ({ page }) => {
    const settings = new AdminSettingsPage(page);
    await settings.goto();

    const originalName = await settings.getBusinessName();
    const testName = `MAMALI E2E Test ${Date.now()}`;

    await settings.updateBusinessName(testName);

    // Reload and check it persisted
    await page.reload();
    await page.waitForLoadState('networkidle');
    const updatedName = await settings.getBusinessName();
    expect(updatedName).toBe(testName);

    // Restore original name
    await settings.updateBusinessName(originalName);
  });

  test('API: GET /api/admin/settings returns settings', async ({ request, adminToken }) => {
    const res = await request.get(`${BACKEND_URL}/api/admin/settings`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.settings).toBeDefined();
    expect(typeof body.settings.businessName).toBe('string');
  });

  test('API: PUT /api/admin/settings updates delivery fee', async ({ request, adminToken }) => {
    // Read current settings
    const getRes = await request.get(`${BACKEND_URL}/api/admin/settings`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const { settings: current } = await getRes.json();

    const newDeliveryFee = (current.deliveryFee ?? 0) + 1;
    const updateRes = await request.put(`${BACKEND_URL}/api/admin/settings`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { deliveryFee: newDeliveryFee },
    });
    expect(updateRes.ok()).toBe(true);
    const body = await updateRes.json();
    expect(body.settings.deliveryFee).toBe(newDeliveryFee);

    // Restore
    await request.put(`${BACKEND_URL}/api/admin/settings`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { deliveryFee: current.deliveryFee ?? 0 },
    });
  });

  test('API: public GET /api/settings is accessible without auth', async ({ request }) => {
    const res = await request.get(`${BACKEND_URL}/api/settings`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.settings).toBeDefined();
  });

  test('settings page does not expose sensitive admin data', async ({ page }) => {
    const settings = new AdminSettingsPage(page);
    await settings.goto();
    const content = await page.content();
    // Should not contain raw JWT secrets or passwords
    expect(content).not.toMatch(/jwt_secret|database_url|private_key/i);
  });
});
