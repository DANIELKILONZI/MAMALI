'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { adminApi } from '@/lib/api';
import AdminLayout from '@/components/layout/AdminLayout';
import FormField, { inputClass, textareaClass } from '@/components/ui/FormField';
import { withAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';

function EditContentPage() {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: '',
    content: '',
    isActive: true,
  });

  useEffect(() => {
    adminApi.content
      .get(slug)
      .then((page) => {
        setForm({
          title: page.title ?? '',
          content: page.content ?? '',
          isActive: page.isActive ?? true,
        });
      })
      .catch(() => toast.error('Failed to load content page'))
      .finally(() => setIsLoading(false));
  }, [slug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await adminApi.content.update(slug, form);
      toast.success('Content page updated!');
      router.push('/content');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update content');
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
        <h2 className="text-2xl font-bold text-gray-900">Edit Content: {slug}</h2>
      </div>

      <form onSubmit={handleSubmit} className="max-w-3xl bg-white rounded-lg shadow p-6 space-y-4">
        <FormField label="Title">
          <input
            className={inputClass}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </FormField>

        <FormField label="Content">
          <textarea
            className={textareaClass}
            rows={16}
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
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

export default withAuth(EditContentPage);
