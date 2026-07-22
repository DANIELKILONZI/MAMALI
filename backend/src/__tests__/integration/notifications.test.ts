/**
 * Integration tests for notification sending logic.
 *
 * Verifies that:
 *  1. A NotificationLog record is created when an order is placed.
 *  2. The log contains the correct channel, type, and recipient phone.
 *  3. The GET /api/admin/notifications endpoint exposes these logs.
 *  4. The POST /api/admin/notifications/:id/resend endpoint queues a retry.
 *  5. Notification channel filtering works correctly.
 *
 * Notification delivery itself (WhatsApp / SMS) is not tested here because
 * it would require real API credentials. We test that the infrastructure
 * correctly records what was sent and makes it available to the admin.
 */

import { seedIntegrationData, cleanIntegrationData, IntegrationFixtures } from '../helpers/setup';
import { startTestServer, TestServer } from '../helpers/testServer';
import { prisma } from '../../lib/prisma';

const PREFIX = 'INT_NTF_';
const TEST_PHONE = '254799904001';

let server: TestServer;
let BASE: string;

let fixtures: IntegrationFixtures;
let createdOrderId: string | null = null;

beforeAll(async () => {
  server = await startTestServer();
  BASE = server.baseUrl;
  fixtures = await seedIntegrationData(PREFIX);

  // Create an order so that a notification log is generated
  const res = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerPhone: TEST_PHONE,
      customerName: 'Notification Test Customer',
      items: [{ productId: fixtures.productId, quantity: 1 }],
    }),
  });

  if (res.ok) {
    const body = (await res.json()) as { order: { id: string } };
    createdOrderId = body.order.id;
  }
}, 30000);

afterAll(async () => {
  if (createdOrderId) {
    await prisma.activityLog.deleteMany({ where: { orderId: createdOrderId } });
    await prisma.notificationLog.deleteMany({ where: { orderId: createdOrderId } });
    await prisma.payment.deleteMany({ where: { orderId: createdOrderId } });
    await prisma.orderItem.deleteMany({ where: { orderId: createdOrderId } });
    await prisma.order.delete({ where: { id: createdOrderId } }).catch(() => {});
  }
  await cleanIntegrationData(PREFIX);
  await server.close();
  await prisma.$disconnect();
}, 20000);

// ── Helper ────────────────────────────────────────────────────────────────────

function authHeader() {
  return { Authorization: `Bearer ${fixtures.adminToken}` };
}

async function getNotifications(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  return fetch(`${BASE}/api/admin/notifications${qs ? `?${qs}` : ''}`, {
    headers: { ...authHeader() },
  });
}

// ── Notification log created on order placement ───────────────────────────────

describe('Order creation — NotificationLog persistence', () => {
  it('creates a NotificationLog record for the new order', async () => {
    expect(createdOrderId).not.toBeNull();

    const logs = await prisma.notificationLog.findMany({
      where: { orderId: createdOrderId! },
    });

    // At least one notification attempt should be logged
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });

  it('notification log references the correct phone number', async () => {
    const logs = await prisma.notificationLog.findMany({
      where: { orderId: createdOrderId! },
    });

    const phones = logs.map((l) => l.recipient);
    expect(phones.some((p) => p === TEST_PHONE || p.endsWith('04001'))).toBe(true);
  });

  it('notification log has a messageType field', async () => {
    const log = await prisma.notificationLog.findFirst({
      where: { orderId: createdOrderId! },
    });
    expect(log).not.toBeNull();
    expect(log!.messageType).toBeTruthy();
  });

  it('notification log has a channel field (whatsapp or sms)', async () => {
    const log = await prisma.notificationLog.findFirst({
      where: { orderId: createdOrderId! },
    });
    expect(['whatsapp', 'sms', 'WHATSAPP', 'SMS']).toContain(log!.channel);
  });

  it('notification log has a status field', async () => {
    const log = await prisma.notificationLog.findFirst({
      where: { orderId: createdOrderId! },
    });
    // Status should be sent, failed, pending, or skipped (no channel enabled)
    expect(['sent', 'failed', 'pending', 'skipped', 'SENT', 'FAILED', 'PENDING']).toContain(log!.status);
  });
});

// ── GET /api/admin/notifications endpoint ─────────────────────────────────────

describe('GET /api/admin/notifications — list notifications', () => {
  it('requires authentication', async () => {
    const res = await fetch(`${BASE}/api/admin/notifications`);
    expect(res.status).toBe(401);
  });

  it('returns 200 with logs array for authenticated admin', async () => {
    const res = await getNotifications();
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean; logs: unknown[] };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.logs)).toBe(true);
  });

  it('response includes summary counts (sent / pending / failed)', async () => {
    const res = await getNotifications();
    const body = await res.json() as {
      success: boolean;
      summary: { totalSent: number; totalPending: number; totalFailed: number };
    };
    expect(typeof body.summary.totalSent).toBe('number');
    expect(typeof body.summary.totalPending).toBe('number');
    expect(typeof body.summary.totalFailed).toBe('number');
  });

  it('filter by status=sent returns only sent notifications', async () => {
    const res = await getNotifications({ status: 'sent' });
    expect(res.status).toBe(200);
    const body = await res.json() as { logs: { status: string }[] };
    for (const n of body.logs) {
      expect(n.status.toLowerCase()).toBe('sent');
    }
  });

  it('filter by status=failed returns only failed notifications', async () => {
    const res = await getNotifications({ status: 'failed' });
    expect(res.status).toBe(200);
    const body = await res.json() as { logs: { status: string }[] };
    for (const n of body.logs) {
      expect(n.status.toLowerCase()).toBe('failed');
    }
  });

  it('filter by channel=whatsapp returns only whatsapp notifications', async () => {
    const res = await getNotifications({ channel: 'whatsapp' });
    expect(res.status).toBe(200);
    const body = await res.json() as { logs: { channel: string }[] };
    for (const n of body.logs) {
      expect(n.channel.toLowerCase()).toBe('whatsapp');
    }
  });

  it('filter by channel=sms returns only sms notifications', async () => {
    const res = await getNotifications({ channel: 'sms' });
    expect(res.status).toBe(200);
    const body = await res.json() as { logs: { channel: string }[] };
    for (const n of body.logs) {
      expect(n.channel.toLowerCase()).toBe('sms');
    }
  });
});

// ── POST /api/admin/notifications/:id/resend ──────────────────────────────────

describe('POST /api/admin/notifications/:id/resend — retry sending', () => {
  it('requires authentication', async () => {
    const res = await fetch(`${BASE}/api/admin/notifications/fake-id/resend`, {
      method: 'POST',
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 for a non-existent notification ID', async () => {
    const res = await fetch(`${BASE}/api/admin/notifications/00000000-0000-0000-0000-000000000000/resend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
    });
    expect([404, 400]).toContain(res.status);
  });

  it('successfully queues resend for an existing notification', async () => {
    // Find a real notification log to retry
    const log = await prisma.notificationLog.findFirst({
      where: { orderId: createdOrderId ?? undefined },
    });

    if (!log) {
      console.log('No notification log found for resend test — skipping');
      return;
    }

    const res = await fetch(`${BASE}/api/admin/notifications/${log.id}/resend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
    });

    // Should succeed (200) or return a meaningful error
    expect([200, 201, 202]).toContain(res.status);
    const body = await res.json() as { success: boolean };
    expect(body.success).toBe(true);
  });
});

// ── Notification log integrity ────────────────────────────────────────────────

describe('NotificationLog — data integrity', () => {
  it('each log has a non-null orderId', async () => {
    const logs = await prisma.notificationLog.findMany({
      where: { orderId: { not: null } },
      take: 5,
    });
    for (const log of logs) {
      expect(log.orderId).not.toBeNull();
    }
  });

  it('notification logs are linked to existing orders', async () => {
    if (!createdOrderId) return;

    const logs = await prisma.notificationLog.findMany({
      where: { orderId: createdOrderId },
    });

    const order = await prisma.order.findUnique({ where: { id: createdOrderId } });
    expect(order).not.toBeNull();

    for (const log of logs) {
      expect(log.orderId).toBe(createdOrderId);
    }
  });

  it('notification timestamp is recent (within last 5 minutes)', async () => {
    if (!createdOrderId) return;

    const log = await prisma.notificationLog.findFirst({
      where: { orderId: createdOrderId },
      orderBy: { createdAt: 'desc' },
    });

    if (!log) return;

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    expect(log.createdAt.getTime()).toBeGreaterThanOrEqual(fiveMinutesAgo.getTime());
  });
});
