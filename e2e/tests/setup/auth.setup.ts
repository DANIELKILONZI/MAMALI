/**
 * Auth setup spec — runs in the 'setup' project before all admin tests.
 *
 * Logs in as the test admin via the UI and saves the browser storage state
 * (localStorage with mamali_admin_token) to .auth/admin.json so all
 * admin specs can reuse it without re-logging in.
 */

import { test as setup, expect } from '@playwright/test';
import path from 'path';
import { ADMIN_STORAGE_STATE } from '../../playwright.config';
import { loadTestData } from '../../utils/test-data';

const ADMIN_URL = process.env.ADMIN_URL || 'http://localhost:3001';

setup('save admin authentication state', async ({ page }) => {
  const { adminEmail, adminPassword } = loadTestData();

  await page.goto(`${ADMIN_URL}/login`);
  await page.waitForLoadState('networkidle');

  // Fill login form
  await page.locator('input[type="email"]').fill(adminEmail);
  await page.locator('input[type="password"]').fill(adminPassword);
  await page.getByRole('button', { name: /sign in/i }).click();

  // Wait for redirect to dashboard
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  await page.waitForLoadState('networkidle');

  // Verify we're actually on the dashboard
  await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();

  // Verify the token is in localStorage
  const token = await page.evaluate(() => localStorage.getItem('mamali_admin_token'));
  expect(token).toBeTruthy();

  // Save storage state for reuse across admin tests
  await page.context().storageState({ path: ADMIN_STORAGE_STATE });

  console.log(`[auth.setup] Admin state saved to ${path.basename(ADMIN_STORAGE_STATE)}`);
});
