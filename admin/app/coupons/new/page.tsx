'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminApi } from '@/lib/api';
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

function NewCouponPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await adminApi.coupons.create({
        code: form.code.toUpperCase(),
        description: form.description || undefined,
        discountType: form.discountType,
        discountValue: parseFloat(form.discountValue),
        minOrderValue: parseFloat(form.minOrderValue) || 0,
        maxUses: form.maxUses ? parseInt(form.maxUses) : null,
        isActive: form.isActive,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      });
      toast.success('Coupon created!');
      router.push('/coupons');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create coupon');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AdminLayout>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700">
          ← Back
        </button>
        <h2 className="text-2xl font-bold text-gray-900">New Coupon</h2>
      </div>

      <form onSubmit={handleSubmit} className="max-w-xl bg-white rounded-lg shadow p-6 space-y-4">
        <FormField label="Coupon Code" required>
          <input
            className={inputClass}
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            placeholder="SAVE10"
            required
          />
        </FormField>

        <FormField label="Description (optional)">
          <input
            className={inputClass}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="10% off all orders"
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
            {isSubmitting ? 'Creating...' : 'Create Coupon'}
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

export default withAuth(NewCouponPage, { permission: 'coupons.manage' });
