'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { adminApi, Order, OrderStatus, StaffUser } from '@/lib/api';
import AdminLayout from '@/components/layout/AdminLayout';
import StatusBadge from '@/components/ui/StatusBadge';
import { withAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';

// Must match the backend VALID_TRANSITIONS (backend/src/routes/orders.ts).
// Refunds are ADMIN-only and reachable from paid/processing/delivered.
const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['awaiting_payment', 'cancelled'],
  awaiting_payment: ['paid', 'cancelled'],
  paid: ['processing', 'refunded'],
  processing: ['delivered', 'refunded'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
};

function OrderDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const reload = () => {
    Promise.all([adminApi.orders.get(id), adminApi.staff.list()])
      .then(([o, s]) => { setOrder(o); setStaff(s); })
      .catch(() => toast.error('Failed to load order'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { reload(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStatusChange = async (newStatus: string) => {
    try {
      await adminApi.orders.updateStatus(id, newStatus);
      toast.success('Status updated');
      reload();
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleAssign = async (staffId: string) => {
    try {
      await adminApi.orders.assign(id, staffId);
      toast.success('Order assigned');
      reload();
    } catch {
      toast.error('Failed to assign order');
    }
  };

  const formatCurrency = (v: number) =>
    'KSh ' + new Intl.NumberFormat('en-KE', { maximumFractionDigits: 0 }).format(v);

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="text-center py-12 text-gray-500">Loading...</div>
      </AdminLayout>
    );
  }

  if (!order) {
    return (
      <AdminLayout>
        <div className="text-center py-12 text-red-500">Order not found</div>
      </AdminLayout>
    );
  }

  const allowedStatuses = STATUS_TRANSITIONS[order.status] ?? [];

  return (
    <AdminLayout>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700">
          ← Back
        </button>
        <h2 className="text-2xl font-bold text-gray-900">Order {order.orderNumber}</h2>
        <StatusBadge status={order.status} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Items */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Order Items</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 text-gray-500 font-medium">Product</th>
                  <th className="text-right py-2 text-gray-500 font-medium">Qty</th>
                  <th className="text-right py-2 text-gray-500 font-medium">Price</th>
                  <th className="text-right py-2 text-gray-500 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {(order.items ?? []).map((item) => (
                  <tr key={item.id} className="border-b border-gray-50">
                    <td className="py-2 text-gray-700">{item.productName}</td>
                    <td className="py-2 text-right text-gray-600">{item.quantity}</td>
                    <td className="py-2 text-right text-gray-600">{formatCurrency(item.price)}</td>
                    <td className="py-2 text-right font-medium text-gray-800">
                      {formatCurrency(item.price * item.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="pt-3 text-right font-semibold text-gray-700">
                    Total:
                  </td>
                  <td className="pt-3 text-right font-bold text-gray-900">
                    {formatCurrency(order.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Activity Log */}
          {(order.activityLog ?? []).length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Activity Log</h3>
              <div className="space-y-3">
                {order.activityLog!.map((log) => (
                  <div key={log.id} className="flex items-start gap-3">
                    <div className="w-2 h-2 mt-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-gray-700">{log.action}</p>
                      <p className="text-xs text-gray-400">
                        {log.performedBy} · {new Date(log.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Customer */}
          <div className="bg-white rounded-lg shadow p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Customer</h3>
            {order.customerName && (
              <p className="text-sm font-medium text-gray-900 mb-1">{order.customerName}</p>
            )}
            <p className="text-sm text-gray-700">📱 {order.customerPhone}</p>
            <p className="text-xs text-gray-400 mt-1">
              Placed: {new Date(order.createdAt).toLocaleString()}
            </p>
            {order.notes && (
              <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-1">
                  Delivery Notes
                </p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{order.notes}</p>
              </div>
            )}
          </div>

          {/* Update Status */}
          <div className="bg-white rounded-lg shadow p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Update Status</h3>
            {allowedStatuses.length > 0 ? (
              <div className="space-y-2">
                {allowedStatuses.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    className="w-full text-left px-3 py-2 rounded border border-gray-200 text-sm hover:bg-gray-50 transition-colors"
                  >
                    → {s.replace('_', ' ')}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No transitions available</p>
            )}
          </div>

          {/* Assign Staff */}
          <div className="bg-white rounded-lg shadow p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Assign To</h3>
            <select
              value={order.assignedTo ?? ''}
              onChange={(e) => handleAssign(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Unassigned</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

export default withAuth(OrderDetailPage, { permission: 'orders.manage' });
