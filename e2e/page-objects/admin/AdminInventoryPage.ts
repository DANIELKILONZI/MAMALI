import { Page, Locator } from '@playwright/test';

export class AdminInventoryPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly reorderAlertsSection: Locator;
  readonly fastMoversSection: Locator;
  readonly deadStockSection: Locator;
  readonly summaryCards: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: /inventory/i }).first();
    this.reorderAlertsSection = page.getByText(/reorder alert/i).locator('..').locator('..');
    this.fastMoversSection = page.getByText(/fast mover/i).locator('..').locator('..');
    this.deadStockSection = page.getByText(/dead stock/i).locator('..').locator('..');
    this.summaryCards = page.locator('.grid > div').filter({ has: page.locator('p.text-2xl') });
  }

  async goto() {
    await this.page.goto('/inventory');
    await this.page.waitForLoadState('networkidle');
  }

  async getOutOfStockCount(): Promise<string> {
    const card = this.page.getByText(/out of stock/i).first().locator('..').locator('p.text-2xl').first();
    return (await card.textContent() ?? '').trim();
  }
}
