'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { adminApi, AdminUser } from '@/lib/api';
import { can as canPermission, isOwnerRole, type Permission } from '@/lib/permissions';

interface AuthContextType {
  user: AdminUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  isOwner: boolean;
  can: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const storedToken = localStorage.getItem('mamali_admin_token');
    if (storedToken) {
      setToken(storedToken);
      adminApi.auth
        .me()
        .then(setUser)
        .catch(() => {
          localStorage.removeItem('mamali_admin_token');
          setToken(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const { token: newToken, user: newUser } = await adminApi.auth.login(email, password);
    localStorage.setItem('mamali_admin_token', newToken);
    setToken(newToken);
    setUser(newUser);
    router.push(landingPath(newUser));
  };

  const logout = () => {
    localStorage.removeItem('mamali_admin_token');
    setToken(null);
    setUser(null);
    router.push('/login');
  };

  const isOwner = isOwnerRole(user?.role);
  const can = (permission: Permission) => canPermission(user?.role, user?.permissions, permission);

  const value = React.useMemo(
    () => ({ user, token, login, logout, isLoading, isOwner, can }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, token, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/**
 * Guards a page. Pass `ownerOnly` for owner-exclusive pages (advertisements,
 * staff, settings), or a `permission` for delegatable pages. A signed-in
 * user who lacks access is redirected to the first page they can reach.
 */
export function withAuth<P extends object>(
  Component: React.ComponentType<P>,
  guard: boolean | { ownerOnly?: boolean; permission?: Permission } = false
) {
  const opts = typeof guard === 'boolean' ? { ownerOnly: guard } : guard;

  return function ProtectedComponent(props: P) {
    const { user, isLoading, isOwner, can } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    const allowed =
      !!user &&
      (isOwner ||
        (!opts.ownerOnly && (!opts.permission || can(opts.permission))));

    // Only redirect if there's somewhere better to send them; otherwise show
    // an inline notice (prevents a redirect loop for a user whose landing
    // page is the very page they can't access).
    const redirectTo = user ? landingPath(user) : '/login';
    const shouldRedirect = !allowed && redirectTo !== pathname;

    useEffect(() => {
      if (!isLoading) {
        if (!user) router.push('/login');
        else if (shouldRedirect) router.push(redirectTo);
      }
    }, [user, isLoading, shouldRedirect, redirectTo, router]);

    if (isLoading || !user) return null;
    if (!allowed) {
      if (shouldRedirect) return null;
      return (
        <div className="flex min-h-screen items-center justify-center p-8 text-center">
          <div>
            <p className="text-lg font-semibold text-gray-900">No access yet</p>
            <p className="mt-1 text-sm text-gray-500">
              Your account doesn&apos;t have access to any sections. Ask the owner to grant you permissions.
            </p>
          </div>
        </div>
      );
    }
    return <Component {...props} />;
  };
}

/** The first route a user can actually reach, for post-login / fallback redirects. */
export function landingPath(user: AdminUser | null): string {
  if (!user) return '/login';
  if (isOwnerRole(user.role)) return '/dashboard';
  const perms = user.permissions ?? [];
  if (perms.includes('analytics.view')) return '/dashboard';
  if (perms.includes('orders.manage')) return '/orders';
  if (perms.includes('products.manage')) return '/products';
  if (perms.includes('coupons.manage')) return '/coupons';
  if (perms.includes('customers.manage')) return '/customers';
  if (perms.includes('inventory.manage')) return '/inventory';
  if (perms.includes('content.manage')) return '/content';
  if (perms.includes('notifications.manage')) return '/notifications';
  // Dashboard is the universal landing (not permission-gated at the page
  // level), so it is always a safe redirect target and never loops.
  return '/dashboard';
}
