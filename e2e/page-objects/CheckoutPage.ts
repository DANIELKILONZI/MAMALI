import { Page, Locator } from '@playwright/test';

export class CheckoutPage {
  readonly page: Page;
  readonly phoneInput: Locator;
  readonly nameInput: Locator;
  readonly couponInput: Locator;
  readonly applyCouponBtn: Locator;
  readonly placeOrderBtn: Locator;
  readonly orderSummary: Locator;
  readonly discountRow: Locator;
  readonly totalRow: Locator;
  readonly successMessage: Locator;
  readonly errorAlert: Locator;
  readonly paymentPending: Locator;

  constructor(page: Page) {
    this.page = page;
    this.phoneInput = page.locator('input[type="tel"]').or(
      page.locator('input[name="phone"], input[placeholder*="phone" i]')
    ).first();
    this.nameInput = page.locator('input[name="name"], input[placeholder*="name" i]').first();
    this.couponInput = page.locator('input[name="coupon"], input[placeholder*="coupon" i]').first();
    this.applyCouponBtn = page.getByRole('button', { name: /apply/i });
    this.placeOrderBtn = page.getByRole('button', { name: /place order|pay/i });
    this.orderSummary = page.locator('[data-testid="order-summary"]').or(
      page.getByText(/order summary/i).locator('..')
    );
    this.discountRow = page.getByText(/discount/i).first();
    this.totalRow = page.getByText(/total/i).last();
    this.successMessage = page.getByText(/payment successful|order confirmed|thank you/i);
    this.errorAlert = page.getByRole('alert').or(page.locator('[class*="error"], [class*="alert"]')).first();
    this.paymentPending = page.getByText(/waiting for payment|check your phone|m-pesa/i);
  }

  async goto() {
    await this.page.goto('/checkout');
    await this.page.waitForLoadState('networkidle');
  }

  async fillPhone(phone: string) {
    await this.phoneInput.fill(phone);
  }

  async fillName(name: string) {
    await this.nameInput.fill(name);
  }

  async applyCoupon(code: string) {
    await this.couponInput.fill(code);
    await this.applyCouponBtn.click();
    // Wait for validation response
    await this.page.waitForResponse(
      (r) => r.url().includes('/api/coupons/apply') && r.status() < 500,
      { timeout: 10_000 }
    );
  }

  async placeOrder() {
    await this.placeOrderBtn.click();
  }

  async fillAndSubmit(params: {
    phone: string;
    name?: string;
    couponCode?: string;
  }) {
    await this.fillPhone(params.phone);
    if (params.name) await this.fillName(params.name);
    if (params.couponCode) await this.applyCoupon(params.couponCode);
    await this.placeOrder();
  }

  /** Wait for the payment-pending screen (STK push sent to phone). */
  async waitForPaymentPending() {
    await this.paymentPending.waitFor({ state: 'visible', timeout: 15_000 });
  }

  /** Wait for the final success/confirmation screen. */
  async waitForOrderConfirmation() {
    await this.successMessage.waitFor({ state: 'visible', timeout: 15_000 });
  }

  async getDiscountText(): Promise<string> {
    return (await this.discountRow.textContent()) ?? '';
  }

  async getTotalText(): Promise<string> {
    return (await this.totalRow.textContent()) ?? '';
  }
}
