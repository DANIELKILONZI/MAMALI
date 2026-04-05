'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi, DashboardData, FraudAlerts } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import AdminLayout from '@/components/layout/AdminLayout';
import StatusBadge from '@/components/ui/StatusBadge';
import { withAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';

function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [fraud, setFraud] = useState<FraudAlerts | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      adminApi.dashboard.get(),
      adminApi.analytics.fraud(60),
    ])
      .then(([dash, fr]) => {
        setData(dash);
        setFraud(fr);
      })
      .catch(() => toast.error('Failed to load dashboard'))
      .finally(() => setIsLoading(false));
  }, []);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(v);

  return (
    <AdminLayout>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <p className="text-gray-500 text-sm mt-1">Welcome back, {user?.name}</p>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : data ? (
        <div className="space-y-6">
          {/* High-Risk Fraud Alert Banner */}
          {fraud && fraud.alerts.length > 0 && (
            <div className="rounded-lg border border-red-300 bg-red-50 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🚨</span>
                <div>
                  <p className="font-semibold text-red-800">
                    {fraud.alerts.length} High-Risk Order{fraud.alerts.length !== 1 ? 's' : ''} Detected
                  </p>
                  <p className="text-sm text-red-600">Review these orders for potential fraud</p>
                </div>
              </div>
              <Link
                href="/analytics"
                className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800"
              >
                Review →
              </Link>
            </div>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Total Revenue"
              value={formatCurrency(data.totalRevenue ?? 0)}
              icon="💰"
              color="blue"
            />
            <StatCard
              title="Total Orders"
              value={String(Object.values(data.ordersByStatus ?? {}).reduce((a, b) => a + b, 0))}
              icon="🛒"
              color="green"
            />
            <StatCard
              title="Processing"
              value={String(data.ordersByStatus?.processing ?? 0)}
              icon="⚙️"
              color="orange"
            />
            <StatCard
              title="Low Stock Items"
              value={String(data.lowStockProducts?.length ?? 0)}
              icon="⚠️"
              color="red"
            />
          </div>

          {/* Orders by Status */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Orders by Status</h3>
              <div className="space-y-2">
                {Object.entries(data.ordersByStatus ?? {}).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between py-1">
                    <StatusBadge status={status} />
                    <span className="font-medium text-gray-700">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Top 5 Products</h3>
              <div className="space-y-2">
                {(data.topProducts ?? []).slice(0, 5).map((p, i) => (
                  <div key={p.id} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 text-xs w-4">{i + 1}</span>
                      <span className="text-sm text-gray-700">{p.name}</span>
                    </div>
                    <span className="text-sm font-medium text-gray-600">{p.sales} sales</span>
                  </div>
                ))}
                {(data.topProducts ?? []).length === 0 && (
                  <p className="text-gray-400 text-sm">No products data</p>
                )}
              </div>
            </div>
          </div>

          {/* Low Stock Alerts */}
          {(data.lowStockProducts ?? []).length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-amber-800">⚠️ Low Stock Alerts</h3>
                <Link href="/inventory" className="text-sm text-amber-700 hover:underline">View Inventory →</Link>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {data.lowStockProducts.map((p) => (
                  <div key={p.id} className="bg-white rounded p-3 text-sm">
                    <p className="font-medium text-gray-700">{p.name}</p>
                    <p className="text-red-600 font-bold">{p.stock} left</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Orders */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Orders</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Order #</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Phone</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Status</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Total</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.recentOrders ?? []).map((order) => (
                    <tr key={order.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 px-3 font-mono text-blue-600">{order.orderNumber}</td>
                      <td className="py-2 px-3 text-gray-600">{order.customerPhone}</td>
                      <td className="py-2 px-3">
                        <StatusBadge status={order.status} />
                      </td>
                      <td className="py-2 px-3 text-gray-700">{formatCurrency(order.total)}</td>
                      <td className="py-2 px-3 text-gray-500">
                        {new Date(order.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                  {(data.recentOrders ?? []).length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 px-3 text-center text-gray-400">
                        No recent orders
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </AdminLayout>
  );
}

function StatCard({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: string;
  icon: string;
  color: 'blue' | 'green' | 'orange' | 'red';
}) {
  const colors = {
    blue: 'bg-blue-50 border-blue-200',
    green: 'bg-green-50 border-green-200',
    orange: 'bg-orange-50 border-orange-200',
    red: 'bg-red-50 border-red-200',
  };
  return (
    <div className={`rounded-lg border p-5 ${colors[color]}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-2xl">{icon}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500 mt-1">{title}</p>
    </div>
  );
}

export default withAuth(DashboardPage);
