'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi, InventoryIntelligence } from '@/lib/api';
import AdminLayout from '@/components/layout/AdminLayout';
import PageHeader from '@/components/ui/PageHeader';
import { withAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';

const KES = (v: number) =>
  new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(v);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
      {children}
    </div>
  );
}

function InventoryPage() {
  const [data, setData] = useState<InventoryIntelligence | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.inventory
      .intelligence()
      .then(setData)
      .catch(() => toast.error('Failed to load inventory data'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <AdminLayout>
        <div className="text-center py-12 text-gray-500">Loading inventory intelligence…</div>
      </AdminLayout>
    );
  }

  if (!data) return null;

  return (
    <AdminLayout>
      <PageHeader
        title="Inventory"
        description="Fast movers, dead stock, and what to reorder."
      />

      <div className="space-y-6">
        {/* Summary stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
            <p className="text-2xl font-bold text-gray-900">{data.summary.totalProducts}</p>
            <p className="text-sm text-gray-500 mt-1">Active Products</p>
          </div>
          <div className={`border rounded-lg p-5 ${data.summary.outOfStock > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
            <p className={`text-2xl font-bold ${data.summary.outOfStock > 0 ? 'text-red-700' : 'text-gray-900'}`}>
              {data.summary.outOfStock}
            </p>
            <p className="text-sm text-gray-500 mt-1">Out of Stock</p>
          </div>
          <div className={`border rounded-lg p-5 ${data.summary.lowStock > 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
            <p className={`text-2xl font-bold ${data.summary.lowStock > 0 ? 'text-amber-700' : 'text-gray-900'}`}>
              {data.summary.lowStock}
            </p>
            <p className="text-sm text-gray-500 mt-1">Low Stock (≤5 units)</p>
          </div>
        </div>

        {/* Reorder Alerts */}
        <Section title="🔔 Reorder Alerts">
          {data.reorderAlerts.length === 0 ? (
            <p className="text-gray-400 text-sm">All products are adequately stocked.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Product</th>
                    <th className="text-right py-2 px-3 text-gray-500 font-medium">Stock</th>
                    <th className="text-right py-2 px-3 text-gray-500 font-medium">Reorder Level</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Status</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.reorderAlerts.map((p) => (
                    <tr key={p.id} className="border-b border-gray-50 hover:bg-amber-50">
                      <td className="py-2 px-3 font-medium text-gray-800">{p.name}</td>
                      <td className="py-2 px-3 text-right">
                        <span className={`font-bold ${p.stock === 0 ? 'text-red-600' : 'text-amber-600'}`}>
                          {p.stock}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right text-gray-500">{p.reorderLevel}</td>
                      <td className="py-2 px-3">
                        {p.stock === 0 ? (
                          <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Out of Stock</span>
                        ) : (
                          <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">Needs Reorder</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <Link href={`/products/${p.id}/edit`} className="text-blue-600 hover:underline text-xs">
                          Update Stock →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* Fast Movers */}
        <Section title="🚀 Fast Movers (Top Sales Last 7 Days)">
          {data.fastMovers.length === 0 ? (
            <p className="text-gray-400 text-sm">No sales data in the last 7 days.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Product</th>
                    <th className="text-right py-2 px-3 text-gray-500 font-medium">Units Sold (7d)</th>
                    <th className="text-right py-2 px-3 text-gray-500 font-medium">Current Stock</th>
                    <th className="text-right py-2 px-3 text-gray-500 font-medium">Days of Stock Left</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Alert</th>
                  </tr>
                </thead>
                <tbody>
                  {data.fastMovers.map((p) => {
                    const dailyRate = p.unitsSoldLast7Days / 7;
                    const daysLeft = dailyRate > 0 ? Math.floor(p.currentStock / dailyRate) : null;
                    return (
                      <tr key={p.productId} className="border-b border-gray-50 hover:bg-green-50">
                        <td className="py-2 px-3 font-medium text-gray-800">{p.name}</td>
                        <td className="py-2 px-3 text-right font-bold text-green-700">{p.unitsSoldLast7Days}</td>
                        <td className="py-2 px-3 text-right text-gray-600">{p.currentStock}</td>
                        <td className="py-2 px-3 text-right">
                          {daysLeft !== null ? (
                            <span className={daysLeft <= 7 ? 'font-bold text-red-600' : 'text-gray-600'}>
                              ~{daysLeft}d
                            </span>
                          ) : '—'}
                        </td>
                        <td className="py-2 px-3">
                          {daysLeft !== null && daysLeft <= 7 ? (
                            <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Reorder Soon</span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* Dead Stock */}
        <Section title="💤 Dead Stock (No Sales in 30 Days)">
          {data.deadStock.length === 0 ? (
            <p className="text-gray-400 text-sm">No dead stock detected — all products are selling!</p>
          ) : (
            <>
              <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                <strong>Total dead stock value:</strong> {KES(data.deadStockValue)}
                {' '}— consider discounting or clearing this inventory.
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Product</th>
                      <th className="text-right py-2 px-3 text-gray-500 font-medium">Stock</th>
                      <th className="text-right py-2 px-3 text-gray-500 font-medium">Unit Price</th>
                      <th className="text-right py-2 px-3 text-gray-500 font-medium">Stock Value</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Last Updated</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.deadStock.map((p) => (
                      <tr key={p.id} className="border-b border-gray-50 hover:bg-amber-50">
                        <td className="py-2 px-3 font-medium text-gray-800">{p.name}</td>
                        <td className="py-2 px-3 text-right text-gray-600">{p.stock}</td>
                        <td className="py-2 px-3 text-right text-gray-600">{KES(p.price)}</td>
                        <td className="py-2 px-3 text-right font-medium text-amber-700">
                          {KES(p.stock * p.price)}
                        </td>
                        <td className="py-2 px-3 text-gray-500 text-xs">
                          {new Date(p.updatedAt).toLocaleDateString()}
                        </td>
                        <td className="py-2 px-3">
                          <Link href={`/products/${p.id}/edit`} className="text-blue-600 hover:underline text-xs">
                            Add Discount →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Section>
      </div>
    </AdminLayout>
  );
}

export default withAuth(InventoryPage, { permission: 'inventory.manage' });
