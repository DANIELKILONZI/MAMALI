# MAMALI Load Tests (k6)

Production simulation scripts for the MAMALI e-commerce platform.
Each script targets a specific stress scenario.

## Prerequisites

Install k6:
```bash
# macOS
brew install k6

# Ubuntu / Debian
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6

# Windows (winget)
winget install k6
```

## Environment Variables

Export these before running:

```bash
export BASE_URL=http://localhost:5000
export PRODUCT_ID=<your-product-id>           # A product with 1000+ stock
export COUPON_CODE=LOADTEST10                  # A coupon with 10k max uses
export ADMIN_TOKEN=<admin-jwt-token>           # For auth-required endpoints
```

## Scripts

### 1. Checkout Load Test (`checkout.k6.js`)
Simulates realistic traffic: 50 → 500 concurrent users checking out.

```bash
k6 run load-tests/checkout.k6.js
```

**Thresholds:**
- 95% of requests complete in < 2 000 ms
- Error rate < 1%
- Order creation success rate > 98%

---

### 2. Coupon Abuse Burst (`coupon-abuse.k6.js`)
500 virtual users all sending the same coupon code simultaneously.
Verifies that the coupon usage counter stays atomic (no overshooting maxUses).

```bash
k6 run load-tests/coupon-abuse.k6.js
```

**Thresholds:**
- Error rate < 5% (some users are expected to be rejected by rate limiter)
- usedCount in DB must never exceed maxUses after the run

---

### 3. Concurrent Last-In-Stock (`concurrent-checkout.k6.js`)
100 users all trying to buy the last 10 units of a product simultaneously.
Only 10 orders should succeed; the rest should get 400 (insufficient stock).

```bash
k6 run load-tests/concurrent-checkout.k6.js
```

**Expected outcome:**
- Exactly ≤ 10 orders succeed (stock enforcement via DB transaction)
- All others return 400 with `outOfStock` error

---

## Interpreting Results

```
✓ http_req_duration............: avg=124ms  min=12ms  med=98ms  max=2.1s p(95)=450ms
✓ http_req_failed..............: 0.23% ✓ 12 ✗ 5123
✓ orders_created...............: 4988
✗ orders_http_failed...........: 12 (rate limited or out-of-stock)
```

A healthy system should show:
- `p(95) < 2000ms` under 500 VUs
- `http_req_failed < 1%` for normal load (non-abuse scenarios)
- Stock count consistency after concurrent-checkout run
