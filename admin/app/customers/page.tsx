'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  adminApi,
  CustomerRecord,
  CustomerListResponse,
  CustomerDetailResponse,
  CustomerSegment,
} from '@/lib/api';
import AdminLayout from '@/components/layout/AdminLayout';
import PageHeader from '@/components/ui/PageHeader';
import { withAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';

const KES = (v: number) =>
  new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(v);

const SEGMENTS: { value: CustomerSegment; label: string; color: string }[] = [
  { value: 'all', label: 'All', color: 'bg-gray-100 text-gray-700' },
  { value: 'vip', label: '🏆 VIP', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'returning', label: '🔄 Returning', color: 'bg-green-100 text-green-800' },
  { value: 'new', label: '🆕 New', color: 'bg-blue-100 text-blue-800' },
  { value: 'inactive', label: '💤 Inactive', color: 'bg-gray-100 text-gray-600' },
  { value: 'risky', label: '⚠️ Risky', color: 'bg-red-100 text-red-800' },
];

function SegmentBadge({ segment }: { segment: CustomerSegment }) {
  const seg = SEGMENTS.find((s) => s.value === segment) ?? SEGMENTS[0];
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${seg.color}`}>
      {seg.label}
    </span>
  );
}

// ── Customer Detail Modal ─────────────────────────────────────────────────────

function CustomerDetailModal({
  phone,
  onClose,
  onBlockToggle,
}: {
  phone: string;
  onClose: () => void;
  onBlockToggle: () => void;
}) {
  const [data, setData] = useState<CustomerDetailResponse | null>(null);
  const [blocking, setBlocking] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [showBlockForm, setShowBlockForm] = useState(false);

  useEffect(() => {
    adminApi.customers.get(phone).then(setData).catch(() => toast.error('Failed to load customer'));
  }, [phone]);

  const handleBlock = async () => {
    setBlocking(true);
    try {
      await adminApi.customers.block(phone, blockReason || undefined);
      toast.success('Customer blocked');
      setShowBlockForm(false);
      onBlockToggle();
      const updated = await adminApi.customers.get(phone);
      setData(updated);
    } catch {
      toast.error('Failed to block customer');
    } finally {
      setBlocking(false);
    }
  };

  const handleUnblock = async () => {
    setBlocking(true);
    try {
      await adminApi.customers.unblock(phone);
      toast.success('Customer unblocked');
      onBlockToggle();
      const updated = await adminApi.customers.get(phone);
      setData(updated);
    } catch {
      toast.error('Failed to unblock customer');
    } finally {
      setBlocking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Customer Detail</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        {!data ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xl font-bold text-gray-900">{data.customer.name ?? '(No name)'}</p>
                <p className="text-gray-500">{data.customer.phone}</p>
                <div className="mt-2 flex items-center gap-2">
                  <SegmentBadge segment={data.customer.segment} />
                  {data.customer.isBlocked && (
                    <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                      🚫 Blocked{data.customer.blockedReason ? ` — ${data.customer.blockedReason}` : ''}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                {data.customer.isBlocked ? (
                  <button
                    onClick={handleUnblock}
                    disabled={blocking}
                    className="rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
                  >
                    Unblock
                  </button>
                ) : (
                  <button
                    onClick={() => setShowBlockForm(true)}
                    className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
                  >
                    Block Customer
                  </button>
                )}
              </div>
            </div>

            {/* Block form */}
            {showBlockForm && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
                <p className="text-sm font-semibold text-red-700">Block this customer?</p>
                <input
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Reason (optional)"
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleBlock}
                    disabled={blocking}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {blocking ? 'Blocking…' : 'Confirm Block'}
                  </button>
                  <button
                    onClick={() => setShowBlockForm(false)}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* KPIs */}
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
                <p className="text-xl font-bold text-gray-900">{data.customer.totalOrders}</p>
                <p className="text-xs text-gray-500 mt-1">Total Orders</p>
              </div>
              <div className="rounded-lg bg-green-50 border border-green-200 p-4">
                <p className="text-xl font-bold text-gray-900">{KES(data.customer.totalSpent)}</p>
                <p className="text-xs text-gray-500 mt-1">Lifetime Value</p>
              </div>
              <div className="rounded-lg bg-purple-50 border border-purple-200 p-4">
                <p className="text-xl font-bold text-gray-900">{KES(data.customer.avgOrderValue)}</p>
                <p className="text-xs text-gray-500 mt-1">Avg Order Value</p>
              </div>
            </div>

            {/* Order History */}
            <div>
              <h4 className="font-semibold text-gray-800 mb-3">Order History</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-2 text-gray-500 font-medium">Order #</th>
                      <th className="text-left py-2 px-2 text-gray-500 font-medium">Status</th>
                      <th className="text-right py-2 px-2 text-gray-500 font-medium">Total</th>
                      <th className="text-left py-2 px-2 text-gray-500 font-medium">Coupon</th>
                      <th className="text-left py-2 px-2 text-gray-500 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.orders.map((o) => (
                      <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 px-2 font-mono text-blue-600 text-xs">{o.orderNumber}</td>
                        <td className="py-2 px-2 capitalize text-gray-600">{o.status}</td>
                        <td className="py-2 px-2 text-right text-gray-700">{KES(o.total)}</td>
                        <td className="py-2 px-2 font-mono text-xs text-gray-500">{o.couponCode ?? '—'}</td>
                        <td className="py-2 px-2 text-gray-500 text-xs">
                          {new Date(o.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                    {data.orders.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-4 text-center text-gray-400">No orders</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function CustomersPage() {
  const [data, setData] = useState<CustomerListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [segment, setSegment] = useState<CustomerSegment>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(() => {
    setLoading(true);
    adminApi.customers
      .list({ page, segment, search: debouncedSearch || undefined })
      .then(setData)
      .catch(() => toast.error('Failed to load customers'))
      .finally(() => setLoading(false));
  }, [page, segment, debouncedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  // Reset to page 1 when filter changes
  useEffect(() => {
    setPage(1);
  }, [segment, debouncedSearch]);

  return (
    <AdminLayout>
      <PageHeader
        title="Customers"
        description={data ? `${data.pagination.total} customers who have ordered from you` : 'Loading…'}
      />

      {/* Segment Tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {SEGMENTS.map((s) => (
          <button
            key={s.value}
            onClick={() => setSegment(s.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              segment === s.value
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by phone or name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-xs rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading customers…</div>
      ) : (
        <>
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Customer</th>
                  <th className="text-right py-3 px-4 text-gray-500 font-medium">Orders</th>
                  <th className="text-right py-3 px-4 text-gray-500 font-medium">Total Spent</th>
                  <th className="text-right py-3 px-4 text-gray-500 font-medium">Avg Order</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Last Order</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Segment</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Status</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {(data?.customers ?? []).map((c: CustomerRecord) => (
                  <tr
                    key={c.phone}
                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelectedPhone(c.phone)}
                  >
                    <td className="py-3 px-4">
                      <p className="font-medium text-gray-800">{c.name ?? '—'}</p>
                      <p className="text-xs text-gray-400">{c.phone}</p>
                    </td>
                    <td className="py-3 px-4 text-right text-gray-700">{c.totalOrders}</td>
                    <td className="py-3 px-4 text-right font-semibold text-green-700">{KES(c.totalSpent)}</td>
                    <td className="py-3 px-4 text-right text-gray-600">{KES(c.avgOrderValue)}</td>
                    <td className="py-3 px-4 text-gray-500">
                      {c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-3 px-4">
                      <SegmentBadge segment={c.segment} />
                    </td>
                    <td className="py-3 px-4">
                      {c.isBlocked ? (
                        <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                          Blocked
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedPhone(c.phone); }}
                        className="text-blue-600 hover:underline text-xs"
                      >
                        View →
                      </button>
                    </td>
                  </tr>
                ))}
                {(data?.customers ?? []).length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-gray-400">
                      No customers found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data && data.pagination.pages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-500">
                Page {data.pagination.page} of {data.pagination.pages}
              </p>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
                >
                  ← Prev
                </button>
                <button
                  disabled={page >= data.pagination.pages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Detail Modal */}
      {selectedPhone && (
        <CustomerDetailModal
          phone={selectedPhone}
          onClose={() => setSelectedPhone(null)}
          onBlockToggle={load}
        />
      )}
    </AdminLayout>
  );
}

export default withAuth(CustomersPage, { permission: 'customers.manage' });
