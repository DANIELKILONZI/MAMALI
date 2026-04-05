/**
 * Global teardown — removes the seeded test data from the database.
 * Runs once after all tests complete.
 */

import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../backend/.env') });

const DATABASE_URL = process.env.DATABASE_URL || 'file:../backend/prisma/dev.db';

const prisma = new PrismaClient({
  datasources: { db: { url: DATABASE_URL } },
});

async function globalTeardown() {
  console.log('\n[global-teardown] Cleaning up test data…');
  try {
    // Delete test orders (and their items/payments) for our test phone number
    const testPhone = '254700000001';
    const testOrders = await prisma.order.findMany({ where: { customerPhone: testPhone } });
    for (const order of testOrders) {
      await prisma.payment.deleteMany({ where: { orderId: order.id } });
      await prisma.activityLog.deleteMany({ where: { orderId: order.id } });
      await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
      await prisma.order.delete({ where: { id: order.id } });
    }

    // Remove test coupons
    await prisma.coupon.deleteMany({
      where: { code: { in: ['E2ETEST10', 'E2EEXPIRED', 'E2EMAXUSED'] } },
    });

    // Remove test products (product views first)
    await prisma.productView.deleteMany({
      where: { product: { slug: { in: ['e2e-test-product', 'e2e-out-of-stock-product'] } } },
    });
    await prisma.orderItem.deleteMany({
      where: { product: { slug: { in: ['e2e-test-product', 'e2e-out-of-stock-product'] } } },
    });
    await prisma.product.deleteMany({
      where: { slug: { in: ['e2e-test-product', 'e2e-out-of-stock-product'] } },
    });

    // Remove test category
    await prisma.category.deleteMany({ where: { slug: 'e2e-test-category' } });

    // Remove test admin user
    await prisma.loginAttempt.deleteMany({ where: { email: 'e2e-admin@mamali.test' } });
    await prisma.refreshToken.deleteMany({
      where: { user: { email: 'e2e-admin@mamali.test' } },
    });
    await prisma.user.deleteMany({ where: { email: 'e2e-admin@mamali.test' } });

    // Clean up auth state file
    const authFile = path.join(__dirname, '.auth/test-data.json');
    if (fs.existsSync(authFile)) fs.unlinkSync(authFile);

    console.log('[global-teardown] Cleanup complete ✓');
  } catch (err) {
    console.error('[global-teardown] Error during cleanup:', err);
  } finally {
    await prisma.$disconnect();
  }
}

export default globalTeardown;
