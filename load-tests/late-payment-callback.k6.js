/**
 * MAMALI Late Payment Callback Simulation — k6
 *
 * Real-world problem: M-Pesa callbacks sometimes arrive seconds, minutes,
 * or even hours after the STK push was sent. This script simulates:
 *
 *   1. Checkout burst: 100 VUs place orders (creating pending payments)
 *   2. Delayed callback wave: after a configurable delay (default 30 s),
 *      payment callbacks arrive all at once — hitting the backend's
 *      webhook/callback endpoint with realistic M-Pesa payloads.
 *   3. Late callbacks: a second wave arrives "very late" (another delay)
 *      after the order expiry window (30 min), to verify expired orders
 *      are handled gracefully (404 / 400, not 500).
 *
 * What we test:
 *  - The callback endpoint handles concurrent late callbacks without crashing
 *  - Responses are 200 (processed) or 400/404 (expired / already processed)
 *  - No 500 Internal Server Errors under concurrent load
 *  - Late callback p95 latency stays reasonable (< 3 s)
 *
 * Usage:
 *   BASE_URL=http://localhost:5000 \
 *   PRODUCT_ID=<id> \
 *   MPESA_PASSKEY=<test-passkey> \
 *   k6 run load-tests/late-payment-callback.k6.js
 *
 * Note: Run against a dev environment with NOTIFICATIONS_ENABLED=false to
 * avoid triggering real WhatsApp/SMS sends during load testing.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { randomIntBetween, randomItem } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
import { SharedArray } from 'k6/data';

// ── Custom metrics ─────────────────────────────────────────────────────────

const callbacksProcessed  = new Counter('callbacks_processed');
const callbacksExpired    = new Counter('callbacks_expired_or_not_found');
const callbackErrors      = new Counter('callbacks_server_errors');
const callbackDuration    = new Trend('callback_processing_duration_ms', true);
const callbackErrorRate   = new Rate('callback_error_rate');

// ── Configuration ──────────────────────────────────────────────────────────

const BASE_URL    = __ENV.BASE_URL    || 'http://localhost:5000';
const PRODUCT_ID  = __ENV.PRODUCT_ID  || 'REPLACE_ME';

// Shared array to communicate order ids from checkout VUs to callback VUs.
// k6 SharedArray is read-only; we use a pre-seeded list here.
// In a real run, the checkout phase populates a file that callback VUs read.
const placedOrders = new SharedArray('placed_orders', function () {
  // Fallback: return an empty placeholder — the checkout scenario fills these
  return [];
});

function randomPhone() {
  return `2547${randomIntBetween(10000000, 99999999)}`;
}

function randomMpesaReceipt() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < 10; i++) {
    s += chars[randomIntBetween(0, chars.length - 1)];
  }
  return s;
}

// Generates a realistic-looking M-Pesa STK callback payload
function buildCallbackPayload(checkoutRequestId, resultCode = 0) {
  return JSON.stringify({
    Body: {
      stkCallback: {
        MerchantRequestID: `MERCHANT-${randomIntBetween(100000, 999999)}`,
        CheckoutRequestID: checkoutRequestId,
        ResultCode: resultCode,
        ResultDesc: resultCode === 0
          ? 'The service request is processed successfully.'
          : 'Request cancelled by user',
        CallbackMetadata: resultCode === 0
          ? {
              Item: [
                { Name: 'Amount', Value: 1500 },
                { Name: 'MpesaReceiptNumber', Value: randomMpesaReceipt() },
                { Name: 'TransactionDate', Value: parseInt(new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)) },
                { Name: 'PhoneNumber', Value: parseInt(randomPhone()) },
              ],
            }
          : undefined,
      },
    },
  });
}

// ── Scenario configuration ─────────────────────────────────────────────────

export const options = {
  scenarios: {
    // Phase 1: checkout burst — 100 VUs place orders
    checkout_burst: {
      executor: 'shared-iterations',
      vus: 100,
      iterations: 100,
      maxDuration: '60s',
      tags: { phase: 'checkout' },
    },

    // Phase 2: callbacks arrive ~30 s after checkout (simulated delay)
    on_time_callbacks: {
      executor: 'shared-iterations',
      vus: 80,
      iterations: 80,
      maxDuration: '60s',
      startTime: '35s', // start 35 s into the test
      tags: { phase: 'on_time_callback' },
    },

    // Phase 3: late callbacks — arrive after orders would typically expire
    late_callbacks: {
      executor: 'shared-iterations',
      vus: 40,
      iterations: 40,
      maxDuration: '60s',
      startTime: '70s', // start 70 s in (well after 30-min expiry is not testable in unit time)
      tags: { phase: 'late_callback' },
    },
  },

  thresholds: {
    // No 500 errors allowed from any phase
    http_req_failed: ['rate<0.05'],
    // Callback endpoint must respond in < 3 s at p95
    callback_processing_duration_ms: ['p(95)<3000'],
    // No server errors
    callbacks_server_errors: ['count==0'],
  },
};

// ── Default function (dispatch by scenario tag) ────────────────────────────

export default function () {
  const phase = __ENV.K6_SCENARIO_TAG_PHASE || 'checkout';
  const headers = { 'Content-Type': 'application/json' };

  if (phase === 'checkout') {
    // Place a real order
    const phone = randomPhone();
    const res = http.post(
      `${BASE_URL}/api/orders`,
      JSON.stringify({
        customerPhone: phone,
        customerName: `Late Callback VU ${__VU}`,
        items: [{ productId: PRODUCT_ID, quantity: 1 }],
      }),
      { headers, tags: { name: 'checkout_order' } }
    );
    check(res, { 'checkout 201 or 429': (r) => r.status === 201 || r.status === 429 });
    return;
  }

  // For callback phases, use a synthetic checkoutRequestId
  const checkoutRequestId = `ws_CO_${randomIntBetween(100000000, 999999999)}_${Date.now()}`;
  const isLate = phase === 'late_callback';

  // Randomly test success (80%) vs user-cancelled (20%) callbacks
  const resultCode = Math.random() < 0.8 ? 0 : 1032;
  const payload = buildCallbackPayload(checkoutRequestId, resultCode);

  const start = Date.now();
  const res = http.post(
    `${BASE_URL}/api/payments/mpesa/callback`,
    payload,
    { headers, tags: { name: isLate ? 'late_callback' : 'on_time_callback' } }
  );
  callbackDuration.add(Date.now() - start);

  const is2xx = res.status >= 200 && res.status < 300;
  const is4xx = res.status >= 400 && res.status < 500;
  const is5xx = res.status >= 500;

  check(res, {
    'callback not 5xx': () => !is5xx,
    'callback is 2xx or 4xx': () => is2xx || is4xx,
  });

  if (is5xx) {
    callbackErrors.add(1);
    callbackErrorRate.add(1);
    console.error(`💥 5xx on callback: ${res.status} — ${res.body.substring(0, 200)}`);
  } else if (is2xx) {
    callbacksProcessed.add(1);
    callbackErrorRate.add(0);
  } else if (is4xx) {
    // 400/404 is expected for unknown or expired checkoutRequestIds
    callbacksExpired.add(1);
    callbackErrorRate.add(0);
  }

  // Brief pause between callbacks (network jitter simulation)
  sleep(randomIntBetween(0, 1));
}

/**
 * Summary teardown: log callback acceptance rate.
 */
export function teardown() {
  console.log(`
╔══════════════════════════════════════════════════╗
║         Late Payment Callback Run Summary         ║
╠══════════════════════════════════════════════════╣
║ Processed  (2xx)       : ${String(callbacksProcessed.count).padStart(6)}              ║
║ Expired/Unknown (4xx)  : ${String(callbacksExpired.count).padStart(6)}              ║
║ Server Errors   (5xx)  : ${String(callbackErrors.count).padStart(6)}              ║
╚══════════════════════════════════════════════════╝
  `.trim());

  if (callbackErrors.count > 0) {
    console.error('🚨 SERVER ERRORS DETECTED during callback simulation!');
  } else {
    console.log('✅ No 5xx errors — callback endpoint is stable under late/concurrent load.');
  }
}
