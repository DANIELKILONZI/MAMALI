'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { adminApi, Category } from '@/lib/api';
import AdminLayout from '@/components/layout/AdminLayout';
import FormField, { inputClass, selectClass, textareaClass } from '@/components/ui/FormField';
import { withAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';

function NewCategoryInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultParentId = searchParams.get('parentId') ?? '';
  const [categories, setCategories] = useState<Category[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    imageUrl: '',
    parentId: defaultParentId,
    sortOrder: '0',
  });

  useEffect(() => {
    adminApi.categories.list().then(setCategories).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await adminApi.categories.create({
        ...form,
        sortOrder: parseInt(form.sortOrder),
        parentId: form.parentId || null,
      });
      toast.success('Category created!');
      router.push('/categories');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create category');
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
        <h2 className="text-2xl font-bold text-gray-900">New Category</h2>
      </div>

      <form onSubmit={handleSubmit} className="max-w-lg bg-white rounded-lg shadow p-6 space-y-4">
        <FormField label="Name" required>
          <input
            className={inputClass}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </FormField>

        <FormField label="Description">
          <textarea
            className={textareaClass}
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </FormField>

        <FormField label="Image URL">
          <input
            className={inputClass}
            placeholder="https://..."
            value={form.imageUrl}
            onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
          />
        </FormField>

        <FormField label="Parent Category">
          <select
            className={selectClass}
            value={form.parentId}
            onChange={(e) => setForm({ ...form, parentId: e.target.value })}
          >
            <option value="">None (top-level)</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Sort Order">
          <input
            type="number"
            className={inputClass}
            value={form.sortOrder}
            onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
          />
        </FormField>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium"
          >
            {isSubmitting ? 'Creating...' : 'Create Category'}
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

function NewCategoryPage() {
  return (
    <Suspense fallback={<AdminLayout><div className="text-center py-12 text-gray-500">Loading...</div></AdminLayout>}>
      <NewCategoryInner />
    </Suspense>
  );
}

export default withAuth(NewCategoryPage);
