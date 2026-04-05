import { Page, Locator } from '@playwright/test';

export class AdminProductsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly newProductBtn: Locator;
  readonly productRows: Locator;
  readonly searchInput: Locator;

  // New product form fields
  readonly nameInput: Locator;
  readonly slugInput: Locator;
  readonly descriptionInput: Locator;
  readonly priceInput: Locator;
  readonly stockInput: Locator;
  readonly discountInput: Locator;
  readonly saveBtn: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: /products/i }).first();
    this.newProductBtn = page.getByRole('link', { name: /new product|add product/i });
    this.productRows = page.locator('tbody tr');
    this.searchInput = page.locator('input[type="search"], input[placeholder*="search" i]').first();

    // Form (used on /products/new and /products/:id/edit)
    this.nameInput = page.locator('input[name="name"], #name, input[placeholder*="name" i]').first();
    this.slugInput = page.locator('input[name="slug"], #slug').first();
    this.descriptionInput = page.locator('textarea[name="description"], #description').first();
    this.priceInput = page.locator('input[name="price"], #price').first();
    this.stockInput = page.locator('input[name="stock"], #stock').first();
    this.discountInput = page.locator('input[name="discount"], #discount').first();
    this.saveBtn = page.getByRole('button', { name: /save|create|submit/i }).first();
  }

  async gotoList() {
    await this.page.goto('/products');
    await this.page.waitForLoadState('networkidle');
  }

  async gotoNewProduct() {
    await this.page.goto('/products/new');
    await this.page.waitForLoadState('networkidle');
  }

  async fillProductForm(data: {
    name: string;
    slug: string;
    price: string;
    stock: string;
    description?: string;
    discount?: string;
  }) {
    await this.nameInput.fill(data.name);
    await this.slugInput.fill(data.slug);
    await this.priceInput.fill(data.price);
    await this.stockInput.fill(data.stock);
    if (data.description) await this.descriptionInput.fill(data.description);
    if (data.discount) await this.discountInput.fill(data.discount);
  }

  async submitForm() {
    await this.saveBtn.click();
  }

  async getProductRowCount(): Promise<number> {
    return this.productRows.count();
  }

  async clickEditForRow(index = 0) {
    const editBtn = this.productRows.nth(index).getByRole('link', { name: /edit/i });
    await editBtn.click();
    await this.page.waitForLoadState('networkidle');
  }

  async clickDeleteForRow(index = 0) {
    const deleteBtn = this.productRows.nth(index).getByRole('button', { name: /delete|deactivate/i });
    await deleteBtn.click();
  }

  async confirmDelete() {
    const confirmBtn = this.page.getByRole('button', { name: /confirm|yes|delete/i });
    await confirmBtn.click();
  }
}
