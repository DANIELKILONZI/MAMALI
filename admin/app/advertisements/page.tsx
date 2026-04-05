'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi, Advertisement } from '@/lib/api';
import AdminLayout from '@/components/layout/AdminLayout';
import Modal from '@/components/ui/Modal';
import { withAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';

function AdvertisementsPage() {
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchAds = () => {
    setIsLoading(true);
    adminApi.advertisements
      .list()
      .then(setAds)
      .catch(() => toast.error('Failed to load advertisements'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { fetchAds(); }, []);

  const handleToggleActive = async (ad: Advertisement) => {
    try {
      await adminApi.advertisements.update(ad.id, { isActive: !ad.isActive });
      toast.success(`Ad ${ad.isActive ? 'deactivated' : 'activated'}`);
      fetchAds();
    } catch {
      toast.error('Failed to update ad');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await adminApi.advertisements.delete(deleteId);
      toast.success('Ad deleted');
      fetchAds();
    } catch {
      toast.error('Failed to delete ad');
    }
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Advertisements</h2>
        <Link
          href="/advertisements/new"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          + New Ad
        </Link>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-500 bg-white rounded-lg shadow">Loading...</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Title</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Type</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Placement</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Dates</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ads.map((ad) => (
                <tr key={ad.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{ad.title}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-xs bg-indigo-100 text-indigo-700 font-medium">
                      {ad.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{ad.placement}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {ad.startsAt ? new Date(ad.startsAt).toLocaleDateString() : '—'}
                    {' → '}
                    {ad.endsAt ? new Date(ad.endsAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleActive(ad)}
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer ${
                        ad.isActive
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {ad.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/advertisements/${ad.id}/edit`}
                        className="text-blue-600 hover:underline text-sm"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => setDeleteId(ad.id)}
                        className="text-red-600 hover:underline text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {ads.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400">
                    No advertisements found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Advertisement"
        message="Are you sure you want to delete this advertisement?"
        confirmLabel="Delete"
      />
    </AdminLayout>
  );
}

export default withAuth(AdvertisementsPage);
