const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

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

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const adminApi = {
  auth: {
    login: (email: string, password: string) =>
      request<{ token: string; user: AdminUser }>('/api/admin/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    me: () => request<AdminUser>('/api/admin/auth/me'),
  },
  dashboard: {
    get: () => request<DashboardData>('/api/admin/dashboard'),
  },
  products: {
    list: (params?: Record<string, string>) =>
      request<PaginatedResponse<Product>>(`/api/admin/products?${new URLSearchParams(params)}`),
    get: (id: string) => request<Product>(`/api/admin/products/${id}`),
    create: (data: Partial<Product>) =>
      request<Product>('/api/admin/products', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Product>) =>
      request<Product>(`/api/admin/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<void>(`/api/admin/products/${id}`, { method: 'DELETE' }),
  },
  categories: {
    list: (params?: Record<string, string>) =>
      request<Category[]>(`/api/admin/categories?${new URLSearchParams(params)}`),
    get: (id: string) => request<Category>(`/api/admin/categories/${id}`),
    create: (data: Partial<Category>) =>
      request<Category>('/api/admin/categories', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Category>) =>
      request<Category>(`/api/admin/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<void>(`/api/admin/categories/${id}`, { method: 'DELETE' }),
  },
  orders: {
    list: (params?: Record<string, string>) =>
      request<PaginatedResponse<Order>>(`/api/admin/orders?${new URLSearchParams(params)}`),
    get: (id: string) => request<Order>(`/api/admin/orders/${id}`),
    updateStatus: (id: string, status: string) =>
      request<Order>(`/api/admin/orders/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    assign: (id: string, staffId: string) =>
      request<Order>(`/api/admin/orders/${id}/assign`, {
        method: 'PATCH',
        body: JSON.stringify({ staffId }),
      }),
  },
  staff: {
    list: () => request<StaffUser[]>('/api/admin/staff'),
    get: (id: string) => request<StaffUser>(`/api/admin/staff/${id}`),
    create: (data: Partial<StaffUser> & { password: string }) =>
      request<StaffUser>('/api/admin/staff', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<StaffUser>) =>
      request<StaffUser>(`/api/admin/staff/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<void>(`/api/admin/staff/${id}`, { method: 'DELETE' }),
  },
  advertisements: {
    list: () => request<Advertisement[]>('/api/admin/advertisements'),
    get: (id: string) => request<Advertisement>(`/api/admin/advertisements/${id}`),
    create: (data: Partial<Advertisement>) =>
      request<Advertisement>('/api/admin/advertisements', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<Advertisement>) =>
      request<Advertisement>(`/api/admin/advertisements/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<void>(`/api/admin/advertisements/${id}`, { method: 'DELETE' }),
  },
  content: {
    list: () => request<ContentPage[]>('/api/admin/content'),
    get: (slug: string) => request<ContentPage>(`/api/admin/content/${slug}`),
    update: (slug: string, data: Partial<ContentPage>) =>
      request<ContentPage>(`/api/admin/content/${slug}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  },
  homepage: {
    list: () => request<HomepageSection[]>('/api/admin/homepage'),
    get: (id: string) => request<HomepageSection>(`/api/admin/homepage/${id}`),
    update: (id: string, data: Partial<HomepageSection>) =>
      request<HomepageSection>(`/api/admin/homepage/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    reorder: (ids: string[]) =>
      request<void>('/api/admin/homepage/reorder', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      }),
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
};

// ---- Types ----

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'staff';
}

export interface DashboardData {
  totalRevenue: number;
  ordersByStatus: Record<string, number>;
  topProducts: { id: string; name: string; sales: number }[];
  lowStockProducts: { id: string; name: string; stock: number }[];
  recentOrders: Order[];
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  discount: number;
  stock: number;
  category: string;
  categoryId: string;
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
  role: 'admin' | 'staff';
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
