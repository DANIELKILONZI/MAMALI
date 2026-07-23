'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { adminApi } from '@/lib/api';
import AdminLayout from '@/components/layout/AdminLayout';
import FormField, { inputClass, selectClass, textareaClass } from '@/components/ui/FormField';
import { withAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';

function EditAdPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: '',
    type: 'BANNER' as 'BANNER' | 'FEATURED' | 'PROMOTION',
    placement: 'HOMEPAGE' as 'HOMEPAGE' | 'CATEGORY' | 'PRODUCT',
    imageUrl: '',
    linkUrl: '',
    content: '',
    startsAt: '',
    endsAt: '',
    sortOrder: '0',
    isActive: true,
  });

  useEffect(() => {
    adminApi.advertisements
      .get(id)
      .then((ad) => {
        setForm({
          title: ad.title ?? '',
          type: ad.type ?? 'BANNER',
          placement: ad.placement ?? 'HOMEPAGE',
          imageUrl: ad.imageUrl ?? '',
          linkUrl: ad.linkUrl ?? '',
          content: ad.content ?? '',
          startsAt: ad.startsAt ? ad.startsAt.slice(0, 16) : '',
          endsAt: ad.endsAt ? ad.endsAt.slice(0, 16) : '',
          sortOrder: String(ad.sortOrder ?? 0),
          isActive: ad.isActive ?? true,
        });
      })
      .catch(() => toast.error('Failed to load advertisement'))
      .finally(() => setIsLoading(false));
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await adminApi.advertisements.update(id, {
        ...form,
        sortOrder: parseInt(form.sortOrder),
      });
      toast.success('Advertisement updated!');
      router.push('/advertisements');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update advertisement');
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

  return (
    <AdminLayout>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700">
          ← Back
        </button>
        <h2 className="text-2xl font-bold text-gray-900">Edit Advertisement</h2>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl bg-white rounded-lg shadow p-6 space-y-4">
        <FormField label="Title" required>
          <input
            className={inputClass}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Type">
            <select
              className={selectClass}
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as typeof form.type })}
            >
              <option value="BANNER">Banner</option>
              <option value="FEATURED">Featured</option>
              <option value="PROMOTION">Promotion</option>
            </select>
          </FormField>
          <FormField label="Placement">
            <select
              className={selectClass}
              value={form.placement}
              onChange={(e) =>
                setForm({ ...form, placement: e.target.value as typeof form.placement })
              }
            >
              <option value="HOMEPAGE">Homepage</option>
              <option value="CATEGORY">Category</option>
              <option value="PRODUCT">Product</option>
            </select>
          </FormField>
        </div>

        <FormField label="Image URL">
          <input
            className={inputClass}
            placeholder="https://..."
            value={form.imageUrl}
            onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
          />
        </FormField>

        <FormField label="Link URL">
          <input
            className={inputClass}
            placeholder="https://..."
            value={form.linkUrl}
            onChange={(e) => setForm({ ...form, linkUrl: e.target.value })}
          />
        </FormField>

        <FormField label="Content">
          <textarea
            className={textareaClass}
            rows={3}
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
          />
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Starts At">
            <input
              type="datetime-local"
              className={inputClass}
              value={form.startsAt}
              onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
            />
          </FormField>
          <FormField label="Ends At">
            <input
              type="datetime-local"
              className={inputClass}
              value={form.endsAt}
              onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
            />
          </FormField>
        </div>

        <FormField label="Sort Order">
          <input
            type="number"
            className={inputClass}
            value={form.sortOrder}
            onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
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

export default withAuth(EditAdPage, { ownerOnly: true });
