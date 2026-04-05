/**
 * MAMALI Notification Retry Failure Simulation — k6
 *
 * Real-world problem: When WhatsApp/SMS providers are down, notifications
 * pile up as 'failed' in the NotificationLog. The retry background job
 * (runs every 5 min) must handle burst retries without hammering the DB or
 * crashing the API.
 *
 * This script simulates:
 *  1. A burst of order creation (filling the notification queue with failures)
 *  2. Hitting the retry trigger endpoint under concurrent load (if exposed)
 *  3. Checking that the notifications admin list API stays responsive
 *     while the retry job is running in the background
 *
 * What we test:
 *  - Admin notifications list API remains < 2 s at p95 under burst
 *  - Resend endpoint handles burst requests without 5xx errors
 *  - DB read performance of NotificationLog under heavy write load
 *
 * Usage:
 *   BASE_URL=http://localhost:5000 \
 *   ADMIN_TOKEN=<admin-jwt-token> \
 *   PRODUCT_ID=<id> \
 *   k6 run load-tests/notification-retry.k6.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// ── Custom metrics ─────────────────────────────────────────────────────────

const listRequestsOk    = new Counter('notification_list_ok');
const listRequestsFail  = new Counter('notification_list_failed');
const retryRequestsOk   = new Counter('notification_resend_ok');
const retryRequestsFail = new Counter('notification_resend_failed');
const listDuration      = new Trend('notification_list_duration_ms', true);
const serverErrorRate   = new Rate('server_error_rate');

// ── Configuration ──────────────────────────────────────────────────────────

const BASE_URL     = __ENV.BASE_URL     || 'http://localhost:5000';
const PRODUCT_ID   = __ENV.PRODUCT_ID   || 'REPLACE_ME';
const ADMIN_TOKEN  = __ENV.ADMIN_TOKEN  || '';

function randomPhone() {
  return `2547${randomIntBetween(10000000, 99999999)}`;
}

const adminHeaders = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${ADMIN_TOKEN}`,
};

// ── Scenario configuration ─────────────────────────────────────────────────

export const options = {
  scenarios: {
    // Phase 1: fill the notification queue by creating lots of orders
    fill_notification_queue: {
      executor: 'constant-arrival-rate',
      rate: 20,           // 20 orders/s
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 30,
      maxVUs: 50,
      tags: { phase: 'fill_queue' },
    },

    // Phase 2: read the notification list under load (admin operations)
    read_notification_list: {
      executor: 'constant-vus',
      vus: 20,
      duration: '60s',
      startTime: '10s',   // starts while Phase 1 is still running
      tags: { phase: 'read_list' },
    },

    // Phase 3: burst resend requests (simulating bulk "retry all" from admin UI)
    bulk_resend_burst: {
      executor: 'shared-iterations',
      vus: 30,
      iterations: 100,
      maxDuration: '30s',
      startTime: '35s',   // after Phase 1 ends
      tags: { phase: 'resend_burst' },
    },
  },

  thresholds: {
    // API must stay fast even under retry burst
    notification_list_duration_ms: ['p(95)<2000'],
    // No 5xx allowed
    http_req_failed: ['rate<0.05'],
    server_error_rate: ['rate==0'],
    // List endpoint must succeed consistently
    notification_list_failed: ['count==0'],
  },
};

// ── Order creation helper ──────────────────────────────────────────────────

function createOrder() {
  const phone = randomPhone();
  return http.post(
    `${BASE_URL}/api/orders`,
    JSON.stringify({
      customerPhone: phone,
      customerName: 'Notification Load VU',
      items: [{ productId: PRODUCT_ID, quantity: 1 }],
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'create_order_for_notifications' },
    }
  );
}

// ── Default function (dispatch by phase) ──────────────────────────────────

export default function () {
  const phase = __ENV.K6_SCENARIO_TAG_PHASE || 'fill_queue';

  // ── Phase 1: create orders to fill notification log ───────────────────────
  if (phase === 'fill_queue') {
    const res = createOrder();
    check(res, {
      'order created or rate-limited': (r) => r.status === 201 || r.status === 429,
      'no 5xx from order creation': (r) => r.status < 500,
    });

    if (res.status >= 500) {
      serverErrorRate.add(1);
      console.error(`Order creation 5xx: ${res.status}`);
    } else {
      serverErrorRate.add(0);
    }
    return;
  }

  // ── Phase 2: read notification list ───────────────────────────────────────
  if (phase === 'read_list') {
    const start = Date.now();
    const res = http.get(
      `${BASE_URL}/api/admin/notifications?page=1&limit=20`,
      {
        headers: adminHeaders,
        tags: { name: 'list_notifications' },
      }
    );
    listDuration.add(Date.now() - start);

    const ok = check(res, {
      'notification list 200': (r) => r.status === 200,
      'notification list has success:true': (r) => {
        try { return JSON.parse(r.body).success === true; } catch { return false; }
      },
    });

    if (ok) {
      listRequestsOk.add(1);
      serverErrorRate.add(0);
    } else {
      listRequestsFail.add(1);
      if (res.status >= 500) {
        serverErrorRate.add(1);
        console.error(`Notification list 5xx: ${res.status} — ${res.body.substring(0, 200)}`);
      }
    }

    sleep(randomIntBetween(1, 3));
    return;
  }

  // ── Phase 3: resend burst ─────────────────────────────────────────────────
  if (phase === 'resend_burst') {
    // Fetch the most recent failed/pending notification id to resend
    const listRes = http.get(
      `${BASE_URL}/api/admin/notifications?status=failed&limit=1`,
      {
        headers: adminHeaders,
        tags: { name: 'get_failed_notification' },
      }
    );

    if (listRes.status !== 200) {
      retryRequestsFail.add(1);
      return;
    }

    let notificationId: string | null = null;
    try {
      const body = JSON.parse(listRes.body);
      if (body.notifications && body.notifications.length > 0) {
        notificationId = body.notifications[0].id;
      }
    } catch { /* ignore */ }

    if (!notificationId) {
      // No failed notifications available — phase complete
      return;
    }

    const resendRes = http.post(
      `${BASE_URL}/api/admin/notifications/${notificationId}/resend`,
      null,
      {
        headers: adminHeaders,
        tags: { name: 'resend_notification' },
      }
    );

    const ok = check(resendRes, {
      'resend not 5xx': (r) => r.status < 500,
      'resend 200 or 404 (already processed)': (r) => r.status === 200 || r.status === 404 || r.status === 400,
    });

    if (ok) {
      retryRequestsOk.add(1);
      serverErrorRate.add(0);
    } else {
      retryRequestsFail.add(1);
      if (resendRes.status >= 500) {
        serverErrorRate.add(1);
        console.error(`Resend 5xx: ${resendRes.status}`);
      }
    }
  }
}

/**
 * Teardown: report summary.
 */
export function teardown() {
  console.log(`
╔══════════════════════════════════════════════════╗
║       Notification Retry Load Run Summary         ║
╠══════════════════════════════════════════════════╣
║ Notification list requests — ok : ${listRequestsOk.count}
║ Notification list requests — fail: ${listRequestsFail.count}
║ Resend requests — ok   : ${retryRequestsOk.count}
║ Resend requests — fail : ${retryRequestsFail.count}
╚══════════════════════════════════════════════════╝
  `.trim());

  if (listRequestsFail.count > 0) {
    console.error('🚨 Notification list endpoint FAILURES detected under load!');
  } else {
    console.log('✅ Notification list endpoint remained stable under concurrent retry load.');
  }
}
