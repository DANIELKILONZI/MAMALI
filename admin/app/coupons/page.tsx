'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi, Coupon } from '@/lib/api';
import AdminLayout from '@/components/layout/AdminLayout';
import PageHeader from '@/components/ui/PageHeader';
import { withAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';

function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = () => {
    setIsLoading(true);
    adminApi.coupons
      .list()
      .then((res) => setCoupons(res.coupons))
      .catch(() => toast.error('Failed to load coupons'))
      .finally(() => setIsLoading(false));
  };

  useEffect(load, []);

  const handleDelete = async (id: string, code: string) => {
    if (!confirm(`Delete coupon "${code}"?`)) return;
    try {
      await adminApi.coupons.delete(id);
      toast.success('Coupon deleted');
      load();
    } catch {
      toast.error('Failed to delete coupon');
    }
  };

  const handleToggle = async (coupon: Coupon) => {
    try {
      await adminApi.coupons.update(coupon.id, { isActive: !coupon.isActive });
      toast.success(coupon.isActive ? 'Coupon deactivated' : 'Coupon activated');
      load();
    } catch {
      toast.error('Failed to update coupon');
    }
  };

  return (
    <AdminLayout>
      <PageHeader
        title="Coupons"
        description="Discount codes customers can apply at checkout."
        actions={
          <Link
            href="/coupons/new"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            + New coupon
          </Link>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {['a', 'b', 'c'].map((k) => (
            <div key={k} className="h-20 animate-pulse rounded-xl border border-gray-200 bg-white" />
          ))}
        </div>
      ) : coupons.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center text-gray-400">
          <p className="text-4xl mb-3">🎟️</p>
          <p className="font-medium">No coupons yet</p>
          <p className="text-sm mt-1">Create your first coupon to offer discounts</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Code</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Discount</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Min Order</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Uses</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Expires</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Status</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((coupon) => (
                <tr key={coupon.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-3 px-4 font-mono font-semibold text-blue-700">{coupon.code}</td>
                  <td className="py-3 px-4 text-gray-700">
                    {coupon.discountType === 'percent'
                      ? `${coupon.discountValue}%`
                      : `KSh ${coupon.discountValue.toLocaleString('en-KE')}`}
                  </td>
                  <td className="py-3 px-4 text-gray-600">
                    {coupon.minOrderValue > 0
                      ? `KSh ${coupon.minOrderValue.toLocaleString('en-KE')}`
                      : '—'}
                  </td>
                  <td className="py-3 px-4 text-gray-600">
                    {coupon.usedCount}{coupon.maxUses ? `/${coupon.maxUses}` : ''}
                  </td>
                  <td className="py-3 px-4 text-gray-600">
                    {coupon.expiresAt
                      ? new Date(coupon.expiresAt).toLocaleDateString()
                      : '—'}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                        coupon.isActive
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {coupon.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/coupons/${coupon.id}/edit`}
                        className="text-blue-600 hover:underline text-xs"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => handleToggle(coupon)}
                        className="text-gray-500 hover:text-gray-700 text-xs"
                      >
                        {coupon.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => handleDelete(coupon.id, coupon.code)}
                        className="text-red-500 hover:text-red-700 text-xs"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}

export default withAuth(CouponsPage, { permission: 'coupons.manage' });
