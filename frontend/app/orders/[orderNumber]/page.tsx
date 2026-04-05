'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, Order } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';

const ORDER_STATUSES = [
  'pending',
  'awaiting_payment',
  'paid',
  'processing',
  'delivered',
] as const;

type KnownStatus = (typeof ORDER_STATUSES)[number];

const statusBadge: Record<string, { variant: 'gray' | 'yellow' | 'green' | 'blue' | 'red'; label: string }> = {
  pending: { variant: 'gray', label: 'Pending' },
  awaiting_payment: { variant: 'yellow', label: 'Awaiting Payment' },
  paid: { variant: 'blue', label: 'Paid' },
  processing: { variant: 'blue', label: 'Processing' },
  delivered: { variant: 'green', label: 'Delivered' },
  cancelled: { variant: 'red', label: 'Cancelled' },
  refunded: { variant: 'gray', label: 'Refunded' },
};

function StatusProgress({ status }: { status: string }) {
  const currentIndex = ORDER_STATUSES.indexOf(status as KnownStatus);
  if (currentIndex === -1) return null;
  return (
    <div className="mt-4 mb-6">
      <div className="flex items-center">
        {ORDER_STATUSES.map((s, i) => (
          <div key={s} className="flex flex-1 items-center last:flex-none">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${
                i <= currentIndex
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-500'
              }`}
            >
              {i < currentIndex ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            {i < ORDER_STATUSES.length - 1 && (
              <div
                className={`h-1 flex-1 transition ${
                  i < currentIndex ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              />
            )}
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-gray-500">
        {ORDER_STATUSES.map((s) => (
          <span key={s} className="capitalize">{s.replace('_', ' ')}</span>
        ))}
      </div>
    </div>
  );
}

export default function OrderStatusPage() {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchOrder = useCallback(async () => {
    try {
      const res = await api.orders.getStatus(orderNumber);
      setOrder(res.order);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Order not found');
    } finally {
      setLoading(false);
    }
  }, [orderNumber]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <Alert variant="error">{error || 'Order not found'}</Alert>
        <Link href="/" className="mt-4 inline-block">
          <Button variant="outline">Go Home</Button>
        </Link>
      </div>
    );
  }

  const badge = statusBadge[order.status] ?? { variant: 'gray' as const, label: order.status };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Order Status</h1>
      <p className="mb-6 text-sm text-gray-500">Order #{order.orderNumber}</p>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm text-gray-600">Status</span>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>

        <StatusProgress status={order.status} />

        {/* Items */}
        <h2 className="mb-3 text-sm font-semibold text-gray-700 uppercase tracking-wide">Items</h2>
        <ul className="mb-6 space-y-2">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between text-sm">
              <span className="text-gray-700">
                {item.name} × {item.quantity}
              </span>
              <span className="font-medium text-gray-900">
                KSh {item.total.toLocaleString('en-KE')}
              </span>
            </li>
          ))}
        </ul>

        <div className="border-t border-gray-100 pt-4 flex justify-between text-base font-bold text-gray-900">
          <span>Total</span>
          <span>KSh {order.total.toLocaleString('en-KE')}</span>
        </div>

        {/* Payment info */}
        {order.payment && (
          <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
            <p>
              Payment:{' '}
              <span
                className={`font-semibold ${
                  order.payment.status === 'completed'
                    ? 'text-green-600'
                    : order.payment.status === 'failed'
                    ? 'text-red-600'
                    : 'text-yellow-600'
                }`}
              >
                {order.payment.status.toUpperCase()}
              </span>
            </p>
            {order.payment.mpesaReceiptNumber && (
              <p>M-Pesa Receipt: {order.payment.mpesaReceiptNumber}</p>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 flex gap-3">
        <Button onClick={fetchOrder} variant="outline">
          Refresh
        </Button>
        <Link href="/products">
          <Button variant="ghost">Continue Shopping</Button>
        </Link>
      </div>
    </div>
  );
}
