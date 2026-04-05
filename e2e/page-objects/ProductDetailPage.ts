import { Page, Locator } from '@playwright/test';

export class ProductDetailPage {
  readonly page: Page;
  readonly productName: Locator;
  readonly price: Locator;
  readonly addToCartBtn: Locator;
  readonly buyNowBtn: Locator;
  readonly stockBadge: Locator;
  readonly quantityIncrease: Locator;
  readonly quantityDecrease: Locator;
  readonly quantityDisplay: Locator;
  readonly successAlert: Locator;

  constructor(page: Page) {
    this.page = page;
    this.productName = page.getByRole('heading', { level: 1 }).first();
    this.price = page.locator('[data-testid="price"], .text-3xl, .font-bold').filter({ hasText: /KES|Ksh|\d/ }).first();
    this.addToCartBtn = page.getByRole('button', { name: /add to cart/i });
    this.buyNowBtn = page.getByRole('button', { name: /buy now/i });
    this.stockBadge = page.locator('[class*="badge"], span').filter({ hasText: /in stock|out of stock|low stock/i }).first();
    this.quantityIncrease = page.getByRole('button', { name: '+' }).or(page.locator('button').filter({ hasText: '+' }).first());
    this.quantityDecrease = page.getByRole('button', { name: '-' }).or(page.locator('button').filter({ hasText: '-' }).first());
    this.quantityDisplay = page.locator('input[type="number"], [data-testid="quantity"]').first().or(
      page.locator('span').filter({ hasText: /^\d+$/ }).first()
    );
    this.successAlert = page.getByText(/added to cart|item added/i).first();
  }

  async goto(slug: string) {
    await this.page.goto(`/products/${slug}`);
    await this.page.waitForLoadState('networkidle');
  }

  async addToCart() {
    await this.addToCartBtn.click();
  }

  async buyNow() {
    await this.buyNowBtn.click();
  }

  async increaseQuantity(times = 1) {
    for (let i = 0; i < times; i++) {
      await this.quantityIncrease.click();
    }
  }

  async decreaseQuantity(times = 1) {
    for (let i = 0; i < times; i++) {
      await this.quantityDecrease.click();
    }
  }

  /** Wait for the "Added to cart" feedback to appear */
  async waitForCartConfirmation() {
    await this.successAlert.waitFor({ state: 'visible', timeout: 5000 });
  }
}
