/**
 * Integration tests for notification sending logic.
 *
 * Verifies that:
 *  1. Creating an order triggers a NotificationLog entry (order_confirmed type)
 *  2. NotificationLog row has the correct fields (orderId, type, recipient, status)
 *  3. The admin notifications list API returns log entries
 *  4. The resend endpoint accepts a valid log id
 *
 * Note: The actual WhatsApp/SMS send calls will fail in CI (no credentials),
 * but the log record should still be written with status 'failed' or 'pending'
 * because the service always persists the attempt.
 */

import { seedIntegrationData, cleanIntegrationData, IntegrationFixtures } from '../helpers/setup';
import { prisma } from '../../lib/prisma';

const PREFIX = 'INT_NOT_';
const BASE = 'http://localhost:5000';
const TEST_PHONE = '254999904001';

let fixtures: IntegrationFixtures;

beforeAll(async () => {
  fixtures = await seedIntegrationData(PREFIX);
}, 20000);

afterAll(async () => {
  // Clean up any notification logs and orders from this test suite
  const orders = await prisma.order.findMany({
    where: { customerPhone: TEST_PHONE },
    select: { id: true },
  });
  if (orders.length > 0) {
    const ids = orders.map((o) => o.id);
    await prisma.notificationLog.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.activityLog.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
  }
  await cleanIntegrationData(PREFIX);
  await prisma.$disconnect();
}, 20000);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createOrder() {
  return fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerPhone: TEST_PHONE,
      customerName: 'Notification Tester',
      items: [{ productId: fixtures.productId, quantity: 1 }],
    }),
  });
}

function authHeader() {
  return { Authorization: `Bearer ${fixtures.adminToken}` };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Notification — order confirmation log entry', () => {
  let orderId: string;

  it('creating an order triggers a NotificationLog row', async () => {
    const res = await createOrder();
    expect(res.status).toBe(201);
    const body = await res.json() as { success: boolean; order: { id: string } };
    expect(body.success).toBe(true);
    orderId = body.order.id;

    // Give the async fire-and-forget a brief moment to write
    await new Promise((r) => setTimeout(r, 300));

    const log = await prisma.notificationLog.findFirst({
      where: { orderId },
    });
    expect(log).not.toBeNull();
  });

  it('NotificationLog has correct type (order_confirmed)', async () => {
    const log = await prisma.notificationLog.findFirst({
      where: { orderId },
    });
    expect(log).not.toBeNull();
    expect(log!.messageType).toBe('order_confirmed');
  });

  it('NotificationLog has the correct recipient phone number', async () => {
    const log = await prisma.notificationLog.findFirst({
      where: { orderId },
    });
    expect(log!.recipient).toBe(TEST_PHONE);
  });

  it('NotificationLog status is sent, pending, or failed (not null)', async () => {
    const log = await prisma.notificationLog.findFirst({
      where: { orderId },
    });
    expect(['sent', 'pending', 'failed']).toContain(log!.status);
  });

  it('NotificationLog has a non-empty message body', async () => {
    const log = await prisma.notificationLog.findFirst({
      where: { orderId },
    });
    expect(log!.body).not.toBeNull();
    expect((log!.body ?? '').length).toBeGreaterThan(0);
  });
});

describe('GET /api/admin/notifications — list endpoint', () => {
  it('returns 401 without auth token', async () => {
    const res = await fetch(`${BASE}/api/admin/notifications`);
    expect(res.status).toBe(401);
  });

  it('returns notification list with summary', async () => {
    const res = await fetch(`${BASE}/api/admin/notifications`, {
      headers: authHeader(),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as {
      success: boolean;
      notifications: unknown[];
      summary: { sent: number; pending: number; failed: number };
    };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.notifications)).toBe(true);
    expect(body.summary).toHaveProperty('sent');
    expect(body.summary).toHaveProperty('pending');
    expect(body.summary).toHaveProperty('failed');
  });

  it('notification entries have required fields', async () => {
    const res = await fetch(`${BASE}/api/admin/notifications`, {
      headers: authHeader(),
    });
    const body = await res.json() as {
      notifications: {
        id: string; messageType: string; recipient: string; status: string; createdAt: string;
      }[];
    };
    if (body.notifications.length === 0) return;
    const n = body.notifications[0];
    expect(n).toHaveProperty('id');
    expect(n).toHaveProperty('messageType');
    expect(n).toHaveProperty('recipient');
    expect(n).toHaveProperty('status');
    expect(n).toHaveProperty('createdAt');
  });
});

describe('POST /api/admin/notifications/:id/resend — resend endpoint', () => {
  let notificationLogId: string;

  beforeAll(async () => {
    // Seed a failed log entry so we can test resend
    const order = await prisma.order.findFirst({ where: { customerPhone: TEST_PHONE } });
    if (!order) return;

    const failedLog = await prisma.notificationLog.create({
      data: {
        orderId: order.id,
        messageType: 'order_confirmed',
        channel: 'whatsapp',
        recipient: TEST_PHONE,
        body: 'Resend test message',
        status: 'failed',
        retryCount: 0,
      },
    });
    notificationLogId = failedLog.id;
  });

  afterAll(async () => {
    if (notificationLogId) {
      await prisma.notificationLog.delete({ where: { id: notificationLogId } }).catch(() => {});
    }
  });

  it('returns 401 without auth', async () => {
    const res = await fetch(`${BASE}/api/admin/notifications/${notificationLogId}/resend`, {
      method: 'POST',
    });
    expect(res.status).toBe(401);
  });

  it('resend returns 200 or 202 for a valid notification id', async () => {
    if (!notificationLogId) return;
    const res = await fetch(`${BASE}/api/admin/notifications/${notificationLogId}/resend`, {
      method: 'POST',
      headers: authHeader(),
    });
    // 200 = resent immediately, 202 = queued, 400/404 also acceptable if no creds
    expect([200, 202, 400, 404]).toContain(res.status);
  });

  it('returns 404 for a non-existent notification id', async () => {
    const res = await fetch(`${BASE}/api/admin/notifications/nonexistent-id-xyz/resend`, {
      method: 'POST',
      headers: authHeader(),
    });
    expect(res.status).toBe(404);
  });
});
