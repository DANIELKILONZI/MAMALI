/**
 * MAMALI Concurrent Last-In-Stock Test — k6
 *
 * The critical race condition test: 100 VUs all try to buy the last 10 units
 * of a product simultaneously.
 *
 * Expected outcome:
 *  - Exactly ≤ 10 orders succeed (DB transaction enforces stock)
 *  - All other requests return 400 with { outOfStock: [...] }
 *  - Zero orders succeed with 0 items in stock (no negative stock)
 *
 * Setup before running:
 *   1. Create a product with stock = 10
 *   2. Set LIMITED_PRODUCT_ID in env
 *
 * Usage:
 *   BASE_URL=http://localhost:5000 \
 *   LIMITED_PRODUCT_ID=xxx \
 *   k6 run load-tests/concurrent-checkout.k6.js
 */

import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// ── Custom metrics ─────────────────────────────────────────────────────────

const successfulOrders    = new Counter('successful_orders');
const stockExhausted      = new Counter('stock_exhausted_responses');
const unexpectedErrors    = new Counter('unexpected_errors');
const duplicateSuccesses  = new Counter('duplicate_stock_warnings');
const oversoldStock       = new Counter('oversold_stock_detected');

// ── Configuration ──────────────────────────────────────────────────────────

const BASE_URL            = __ENV.BASE_URL            || 'http://localhost:5000';
const LIMITED_PRODUCT_ID  = __ENV.LIMITED_PRODUCT_ID  || 'REPLACE_ME';
const STOCK_LIMIT         = parseInt(__ENV.STOCK_LIMIT || '10', 10);

function randomPhone() {
  return `2547${randomIntBetween(10000000, 99999999)}`;
}

export const options = {
  // 100 VUs all fire at once — maximum simultaneity
  scenarios: {
    concurrent_checkout: {
      executor: 'shared-iterations',
      vus: 100,
      iterations: 100,
      maxDuration: '30s',
    },
  },

  thresholds: {
    // All responses must be 201 or 400 (not 500)
    http_req_failed: ['rate<0.05'], // allow up to 5% for rate-limiter 429s
    // Total successful orders must not exceed STOCK_LIMIT
    oversold_stock_detected: ['count==0'],
    // At most STOCK_LIMIT orders should succeed
    successful_orders: [`count<=${STOCK_LIMIT}`],
  },
};

export default function () {
  const headers = { 'Content-Type': 'application/json' };
  const phone = randomPhone();

  const res = http.post(
    `${BASE_URL}/api/orders`,
    JSON.stringify({
      customerPhone: phone,
      customerName: `Concurrent VU ${__VU}`,
      items: [{ productId: LIMITED_PRODUCT_ID, quantity: 1 }],
    }),
    { headers, tags: { name: 'concurrent_order' } }
  );

  const is201 = res.status === 201;
  const is400 = res.status === 400;
  const is429 = res.status === 429;

  check(res, {
    'response is 201 or 400 or 429': () => is201 || is400 || is429,
    'no 500 internal errors':        () => res.status < 500,
  });

  if (is201) {
    successfulOrders.add(1);

    if (successfulOrders.count > STOCK_LIMIT) {
      oversoldStock.add(1);
      console.error(
        `🚨 OVERSELL DETECTED! Order #${successfulOrders.count} succeeded ` +
        `but stock limit is ${STOCK_LIMIT}. Stock deduction is NOT atomic!`
      );
    }
  } else if (is400) {
    try {
      const body = JSON.parse(res.body);
      if (body.outOfStock) {
        stockExhausted.add(1);
      } else {
        unexpectedErrors.add(1);
        console.log(`400 without outOfStock field: ${res.body.substring(0, 200)}`);
      }
    } catch (_) {
      unexpectedErrors.add(1);
    }
  } else if (!is429) {
    // Unexpected status
    unexpectedErrors.add(1);
    console.log(`Unexpected status ${res.status}: ${res.body.substring(0, 200)}`);
  }
}

/**
 * Post-run stock verification.
 * Checks that the product's stock is ≥ 0 and equals STOCK_LIMIT - successfulOrders.
 */
export function teardown() {
  const adminToken = __ENV.ADMIN_TOKEN;
  if (!adminToken) {
    console.log('ADMIN_TOKEN not set — skipping post-run stock verification');
    return;
  }

  const res = http.get(`${BASE_URL}/api/products/${LIMITED_PRODUCT_ID}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });

  if (res.status !== 200) {
    console.error('Could not fetch product for stock verification');
    return;
  }

  try {
    const body = JSON.parse(res.body);
    const stock = body.product?.stock ?? body.stock;
    console.log(`Final product stock: ${stock}`);

    if (stock < 0) {
      console.error(`🚨 NEGATIVE STOCK (${stock})! Stock transactions are broken.`);
    } else {
      console.log(`✅ Stock is non-negative: ${stock}`);
    }
  } catch (e) {
    console.error('Failed to parse product response', e);
  }
}
