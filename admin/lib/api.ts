function getApiUrl(): string {
  if (typeof window !== 'undefined') {
    return (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
  }

  return (process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000').replace(/\/$/, '');
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('mamali_admin_token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${getApiUrl()}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const adminApi = {
  auth: {
    login: (email: string, password: string) =>
      request<{ token: string; user: AdminUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    me: () =>
      request<{ success: boolean; user: AdminUser }>('/api/auth/me').then((r) => r.user),
  },
  dashboard: {
    get: () => request<DashboardData>('/api/admin/dashboard'),
  },
  products: {
    list: (params?: Record<string, string>) =>
      request<{ success: boolean; products: Product[]; pagination: { total: number; page: number; limit: number; pages: number } }>(
        `/api/products?${new URLSearchParams(params)}`
      ).then((r) => ({
        data: r.products,
        total: r.pagination.total,
        page: r.pagination.page,
        limit: r.pagination.limit,
        totalPages: r.pagination.pages,
      })),
    get: (id: string) => request<{ success: boolean; product: Product }>(`/api/products/${id}`).then((r) => r.product),
    create: (data: Partial<Product>) =>
      request<{ success: boolean; product: Product }>('/api/products', {
        method: 'POST',
        body: JSON.stringify(data),
      }).then((r) => r.product),
    update: (id: string, data: Partial<Product>) =>
      request<{ success: boolean; product: Product }>(`/api/products/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }).then((r) => r.product),
    delete: (id: string) =>
      request<{ success: boolean; message: string }>(`/api/products/${id}`, { method: 'DELETE' }),
  },
  categories: {
    list: (params?: Record<string, string>) =>
      request<{ success: boolean; categories: Category[] }>(
        `/api/categories?${new URLSearchParams(params)}`
      ).then((r) => r.categories),
    get: (id: string) =>
      request<{ success: boolean; category: Category }>(`/api/categories/${id}`).then((r) => r.category),
    create: (data: Partial<Category>) =>
      request<{ success: boolean; category: Category }>('/api/categories', {
        method: 'POST',
        body: JSON.stringify(data),
      }).then((r) => r.category),
    update: (id: string, data: Partial<Category>) =>
      request<{ success: boolean; category: Category }>(`/api/categories/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }).then((r) => r.category),
    delete: (id: string) =>
      request<{ success: boolean; message: string }>(`/api/categories/${id}`, { method: 'DELETE' }),
  },
  orders: {
    list: (params?: Record<string, string>) =>
      request<{ success: boolean; orders: Order[]; pagination: { total: number; page: number; limit: number; pages: number } }>(
        `/api/orders/list?${new URLSearchParams(params)}`
      ).then((r) => ({
        data: r.orders,
        total: r.pagination?.total ?? r.orders.length,
        page: r.pagination?.page ?? 1,
        limit: r.pagination?.limit ?? 20,
        totalPages: r.pagination?.pages ?? 1,
      })),
    get: (orderNumber: string) =>
      request<{ success: boolean; order: Order }>(`/api/orders/${orderNumber}`).then((r) => r.order),
    updateStatus: (id: string, status: string) =>
      request<{ success: boolean; order: Order }>(`/api/orders/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      }).then((r) => r.order),
    assign: (id: string, staffId: string) =>
      request<{ success: boolean; order: Order }>(`/api/orders/${id}/assign`, {
        method: 'PUT',
        body: JSON.stringify({ staffId }),
      }).then((r) => r.order),
  },
  staff: {
    list: () =>
      request<{ success: boolean; staff: StaffUser[] }>('/api/admin/staff').then((r) => r.staff),
    /** Minimal active-staff list for order assignment (needs orders.manage, not owner). */
    assignable: () =>
      request<{ success: boolean; staff: { id: string; name: string; role: string }[] }>(
        '/api/admin/staff/assignable'
      ).then((r) => r.staff),
    get: (id: string) =>
      request<{ success: boolean; staff: StaffUser }>(`/api/admin/staff/${id}`).then((r) => r.staff),
    create: (data: Partial<StaffUser> & { password: string }) =>
      request<{ success: boolean; user: StaffUser }>('/api/admin/staff', {
        method: 'POST',
        body: JSON.stringify(data),
      }).then((r) => r.user),
    update: (id: string, data: Partial<StaffUser>) =>
      request<{ success: boolean; user: StaffUser }>(`/api/admin/staff/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }).then((r) => r.user),
    delete: (id: string) =>
      request<void>(`/api/admin/staff/${id}`, { method: 'DELETE' }),
  },
  advertisements: {
    list: () =>
      request<{ success: boolean; advertisements: Advertisement[] }>('/api/admin/advertisements').then(
        (r) => r.advertisements
      ),
    get: (id: string) =>
      request<{ success: boolean; advertisement: Advertisement }>(`/api/admin/advertisements/${id}`).then(
        (r) => r.advertisement
      ),
    create: (data: Partial<Advertisement>) =>
      request<{ success: boolean; advertisement: Advertisement }>('/api/admin/advertisements', {
        method: 'POST',
        body: JSON.stringify(data),
      }).then((r) => r.advertisement),
    update: (id: string, data: Partial<Advertisement>) =>
      request<{ success: boolean; advertisement: Advertisement }>(`/api/admin/advertisements/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }).then((r) => r.advertisement),
    delete: (id: string) =>
      request<void>(`/api/admin/advertisements/${id}`, { method: 'DELETE' }),
  },
  content: {
    list: () =>
      request<{ success: boolean; pages: ContentPage[] }>('/api/admin/content').then((r) => r.pages),
    get: (slug: string) =>
      request<{ success: boolean; page: ContentPage }>(`/api/admin/content/${slug}`).then((r) => r.page),
    update: (slug: string, data: Partial<ContentPage>) =>
      request<{ success: boolean; page: ContentPage }>(`/api/admin/content/${slug}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }).then((r) => r.page),
  },
  homepage: {
    list: () =>
      request<{ success: boolean; sections: HomepageSection[] }>('/api/admin/homepage').then(
        (r) => r.sections
      ),
    get: (id: string) =>
      request<{ success: boolean; section: HomepageSection }>(`/api/admin/homepage/${id}`).then(
        (r) => r.section
      ),
    create: (data: Partial<HomepageSection>) =>
      request<{ success: boolean; section: HomepageSection }>('/api/admin/homepage', {
        method: 'POST',
        body: JSON.stringify(data),
      }).then((r) => r.section),
    update: (id: string, data: Partial<HomepageSection>) =>
      request<{ success: boolean; section: HomepageSection }>(`/api/admin/homepage/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }).then((r) => r.section),
    delete: (id: string) =>
      request<{ success: boolean }>(`/api/admin/homepage/${id}`, { method: 'DELETE' }),
    reorder: (ids: string[]) =>
      request<{ success: boolean; sections: HomepageSection[] }>('/api/admin/homepage/reorder', {
        method: 'PUT',
        body: JSON.stringify({ ids }),
      }).then((r) => r.sections),
  },

  settings: {
    get: () => request<{ success: boolean; settings: StoreSettings }>('/api/admin/settings'),
    update: (data: Partial<StoreSettings>) =>
      request<{ success: boolean; settings: StoreSettings }>('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  },

  coupons: {
    list: () => request<{ success: boolean; coupons: Coupon[] }>('/api/admin/coupons'),
    get: (id: string) => request<{ success: boolean; coupon: Coupon }>(`/api/admin/coupons/${id}`),
    create: (data: Partial<Coupon>) =>
      request<{ success: boolean; coupon: Coupon }>('/api/admin/coupons', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<Coupon>) =>
      request<{ success: boolean; coupon: Coupon }>(`/api/admin/coupons/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/api/admin/coupons/${id}`, { method: 'DELETE' }),
  },

  analytics: {
    revenue: () => request<RevenueAnalytics>('/api/admin/analytics/revenue'),
    products: () => request<ProductAnalytics>('/api/admin/analytics/products'),
    funnel: () => request<FunnelAnalytics>('/api/admin/analytics/funnel'),
    coupons: () => request<CouponAnalytics>('/api/admin/analytics/coupons'),
    fraud: (threshold?: number) =>
      request<FraudAlerts>(`/api/admin/analytics/fraud${threshold ? `?threshold=${threshold}` : ''}`),
    customers: () => request<CustomerAnalytics>('/api/admin/analytics/customers'),
  },

  inventory: {
    intelligence: () => request<InventoryIntelligence>('/api/admin/inventory/intelligence'),
  },

  customers: {
    list: (params?: { page?: number; limit?: number; segment?: string; search?: string }) => {
      const q = new URLSearchParams();
      if (params?.page) q.set('page', String(params.page));
      if (params?.limit) q.set('limit', String(params.limit));
      if (params?.segment && params.segment !== 'all') q.set('segment', params.segment);
      if (params?.search) q.set('search', params.search);
      const qs = q.toString();
      return request<CustomerListResponse>(`/api/admin/customers${qs ? `?${qs}` : ''}`);
    },
    get: (phone: string) =>
      request<CustomerDetailResponse>(`/api/admin/customers/${encodeURIComponent(phone)}`),
    block: (phone: string, reason?: string) =>
      request<{ success: boolean }>(`/api/admin/customers/${encodeURIComponent(phone)}/block`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    unblock: (phone: string) =>
      request<{ success: boolean }>(`/api/admin/customers/${encodeURIComponent(phone)}/block`, {
        method: 'DELETE',
      }),
  },

  notifications: {
    list: (params?: { page?: number; status?: string; channel?: string }) => {
      const q = new URLSearchParams();
      if (params?.page) q.set('page', String(params.page));
      if (params?.status && params.status !== 'all') q.set('status', params.status);
      if (params?.channel && params.channel !== 'all') q.set('channel', params.channel);
      const qs = q.toString();
      return request<NotificationListResponse>(`/api/admin/notifications${qs ? `?${qs}` : ''}`);
    },
    resend: (id: string) =>
      request<{ success: boolean }>(`/api/admin/notifications/${id}/resend`, { method: 'POST' }),
  },

  health: {
    basic: () => request<{ success: boolean; message: string; timestamp: string }>('/api/health'),
    fullCheck: () => request<SystemHealthResponse>('/api/health/full-check'),
  },

  alerts: {
    get: () => request<AlertsResponse>('/api/admin/alerts'),
  },
};

// ---- Types ----

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions?: string[];
}

export interface DashboardData {
  totalRevenue: number;
  aov: number;
  abandonedLast24h: number;
  ordersByStatus: Record<string, number>;
  topProducts: { id: string; name: string; sales: number }[];
  lowStockProducts: { id: string; name: string; stock: number }[];
  recentOrders: Order[];
  revenue?: {
    total: number;
    thisMonth: number;
    lastMonth: number;
    growth: number;
  };
  orders?: {
    total: number;
    pending: number;
    processing: number;
  };
  lowStockAlerts?: { id: string; name: string; stock: number }[];
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  /** Whole shillings (KES). */
  price: number;
  discount: number;
  stock: number;
  reorderLevel?: number;
  /** The API returns the related record, not a name string. */
  category?: { id: string; name: string; slug: string } | null;
  categoryId: string | null;
  images: string[];
  isActive: boolean;
  isFeatured: boolean;
  status?: string;
}

export interface Category {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  parentId: string | null;
  sortOrder: number;
  children?: Category[];
}

export interface Order {
  id: string;
  orderNumber: string;
  customerPhone: string;
  customerName?: string | null;
  notes?: string | null;
  status: OrderStatus;
  total: number;
  assignedTo: string | null;
  assignedStaff?: { id: string; name: string } | null;
  createdAt: string;
  items: OrderItem[];
  activityLog?: ActivityLog[];
}

export type OrderStatus =
  | 'pending'
  | 'awaiting_payment'
  | 'paid'
  | 'processing'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  price: number;
}

export interface ActivityLog {
  id: string;
  action: string;
  performedBy: string;
  createdAt: string;
}

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: 'OWNER' | 'STAFF';
  permissions: string[];
  isActive: boolean;
  password?: string;
}

export interface Advertisement {
  id: string;
  title: string;
  type: 'BANNER' | 'FEATURED' | 'PROMOTION';
  placement: 'HOMEPAGE' | 'CATEGORY' | 'PRODUCT';
  imageUrl: string;
  linkUrl: string;
  content: string;
  startsAt: string;
  endsAt: string;
  sortOrder: number;
  isActive: boolean;
}

export interface ContentPage {
  id: string;
  slug: string;
  title: string;
  content: string;
  isActive: boolean;
}

export interface HomepageSection {
  id: string;
  title: string;
  type: string;
  content: string;
  sortOrder: number;
  isActive: boolean;
}

export interface StoreSettings {
  id: string;
  businessName: string;
  currency: string;
  logoUrl?: string | null;
  primaryColor: string;
  themeColor: string;
  notificationsEnabled: boolean;
  whatsappEnabled: boolean;
  smsFallbackEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Coupon {
  id: string;
  code: string;
  description?: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  minOrderValue: number;
  maxUses?: number | null;
  usedCount: number;
  isActive: boolean;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface RevenueTrendDay {
  date: string;
  revenue: number;
  orders: number;
  discountGiven: number;
}

export interface RevenueAnalytics {
  success: boolean;
  trend: RevenueTrendDay[];
  totalRevenue: number;
  totalOrders: number;
}

export interface ProductStat {
  productId: string;
  name: string;
  totalUnits: number;
  totalRevenue: number;
  totalOrders: number;
  unitsLast30: number;
  revenueLast30: number;
  viewsLast30: number;
  conversionRate: number | null;
}

export interface ProductAnalytics {
  success: boolean;
  products: ProductStat[];
}

export interface FunnelData {
  ordersCreated: number;
  paymentInitiated: number;
  paymentCompleted: number;
  delivered: number;
  cancelled: number;
  abandonmentRate: number;
  paymentSuccessRate: number;
}

export interface FunnelAnalytics {
  success: boolean;
  funnel: FunnelData;
}

export interface CouponStat {
  id: string;
  code: string;
  description?: string;
  discountType: string;
  discountValue: number;
  isActive: boolean;
  usedCount: number;
  maxUses?: number | null;
  expiresAt?: string | null;
  revenueGenerated: number;
  totalDiscount: number;
  ordersWithCoupon: number;
}

export interface CouponAnalytics {
  success: boolean;
  coupons: CouponStat[];
}

export interface FraudAlert {
  id: string;
  orderNumber: string;
  customerPhone: string;
  customerName?: string;
  status: string;
  total: number;
  riskScore: number;
  riskFlags: string;
  createdAt: string;
}

export interface FraudAlerts {
  success: boolean;
  alerts: FraudAlert[];
}

export interface ReorderAlert {
  id: string;
  name: string;
  slug: string;
  stock: number;
  reorderLevel: number;
}

export interface FastMover {
  productId: string;
  name: string;
  unitsSoldLast7Days: number;
  currentStock: number;
  reorderLevel: number;
}

export interface DeadStockItem {
  id: string;
  name: string;
  slug: string;
  stock: number;
  price: number;
  updatedAt: string;
}

export interface InventoryIntelligence {
  success: boolean;
  summary: { totalProducts: number; outOfStock: number; lowStock: number };
  reorderAlerts: ReorderAlert[];
  fastMovers: FastMover[];
  deadStock: DeadStockItem[];
  deadStockValue: number;
}

export interface CustomerStat {
  phone: string;
  name: string | null;
  totalOrders: number;
  totalSpent: number;
  totalDiscount: number;
  avgOrderValue: number;
  lastOrderAt: string | null;
  isRepeat: boolean;
}

export interface CustomerAnalyticsSummary {
  totalUniqueCustomers: number;
  repeatCustomers: number;
  repeatRate: number;
  avgCustomerLifetimeValue: number;
  newCustomersLast30: number;
  repeatCustomersLast30: number;
  repeatRateLast30: number;
}

export interface CustomerAnalytics {
  success: boolean;
  summary: CustomerAnalyticsSummary;
  topCustomers: CustomerStat[];
}

// ---- Customer Management ----

export type CustomerSegment = 'vip' | 'returning' | 'inactive' | 'risky' | 'new' | 'all';

export interface CustomerRecord {
  phone: string;
  name: string | null;
  totalOrders: number;
  totalSpent: number;
  totalDiscount: number;
  avgOrderValue: number;
  lastOrderAt: string | null;
  maxRiskScore: number;
  segment: CustomerSegment;
  isBlocked: boolean;
}

export interface CustomerListResponse {
  success: boolean;
  customers: CustomerRecord[];
  pagination: { total: number; page: number; limit: number; pages: number };
}

export interface CustomerOrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  total: number;
}

export interface CustomerOrder {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  subtotal: number;
  discountAmount: number;
  couponCode: string | null;
  createdAt: string;
  riskScore: number;
  items: CustomerOrderItem[];
  payment: { status: string; mpesaReceiptNumber: string | null } | null;
}

export interface CustomerDetail {
  phone: string;
  name: string | null;
  totalOrders: number;
  totalSpent: number;
  avgOrderValue: number;
  lastOrderAt: string | null;
  maxRiskScore: number;
  segment: CustomerSegment;
  isBlocked: boolean;
  blockedReason: string | null;
}

export interface CustomerDetailResponse {
  success: boolean;
  customer: CustomerDetail;
  orders: CustomerOrder[];
}

// ---- Notifications ----

export interface NotificationLogEntry {
  id: string;
  orderId: string | null;
  order: { orderNumber: string; customerName: string | null } | null;
  channel: 'whatsapp' | 'sms';
  recipient: string;
  messageType: string;
  body: string | null;
  status: 'pending' | 'sent' | 'failed' | 'delivered';
  error: string | null;
  externalId: string | null;
  retryCount: number;
  sentAt: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  success: boolean;
  logs: NotificationLogEntry[];
  summary: { totalSent: number; totalFailed: number; totalPending: number };
  pagination: { total: number; page: number; limit: number; pages: number };
}

// ---- System Health ----

export interface HealthComponentStatus {
  status: 'ok' | 'warn' | 'error';
  latencyMs?: number;
  detail?: string;
  metrics?: Record<string, number>;
}

export interface SystemHealthResponse {
  success: boolean;
  status: 'healthy' | 'degraded' | 'unhealthy';
  startedAt: string;
  components: {
    database: HealthComponentStatus;
    orders: HealthComponentStatus;
    notifications: HealthComponentStatus;
    fraud: HealthComponentStatus;
  };
  error?: string;
}

// ---- Alerts ----

export type AlertSeverity = 'warning' | 'critical';

export interface Alert {
  type: string;
  severity: AlertSeverity;
  message: string;
  value: number;
  threshold: number;
  unit: string;
  generatedAt: string;
}

export interface AlertsResponse {
  success: boolean;
  alerts: Alert[];
  summary: { total: number; critical: number; warning: number };
}
