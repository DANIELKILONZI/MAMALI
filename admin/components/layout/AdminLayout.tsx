'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { adminApi } from '@/lib/api';
import type { Permission } from '@/lib/permissions';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  permission?: Permission; // delegatable — visible when granted
  ownerOnly?: boolean;     // visible only to the owner
}

const navItems: NavItem[] = [
  { href: '/dashboard',      label: 'Dashboard',      icon: '📊', permission: 'analytics.view' },
  { href: '/alerts',         label: 'Alerts',          icon: '🚨', permission: 'analytics.view' },
  { href: '/analytics',      label: 'Analytics',       icon: '📈', permission: 'analytics.view' },
  { href: '/products',       label: 'Products',        icon: '📦', permission: 'products.manage' },
  { href: '/categories',     label: 'Categories',      icon: '🗂️', permission: 'categories.manage' },
  { href: '/orders',         label: 'Orders',          icon: '🛒', permission: 'orders.manage' },
  { href: '/customers',      label: 'Customers',       icon: '👥', permission: 'customers.manage' },
  { href: '/inventory',      label: 'Inventory',       icon: '🏭', permission: 'inventory.manage' },
  { href: '/coupons',        label: 'Coupons',         icon: '🎟️', permission: 'coupons.manage' },
  { href: '/notifications',  label: 'Notifications',   icon: '🔔', permission: 'notifications.manage' },
  { href: '/content',        label: 'Content',         icon: '📄', permission: 'content.manage' },
  { href: '/homepage',       label: 'Homepage',        icon: '🏠', permission: 'content.manage' },
  // Owner-exclusive
  { href: '/advertisements', label: 'Advertisements',  icon: '📢', ownerOnly: true },
  { href: '/settings',       label: 'Settings',        icon: '⚙️', ownerOnly: true },
  { href: '/staff',          label: 'Staff',           icon: '🧑‍💼', ownerOnly: true },
];

const ALERT_POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout, isOwner, can } = useAuth();
  const [alertCount, setAlertCount] = useState<{ critical: number; total: number } | null>(null);

  // Show only sections this user can reach.
  const visibleNav = navItems.filter((item) => {
    if (item.ownerOnly) return isOwner;
    if (item.permission) return can(item.permission);
    return true; // Dashboard — universal
  });

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/');

  // Poll for active alert count every 2 minutes to show badge in nav
  useEffect(() => {
    let cancelled = false;
    const fetchAlerts = async () => {
      try {
        const data = await adminApi.alerts.get();
        if (!cancelled) {
          setAlertCount({ critical: data.summary.critical, total: data.summary.total });
        }
      } catch {
        // silently ignore — no badge shown if unavailable
      }
    };
    fetchAlerts();
    const interval = setInterval(fetchAlerts, ALERT_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-[#1E293B] text-white flex flex-col flex-shrink-0">
        <div className="p-6 border-b border-slate-700">
          <h1 className="text-xl font-bold text-white">MAMALI Admin</h1>
          <p className="text-slate-400 text-sm">Control Panel</p>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {visibleNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive(item.href)
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              <span>{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {/* Alert badge on the Alerts nav item */}
              {item.href === '/alerts' && alertCount && alertCount.total > 0 && (
                <span
                  className={`inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-bold leading-none ${
                    alertCount.critical > 0
                      ? 'bg-red-500 text-white'
                      : 'bg-yellow-400 text-yellow-900'
                  }`}
                >
                  {alertCount.total}
                </span>
              )}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-700">
          <div className="mb-3">
            <p className="text-sm font-medium text-white">{user?.name}</p>
            <p className="text-xs text-slate-400 capitalize">{user?.role}</p>
          </div>
          <button
            onClick={logout}
            className="w-full text-left text-sm text-slate-400 hover:text-white transition-colors px-3 py-2 rounded hover:bg-slate-700"
          >
            🚪 Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
