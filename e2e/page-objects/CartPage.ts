import { Page, Locator } from '@playwright/test';

export class CartPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly cartItems: Locator;
  readonly emptyState: Locator;
  readonly checkoutBtn: Locator;
  readonly continueShoppingBtn: Locator;
  readonly subtotalText: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: /cart|shopping/i }).first();
    this.cartItems = page.locator('li, [data-testid="cart-item"]').filter({ has: page.locator('button') });
    this.emptyState = page.getByText(/your cart is empty|no items/i);
    this.checkoutBtn = page.getByRole('link', { name: /checkout/i }).or(
      page.getByRole('button', { name: /checkout/i })
    );
    this.continueShoppingBtn = page.getByRole('link', { name: /continue shopping|shop/i });
    this.subtotalText = page.getByText(/subtotal/i).first();
  }

  async goto() {
    await this.page.goto('/cart');
    await this.page.waitForLoadState('networkidle');
  }

  async getItemCount(): Promise<number> {
    return this.cartItems.count();
  }

  async removeItem(index = 0) {
    const removeBtn = this.page.getByRole('button', { name: /remove|delete|×/i });
    await removeBtn.nth(index).click();
  }

  async increaseItemQuantity(index = 0) {
    const increaseBtns = this.page.locator('button').filter({ hasText: '+' });
    await increaseBtns.nth(index).click();
  }

  async decreaseItemQuantity(index = 0) {
    const decreaseBtns = this.page.locator('button').filter({ hasText: '-' });
    await decreaseBtns.nth(index).click();
  }

  async proceedToCheckout() {
    await this.checkoutBtn.click();
  }

  async getSubtotal(): Promise<string> {
    const subtotalLine = this.page.locator('text=/subtotal/i').locator('..').locator('span').last();
    return (await subtotalLine.textContent()) ?? '';
  }

  /** Sets cart localStorage directly to inject items without going through product pages. */
  async injectCartItem(item: {
    productId: string;
    name: string;
    price: number;
    quantity: number;
    stock: number;
    image?: string;
  }) {
    await this.page.evaluate((cartItem) => {
      const existing = JSON.parse(localStorage.getItem('mamali_cart') ?? '[]');
      existing.push(cartItem);
      localStorage.setItem('mamali_cart', JSON.stringify(existing));
    }, item);
    // Reload so the CartContext picks up the new localStorage value
    await this.page.reload();
    await this.page.waitForLoadState('networkidle');
  }

  /** Clears the cart via localStorage. */
  async clearCart() {
    await this.page.evaluate(() => {
      localStorage.removeItem('mamali_cart');
    });
  }
}
