/**
 * Admin API contract tests.
 *
 * The admin panel is a thin client over these endpoints. Historically it was
 * written against *assumed* shapes and paths — the Homepage CMS 404'd, and
 * product/category/order edit screens fetched by id against slug-only routes.
 * TypeScript could not catch it because the client's types asserted shapes
 * nobody verified.
 *
 * These tests pin the real contract: the exact paths the admin calls and the
 * exact top-level keys it destructures. If a route is renamed or an envelope
 * changes, this fails here instead of silently breaking the panel.
 */

import { seedIntegrationData, cleanIntegrationData, IntegrationFixtures } from '../helpers/setup';
import { startTestServer, TestServer } from '../helpers/testServer';
import { prisma } from '../../lib/prisma';

const PREFIX = 'INT_CONTRACT_';
const PHONE = '254799909001';

let server: TestServer;
let BASE: string;
let fixtures: IntegrationFixtures;
let orderId = '';
let orderNumber = '';
let sectionId = '';

beforeAll(async () => {
  server = await startTestServer();
  BASE = server.baseUrl;
  fixtures = await seedIntegrationData(PREFIX);

  const res = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerPhone: PHONE,
      items: [{ productId: fixtures.productId, quantity: 1 }],
    }),
  });
  const body = (await res.json()) as { order: { id: string; orderNumber: string } };
  orderId = body.order.id;
  orderNumber = body.order.orderNumber;
}, 30000);

afterAll(async () => {
  if (sectionId) await prisma.homepageSection.deleteMany({ where: { id: sectionId } });
  const orders = await prisma.order.findMany({ where: { customerPhone: PHONE }, select: { id: true } });
  const ids = orders.map((o) => o.id);
  if (ids.length) {
    await prisma.activityLog.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.notificationLog.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
  }
  await cleanIntegrationData(PREFIX);
  await server.close();
  await prisma.$disconnect();
}, 20000);

function get(path: string) {
  return fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${fixtures.adminToken}` } });
}

/** Asserts a 200 whose JSON body exposes every key the admin client reads. */
async function expectKeys(path: string, keys: string[]) {
  const res = await get(path);
  expect([path, res.status]).toEqual([path, 200]);
  const body = (await res.json()) as Record<string, unknown>;
  for (const key of keys) {
    expect([path, key, key in body]).toEqual([path, key, true]);
  }
}

describe('admin list endpoints return the envelopes the client destructures', () => {
  it.each([
    ['/api/admin/dashboard', ['success']],
    ['/api/admin/staff', ['success', 'staff']],
    ['/api/admin/staff/assignable', ['success', 'staff']],
    ['/api/admin/advertisements', ['success', 'advertisements']],
    ['/api/admin/content', ['success', 'pages']],
    ['/api/admin/homepage', ['success', 'sections']],
    ['/api/admin/settings', ['success', 'settings']],
    ['/api/admin/coupons', ['success', 'coupons']],
    ['/api/admin/metrics', ['success', 'metrics']],
    ['/api/admin/alerts', ['success', 'alerts', 'summary']],
    ['/api/admin/customers', ['success', 'customers', 'pagination']],
    ['/api/admin/notifications', ['success', 'logs', 'summary', 'pagination']],
    ['/api/admin/inventory/intelligence', ['success', 'summary', 'reorderAlerts', 'fastMovers', 'deadStock']],
    ['/api/admin/analytics/revenue', ['success', 'trend']],
    ['/api/admin/analytics/products', ['success', 'products']],
    ['/api/admin/analytics/funnel', ['success', 'funnel']],
    ['/api/admin/analytics/coupons', ['success', 'coupons']],
    ['/api/admin/analytics/customers', ['success', 'summary', 'topCustomers']],
    ['/api/admin/analytics/fraud', ['success', 'alerts']],
    ['/api/products', ['success', 'products', 'pagination']],
    ['/api/categories', ['success', 'categories']],
    ['/api/orders/list', ['success', 'orders', 'pagination']],
  ])('%s', async (path, keys) => {
    await expectKeys(path as string, keys as string[]);
  });
});

describe('detail lookups accept the identifier the admin actually has', () => {
  it('product edit fetches by id (admin) and by slug (storefront)', async () => {
    const product = await prisma.product.findUnique({ where: { id: fixtures.productId } });
    expect((await get(`/api/products/${product!.id}`)).status).toBe(200);
    expect((await get(`/api/products/${product!.slug}`)).status).toBe(200);
  });

  it('category edit fetches by id and by slug', async () => {
    const category = await prisma.category.findUnique({ where: { id: fixtures.categoryId } });
    expect((await get(`/api/categories/${category!.id}`)).status).toBe(200);
    expect((await get(`/api/categories/${category!.slug}`)).status).toBe(200);
  });

  it('order detail fetches by id (admin links) and by order number (tracking)', async () => {
    expect((await get(`/api/orders/${orderId}`)).status).toBe(200);
    expect((await get(`/api/orders/${orderNumber}`)).status).toBe(200);
  });
});

describe('homepage CMS supports the full admin lifecycle', () => {
  it('creates, reads, reorders, updates, and deletes a section', async () => {
    const auth = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${fixtures.adminToken}`,
    };

    const createRes = await fetch(`${BASE}/api/admin/homepage`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ type: 'PROMOTIONS', title: `${PREFIX}Section`, isActive: true }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { section: { id: string } };
    sectionId = created.section.id;

    // read back
    const getRes = await get(`/api/admin/homepage/${sectionId}`);
    expect(getRes.status).toBe(200);
    expect((await getRes.json() as { section: { id: string } }).section.id).toBe(sectionId);

    // reorder must NOT be captured by the '/:id' route
    const reorderRes = await fetch(`${BASE}/api/admin/homepage/reorder`, {
      method: 'PUT',
      headers: auth,
      body: JSON.stringify({ ids: [sectionId] }),
    });
    expect(reorderRes.status).toBe(200);
    expect(Array.isArray((await reorderRes.json() as { sections: unknown[] }).sections)).toBe(true);

    const updateRes = await fetch(`${BASE}/api/admin/homepage/${sectionId}`, {
      method: 'PUT',
      headers: auth,
      body: JSON.stringify({ isActive: false }),
    });
    expect(updateRes.status).toBe(200);

    const delRes = await fetch(`${BASE}/api/admin/homepage/${sectionId}`, {
      method: 'DELETE',
      headers: auth,
    });
    expect(delRes.status).toBe(200);
    sectionId = '';
  });
});
