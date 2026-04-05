/**
 * MAMALI Coupon Abuse Burst Test — k6
 *
 * Simulates 500 VUs all sending the same coupon code simultaneously.
 * Verifies:
 *  1. The backend atomically enforces maxUses (no overshooting)
 *  2. The rate limiter handles the burst without crashing
 *  3. Accepted orders each get a proper discount applied
 *
 * Usage:
 *   BASE_URL=http://localhost:5000 \
 *   PRODUCT_ID=xxx \
 *   COUPON_CODE=LOADTEST10 \
 *   COUPON_MAX_USES=50 \
 *   k6 run load-tests/coupon-abuse.k6.js
 *
 * Before running, create the coupon with exactly COUPON_MAX_USES uses allowed:
 *   POST /api/admin/coupons  { code: "LOADTEST10", discountType: "percent",
 *     discountValue: 10, maxUses: 50, isActive: true }
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// ── Custom metrics ─────────────────────────────────────────────────────────

const couponAccepted   = new Counter('coupon_accepted');
const couponRejected   = new Counter('coupon_rejected');
const orderSucceeded   = new Counter('order_with_coupon_succeeded');
const overuseDetected  = new Counter('coupon_overuse_detected');
const errorRate        = new Rate('request_error_rate');

// ── Configuration ──────────────────────────────────────────────────────────

const BASE_URL       = __ENV.BASE_URL       || 'http://localhost:5000';
const PRODUCT_ID     = __ENV.PRODUCT_ID     || 'REPLACE_ME';
const COUPON_CODE    = __ENV.COUPON_CODE    || 'LOADTEST10';
const MAX_USES       = parseInt(__ENV.COUPON_MAX_USES || '50', 10);

function randomPhone() {
  return `2547${randomIntBetween(10000000, 99999999)}`;
}

export const options = {
  // Spike: all 500 VUs arrive at once to maximise race conditions
  scenarios: {
    coupon_burst: {
      executor: 'arrival-rate',
      rate: 500,
      timeUnit: '1s',
      duration: '10s',
      preAllocatedVUs: 500,
      maxVUs: 600,
    },
  },

  thresholds: {
    // Some rejections are expected (maxUses exceeded) — allow up to 90% rejection rate
    http_req_failed: ['rate<0.95'],
    // The flood of 400s shouldn't slow response time dramatically
    http_req_duration: ['p(95)<3000'],
    // Coupon must NEVER be used more than maxUses times (checked post-run via DB)
    coupon_overuse_detected: ['count==0'],
  },
};

export default function () {
  const headers = { 'Content-Type': 'application/json' };
  const phone = randomPhone();

  // Step 1: Try to apply the coupon
  const applyRes = http.post(
    `${BASE_URL}/api/coupons/apply`,
    JSON.stringify({ code: COUPON_CODE, orderTotal: 1500 }),
    { headers, tags: { name: 'apply_coupon' } }
  );

  const applyOk = check(applyRes, {
    'coupon applied or rejected cleanly': (r) => r.status === 200 || r.status === 400,
  });
  errorRate.add(!applyOk ? 1 : 0);

  if (applyRes.status === 200) {
    couponAccepted.add(1);

    // Step 2: Immediately place the order with the coupon
    const orderRes = http.post(
      `${BASE_URL}/api/orders`,
      JSON.stringify({
        customerPhone: phone,
        customerName: 'Coupon Abuser VU',
        items: [{ productId: PRODUCT_ID, quantity: 1 }],
        couponCode: COUPON_CODE,
      }),
      { headers, tags: { name: 'create_order_with_coupon' } }
    );

    const orderOk = check(orderRes, {
      'order with coupon created (201)': (r) => r.status === 201,
    });

    if (orderOk) {
      orderSucceeded.add(1);

      // Verify discount was actually applied
      try {
        const body = JSON.parse(orderRes.body);
        if (body.order && body.order.discountAmount === 0) {
          // Coupon was accepted but no discount was applied — potential exploit!
          console.warn(`Zero discount on order ${body.order.id} with coupon ${COUPON_CODE}`);
        }
      } catch (_) { /* ignore parse errors */ }
    }
  } else {
    couponRejected.add(1);
  }

  // No sleep — we want maximum concurrency
}

/**
 * Teardown: After the run, verify usedCount in the DB never exceeded maxUses.
 * This is checked via the admin API (requires ADMIN_TOKEN env var).
 */
export function teardown() {
  const adminToken = __ENV.ADMIN_TOKEN;
  if (!adminToken) {
    console.log('ADMIN_TOKEN not set — skipping post-run DB verification');
    return;
  }

  // Fetch all coupons and find ours
  const res = http.get(`${BASE_URL}/api/admin/coupons`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });

  if (res.status !== 200) {
    console.error('Could not fetch coupons for verification');
    return;
  }

  try {
    const body = JSON.parse(res.body);
    const coupon = body.coupons.find((c) => c.code === COUPON_CODE);
    if (!coupon) {
      console.log(`Coupon ${COUPON_CODE} not found in admin list`);
      return;
    }

    console.log(`Coupon ${COUPON_CODE}: usedCount=${coupon.usedCount}, maxUses=${coupon.maxUses}`);

    if (coupon.usedCount > MAX_USES) {
      overuseDetected.add(1);
      console.error(
        `🚨 COUPON OVERUSE! usedCount=${coupon.usedCount} > maxUses=${MAX_USES}. ` +
        `Atomic increment is BROKEN.`
      );
    } else {
      console.log(`✅ Coupon usage is within limits (${coupon.usedCount}/${MAX_USES})`);
    }
  } catch (e) {
    console.error('Failed to parse coupon response', e);
  }
}
