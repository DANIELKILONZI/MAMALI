/**
 * Homepage tests — validates page loads, navigation, featured products,
 * and the cart icon badge behaviour.
 */

import { expect } from '@playwright/test';
import { test } from '../../fixtures';
import { HomePage } from '../../page-objects/HomePage';

test.describe('Homepage', () => {
  test('loads and shows the MAMALI brand logo', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await expect(home.logo).toBeVisible();
    await expect(page).toHaveTitle(/MAMALI/i);
  });

  test('navigation links are visible and functional', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await expect(home.productsLink).toBeVisible();
    await expect(home.cartLink).toBeVisible();
  });

  test('clicking Products nav navigates to /products', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.clickProductsNav();
    await expect(page).toHaveURL(/\/products/);
  });

  test('clicking Cart icon navigates to /cart', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.clickCartIcon();
    await expect(page).toHaveURL(/\/cart/);
  });

  test('cart badge shows 0 (no badge) on empty cart', async ({ page }) => {
    const home = new HomePage(page);
    // Clear cart first
    await home.goto();
    await page.evaluate(() => localStorage.removeItem('mamali_cart'));
    await page.reload();
    const count = await home.getCartCount();
    expect(count).toBe(0);
  });

  test('health check: backend API is reachable', async ({ request }) => {
    const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
    const res = await request.get(`${BACKEND_URL}/api/health`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('homepage renders content without client-side errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    const home = new HomePage(page);
    await home.goto();
    // Allow known benign errors (e.g. network fetch failures in dev)
    const fatalErrors = errors.filter(
      (e) => !e.includes('fetch') && !e.includes('NetworkError')
    );
    expect(fatalErrors).toHaveLength(0);
  });
});
