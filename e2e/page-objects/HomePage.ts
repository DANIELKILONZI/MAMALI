import { Page, Locator } from '@playwright/test';

export class HomePage {
  readonly page: Page;
  readonly logo: Locator;
  readonly heroSection: Locator;
  readonly productsLink: Locator;
  readonly cartLink: Locator;
  readonly featuredProducts: Locator;

  constructor(page: Page) {
    this.page = page;
    this.logo = page.getByRole('link', { name: /MAMALI/i }).first();
    this.productsLink = page.getByRole('link', { name: /products/i }).first();
    this.cartLink = page.getByRole('link', { name: /cart/i });
    this.heroSection = page.locator('main section').first();
    this.featuredProducts = page.locator('[data-testid="featured-products"], .grid a').first();
  }

  async goto() {
    await this.page.goto('/');
    await this.page.waitForLoadState('networkidle');
  }

  async clickProductsNav() {
    await this.productsLink.click();
  }

  async clickCartIcon() {
    await this.cartLink.click();
  }

  async clickBrandLogo() {
    await this.logo.click();
  }

  /** Returns the number displayed in the cart badge, or 0 if not visible. */
  async getCartCount(): Promise<number> {
    const badge = this.page.locator('header span').filter({ hasText: /^\d+$/ }).first();
    if (await badge.isVisible()) {
      return parseInt(await badge.textContent() ?? '0', 10);
    }
    return 0;
  }

  /** Navigate to the first product visible on the homepage. */
  async clickFirstProduct() {
    const productLinks = this.page.locator('a[href^="/products/"]');
    await productLinks.first().click();
  }
}
