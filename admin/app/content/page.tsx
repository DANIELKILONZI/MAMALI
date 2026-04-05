'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi, ContentPage } from '@/lib/api';
import AdminLayout from '@/components/layout/AdminLayout';
import { withAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';

function ContentListPage() {
  const [pages, setPages] = useState<ContentPage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    adminApi.content
      .list()
      .then(setPages)
      .catch(() => toast.error('Failed to load content pages'))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <AdminLayout>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Content Pages</h2>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-500 bg-white rounded-lg shadow">Loading...</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Slug</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Title</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pages.map((page) => (
                <tr key={page.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-gray-600">{page.slug}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{page.title}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        page.isActive
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {page.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/content/${page.slug}/edit`}
                      className="text-blue-600 hover:underline text-sm"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
              {pages.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-gray-400">
                    No content pages found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}

export default withAuth(ContentListPage);
