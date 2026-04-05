/**
 * Cart page tests — add/remove/update quantities, empty state, proceed to checkout.
 */

import { expect } from '@playwright/test';
import { test } from '../../fixtures';
import { CartPage } from '../../page-objects/CartPage';
import { ProductDetailPage } from '../../page-objects/ProductDetailPage';

test.describe('Cart page', () => {
  test.beforeEach(async ({ page }) => {
    // Start each test with a clean cart
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('mamali_cart'));
  });

  test('shows empty state when cart is empty', async ({ page }) => {
    const cart = new CartPage(page);
    await cart.goto();
    await expect(cart.emptyState).toBeVisible();
  });

  test('shows continue shopping CTA on empty cart', async ({ page }) => {
    const cart = new CartPage(page);
    await cart.goto();
    await expect(cart.continueShoppingBtn).toBeVisible();
    await cart.continueShoppingBtn.click();
    await expect(page).toHaveURL(/\/products/);
  });

  test('adding a product via product page shows it in cart', async ({ page, testData }) => {
    const detail = new ProductDetailPage(page);
    await detail.goto(testData.productSlug);
    await detail.addToCart();

    const cart = new CartPage(page);
    await cart.goto();
    await expect(page.getByText(testData.productName)).toBeVisible();
    const itemCount = await cart.getItemCount();
    expect(itemCount).toBeGreaterThanOrEqual(1);
  });

  test('injecting a cart item directly shows it on cart page', async ({ page, testData }) => {
    const cart = new CartPage(page);
    await page.goto('/cart');
    await cart.injectCartItem({
      productId: testData.productId,
      name: testData.productName,
      price: 1500,
      quantity: 2,
      stock: 50,
    });
    await expect(page.getByText(testData.productName)).toBeVisible();
  });

  test('increasing quantity updates the item count', async ({ page, testData }) => {
    const cart = new CartPage(page);
    await page.goto('/cart');
    await cart.injectCartItem({
      productId: testData.productId,
      name: testData.productName,
      price: 1500,
      quantity: 1,
      stock: 50,
    });
    await cart.increaseItemQuantity(0);
    // Check the subtotal has increased (1500 * 2 = 3000)
    await expect(page.getByText(/3,000|3000/)).toBeVisible({ timeout: 5000 });
  });

  test('decreasing quantity to 0 removes the item', async ({ page, testData }) => {
    const cart = new CartPage(page);
    await page.goto('/cart');
    await cart.injectCartItem({
      productId: testData.productId,
      name: testData.productName,
      price: 1500,
      quantity: 1,
      stock: 50,
    });
    await cart.decreaseItemQuantity(0);
    // Item should be removed — empty state or no product name
    await expect(cart.emptyState).toBeVisible({ timeout: 5000 });
  });

  test('remove button removes item from cart', async ({ page, testData }) => {
    const cart = new CartPage(page);
    await page.goto('/cart');
    await cart.injectCartItem({
      productId: testData.productId,
      name: testData.productName,
      price: 1500,
      quantity: 1,
      stock: 50,
    });
    await cart.removeItem(0);
    await expect(cart.emptyState).toBeVisible({ timeout: 5000 });
  });

  test('checkout button navigates to /checkout', async ({ page, testData }) => {
    const cart = new CartPage(page);
    await page.goto('/cart');
    await cart.injectCartItem({
      productId: testData.productId,
      name: testData.productName,
      price: 1500,
      quantity: 1,
      stock: 50,
    });
    await cart.proceedToCheckout();
    await expect(page).toHaveURL(/\/checkout/);
  });

  test('cart persists across page reload', async ({ page, testData }) => {
    const cart = new CartPage(page);
    await page.goto('/cart');
    await cart.injectCartItem({
      productId: testData.productId,
      name: testData.productName,
      price: 1500,
      quantity: 3,
      stock: 50,
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    // Product should still be there after reload
    await expect(page.getByText(testData.productName)).toBeVisible();
  });

  test('cart header badge count reflects added items', async ({ page, testData }) => {
    await page.evaluate(() => localStorage.removeItem('mamali_cart'));
    const detail = new ProductDetailPage(page);
    await detail.goto(testData.productSlug);
    await detail.addToCart();
    // Badge in header should be 1
    const badge = page.locator('header span').filter({ hasText: /^\d+$/ }).first();
    await expect(badge).toBeVisible();
    const count = parseInt(await badge.textContent() ?? '0', 10);
    expect(count).toBe(1);
  });
});
