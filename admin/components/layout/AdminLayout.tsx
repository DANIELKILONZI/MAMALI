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
  group: string;
  permission?: Permission; // delegatable — visible when granted
  ownerOnly?: boolean;     // visible only to the owner
}

// Grouped by the job to be done, rather than one flat list of 15 links.
const NAV_GROUPS = ['Overview', 'Catalogue', 'Sales', 'Marketing', 'Business'] as const;

const navItems: NavItem[] = [
  { group: 'Overview',  href: '/dashboard',      label: 'Dashboard',      icon: '📊', permission: 'analytics.view' },
  { group: 'Overview',  href: '/alerts',         label: 'Alerts',         icon: '🚨', permission: 'analytics.view' },
  { group: 'Overview',  href: '/analytics',      label: 'Analytics',      icon: '📈', permission: 'analytics.view' },

  { group: 'Catalogue', href: '/products',       label: 'Products',       icon: '📦', permission: 'products.manage' },
  { group: 'Catalogue', href: '/categories',     label: 'Categories',     icon: '🗂️', permission: 'categories.manage' },
  { group: 'Catalogue', href: '/inventory',      label: 'Inventory',      icon: '🏭', permission: 'inventory.manage' },

  { group: 'Sales',     href: '/orders',         label: 'Orders',         icon: '🛒', permission: 'orders.manage' },
  { group: 'Sales',     href: '/customers',      label: 'Customers',      icon: '👥', permission: 'customers.manage' },
  { group: 'Sales',     href: '/notifications',  label: 'Notifications',  icon: '🔔', permission: 'notifications.manage' },

  { group: 'Marketing', href: '/coupons',        label: 'Coupons',        icon: '🎟️', permission: 'coupons.manage' },
  { group: 'Marketing', href: '/homepage',       label: 'Homepage',       icon: '🏠', permission: 'content.manage' },
  { group: 'Marketing', href: '/content',        label: 'Pages',          icon: '📄', permission: 'content.manage' },
  { group: 'Marketing', href: '/advertisements', label: 'Advertisements', icon: '📢', ownerOnly: true },

  { group: 'Business',  href: '/staff',          label: 'Staff',          icon: '🧑‍💼', ownerOnly: true },
  { group: 'Business',  href: '/settings',       label: 'Settings',       icon: '⚙️', ownerOnly: true },
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

        <nav className="flex-1 space-y-5 overflow-y-auto p-4">
          {NAV_GROUPS.map((group) => {
            const items = visibleNav.filter((i) => i.group === group);
            if (items.length === 0) return null; // hide empty groups entirely
            return (
              <div key={group}>
                <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {group}
                </p>
                <div className="space-y-0.5">
                  {items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={isActive(item.href) ? 'page' : undefined}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        isActive(item.href)
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-300 hover:bg-slate-700/70 hover:text-white'
                      }`}
                    >
                      <span aria-hidden="true">{item.icon}</span>
                      <span className="flex-1 truncate">{item.label}</span>
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
                </div>
              </div>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-700">
          <div className="mb-3">
            <p className="truncate text-sm font-medium text-white">{user?.name}</p>
            <p className="text-xs text-slate-400">{isOwner ? 'Owner' : 'Staff'}</p>
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
