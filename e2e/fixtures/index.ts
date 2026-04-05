/**
 * Custom Playwright test fixtures.
 *
 * Extends the base `test` with:
 *  - `testData`  — the seeded test data (IDs, credentials, slugs)
 *  - `adminToken` — a valid admin JWT fetched once per worker
 */

import { test as base } from '@playwright/test';
import type { TestData } from '../global-setup';
import { loadTestData } from '../utils/test-data';
import { getAdminToken } from '../utils/api-helpers';

// Page-object imports (used when extending further in spec files)
export { expect } from '@playwright/test';

type Fixtures = {
  testData: TestData;
  adminToken: string;
};

export const test = base.extend<Fixtures>({
  testData: async ({}, use) => {
    await use(loadTestData());
  },

  adminToken: async ({ testData }, use) => {
    const token = await getAdminToken(testData.adminEmail, testData.adminPassword);
    await use(token);
  },
});
