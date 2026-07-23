function getApiUrl(): string {
  if (typeof window !== 'undefined') {
    return (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
  }

  return (process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000').replace(/\/$/, '');
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
  parentId?: string;
  children: Category[];
  _count: { products: number };
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description?: string;
  price: number;
  discount: number;
  discountEndsAt?: string | null;
  boostScore?: number;
  stock: number;
  images: string[];
  categoryId?: string;
  category?: { id: string; name: string; slug: string };
  isActive: boolean;
  isFeatured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface ProductsResponse {
  success: boolean;
  products: Product[];
  pagination: Pagination;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  total: number;
  product?: {
    id: string;
    name: string;
    slug: string;
    images: string;
  };
  createdAt: string;
}

export interface Payment {
  id: string;
  orderId: string;
  status: 'pending' | 'completed' | 'failed';
  mpesaReceiptNumber?: string;
  resultCode?: string;
  resultDesc?: string;
  amount: number;
  merchantRequestId?: string;
  checkoutRequestId?: string;
  phoneNumber?: string;
  idempotencyKey?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerPhone: string;
  customerName?: string;
  status: string;
  items: OrderItem[];
  subtotal: number;
  discountAmount?: number;
  couponCode?: string;
  total: number;
  notes?: string;
  payment?: Payment;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Advertisement {
  id: string;
  title: string;
  type: 'BANNER' | 'FEATURED' | 'PROMOTION';
  placement: 'HOMEPAGE' | 'CATEGORY' | 'PRODUCT';
  imageUrl?: string;
  linkUrl?: string;
  content?: string;
  isActive: boolean;
  startsAt?: string;
  endsAt?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ContentPage {
  id: string;
  slug: string;
  title: string;
  content: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HomepageSection {
  id: string;
  type: string;
  title?: string;
  content?: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface StoreSettings {
  id: string;
  businessName: string;
  currency: string;
  logoUrl?: string | null;
  primaryColor: string;
  themeColor: string;
  createdAt: string;
  updatedAt: string;
}

export interface CouponApplyResult {
  success: boolean;
  coupon: { id: string; code: string; discountType: string; discountValue: number };
  discountAmount: number;
}

export interface CartValidationItem {
  productId: string;
  quantity: number;
  valid: boolean;
  reason?: string;
  availableStock?: number;
  price?: number;
  total?: number;
  product?: {
    id: string;
    name: string;
    price: number;
    discount: number;
    stock: number;
    images: string[];
  };
}

export interface CartValidationResponse {
  success: boolean;
  valid: boolean;
  items: CartValidationItem[];
  subtotal: number;
  total: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiUrl()}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message || `API error ${res.status}`);
  }

  return res.json() as Promise<T>;
}

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

// ── API client ────────────────────────────────────────────────────────────────

export const api = {
  products: {
    list: (params: {
      category?: string;
      search?: string;
      minPrice?: number;
      maxPrice?: number;
      featured?: boolean;
      page?: number;
      limit?: number;
    } = {}) =>
      apiFetch<ProductsResponse>(`/api/products${buildQuery(params)}`),

    get: (slug: string) =>
      apiFetch<{ success: boolean; product: Product }>(`/api/products/${slug}`),

    recordView: (slug: string) =>
      fetch(`${getApiUrl()}/api/products/${slug}/view`, { method: 'POST' }).catch(() => {}),

    search: (query: string, page = 1) =>
      apiFetch<ProductsResponse>(`/api/products${buildQuery({ search: query, page })}`),
  },

  categories: {
    list: () =>
      apiFetch<{ success: boolean; categories: Category[] }>('/api/categories'),

    get: (slug: string) =>
      apiFetch<{ success: boolean; category: Category & { products: Product[] } }>(
        `/api/categories/${slug}`
      ),
  },

  orders: {
    create: (body: {
      customerPhone: string;
      customerName?: string;
      notes?: string;
      couponCode?: string;
      items: { productId: string; quantity: number }[];
    }) =>
      apiFetch<{ success: boolean; order: Order }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    getStatus: (orderNumber: string) =>
      apiFetch<{ success: boolean; order: Order }>(`/api/orders/${orderNumber}`),
  },

  payments: {
    initiate: (body: { orderId: string; phoneNumber: string }) =>
      apiFetch<{ success: boolean; payment: Payment; message: string }>(
        '/api/payments/initiate',
        { method: 'POST', body: JSON.stringify(body) }
      ),

    getStatus: (orderId: string) =>
      apiFetch<{ success: boolean; payment: Payment }>(`/api/payments/${orderId}/status`),
  },

  cart: {
    validate: (items: { productId: string; quantity: number }[]) =>
      apiFetch<CartValidationResponse>('/api/cart/validate', {
        method: 'POST',
        body: JSON.stringify({ items }),
      }),
  },

  advertisements: {
    getByPlacement: (placement?: 'HOMEPAGE' | 'CATEGORY' | 'PRODUCT') =>
      apiFetch<{ success: boolean; advertisements: Advertisement[] }>(
        `/api/advertisements${placement ? `?placement=${placement}` : ''}`
      ),
  },

  content: {
    getPage: (slug: string) =>
      apiFetch<{ success: boolean; page: ContentPage }>(`/api/content/${slug}`),
  },

  homepage: {
    getSections: () =>
      apiFetch<{ success: boolean; sections: HomepageSection[] }>('/api/homepage/sections'),
  },

  settings: {
    get: () =>
      apiFetch<{ success: boolean; settings: StoreSettings }>('/api/settings'),
  },

  coupons: {
    apply: (code: string, orderTotal: number) =>
      apiFetch<CouponApplyResult>('/api/coupons/apply', {
        method: 'POST',
        body: JSON.stringify({ code, orderTotal }),
      }),
  },

  // Optional customer accounts — shopping never requires one.
  customer: {
    register: (body: { phone: string; name?: string; password: string }) =>
      apiFetch<{ success: boolean; token: string; customer: CustomerAccount }>('/api/customer/register', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    login: (body: { phone: string; password: string }) =>
      apiFetch<{ success: boolean; token: string; customer: CustomerAccount }>('/api/customer/login', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    me: () =>
      apiFetch<{ success: boolean; customer: CustomerAccount }>('/api/customer/me', {
        headers: { 'Content-Type': 'application/json', ...customerAuth.header() },
      }),
    myOrders: () =>
      apiFetch<{ success: boolean; orders: CustomerOrderSummary[] }>('/api/customer/me/orders', {
        headers: { 'Content-Type': 'application/json', ...customerAuth.header() },
      }),
  },
};

// ── Customer session (localStorage token) ─────────────────────────────────────

export interface CustomerAccount {
  id: string;
  phone: string;
  name?: string | null;
  createdAt: string;
}

export interface CustomerOrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  createdAt: string;
  items: { name: string; quantity: number }[];
}

const CUSTOMER_TOKEN_KEY = 'mamali_customer_token';

export const customerAuth = {
  getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(CUSTOMER_TOKEN_KEY);
  },
  setToken(token: string): void {
    localStorage.setItem(CUSTOMER_TOKEN_KEY, token);
  },
  clear(): void {
    localStorage.removeItem(CUSTOMER_TOKEN_KEY);
  },
  isLoggedIn(): boolean {
    return this.getToken() !== null;
  },
  header(): Record<string, string> {
    const token = this.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
};

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Returns the effective selling price after discount, in whole shillings */
export function effectivePrice(product: Pick<Product, 'price' | 'discount'>): number {
  if (!product.discount) return product.price;
  return Math.round(product.price * (1 - product.discount / 100));
}

/** Returns stock status label */
export function stockStatus(stock: number): 'in_stock' | 'low_stock' | 'out_of_stock' {
  if (stock <= 0) return 'out_of_stock';
  if (stock <= 5) return 'low_stock';
  return 'in_stock';
}
