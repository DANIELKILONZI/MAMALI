'use client';

import { useEffect, useState } from 'react';
import {
  adminApi,
  RevenueAnalytics,
  ProductAnalytics,
  FunnelAnalytics,
  CouponAnalytics,
  FraudAlerts,
  CustomerAnalytics,
} from '@/lib/api';
import AdminLayout from '@/components/layout/AdminLayout';
import PageHeader from '@/components/ui/PageHeader';
import { withAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';

const KES = (v: number) =>
  new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(v);

function pct(v: number | null) {
  if (v === null) return '—';
  return `${v.toFixed(1)}%`;
}

function RiskBadge({ score }: { score: number }) {
  if (score >= 60) return <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">High {score}</span>;
  if (score >= 30) return <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-700">Med {score}</span>;
  return <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">Low {score}</span>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
      {children}
    </div>
  );
}

function AnalyticsPage() {
  const [revenue, setRevenue] = useState<RevenueAnalytics | null>(null);
  const [products, setProducts] = useState<ProductAnalytics | null>(null);
  const [funnel, setFunnel] = useState<FunnelAnalytics | null>(null);
  const [coupons, setCoupons] = useState<CouponAnalytics | null>(null);
  const [fraud, setFraud] = useState<FraudAlerts | null>(null);
  const [customers, setCustomers] = useState<CustomerAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      adminApi.analytics.revenue(),
      adminApi.analytics.products(),
      adminApi.analytics.funnel(),
      adminApi.analytics.coupons(),
      adminApi.analytics.fraud(30),
      adminApi.analytics.customers(),
    ])
      .then(([r, p, f, c, fr, cu]) => {
        setRevenue(r);
        setProducts(p);
        setFunnel(f);
        setCoupons(c);
        setFraud(fr);
        setCustomers(cu);
      })
      .catch(() => toast.error('Failed to load analytics'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <AdminLayout>
        <div className="text-center py-12 text-gray-500">Loading analytics…</div>
      </AdminLayout>
    );
  }

  const f = funnel?.funnel;
  const maxRevenue = Math.max(...(revenue?.trend.map((d) => d.revenue) ?? [1]));

  return (
    <AdminLayout>
      <PageHeader
        title="Analytics"
        description="How the business is performing — last 30 days."
      />

      <div className="space-y-6">

        {/* --- Revenue Summary --- */}
        {revenue && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
              <p className="text-2xl font-bold text-gray-900">{KES(revenue.totalRevenue)}</p>
              <p className="text-sm text-gray-500 mt-1">Revenue (30 days)</p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-5">
              <p className="text-2xl font-bold text-gray-900">{revenue.totalOrders}</p>
              <p className="text-sm text-gray-500 mt-1">Paid Orders (30 days)</p>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-5">
              <p className="text-2xl font-bold text-gray-900">
                {revenue.totalOrders > 0 ? KES(revenue.totalRevenue / revenue.totalOrders) : '—'}
              </p>
              <p className="text-sm text-gray-500 mt-1">Avg Order Value</p>
            </div>
          </div>
        )}

        {/* --- Revenue Trend --- */}
        {revenue && (
          <Section title="📈 Daily Revenue (30 days)">
            <div className="overflow-x-auto">
              <div className="flex items-end gap-0.5 h-40 min-w-[600px]">
                {revenue.trend.map((d) => {
                  const heightPct = maxRevenue > 0 ? (d.revenue / maxRevenue) * 100 : 0;
                  return (
                    <div
                      key={d.date}
                      title={`${d.date}: ${KES(d.revenue)} (${d.orders} orders)`}
                      className="flex-1 bg-blue-500 hover:bg-blue-600 transition rounded-t cursor-help"
                      style={{ height: `${Math.max(heightPct, 1)}%` }}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1 min-w-[600px]">
                <span>{revenue.trend[0]?.date}</span>
                <span>{revenue.trend[revenue.trend.length - 1]?.date}</span>
              </div>
            </div>
          </Section>
        )}

        {/* --- Checkout Funnel --- */}
        {f && (
          <Section title="🔄 Checkout Funnel (30 days)">
            <div className="space-y-3">
              {[
                { label: 'Orders Created', value: f.ordersCreated, color: 'bg-blue-500' },
                { label: 'Payment Initiated', value: f.paymentInitiated, color: 'bg-yellow-500' },
                { label: 'Payment Completed', value: f.paymentCompleted, color: 'bg-green-500' },
                { label: 'Delivered', value: f.delivered, color: 'bg-emerald-600' },
                { label: 'Cancelled', value: f.cancelled, color: 'bg-red-400' },
              ].map((step) => (
                <div key={step.label} className="flex items-center gap-3">
                  <span className="w-44 text-sm text-gray-600">{step.label}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                    <div
                      className={`${step.color} h-4 rounded-full transition`}
                      style={{
                        width: f.ordersCreated > 0
                          ? `${(step.value / f.ordersCreated) * 100}%`
                          : '0%',
                      }}
                    />
                  </div>
                  <span className="w-12 text-sm font-semibold text-gray-700 text-right">{step.value}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
                <p className="font-bold text-red-700 text-xl">{pct(f.abandonmentRate)}</p>
                <p className="text-gray-500">Abandonment Rate</p>
              </div>
              <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3">
                <p className="font-bold text-green-700 text-xl">{pct(f.paymentSuccessRate)}</p>
                <p className="text-gray-500">Payment Success Rate</p>
              </div>
            </div>
          </Section>
        )}

        {/* --- Product Performance --- */}
        {products && (
          <Section title="📦 Product Performance">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Product</th>
                    <th className="text-right py-2 px-3 text-gray-500 font-medium">Total Revenue</th>
                    <th className="text-right py-2 px-3 text-gray-500 font-medium">Units (30d)</th>
                    <th className="text-right py-2 px-3 text-gray-500 font-medium">Views (30d)</th>
                    <th className="text-right py-2 px-3 text-gray-500 font-medium">Conversion</th>
                  </tr>
                </thead>
                <tbody>
                  {products.products.slice(0, 15).map((p) => (
                    <tr key={p.productId} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 px-3 text-gray-800 font-medium max-w-xs">
                        <span className="line-clamp-1">{p.name}</span>
                      </td>
                      <td className="py-2 px-3 text-right text-gray-700">{KES(p.totalRevenue)}</td>
                      <td className="py-2 px-3 text-right text-gray-600">{p.unitsLast30}</td>
                      <td className="py-2 px-3 text-right text-gray-600">{p.viewsLast30}</td>
                      <td className="py-2 px-3 text-right">
                        {p.conversionRate !== null ? (
                          <span className={`font-medium ${p.conversionRate >= 5 ? 'text-green-600' : 'text-gray-600'}`}>
                            {p.conversionRate.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {products.products.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-gray-400">No product data yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* --- Coupon Effectiveness --- */}
        {coupons && coupons.coupons.length > 0 && (
          <Section title="🎟️ Coupon Effectiveness">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Code</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Discount</th>
                    <th className="text-right py-2 px-3 text-gray-500 font-medium">Uses</th>
                    <th className="text-right py-2 px-3 text-gray-500 font-medium">Revenue Generated</th>
                    <th className="text-right py-2 px-3 text-gray-500 font-medium">Discount Given</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {coupons.coupons.map((c) => (
                    <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 px-3 font-mono font-semibold text-blue-700">{c.code}</td>
                      <td className="py-2 px-3 text-gray-600">
                        {c.discountType === 'percent' ? `${c.discountValue}%` : KES(c.discountValue)}
                      </td>
                      <td className="py-2 px-3 text-right text-gray-600">
                        {c.usedCount}{c.maxUses ? `/${c.maxUses}` : ''}
                      </td>
                      <td className="py-2 px-3 text-right font-medium text-green-700">{KES(c.revenueGenerated)}</td>
                      <td className="py-2 px-3 text-right text-red-600">{KES(c.totalDiscount)}</td>
                      <td className="py-2 px-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${c.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {c.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* --- Fraud Alerts --- */}
        {fraud && (
          <Section title="🚨 Fraud Alerts (Risk Score ≥ 30)">
            {fraud.alerts.length === 0 ? (
              <p className="text-gray-400 text-sm">No high-risk orders detected.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Order #</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Phone</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Status</th>
                      <th className="text-right py-2 px-3 text-gray-500 font-medium">Total</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Risk</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fraud.alerts.map((a) => {
                      let flags: string[] = [];
                      try { flags = JSON.parse(a.riskFlags ?? '[]'); } catch { flags = []; }
                      return (
                        <tr key={a.id} className="border-b border-gray-50 hover:bg-red-50">
                          <td className="py-2 px-3 font-mono text-blue-600">{a.orderNumber}</td>
                          <td className="py-2 px-3 text-gray-600">{a.customerPhone}</td>
                          <td className="py-2 px-3 capitalize text-gray-600">{a.status}</td>
                          <td className="py-2 px-3 text-right text-gray-700">{KES(a.total)}</td>
                          <td className="py-2 px-3"><RiskBadge score={a.riskScore} /></td>
                          <td className="py-2 px-3">
                            <div className="flex flex-wrap gap-1">
                              {flags.map((flag) => (
                                <span key={flag} className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
                                  {flag.replace(/_/g, ' ')}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        )}

        {/* --- Customer Intelligence --- */}
        {customers && (
          <Section title="👥 Customer Intelligence">
            {/* Summary KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-xl font-bold text-gray-900">{customers.summary.totalUniqueCustomers}</p>
                <p className="text-xs text-gray-500 mt-1">Total Customers</p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-xl font-bold text-gray-900">{KES(customers.summary.avgCustomerLifetimeValue)}</p>
                <p className="text-xs text-gray-500 mt-1">Avg Lifetime Value</p>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <p className="text-xl font-bold text-gray-900">{pct(customers.summary.repeatRate)}</p>
                <p className="text-xs text-gray-500 mt-1">Repeat Rate (all‑time)</p>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-xl font-bold text-gray-900">{pct(customers.summary.repeatRateLast30)}</p>
                <p className="text-xs text-gray-500 mt-1">Repeat Rate (30 days)</p>
              </div>
            </div>

            {/* New vs Repeat last 30 days */}
            <div className="mb-6">
              <p className="text-sm font-medium text-gray-700 mb-2">New vs Repeat Customers — Last 30 days</p>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-14">New</span>
                <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-blue-500 h-3 rounded-full"
                    style={{
                      width: (customers.summary.newCustomersLast30 + customers.summary.repeatCustomersLast30) > 0
                        ? `${(customers.summary.newCustomersLast30 / (customers.summary.newCustomersLast30 + customers.summary.repeatCustomersLast30)) * 100}%`
                        : '0%',
                    }}
                  />
                </div>
                <span className="text-xs font-semibold text-gray-700 w-8 text-right">{customers.summary.newCustomersLast30}</span>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-xs text-gray-500 w-14">Repeat</span>
                <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-green-500 h-3 rounded-full"
                    style={{
                      width: (customers.summary.newCustomersLast30 + customers.summary.repeatCustomersLast30) > 0
                        ? `${(customers.summary.repeatCustomersLast30 / (customers.summary.newCustomersLast30 + customers.summary.repeatCustomersLast30)) * 100}%`
                        : '0%',
                    }}
                  />
                </div>
                <span className="text-xs font-semibold text-gray-700 w-8 text-right">{customers.summary.repeatCustomersLast30}</span>
              </div>
            </div>

            {/* Top customers table */}
            {customers.topCustomers.length > 0 && (
              <div className="overflow-x-auto">
                <p className="text-sm font-medium text-gray-700 mb-2">Top Customers by Lifetime Spend</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Customer</th>
                      <th className="text-right py-2 px-3 text-gray-500 font-medium">Orders</th>
                      <th className="text-right py-2 px-3 text-gray-500 font-medium">Total Spent</th>
                      <th className="text-right py-2 px-3 text-gray-500 font-medium">Avg Order</th>
                      <th className="text-right py-2 px-3 text-gray-500 font-medium">Discount Saved</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.topCustomers.slice(0, 20).map((c) => (
                      <tr key={c.phone} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 px-3">
                          <p className="font-medium text-gray-800">{c.name ?? '—'}</p>
                          <p className="text-xs text-gray-400">{c.phone}</p>
                        </td>
                        <td className="py-2 px-3 text-right text-gray-700">{c.totalOrders}</td>
                        <td className="py-2 px-3 text-right font-semibold text-green-700">{KES(c.totalSpent)}</td>
                        <td className="py-2 px-3 text-right text-gray-600">{KES(c.avgOrderValue)}</td>
                        <td className="py-2 px-3 text-right text-blue-600">{c.totalDiscount > 0 ? KES(c.totalDiscount) : '—'}</td>
                        <td className="py-2 px-3">
                          {c.isRepeat ? (
                            <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">Repeat</span>
                          ) : (
                            <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">New</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {customers.topCustomers.length === 0 && (
              <p className="text-gray-400 text-sm mt-4">No customer data yet.</p>
            )}
          </Section>
        )}
      </div>
    </AdminLayout>
  );
}

export default withAuth(AnalyticsPage, { permission: 'analytics.view' });

