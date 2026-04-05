import { Page, Locator } from '@playwright/test';

export class AdminSettingsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly businessNameInput: Locator;
  readonly currencyInput: Locator;
  readonly primaryColorInput: Locator;
  readonly saveBtn: Locator;
  readonly successToast: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: /settings/i }).first();
    this.businessNameInput = page.locator('input[name="businessName"], #businessName').first();
    this.currencyInput = page.locator('input[name="currency"], #currency').first();
    this.primaryColorInput = page.locator('input[name="primaryColor"], #primaryColor').first();
    this.saveBtn = page.getByRole('button', { name: /save|update/i }).first();
    this.successToast = page.getByText(/saved|updated|success/i);
  }

  async goto() {
    await this.page.goto('/settings');
    await this.page.waitForLoadState('networkidle');
  }

  async updateBusinessName(name: string) {
    await this.businessNameInput.fill(name);
    await this.saveBtn.click();
    await this.successToast.waitFor({ state: 'visible', timeout: 10_000 });
  }

  async getBusinessName(): Promise<string> {
    return this.businessNameInput.inputValue();
  }
}
