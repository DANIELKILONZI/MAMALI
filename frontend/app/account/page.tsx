'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, customerAuth, CustomerAccount, CustomerOrderSummary } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';

const statusVariant: Record<string, 'gray' | 'yellow' | 'green' | 'blue' | 'red'> = {
  pending: 'gray',
  awaiting_payment: 'yellow',
  paid: 'blue',
  processing: 'blue',
  delivered: 'green',
  cancelled: 'red',
  refunded: 'gray',
};

export default function AccountPage() {
  const router = useRouter();
  const [customer, setCustomer] = useState<CustomerAccount | null>(null);
  const [orders, setOrders] = useState<CustomerOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customerAuth.isLoggedIn()) {
      router.replace('/account/login');
      return;
    }
    Promise.all([api.customer.me(), api.customer.myOrders()])
      .then(([meRes, ordersRes]) => {
        setCustomer(meRes.customer);
        setOrders(ordersRes.orders);
      })
      .catch(() => {
        // Expired or invalid token — clear it and send to login
        customerAuth.clear();
        router.replace('/account/login');
      })
      .finally(() => setLoading(false));
  }, [router]);

  function handleLogout() {
    customerAuth.clear();
    router.push('/');
  }

  if (loading || !customer) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {customer.name || 'My Account'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">📱 {customer.phone}</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleLogout}>
          Log Out
        </Button>
      </div>

      <h2 className="mb-4 text-lg font-semibold text-gray-800">Order History</h2>

      {orders.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
          <p className="mb-4 text-gray-600">No orders yet.</p>
          <Button onClick={() => router.push('/products')}>Start Shopping</Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                href={`/orders/${order.orderNumber}`}
                className="block rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-gray-900">{order.orderNumber}</span>
                  <Badge variant={statusVariant[order.status] ?? 'gray'}>
                    {order.status.replace('_', ' ')}
                  </Badge>
                </div>
                <p className="mt-1 line-clamp-1 text-sm text-gray-500">
                  {order.items.map((i) => `${i.name} × ${i.quantity}`).join(', ')}
                </p>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-gray-400">
                    {new Date(order.createdAt).toLocaleDateString('en-KE', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  <span className="font-bold text-gray-900">
                    KSh {order.total.toLocaleString('en-KE')}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
