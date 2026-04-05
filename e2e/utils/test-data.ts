/**
 * Shared test data constants and test data helpers.
 * Import from here in all spec files.
 */

import fs from 'fs';
import path from 'path';
import type { TestData } from '../global-setup';

export const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
export const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
export const ADMIN_URL = process.env.ADMIN_URL || 'http://localhost:3001';

/** A Kenyan phone number in M-Pesa format used for test orders. */
export const TEST_PHONE = '0700000001';
export const TEST_PHONE_MPESA = '254700000001';

export function loadTestData(): TestData {
  const file = path.join(__dirname, '../.auth/test-data.json');
  if (!fs.existsSync(file)) {
    throw new Error(
      `test-data.json not found at ${file}. Did global-setup run?`
    );
  }
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as TestData;
}
