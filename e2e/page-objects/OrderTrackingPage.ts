import { Page, Locator } from '@playwright/test';

export class OrderTrackingPage {
  readonly page: Page;
  readonly orderNumber: Locator;
  readonly orderStatus: Locator;
  readonly orderTotal: Locator;
  readonly customerPhone: Locator;

  constructor(page: Page) {
    this.page = page;
    this.orderNumber = page.locator('[data-testid="order-number"]').or(
      page.getByText(/ORD-/i).first()
    );
    this.orderStatus = page.locator('[data-testid="order-status"]').or(
      page.locator('span').filter({ hasText: /pending|paid|processing|delivered|cancelled/i }).first()
    );
    this.orderTotal = page.locator('[data-testid="order-total"]').or(
      page.getByText(/total/i).locator('..').locator('span, strong').last()
    );
    this.customerPhone = page.locator('[data-testid="customer-phone"]').or(
      page.getByText(/07\d{8}|2547\d{8}/).first()
    );
  }

  async goto(orderNumber: string) {
    await this.page.goto(`/orders/${orderNumber}`);
    await this.page.waitForLoadState('networkidle');
  }

  async getStatus(): Promise<string> {
    return (await this.orderStatus.textContent() ?? '').trim().toLowerCase();
  }
}
