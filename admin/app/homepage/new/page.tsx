'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminApi } from '@/lib/api';
import AdminLayout from '@/components/layout/AdminLayout';
import PageHeader from '@/components/ui/PageHeader';
import FormField, { inputClass, selectClass } from '@/components/ui/FormField';
import { withAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';

/** Must match HOMEPAGE_SECTION_TYPES in backend/src/routes/content.ts. */
const SECTION_TYPES = [
  { value: 'HERO', label: 'Hero banner', hint: 'Rotating banner at the top of the homepage' },
  { value: 'PROMOTIONS', label: 'Promotions', hint: 'Promotional advertisement cards' },
  { value: 'CATEGORIES', label: 'Categories', hint: 'Shop-by-category chips' },
  { value: 'FEATURED_PRODUCTS', label: 'Featured products', hint: 'Grid of featured products' },
] as const;

function NewHomepageSectionPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    type: 'FEATURED_PRODUCTS' as (typeof SECTION_TYPES)[number]['value'],
    title: '',
    isActive: true,
  });

  const hint = SECTION_TYPES.find((t) => t.value === form.type)?.hint;

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await adminApi.homepage.create({
        type: form.type,
        title: form.title || undefined,
        isActive: form.isActive,
      });
      toast.success('Section added');
      router.push('/homepage');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add section');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AdminLayout>
      <PageHeader title="New Homepage Section" backHref="/homepage" />

      <form onSubmit={handleSubmit} className="max-w-lg space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <FormField label="Section type" required>
          <select
            className={selectClass}
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as typeof form.type })}
          >
            {SECTION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
        </FormField>

        <FormField label="Heading (optional)">
          <input
            className={inputClass}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. Featured Products"
          />
          <p className="mt-1 text-xs text-gray-500">
            Shown above the section on your homepage. Leave blank to use the default.
          </p>
        </FormField>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            className="rounded"
          />
          Visible on the storefront
        </label>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Adding…' : 'Add section'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/homepage')}
            className="rounded-lg bg-gray-100 px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            Cancel
          </button>
        </div>
      </form>
    </AdminLayout>
  );
}

export default withAuth(NewHomepageSectionPage, { permission: 'content.manage' });
