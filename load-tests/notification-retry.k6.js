/**
 * MAMALI Notification Retry Queue Flood Test — k6
 *
 * Simulates the production scenario where the notification retry job is
 * overwhelmed: many notifications are in "pending" or "failed" state and
 * the retry mechanism must drain the queue without crashing the backend.
 *
 * What this tests:
 *  1. The /api/admin/notifications/:id/resend endpoint handles burst retries.
 *  2. The admin notification list remains responsive while retries run.
 *  3. No 500 errors occur when multiple retries hit the same notification.
 *  4. The backend gracefully handles retries when the WhatsApp/SMS provider
 *     is unavailable (notifications land in "failed" state).
 *
 * Scenario:
 *   Phase 1 (0–30s): Flood the resend endpoint with 100 concurrent retries/s.
 *   Phase 2 (30–60s): Mix resend + list-notifications to simulate a busy
 *                     ops dashboard during an incident.
 *   Phase 3 (60–90s): Ramp down resends, verify list endpoint is still fast.
 *
 * Usage:
 *   BASE_URL=http://localhost:5000 \
 *   ADMIN_TOKEN=xxx \
 *   NOTIFICATION_IDS=id1,id2,id3,...  (comma-separated, pre-fetched)
 *   k6 run load-tests/notification-retry.k6.js
 *
 * Quick setup (seeds some failed notifications before the test):
 *   1. Create several orders so notifications are logged.
 *   2. Manually update some logs to status='failed' in the DB.
 *   3. Extract their IDs and pass as NOTIFICATION_IDS.
 *
 * If NOTIFICATION_IDS is not set, the script fetches them at startup.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
import { SharedArray } from 'k6/data';

// ── Custom metrics ─────────────────────────────────────────────────────────

const retriesQueued       = new Counter('retries_queued');
const retriesFailed       = new Counter('retries_server_error');  // 5xx
const retriesNotFound     = new Counter('retries_not_found');     // 404
const duplicateRetries    = new Counter('duplicate_retries');
const listDuration        = new Trend('notification_list_ms', true);
const retryDuration       = new Trend('notification_retry_ms', true);
const listErrorRate       = new Rate('notification_list_error_rate');

// ── Configuration ──────────────────────────────────────────────────────────

const BASE_URL    = __ENV.BASE_URL    || 'http://localhost:5000';
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || '';

// Pre-load notification IDs (or fall back to synthetic UUIDs for smoke testing)
const notificationIds = new SharedArray('notificationIds', function () {
  const envIds = __ENV.NOTIFICATION_IDS;
  if (envIds && envIds.trim()) {
    return envIds.split(',').map((id) => id.trim()).filter(Boolean);
  }
  // Fallback: generate synthetic UUIDs — most will return 404 which is expected
  return Array.from({ length: 20 }, (_, i) =>
    `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`
  );
});

function randomNotificationId() {
  return notificationIds[randomIntBetween(0, notificationIds.length - 1)];
}

const AUTH_HEADER = { Authorization: `Bearer ${ADMIN_TOKEN}`, 'Content-Type': 'application/json' };

export const options = {
  scenarios: {
    // Phase 1: burst retry flood
    retry_burst: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1s',
      preAllocatedVUs: 150,
      maxVUs: 200,
      stages: [
        { duration: '15s', target: 100 }, // rapid ramp
        { duration: '15s', target: 100 }, // sustain burst
        { duration: '30s', target: 20  }, // taper during mixed phase
        { duration: '30s', target: 0   }, // stop
      ],
      exec: 'retryNotification',
    },

    // Phase 2 onwards: concurrent dashboard list polling
    dashboard_polling: {
      executor: 'constant-arrival-rate',
      startTime: '30s',
      rate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 20,
      maxVUs: 30,
      duration: '60s',
      exec: 'listNotifications',
    },
  },

  thresholds: {
    // List endpoint must stay responsive: p(95) < 1 s
    notification_list_ms: ['p(95)<1000'],
    // Retry endpoint must handle burst: p(95) < 3 s
    notification_retry_ms: ['p(95)<3000'],
    // No 5xx from either endpoint
    retries_server_error: ['count==0'],
    // Acceptable error rate on the list endpoint under load
    notification_list_error_rate: ['rate<0.01'],
  },
};

// ── VU: trigger a notification retry ──────────────────────────────────────

export function retryNotification() {
  if (!ADMIN_TOKEN) {
    console.error('ADMIN_TOKEN is required for retry tests');
    return;
  }

  const notifId = randomNotificationId();

  const start = Date.now();
  const res = http.post(
    `${BASE_URL}/api/admin/notifications/${notifId}/resend`,
    '{}',
    { headers: AUTH_HEADER, tags: { name: 'retry_notification' } }
  );
  const elapsed = Date.now() - start;
  retryDuration.add(elapsed);

  check(res, {
    'retry response is not 5xx': (r) => r.status < 500,
    'retry response is not empty': (r) => (r.body?.length ?? 0) > 0,
  });

  if (res.status === 200 || res.status === 202) {
    retriesQueued.add(1);
  } else if (res.status === 404 || res.status === 400) {
    retriesNotFound.add(1);
    // Expected when notification ID doesn't exist — not an error
  } else if (res.status >= 500) {
    retriesFailed.add(1);
    console.error(`Retry 5xx for ${notifId}: ${res.status} — ${res.body?.substring(0, 200)}`);
  }

  // Occasionally retry the same notification twice to test idempotency
  if (randomIntBetween(1, 10) === 1) {
    const dupRes = http.post(
      `${BASE_URL}/api/admin/notifications/${notifId}/resend`,
      '{}',
      { headers: AUTH_HEADER, tags: { name: 'retry_duplicate' } }
    );
    check(dupRes, {
      'duplicate retry does not crash server': (r) => r.status < 500,
    });
    if (dupRes.status < 500) {
      duplicateRetries.add(1);
    }
  }

  // No sleep — simulate a retry job draining a queue as fast as possible
}

// ── VU: poll the notification list (admin dashboard) ──────────────────────

export function listNotifications() {
  if (!ADMIN_TOKEN) return;

  const pages = ['status=failed', 'status=pending', 'channel=whatsapp', 'channel=sms', ''];
  const params = pages[randomIntBetween(0, pages.length - 1)];
  const url = `${BASE_URL}/api/admin/notifications${params ? `?${params}` : ''}`;

  const start = Date.now();
  const res = http.get(url, { headers: AUTH_HEADER, tags: { name: 'list_notifications' } });
  const elapsed = Date.now() - start;
  listDuration.add(elapsed);

  const ok = check(res, {
    'list returns 200': (r) => r.status === 200,
    'list response has notifications key': (r) => {
      try { return Array.isArray(JSON.parse(r.body).notifications); } catch { return false; }
    },
  });

  listErrorRate.add(!ok ? 1 : 0);

  sleep(randomIntBetween(1, 3)); // simulate ops engineer reviewing the list
}

/**
 * Teardown: report final queue depth — how many notifications are still pending.
 */
export function teardown() {
  if (!ADMIN_TOKEN) {
    console.log('ADMIN_TOKEN not set — skipping queue depth check');
    return;
  }

  for (const status of ['pending', 'failed']) {
    const res = http.get(`${BASE_URL}/api/admin/notifications?status=${status}`, {
      headers: AUTH_HEADER,
    });

    if (res.status !== 200) {
      console.log(`Could not fetch ${status} notifications (${res.status})`);
      continue;
    }

    try {
      const body = JSON.parse(res.body);
      const count = body.notifications?.length ?? 0;
      console.log(`Notifications with status=${status} after test: ${count}`);
      if (status === 'pending' && count > 0) {
        console.warn(`⚠️  ${count} notifications still pending — retry job may be lagging.`);
      } else {
        console.log(`✅ ${status} queue: ${count}`);
      }
    } catch (e) {
      console.error('Failed to parse notifications response', e);
    }
  }

  // Summary of what the test did
  console.log(`\n📊 Test summary:`);
  console.log(`   Retries queued:      ${retriesQueued.count}`);
  console.log(`   Retries not found:   ${retriesNotFound.count}`);
  console.log(`   Server errors:       ${retriesFailed.count}`);
  console.log(`   Duplicate retries:   ${duplicateRetries.count}`);
}
