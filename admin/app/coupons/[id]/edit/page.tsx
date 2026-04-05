'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { adminApi, Coupon } from '@/lib/api';
import AdminLayout from '@/components/layout/AdminLayout';
import FormField, { inputClass, selectClass } from '@/components/ui/FormField';
import { withAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';

interface CouponForm {
  code: string;
  description: string;
  discountType: 'percent' | 'fixed';
  discountValue: string;
  minOrderValue: string;
  maxUses: string;
  isActive: boolean;
  expiresAt: string;
}

function EditCouponPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [form, setForm] = useState<CouponForm>({
    code: '',
    description: '',
    discountType: 'percent',
    discountValue: '',
    minOrderValue: '0',
    maxUses: '',
    isActive: true,
    expiresAt: '',
  });

  useEffect(() => {
    adminApi.coupons
      .get(id)
      .then((res) => {
        const c = res.coupon;
        setCoupon(c);
        setForm({
          code: c.code,
          description: c.description ?? '',
          discountType: c.discountType,
          discountValue: String(c.discountValue),
          minOrderValue: String(c.minOrderValue),
          maxUses: c.maxUses ? String(c.maxUses) : '',
          isActive: c.isActive,
          expiresAt: c.expiresAt ? c.expiresAt.slice(0, 16) : '',
        });
      })
      .catch(() => toast.error('Failed to load coupon'))
      .finally(() => setIsLoading(false));
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await adminApi.coupons.update(id, {
        code: form.code.toUpperCase(),
        description: form.description || undefined,
        discountType: form.discountType,
        discountValue: parseFloat(form.discountValue),
        minOrderValue: parseFloat(form.minOrderValue) || 0,
        maxUses: form.maxUses ? parseInt(form.maxUses) : null,
        isActive: form.isActive,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      });
      toast.success('Coupon updated!');
      router.push('/coupons');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update coupon');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="text-center py-12 text-gray-500">Loading...</div>
      </AdminLayout>
    );
  }

  if (!coupon) {
    return (
      <AdminLayout>
        <div className="text-center py-12 text-red-500">Coupon not found</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700">
          ← Back
        </button>
        <h2 className="text-2xl font-bold text-gray-900">Edit Coupon: {coupon.code}</h2>
      </div>

      {coupon.usedCount > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          This coupon has been used {coupon.usedCount} time{coupon.usedCount !== 1 ? 's' : ''}.
        </div>
      )}

      <form onSubmit={handleSubmit} className="max-w-xl bg-white rounded-lg shadow p-6 space-y-4">
        <FormField label="Coupon Code" required>
          <input
            className={inputClass}
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            required
          />
        </FormField>

        <FormField label="Description (optional)">
          <input
            className={inputClass}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Discount Type" required>
            <select
              className={selectClass}
              value={form.discountType}
              onChange={(e) => setForm({ ...form, discountType: e.target.value as 'percent' | 'fixed' })}
            >
              <option value="percent">Percentage (%)</option>
              <option value="fixed">Fixed Amount (KSh)</option>
            </select>
          </FormField>

          <FormField label={form.discountType === 'percent' ? 'Discount (%)' : 'Discount (KSh)'} required>
            <input
              type="number"
              step="0.01"
              min="0"
              max={form.discountType === 'percent' ? '100' : undefined}
              className={inputClass}
              value={form.discountValue}
              onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
              required
            />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Min Order Value (KSh)">
            <input
              type="number"
              step="0.01"
              min="0"
              className={inputClass}
              value={form.minOrderValue}
              onChange={(e) => setForm({ ...form, minOrderValue: e.target.value })}
            />
          </FormField>

          <FormField label="Max Uses (optional)">
            <input
              type="number"
              min="1"
              className={inputClass}
              value={form.maxUses}
              onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
              placeholder="Unlimited"
            />
          </FormField>
        </div>

        <FormField label="Expiry Date (optional)">
          <input
            type="datetime-local"
            className={inputClass}
            value={form.expiresAt}
            onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
          />
        </FormField>

        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            className="rounded"
          />
          Active
        </label>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium"
          >
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2 rounded-lg text-sm font-medium"
          >
            Cancel
          </button>
        </div>
      </form>
    </AdminLayout>
  );
}

export default withAuth(EditCouponPage);
