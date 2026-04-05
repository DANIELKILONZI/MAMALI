/**
 * MAMALI Checkout Load Test — k6
 *
 * Simulates a realistic traffic ramp-up:
 *   Stage 1: warm up        (  0 → 50 VUs over 30 s)
 *   Stage 2: normal load    ( 50 VUs sustained for 1 min)
 *   Stage 3: peak load      ( 50 → 500 VUs over 2 min)
 *   Stage 4: sustained peak (500 VUs for 1 min)
 *   Stage 5: ramp-down      (500 →   0 VUs over 30 s)
 *
 * Each virtual user:
 *   1. Views a product page (GET /api/products/:slug)
 *   2. Adds to cart (GET product detail)
 *   3. Creates an order (POST /api/orders)
 *   4. Initiates payment (POST /api/payments/initiate) — optional
 *
 * Usage:
 *   BASE_URL=http://localhost:5000 PRODUCT_ID=xxx k6 run load-tests/checkout.k6.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// ── Custom metrics ─────────────────────────────────────────────────────────

const ordersCreated   = new Counter('orders_created');
const ordersFailed    = new Counter('orders_http_failed');
const orderDuration   = new Trend('order_creation_duration_ms', true);
const orderErrorRate  = new Rate('order_error_rate');

// ── Configuration ──────────────────────────────────────────────────────────

const BASE_URL    = __ENV.BASE_URL   || 'http://localhost:5000';
const PRODUCT_ID  = __ENV.PRODUCT_ID || 'REPLACE_ME';
const COUPON_CODE = __ENV.COUPON_CODE || null;

// Generate unique phone numbers to avoid rate-limiter false positives
// (checkoutRateLimiter: 5 orders/phone/hour)
function randomPhone() {
  return `2547${randomIntBetween(10000000, 99999999)}`;
}

export const options = {
  stages: [
    { duration: '30s', target: 50  },   // warm up
    { duration: '60s', target: 50  },   // normal load
    { duration: '120s', target: 500 },  // ramp to peak
    { duration: '60s', target: 500 },   // sustain peak
    { duration: '30s', target: 0   },   // ramp down
  ],

  thresholds: {
    // 95% of all requests must complete in < 2 s
    http_req_duration: ['p(95)<2000'],
    // Overall HTTP error rate must stay below 1%
    http_req_failed: ['rate<0.01'],
    // Order creation endpoint must be < 1% error rate
    order_error_rate: ['rate<0.01'],
    // Order creation must be fast (p95 < 3 s)
    order_creation_duration_ms: ['p(95)<3000'],
  },
};

// ── Default function (run per VU per iteration) ────────────────────────────

export default function () {
  const headers = { 'Content-Type': 'application/json' };
  const phone = randomPhone();

  // 1. View product (simulate page load + tracking)
  const productRes = http.get(`${BASE_URL}/api/products/${PRODUCT_ID}`, { tags: { name: 'view_product' } });
  check(productRes, { 'product page ok': (r) => r.status === 200 });
  sleep(randomIntBetween(1, 3)); // user reading the page

  // 2. Create order
  const orderPayload = JSON.stringify({
    customerPhone: phone,
    customerName: 'Load Test User',
    items: [{ productId: PRODUCT_ID, quantity: 1 }],
    ...(COUPON_CODE ? { couponCode: COUPON_CODE } : {}),
  });

  const start = Date.now();
  const orderRes = http.post(`${BASE_URL}/api/orders`, orderPayload, {
    headers,
    tags: { name: 'create_order' },
  });
  const elapsed = Date.now() - start;
  orderDuration.add(elapsed);

  const orderOk = check(orderRes, {
    'order created (201)': (r) => r.status === 201,
    'order has id':        (r) => {
      try { return !!JSON.parse(r.body).order?.id; } catch { return false; }
    },
  });

  if (orderOk) {
    ordersCreated.add(1);
    orderErrorRate.add(0);
  } else {
    ordersFailed.add(1);
    orderErrorRate.add(1);
    // Log first few failures for debugging
    if (ordersFailed.count <= 5) {
      console.log(`Order failed: ${orderRes.status} — ${orderRes.body.substring(0, 200)}`);
    }
  }

  // 3. Brief pause between checkout and payment (user reading confirmation)
  sleep(randomIntBetween(1, 2));
}
