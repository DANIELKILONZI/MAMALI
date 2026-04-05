import { defineConfig, devices } from '@playwright/test';
import path from 'path';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const ADMIN_URL = process.env.ADMIN_URL || 'http://localhost:3001';

export const ADMIN_STORAGE_STATE = path.join(__dirname, '.auth/admin.json');

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,

  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
    ...(process.env.CI ? ([['github']] as [['github']]) : []),
  ],

  use: {
    baseURL: FRONTEND_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    actionTimeout: 15_000,
    navigationTimeout: 15_000,
  },

  projects: [
    // 1. Auth setup — saves admin storage state
    {
      name: 'setup',
      testMatch: /setup\/auth\.setup\.ts/,
    },

    // 2. Frontend (customer-facing) tests
    {
      name: 'frontend',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: FRONTEND_URL,
      },
      dependencies: ['setup'],
      testMatch: /frontend\/.+\.spec\.ts/,
    },

    // 3. Admin dashboard tests (authenticated via saved storage state)
    {
      name: 'admin',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: ADMIN_URL,
        storageState: ADMIN_STORAGE_STATE,
      },
      dependencies: ['setup'],
      testMatch: /admin\/.+\.spec\.ts/,
    },
  ],

  globalSetup: require.resolve('./global-setup'),
  globalTeardown: require.resolve('./global-teardown'),

  webServer: [
    {
      command: 'cd ../backend && npm run dev',
      url: `${BACKEND_URL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        DATABASE_URL: 'file:../backend/prisma/dev.db',
        NODE_ENV: 'test',
      },
    },
    {
      command: 'cd ../frontend && npm run dev',
      url: FRONTEND_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'cd ../admin && npm run dev -- -p 3001',
      url: ADMIN_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
