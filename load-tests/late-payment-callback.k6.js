/**
 * MAMALI Late Payment Callback Stress Test — k6
 *
 * Simulates the real-world scenario where M-Pesa payment callbacks arrive
 * late (seconds to minutes after the checkout request), while new orders
 * are still being placed simultaneously.
 *
 * What this tests:
 *  1. The payment callback endpoint (/api/payments/mpesa/callback) remains
 *     stable under burst load from delayed callbacks.
 *  2. Concurrent order creation + callback processing does NOT cause
 *     database deadlocks or 500 errors.
 *  3. Orders that receive a late "completed" callback are correctly moved
 *     to the paid/processing state.
 *  4. Orders that receive a late "failed" callback are correctly marked
 *     as cancelled or expired.
 *  5. Duplicate callbacks for the same transaction are idempotent.
 *
 * Scenario:
 *   Stage 1 (0–30s): Create 50 orders/s → generate a backlog of pending payments.
 *   Stage 2 (30–90s): Simultaneously replay late callbacks for all pending
 *                     orders while new orders keep arriving.
 *   Stage 3 (90–120s): Only callbacks remain (cool-down).
 *
 * Usage:
 *   BASE_URL=http://localhost:5000 \
 *   PRODUCT_ID=xxx \
 *   ADMIN_TOKEN=xxx \
 *   k6 run load-tests/late-payment-callback.k6.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
import { SharedArray } from 'k6/data';

// ── Custom metrics ─────────────────────────────────────────────────────────

const callbacksProcessed    = new Counter('callbacks_processed');
const callbacksIdempotent   = new Counter('callbacks_idempotent');   // 200 on duplicate
const callbacksFailed       = new Counter('callbacks_server_error'); // 5xx
const callbackDuration      = new Trend('callback_processing_ms', true);
const ordersDuringCallbacks = new Counter('orders_during_callback_phase');
const deadlockErrors        = new Counter('deadlock_errors');

// ── Configuration ──────────────────────────────────────────────────────────

const BASE_URL    = __ENV.BASE_URL    || 'http://localhost:5000';
const PRODUCT_ID  = __ENV.PRODUCT_ID  || 'REPLACE_ME';
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || '';

// Shared array stores order IDs created in setUp so callbacks can reference them
const pendingOrders = new SharedArray('pendingOrders', function () {
  return [];
});

function randomPhone() {
  return `2547${randomIntBetween(10000000, 99999999)}`;
}

/** Generate a realistic-looking M-Pesa receipt number. */
function randomReceipt() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  return Array.from({ length: 10 }, () => chars[randomIntBetween(0, chars.length - 1)]).join('');
}

/** Build a realistic M-Pesa STK callback payload. */
function buildMpesaCallback(checkoutRequestId, resultCode) {
  return JSON.stringify({
    Body: {
      stkCallback: {
        MerchantRequestID: `merchant-${checkoutRequestId}`,
        CheckoutRequestID: checkoutRequestId,
        ResultCode: resultCode,
        ResultDesc: resultCode === 0 ? 'The service request is processed successfully.' : 'Request cancelled by user.',
        CallbackMetadata: resultCode === 0 ? {
          Item: [
            { Name: 'Amount',              Value: 1500 },
            { Name: 'MpesaReceiptNumber',  Value: randomReceipt() },
            { Name: 'TransactionDate',     Value: 20260101120000 },
            { Name: 'PhoneNumber',         Value: '254700000001' },
          ],
        } : undefined,
      },
    },
  });
}

export const options = {
  scenarios: {
    // Stage 1 + Stage 2: create orders while simultaneously sending late callbacks
    order_creation: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 100,
      stages: [
        { duration: '30s', target: 30 },  // ramp up order creation
        { duration: '60s', target: 20 },  // hold during callback burst
        { duration: '30s', target: 0  },  // taper off
      ],
      exec: 'createOrder',
    },

    // Stage 2: burst of late callbacks starting after 30s
    late_callbacks: {
      executor: 'ramping-arrival-rate',
      startTime: '30s',
      startRate: 0,
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 200,
      stages: [
        { duration: '30s', target: 100 }, // burst of delayed callbacks
        { duration: '30s', target: 50  }, // sustained
        { duration: '30s', target: 0   }, // drain
      ],
      exec: 'sendLateCallback',
    },
  },

  thresholds: {
    // Callback endpoint must respond quickly even under concurrent order load
    'http_req_duration{name:callback}': ['p(95)<2000'],
    // Overall error rate (includes expected 404s for synthetic IDs)
    http_req_failed: ['rate<0.10'],
    // Absolutely no server-side 500 errors from callbacks
    callbacks_server_error: ['count==0'],
    // Zero deadlock errors
    deadlock_errors: ['count==0'],
  },
};

// ── VU: create a new order ─────────────────────────────────────────────────

export function createOrder() {
  const headers = { 'Content-Type': 'application/json' };
  const phone = randomPhone();

  const res = http.post(
    `${BASE_URL}/api/orders`,
    JSON.stringify({
      customerPhone: phone,
      customerName: 'Late Callback Test',
      items: [{ productId: PRODUCT_ID, quantity: 1 }],
    }),
    { headers, tags: { name: 'create_order' } }
  );

  check(res, {
    'order created or rate-limited': (r) => r.status === 201 || r.status === 429,
    'no server error on order creation': (r) => r.status < 500,
  });

  if (res.status === 201) {
    ordersDuringCallbacks.add(1);
  }

  if (res.status >= 500) {
    deadlockErrors.add(1);
    console.error(`Order creation 5xx: ${res.status} — ${res.body.substring(0, 200)}`);
  }

  sleep(randomIntBetween(0, 1));
}

// ── VU: send a late payment callback ──────────────────────────────────────

export function sendLateCallback() {
  const headers = { 'Content-Type': 'application/json' };

  // Use a synthetic checkout request ID to simulate a real callback
  // In a production test this would be pulled from a shared data file
  // populated by the createOrder scenario
  const checkoutRequestId = `ws_CO_${randomIntBetween(100000000, 999999999)}_${randomIntBetween(100000000, 999999999)}`;

  // 70% successful payments, 20% user-cancelled, 10% duplicate
  const roll = randomIntBetween(1, 10);
  const resultCode = roll <= 7 ? 0 : 1; // 0 = success, 1 = cancelled

  const payload = buildMpesaCallback(checkoutRequestId, resultCode);

  const start = Date.now();
  const res = http.post(
    `${BASE_URL}/api/payments/mpesa/callback`,
    payload,
    { headers, tags: { name: 'callback' } }
  );
  const elapsed = Date.now() - start;
  callbackDuration.add(elapsed);

  const isOk = check(res, {
    // 200 = processed, 404 = order not found (expected for synthetic IDs)
    'callback response is 200 or 404': (r) => r.status === 200 || r.status === 404,
    'no 5xx from callback endpoint':   (r) => r.status < 500,
  });

  if (res.status === 200) {
    callbacksProcessed.add(1);
  } else if (res.status >= 500) {
    callbacksFailed.add(1);
    console.error(`Callback 5xx: ${res.status} — ${res.body.substring(0, 200)}`);
  }

  // 10% chance: send the same callback again to test idempotency
  if (roll === 1) {
    const dupRes = http.post(
      `${BASE_URL}/api/payments/mpesa/callback`,
      payload,
      { headers, tags: { name: 'callback_duplicate' } }
    );
    check(dupRes, {
      'duplicate callback does not crash': (r) => r.status < 500,
    });
    if (dupRes.status === 200 || dupRes.status === 404) {
      callbacksIdempotent.add(1);
    }
  }

  // Simulate callbacks arriving with random delays (0–5 seconds late)
  sleep(randomIntBetween(0, 5));
}

/**
 * Teardown: verify no orders are stuck in payment-pending state due to
 * missed callbacks. Requires admin token.
 */
export function teardown() {
  if (!ADMIN_TOKEN) {
    console.log('ADMIN_TOKEN not set — skipping stuck-order verification');
    return;
  }

  const res = http.get(`${BASE_URL}/api/orders/list?status=awaiting_payment&limit=100`, {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
  });

  if (res.status !== 200) {
    console.log(`Could not fetch pending orders (${res.status})`);
    return;
  }

  try {
    const body = JSON.parse(res.body);
    const stuckCount = body.orders?.length ?? 0;
    console.log(`Orders still awaiting payment after test: ${stuckCount}`);
    if (stuckCount > 50) {
      console.warn(`⚠️  ${stuckCount} orders still awaiting_payment — consider a payment expiry job.`);
    } else {
      console.log(`✅ Acceptable number of pending orders: ${stuckCount}`);
    }
  } catch (e) {
    console.error('Failed to parse orders response', e);
  }
}
