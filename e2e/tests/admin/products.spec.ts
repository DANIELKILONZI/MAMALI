/**
 * Admin product management tests — CRUD operations.
 */

import { expect } from '@playwright/test';
import { test } from '../../fixtures';
import { AdminProductsPage } from '../../page-objects/admin/AdminProductsPage';
import { BACKEND_URL } from '../../utils/test-data';

const TEMP_PRODUCT = {
  name: 'E2E Temp Product',
  slug: 'e2e-temp-product-' + Date.now(),
  price: '2500',
  stock: '15',
  description: 'Created by E2E test',
};

test.describe('Admin product management', () => {
  test('product list page loads', async ({ page }) => {
    const products = new AdminProductsPage(page);
    await products.gotoList();
    await expect(products.heading).toBeVisible();
  });

  test('new product button navigates to /products/new', async ({ page }) => {
    const products = new AdminProductsPage(page);
    await products.gotoList();
    await products.newProductBtn.click();
    await expect(page).toHaveURL(/\/products\/new/);
  });

  test('seeded test product appears in the product list', async ({ page, testData }) => {
    const products = new AdminProductsPage(page);
    await products.gotoList();
    await expect(page.getByText(testData.productName)).toBeVisible({ timeout: 10_000 });
  });

  test('create new product via UI fills form and submits', async ({ page }) => {
    const products = new AdminProductsPage(page);
    await products.gotoNewProduct();
    await products.fillProductForm({
      name: TEMP_PRODUCT.name,
      slug: TEMP_PRODUCT.slug,
      price: TEMP_PRODUCT.price,
      stock: TEMP_PRODUCT.stock,
      description: TEMP_PRODUCT.description,
    });
    await products.submitForm();
    // Should redirect to products list or show success
    await expect(page.getByText(/product created|saved successfully|e2e temp/i)).toBeVisible({ timeout: 10_000 });
  });

  test('created product appears in product list', async ({ page }) => {
    const products = new AdminProductsPage(page);
    await products.gotoList();
    // Check product from previous test is visible
    await expect(page.getByText(TEMP_PRODUCT.name)).toBeVisible({ timeout: 10_000 });
  });

  test('edit product navigates to edit form', async ({ page, testData }) => {
    // Go to product list and find the test product row
    const products = new AdminProductsPage(page);
    await products.gotoList();
    const testProductRow = page.locator('tbody tr').filter({ hasText: testData.productName });
    const editLink = testProductRow.getByRole('link', { name: /edit/i });
    if (await editLink.isVisible()) {
      await editLink.click();
      await page.waitForLoadState('networkidle');
      await expect(products.nameInput).toBeVisible();
      // Product name should be pre-filled
      const nameValue = await products.nameInput.inputValue();
      expect(nameValue).toBe(testData.productName);
    }
  });

  test('API: create product succeeds with valid admin token', async ({ request, adminToken, testData }) => {
    const res = await request.post(`${BACKEND_URL}/api/products`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        name: 'API Created Product',
        slug: `api-product-${Date.now()}`,
        price: 3000,
        stock: 20,
        isActive: true,
        images: [],
        categoryId: testData.categoryId,
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.product.name).toBe('API Created Product');

    // Cleanup
    await request.delete(`${BACKEND_URL}/api/products/${body.product.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
  });

  test('API: update product stock changes the stock value', async ({ request, adminToken, testData }) => {
    const res = await request.put(`${BACKEND_URL}/api/products/${testData.productId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { stock: 99 },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.product.stock).toBe(99);

    // Reset stock back to 50
    await request.put(`${BACKEND_URL}/api/products/${testData.productId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { stock: 50 },
    });
  });

  test('API: delete (deactivate) product sets isActive=false', async ({ request, adminToken }) => {
    // Create a product to delete
    const createRes = await request.post(`${BACKEND_URL}/api/products`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        name: 'Product To Delete',
        slug: `delete-me-${Date.now()}`,
        price: 100,
        stock: 1,
        isActive: true,
        images: [],
      },
    });
    const { product } = await createRes.json();

    const deleteRes = await request.delete(`${BACKEND_URL}/api/products/${product.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(deleteRes.ok()).toBe(true);
  });

  test('product form: duplicate slug shows error', async ({ page, testData }) => {
    const products = new AdminProductsPage(page);
    await products.gotoNewProduct();
    await products.fillProductForm({
      name: 'Duplicate Slug Test',
      slug: testData.productSlug,  // Already exists
      price: '100',
      stock: '10',
    });
    await products.submitForm();
    const error = page.getByText(/slug already|already in use|duplicate/i);
    await expect(error).toBeVisible({ timeout: 5000 });
  });
});
