/**
 * Integration test helpers.
 *
 * Provides functions to seed minimal test fixtures into the REAL SQLite
 * dev database (same file used by the dev server, but tests use unique
 * slugs/codes/phones to avoid conflicts and clean up after themselves).
 *
 * Call `seedIntegrationData()` in beforeAll, `cleanIntegrationData()` in
 * afterAll. Each suite uses a unique prefix (e.g. 'INT_ORD_') so multiple
 * suites can run in the same process without stepping on each other.
 */

import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma';

export interface IntegrationFixtures {
  adminId: string;
  adminEmail: string;
  adminPassword: string;
  adminToken: string;
  categoryId: string;
  productId: string;
  productStock: number;
  couponId: string;
  couponCode: string;
  expiredCouponCode: string;
  maxUsedCouponCode: string;
}

/** Login via bcrypt compare + JWT generation (same logic as auth route). */
async function generateToken(userId: string): Promise<string> {
  // We import JWT directly rather than calling the server so tests don't
  // need a running HTTP server.
  const jwt = await import('jsonwebtoken');
  const secret = process.env.JWT_SECRET ?? 'test-secret-change-me';
  return jwt.sign({ id: userId, role: 'ADMIN' }, secret, { expiresIn: '1h' });
}

export async function seedIntegrationData(prefix = 'INT_'): Promise<IntegrationFixtures> {
  const adminPassword = 'TestAdmin@123';
  const hashedPw = await bcrypt.hash(adminPassword, 8);

  // ── Admin user ────────────────────────────────────────────────────────────
  const admin = await prisma.user.create({
    data: {
      name: `${prefix}Admin`,
      email: `${prefix.toLowerCase()}admin@test.local`,
      password: hashedPw,
      role: 'ADMIN',
      isActive: true,
    },
  });

  const adminToken = await generateToken(admin.id);

  // ── Category ──────────────────────────────────────────────────────────────
  const category = await prisma.category.create({
    data: {
      name: `${prefix}Category`,
      slug: `${prefix.toLowerCase()}category`,
    },
  });

  // ── Product ───────────────────────────────────────────────────────────────
  const product = await prisma.product.create({
    data: {
      name: `${prefix}Product`,
      slug: `${prefix.toLowerCase()}product`,
      description: 'Integration test product',
      price: 1500,
      stock: 20,
      categoryId: category.id,
      isActive: true,
      images: '[]',
    },
  });

  // ── Valid coupon (10% off, min order 500) ─────────────────────────────────
  const coupon = await prisma.coupon.create({
    data: {
      code: `${prefix}SAVE10`,
      discountType: 'percent',
      discountValue: 10,
      minOrderValue: 500,
      maxUses: 100,
      usedCount: 0,
      isActive: true,
    },
  });

  // ── Expired coupon ────────────────────────────────────────────────────────
  await prisma.coupon.create({
    data: {
      code: `${prefix}EXPIRED`,
      discountType: 'percent',
      discountValue: 20,
      minOrderValue: 0,
      maxUses: null,
      usedCount: 0,
      isActive: true,
      expiresAt: new Date('2000-01-01'),
    },
  });

  // ── Max-used coupon ───────────────────────────────────────────────────────
  await prisma.coupon.create({
    data: {
      code: `${prefix}MAXUSED`,
      discountType: 'fixed',
      discountValue: 100,
      minOrderValue: 0,
      maxUses: 1,
      usedCount: 1,
      isActive: true,
    },
  });

  return {
    adminId: admin.id,
    adminEmail: `${prefix.toLowerCase()}admin@test.local`,
    adminPassword,
    adminToken,
    categoryId: category.id,
    productId: product.id,
    productStock: 20,
    couponId: coupon.id,
    couponCode: coupon.code,
    expiredCouponCode: `${prefix}EXPIRED`,
    maxUsedCouponCode: `${prefix}MAXUSED`,
  };
}

export async function cleanIntegrationData(prefix = 'INT_'): Promise<void> {
  // Delete in FK-safe order

  // Remove any BlockedCustomer records from tests
  await prisma.blockedCustomer.deleteMany({
    where: { phone: { startsWith: '25479999' } },
  });

  // Orders created during tests (identified by customer phone pattern)
  const testOrders = await prisma.order.findMany({
    where: { customerPhone: { startsWith: '25479999' } },
    select: { id: true },
  });
  if (testOrders.length > 0) {
    const ids = testOrders.map((o) => o.id);
    await prisma.activityLog.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.notificationLog.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
  }

  // Coupons
  await prisma.coupon.deleteMany({ where: { code: { startsWith: prefix } } });

  // Products (and their views)
  const products = await prisma.product.findMany({
    where: { slug: { startsWith: prefix.toLowerCase() } },
    select: { id: true },
  });
  if (products.length > 0) {
    const pids = products.map((p) => p.id);
    await prisma.productView.deleteMany({ where: { productId: { in: pids } } });
    await prisma.product.deleteMany({ where: { id: { in: pids } } });
  }

  // Category
  await prisma.category.deleteMany({ where: { slug: { startsWith: prefix.toLowerCase() } } });

  // Admin user
  const admin = await prisma.user.findUnique({
    where: { email: `${prefix.toLowerCase()}admin@test.local` },
  });
  if (admin) {
    await prisma.refreshToken.deleteMany({ where: { userId: admin.id } });
    await prisma.loginAttempt.deleteMany({ where: { email: `${prefix.toLowerCase()}admin@test.local` } });
    await prisma.activityLog.deleteMany({ where: { userId: admin.id } });
    await prisma.user.delete({ where: { id: admin.id } });
  }
}
