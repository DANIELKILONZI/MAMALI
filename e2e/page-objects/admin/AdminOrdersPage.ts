import { Page, Locator } from '@playwright/test';

export class AdminOrdersPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly orderRows: Locator;
  readonly statusFilter: Locator;
  readonly searchInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: /orders/i }).first();
    this.orderRows = page.locator('tbody tr');
    this.statusFilter = page.locator('select').first();
    this.searchInput = page.locator('input[type="search"], input[placeholder*="search" i]').first();
  }

  async goto() {
    await this.page.goto('/orders');
    await this.page.waitForLoadState('networkidle');
  }

  async getOrderCount(): Promise<number> {
    return this.orderRows.count();
  }

  async clickOrderRow(index = 0) {
    await this.orderRows.nth(index).click();
    await this.page.waitForLoadState('networkidle');
  }

  async filterByStatus(status: string) {
    await this.statusFilter.selectOption(status);
    await this.page.waitForLoadState('networkidle');
  }

  async getOrderNumberAtRow(index = 0): Promise<string> {
    return (await this.orderRows.nth(index).locator('td').first().textContent() ?? '').trim();
  }

  /** On the order detail page, update the status */
  async updateStatusOnDetailPage(newStatus: string) {
    const statusSelect = this.page.locator('select').first();
    await statusSelect.selectOption(newStatus);
    const saveBtn = this.page.getByRole('button', { name: /update|save|confirm/i });
    await saveBtn.click();
  }
}
