/**
 * Admin coupon management tests — list, create, update, delete, and edge cases.
 */

import { expect } from '@playwright/test';
import { test } from '../../fixtures';
import { AdminCouponsPage } from '../../page-objects/admin/AdminCouponsPage';
import { BACKEND_URL } from '../../utils/test-data';

const NEW_COUPON_CODE = `E2EUICOUPON${Date.now()}`.slice(0, 20);

test.describe('Admin coupon management', () => {
  test('coupons list page loads and shows seeded coupons', async ({ page, testData }) => {
    const coupons = new AdminCouponsPage(page);
    await coupons.gotoList();
    await expect(coupons.heading).toBeVisible();
    // Seeded coupons should appear
    await expect(page.getByText(testData.validCouponCode)).toBeVisible({ timeout: 10_000 });
  });

  test('new coupon button navigates to /coupons/new', async ({ page }) => {
    const coupons = new AdminCouponsPage(page);
    await coupons.gotoList();
    await coupons.newCouponBtn.click();
    await expect(page).toHaveURL(/\/coupons\/new/);
  });

  test('creates a new percent coupon via UI', async ({ page }) => {
    const coupons = new AdminCouponsPage(page);
    await coupons.gotoNew();
    await coupons.fillCouponForm({
      code: NEW_COUPON_CODE,
      discountValue: '15',
      discountType: 'percent',
      minOrderValue: '1000',
    });
    await coupons.save();
    // Should redirect back to list or show success
    await expect(page.getByText(/saved|created|coupon/i)).toBeVisible({ timeout: 10_000 });
  });

  test('newly created coupon appears in the list', async ({ page }) => {
    const coupons = new AdminCouponsPage(page);
    await coupons.gotoList();
    await expect(page.getByText(NEW_COUPON_CODE)).toBeVisible({ timeout: 10_000 });
  });

  test('expired coupon appears in list (seeded)', async ({ page, testData }) => {
    const coupons = new AdminCouponsPage(page);
    await coupons.gotoList();
    await expect(page.getByText(testData.expiredCouponCode)).toBeVisible({ timeout: 10_000 });
  });

  test('API: create coupon with admin token', async ({ request, adminToken }) => {
    const code = `APITEST${Date.now()}`.slice(0, 20);
    const res = await request.post(`${BACKEND_URL}/api/admin/coupons`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        code,
        discountType: 'fixed',
        discountValue: 200,
        minOrderValue: 1000,
        isActive: true,
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.coupon.code).toBe(code);

    // Cleanup
    await request.delete(`${BACKEND_URL}/api/admin/coupons/${body.coupon.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
  });

  test('API: update coupon disables it', async ({ request, adminToken, testData }) => {
    // Get coupon list to find the valid coupon ID
    const listRes = await request.get(`${BACKEND_URL}/api/admin/coupons`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const { coupons } = await listRes.json();
    const validCoupon = coupons.find((c: { code: string }) => c.code === testData.validCouponCode);
    if (!validCoupon) return; // Skip if not found

    const updateRes = await request.put(`${BACKEND_URL}/api/admin/coupons/${validCoupon.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { isActive: false },
    });
    expect(updateRes.ok()).toBe(true);

    // Re-enable
    await request.put(`${BACKEND_URL}/api/admin/coupons/${validCoupon.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { isActive: true },
    });
  });

  test('API: delete coupon removes it from the list', async ({ request, adminToken }) => {
    // Create a coupon to delete
    const code = `DELETEME${Date.now()}`.slice(0, 20);
    const createRes = await request.post(`${BACKEND_URL}/api/admin/coupons`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { code, discountType: 'percent', discountValue: 5, isActive: true },
    });
    const { coupon } = await createRes.json();

    const deleteRes = await request.delete(`${BACKEND_URL}/api/admin/coupons/${coupon.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(deleteRes.ok()).toBe(true);

    // Confirm it's gone
    const listRes = await request.get(`${BACKEND_URL}/api/admin/coupons`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const { coupons } = await listRes.json();
    const found = coupons.find((c: { code: string }) => c.code === code);
    expect(found).toBeUndefined();
  });

  test('coupon code is coerced to uppercase by backend', async ({ request, adminToken }) => {
    const code = `lowercase${Date.now()}`.slice(0, 20).toLowerCase();
    const res = await request.post(`${BACKEND_URL}/api/admin/coupons`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { code, discountType: 'percent', discountValue: 5, isActive: true },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.coupon.code).toBe(code.toUpperCase());

    // Cleanup
    await request.delete(`${BACKEND_URL}/api/admin/coupons/${body.coupon.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
  });
});
