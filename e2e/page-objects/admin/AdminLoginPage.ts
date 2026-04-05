import { Page, Locator } from '@playwright/test';

export class AdminLoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitBtn: Locator;
  readonly errorToast: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('input[type="email"]');
    this.passwordInput = page.locator('input[type="password"]');
    this.submitBtn = page.getByRole('button', { name: /sign in|log in/i });
    this.errorToast = page.getByText(/login failed|invalid|credentials/i);
  }

  async goto() {
    await this.page.goto('/login');
    await this.page.waitForLoadState('networkidle');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitBtn.click();
    // Wait for either redirect or error toast
    await Promise.race([
      this.page.waitForURL(/\/dashboard/, { timeout: 10_000 }),
      this.errorToast.waitFor({ state: 'visible', timeout: 10_000 }),
    ]).catch(() => {});
  }

  async isLoggedIn(): Promise<boolean> {
    return this.page.url().includes('/dashboard');
  }
}
