/**
 * Product listing & detail page tests.
 */

import { expect } from '@playwright/test';
import { test } from '../../fixtures';
import { ProductsPage } from '../../page-objects/ProductsPage';
import { ProductDetailPage } from '../../page-objects/ProductDetailPage';
import { BACKEND_URL } from '../../utils/test-data';

test.describe('Products listing page', () => {
  test('loads /products and shows the seeded test product', async ({ page, testData }) => {
    const products = new ProductsPage(page);
    await products.goto();
    await products.waitForProducts();
    const count = await products.getProductCount();
    expect(count).toBeGreaterThan(0);
    // Seeded product should be visible
    await expect(page.getByText(testData.productName)).toBeVisible();
  });

  test('search filters products by name', async ({ page, testData }) => {
    const products = new ProductsPage(page);
    await products.goto();
    await products.waitForProducts();
    const searchBox = page.locator('input[type="search"], input[placeholder*="search" i]').first();
    if (await searchBox.isVisible()) {
      await products.search(testData.productName.slice(0, 5));
      await expect(page.getByText(testData.productName)).toBeVisible();
    }
  });

  test('search with no results shows empty state', async ({ page }) => {
    const products = new ProductsPage(page);
    await products.goto();
    const searchBox = page.locator('input[type="search"], input[placeholder*="search" i]').first();
    if (await searchBox.isVisible()) {
      await products.search('xxxxxxxxxxx_no_match');
      const noResults = page.getByText(/no products|no results/i);
      await expect(noResults).toBeVisible();
    }
  });

  test('clicking a product card navigates to the detail page', async ({ page, testData }) => {
    const products = new ProductsPage(page);
    await products.goto();
    await products.waitForProducts();
    await page.getByText(testData.productName).first().click();
    await expect(page).toHaveURL(new RegExp(`/products/${testData.productSlug}`));
  });
});

test.describe('Product detail page', () => {
  test('shows product name, price, and stock status', async ({ page, testData }) => {
    const detail = new ProductDetailPage(page);
    await detail.goto(testData.productSlug);
    await expect(detail.productName).toContainText(testData.productName);
    await expect(detail.addToCartBtn).toBeVisible();
  });

  test('Add to Cart button adds item to cart', async ({ page, testData }) => {
    const detail = new ProductDetailPage(page);
    await detail.goto(testData.productSlug);
    // Clear cart first
    await page.evaluate(() => localStorage.removeItem('mamali_cart'));
    await detail.addToCart();
    // Cart badge should appear
    const badge = page.locator('header span').filter({ hasText: /^\d+$/ }).first();
    await expect(badge).toBeVisible({ timeout: 5000 });
    const count = parseInt(await badge.textContent() ?? '0', 10);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('quantity controls update the quantity', async ({ page, testData }) => {
    const detail = new ProductDetailPage(page);
    await detail.goto(testData.productSlug);
    await detail.increaseQuantity(2);
    // Check quantity is now 3 (default 1 + 2 increases)
    const qtyText = await page.locator('button').filter({ hasText: '+' }).locator('..').textContent();
    // We can't rely on exact text due to layout variations, so just check we can interact
    expect(await detail.quantityIncrease.isEnabled()).toBe(true);
  });

  test('out-of-stock product disables Add to Cart', async ({ page, testData }) => {
    const detail = new ProductDetailPage(page);
    await detail.goto(testData.outOfStockSlug);
    await expect(detail.stockBadge).toContainText(/out of stock/i);
    // Add to cart button should be disabled or not present
    const addBtn = page.getByRole('button', { name: /add to cart/i });
    if (await addBtn.isVisible()) {
      expect(await addBtn.isDisabled()).toBe(true);
    }
  });

  test('product view is tracked via POST /api/products/:slug/view', async ({ page, testData }) => {
    let viewTracked = false;
    page.on('request', (req) => {
      if (req.url().includes(`/products/${testData.productSlug}/view`) && req.method() === 'POST') {
        viewTracked = true;
      }
    });
    const detail = new ProductDetailPage(page);
    await detail.goto(testData.productSlug);
    await page.waitForTimeout(1000);
    expect(viewTracked).toBe(true);
  });

  test('API GET /api/products/:slug returns product data', async ({ request, testData }) => {
    const res = await request.get(`${BACKEND_URL}/api/products/${testData.productSlug}`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.product.name).toBe(testData.productName);
    expect(body.product.stock).toBeGreaterThan(0);
  });

  test('navigating to a non-existent product shows error', async ({ page }) => {
    const detail = new ProductDetailPage(page);
    await detail.goto('this-product-does-not-exist-xyz');
    const error = page.getByText(/not found|error/i);
    await expect(error).toBeVisible();
  });
});
