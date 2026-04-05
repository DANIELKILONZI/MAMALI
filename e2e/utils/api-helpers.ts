/**
 * Direct API call helpers for use in tests and setup fixtures.
 * These bypass the browser and hit the backend REST API directly,
 * useful for seeding state without going through the UI.
 */

import { BACKEND_URL } from './test-data';

/** Login as admin and return the JWT token. */
export async function getAdminToken(email: string, password: string): Promise<string> {
  const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Admin login failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { token: string };
  return data.token;
}

/** Create a test order directly via the API (no browser needed). */
export async function createTestOrder(params: {
  productId: string;
  customerPhone: string;
  quantity?: number;
  couponCode?: string;
}): Promise<{ id: string; orderNumber: string; total: number; status: string }> {
  const res = await fetch(`${BACKEND_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerPhone: params.customerPhone,
      customerName: 'E2E Test Customer',
      items: [{ productId: params.productId, quantity: params.quantity ?? 1 }],
      couponCode: params.couponCode,
    }),
  });
  if (!res.ok) throw new Error(`Order creation failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { order: { id: string; orderNumber: string; total: number; status: string } };
  return data.order;
}

/** Advance an order's status (requires admin token). */
export async function updateOrderStatus(
  orderId: string,
  status: string,
  token: string
): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/orders/${orderId}/status`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`Status update failed: ${res.status} ${await res.text()}`);
}

/** Apply a coupon via the public endpoint and return the discount amount. */
export async function applyCoupon(
  code: string,
  orderTotal: number
): Promise<{ discountAmount: number }> {
  const res = await fetch(`${BACKEND_URL}/api/coupons/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, orderTotal }),
  });
  const data = (await res.json()) as { success: boolean; discountAmount: number; message?: string };
  if (!data.success) throw new Error(data.message ?? 'Coupon apply failed');
  return { discountAmount: data.discountAmount };
}

/** Create a product via admin API. Returns the created product ID. */
export async function createProductViaApi(
  data: {
    name: string;
    slug: string;
    price: number;
    stock: number;
    categoryId?: string;
  },
  token: string
): Promise<string> {
  const res = await fetch(`${BACKEND_URL}/api/products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ...data, isActive: true, images: [] }),
  });
  if (!res.ok) throw new Error(`Product creation failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { product: { id: string } };
  return body.product.id;
}

/** Delete (deactivate) a product via admin API. */
export async function deleteProductViaApi(id: string, token: string): Promise<void> {
  await fetch(`${BACKEND_URL}/api/products/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}
