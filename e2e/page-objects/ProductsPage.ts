import { Page, Locator } from '@playwright/test';

export class ProductsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly searchInput: Locator;
  readonly productCards: Locator;
  readonly paginationNext: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: /products/i }).first();
    this.searchInput = page.getByRole('textbox', { name: /search/i }).or(
      page.locator('input[type="search"], input[placeholder*="search" i]')
    );
    this.productCards = page.locator('a[href^="/products/"]');
    this.paginationNext = page.getByRole('button', { name: /next/i });
  }

  async goto() {
    await this.page.goto('/products');
    await this.page.waitForLoadState('networkidle');
  }

  async gotoWithCategory(slug: string) {
    await this.page.goto(`/categories/${slug}`);
    await this.page.waitForLoadState('networkidle');
  }

  async search(query: string) {
    await this.searchInput.fill(query);
    await this.page.keyboard.press('Enter');
    await this.page.waitForLoadState('networkidle');
  }

  async getProductCount(): Promise<number> {
    return this.productCards.count();
  }

  async clickProductByIndex(index: number) {
    await this.productCards.nth(index).click();
  }

  async clickProductByName(name: string) {
    await this.page.getByRole('link', { name }).first().click();
  }

  /** Wait until at least one product card is visible */
  async waitForProducts() {
    await this.productCards.first().waitFor({ state: 'visible' });
  }
}
