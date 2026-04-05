import { Page, Locator } from '@playwright/test';

export class AdminCouponsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly newCouponBtn: Locator;
  readonly couponRows: Locator;

  // Form fields
  readonly codeInput: Locator;
  readonly descriptionInput: Locator;
  readonly discountValueInput: Locator;
  readonly minOrderInput: Locator;
  readonly maxUsesInput: Locator;
  readonly discountTypeSelect: Locator;
  readonly activeCheckbox: Locator;
  readonly saveBtn: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: /coupons/i }).first();
    this.newCouponBtn = page.getByRole('link', { name: /new coupon|add coupon/i });
    this.couponRows = page.locator('tbody tr');

    this.codeInput = page.locator('input[name="code"], #code').first();
    this.descriptionInput = page.locator('input[name="description"], textarea[name="description"]').first();
    this.discountValueInput = page.locator('input[name="discountValue"], #discountValue').first();
    this.minOrderInput = page.locator('input[name="minOrderValue"], #minOrderValue').first();
    this.maxUsesInput = page.locator('input[name="maxUses"], #maxUses').first();
    this.discountTypeSelect = page.locator('select[name="discountType"], #discountType');
    this.activeCheckbox = page.locator('input[type="checkbox"][name="isActive"], #isActive');
    this.saveBtn = page.getByRole('button', { name: /save|create|submit/i }).first();
  }

  async gotoList() {
    await this.page.goto('/coupons');
    await this.page.waitForLoadState('networkidle');
  }

  async gotoNew() {
    await this.page.goto('/coupons/new');
    await this.page.waitForLoadState('networkidle');
  }

  async fillCouponForm(data: {
    code: string;
    discountValue: string;
    discountType?: 'percent' | 'fixed';
    minOrderValue?: string;
    maxUses?: string;
    description?: string;
  }) {
    await this.codeInput.fill(data.code);
    await this.discountValueInput.fill(data.discountValue);
    if (data.discountType) {
      await this.discountTypeSelect.selectOption(data.discountType);
    }
    if (data.minOrderValue) await this.minOrderInput.fill(data.minOrderValue);
    if (data.maxUses) await this.maxUsesInput.fill(data.maxUses);
    if (data.description) await this.descriptionInput.fill(data.description);
  }

  async save() {
    await this.saveBtn.click();
  }

  async getRowCount(): Promise<number> {
    return this.couponRows.count();
  }

  async clickDeleteForCode(code: string) {
    const row = this.couponRows.filter({ hasText: code });
    await row.getByRole('button', { name: /delete/i }).click();
  }

  async confirmDelete() {
    await this.page.getByRole('button', { name: /confirm|yes|delete/i }).click();
  }
}
