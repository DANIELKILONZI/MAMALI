import { Page, Locator } from '@playwright/test';

export class AdminDashboardPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly totalRevenueCard: Locator;
  readonly totalOrdersCard: Locator;
  readonly lowStockCard: Locator;
  readonly recentOrdersTable: Locator;
  readonly fraudAlertBanner: Locator;
  readonly navAnalytics: Locator;
  readonly navInventory: Locator;
  readonly navProducts: Locator;
  readonly navOrders: Locator;
  readonly navCoupons: Locator;
  readonly navSettings: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: /dashboard/i });
    this.totalRevenueCard = page.getByText(/total revenue/i).first();
    this.totalOrdersCard = page.getByText(/total orders/i).first();
    this.lowStockCard = page.getByText(/low stock/i).first();
    this.recentOrdersTable = page.locator('table').filter({ has: page.locator('th') }).first();
    this.fraudAlertBanner = page.getByText(/high-risk order/i).first();
    this.navAnalytics = page.getByRole('link', { name: /analytics/i });
    this.navInventory = page.getByRole('link', { name: /inventory/i });
    this.navProducts = page.getByRole('link', { name: /products/i }).first();
    this.navOrders = page.getByRole('link', { name: /orders/i }).first();
    this.navCoupons = page.getByRole('link', { name: /coupons/i });
    this.navSettings = page.getByRole('link', { name: /settings/i });
  }

  async goto() {
    await this.page.goto('/dashboard');
    await this.page.waitForLoadState('networkidle');
  }

  async navigateTo(section: 'analytics' | 'inventory' | 'products' | 'orders' | 'coupons' | 'settings') {
    const navMap = {
      analytics: this.navAnalytics,
      inventory: this.navInventory,
      products: this.navProducts,
      orders: this.navOrders,
      coupons: this.navCoupons,
      settings: this.navSettings,
    };
    await navMap[section].click();
    await this.page.waitForLoadState('networkidle');
  }
}
