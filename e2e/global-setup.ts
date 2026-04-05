/**
 * Global setup — seeds the test database with an admin user, a test product,
 * an out-of-stock product, and two test coupons (valid + expired).
 *
 * Runs once before all tests. Uses Prisma directly so the setup is fast and
 * doesn't depend on a running server.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../backend/.env') });

// Override DATABASE_URL for tests to use backend's dev.db
const DATABASE_URL = process.env.DATABASE_URL || 'file:../backend/prisma/dev.db';

const prisma = new PrismaClient({
  datasources: { db: { url: DATABASE_URL } },
});

// IDs are written to a shared file so individual tests can reference them
export const TEST_DATA_FILE = path.join(__dirname, '.auth/test-data.json');

export interface TestData {
  adminId: string;
  adminEmail: string;
  adminPassword: string;
  productId: string;
  productSlug: string;
  productName: string;
  outOfStockProductId: string;
  outOfStockSlug: string;
  validCouponCode: string;
  expiredCouponCode: string;
  zerouseCouponCode: string;
  categoryId: string;
  categorySlug: string;
}

async function globalSetup() {
  console.log('\n[global-setup] Seeding test data…');

  fs.mkdirSync(path.join(__dirname, '.auth'), { recursive: true });

  // ── Admin user ─────────────────────────────────────────────────────────────
  const adminEmail = 'e2e-admin@mamali.test';
  const adminPassword = 'E2eAdmin@123';
  const hashed = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { password: hashed, isActive: true, role: 'ADMIN' },
    create: { name: 'E2E Admin', email: adminEmail, password: hashed, role: 'ADMIN', isActive: true },
  });

  // ── Category ───────────────────────────────────────────────────────────────
  const categorySlug = 'e2e-test-category';
  const category = await prisma.category.upsert({
    where: { slug: categorySlug },
    update: { name: 'E2E Test Category' },
    create: { name: 'E2E Test Category', slug: categorySlug, sortOrder: 0 },
  });

  // ── In-stock product ───────────────────────────────────────────────────────
  const productSlug = 'e2e-test-product';
  const product = await prisma.product.upsert({
    where: { slug: productSlug },
    update: {
      name: 'E2E Test Product',
      price: 1500,
      stock: 50,
      isActive: true,
      reorderLevel: 5,
      images: JSON.stringify(['https://placehold.co/400x400/blue/white?text=E2E']),
    },
    create: {
      name: 'E2E Test Product',
      slug: productSlug,
      description: 'A product created for E2E testing.',
      price: 1500,
      discount: 0,
      stock: 50,
      reorderLevel: 5,
      categoryId: category.id,
      isActive: true,
      isFeatured: true,
      images: JSON.stringify(['https://placehold.co/400x400/blue/white?text=E2E']),
    },
  });

  // ── Out-of-stock product ───────────────────────────────────────────────────
  const outOfStockSlug = 'e2e-out-of-stock-product';
  const outOfStockProduct = await prisma.product.upsert({
    where: { slug: outOfStockSlug },
    update: { stock: 0, isActive: true },
    create: {
      name: 'E2E Out-of-Stock Product',
      slug: outOfStockSlug,
      description: 'An out-of-stock product for edge-case testing.',
      price: 500,
      stock: 0,
      reorderLevel: 5,
      isActive: true,
      images: JSON.stringify([]),
    },
  });

  // ── Valid coupon ───────────────────────────────────────────────────────────
  const validCouponCode = 'E2ETEST10';
  await prisma.coupon.upsert({
    where: { code: validCouponCode },
    update: { isActive: true, usedCount: 0, expiresAt: null, maxUses: null },
    create: {
      code: validCouponCode,
      description: 'E2E 10% discount coupon',
      discountType: 'percent',
      discountValue: 10,
      minOrderValue: 500,
      isActive: true,
    },
  });

  // ── Expired coupon ─────────────────────────────────────────────────────────
  const expiredCouponCode = 'E2EEXPIRED';
  await prisma.coupon.upsert({
    where: { code: expiredCouponCode },
    update: { isActive: true, expiresAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) },
    create: {
      code: expiredCouponCode,
      description: 'E2E expired coupon',
      discountType: 'percent',
      discountValue: 20,
      isActive: true,
      expiresAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
    },
  });

  // ── Zero-remaining coupon ──────────────────────────────────────────────────
  const zerouseCouponCode = 'E2EMAXUSED';
  await prisma.coupon.upsert({
    where: { code: zerouseCouponCode },
    update: { maxUses: 1, usedCount: 1, isActive: true, expiresAt: null },
    create: {
      code: zerouseCouponCode,
      description: 'E2E max-used coupon',
      discountType: 'fixed',
      discountValue: 100,
      maxUses: 1,
      usedCount: 1,
      isActive: true,
    },
  });

  const testData: TestData = {
    adminId: admin.id,
    adminEmail,
    adminPassword,
    productId: product.id,
    productSlug,
    productName: product.name,
    outOfStockProductId: outOfStockProduct.id,
    outOfStockSlug,
    validCouponCode,
    expiredCouponCode,
    zerouseCouponCode,
    categoryId: category.id,
    categorySlug,
  };

  fs.writeFileSync(TEST_DATA_FILE, JSON.stringify(testData, null, 2));
  console.log('[global-setup] Test data seeded ✓');

  await prisma.$disconnect();
}

export default globalSetup;
