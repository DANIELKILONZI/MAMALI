'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi, HomepageSection } from '@/lib/api';
import AdminLayout from '@/components/layout/AdminLayout';
import { withAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';

function HomepagePage() {
  const [sections, setSections] = useState<HomepageSection[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSections = () => {
    setIsLoading(true);
    adminApi.homepage
      .list()
      .then((data) => setSections([...data].sort((a, b) => a.sortOrder - b.sortOrder)))
      .catch(() => toast.error('Failed to load homepage sections'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { fetchSections(); }, []);

  const handleToggleActive = async (section: HomepageSection) => {
    try {
      await adminApi.homepage.update(section.id, { isActive: !section.isActive });
      toast.success('Section updated');
      fetchSections();
    } catch {
      toast.error('Failed to update section');
    }
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0) return;
    const newSections = [...sections];
    [newSections[index - 1], newSections[index]] = [newSections[index], newSections[index - 1]];
    setSections(newSections);
    try {
      await adminApi.homepage.reorder(newSections.map((s) => s.id));
      toast.success('Reordered');
    } catch {
      toast.error('Failed to reorder');
      fetchSections();
    }
  };

  const handleMoveDown = async (index: number) => {
    if (index === sections.length - 1) return;
    const newSections = [...sections];
    [newSections[index], newSections[index + 1]] = [newSections[index + 1], newSections[index]];
    setSections(newSections);
    try {
      await adminApi.homepage.reorder(newSections.map((s) => s.id));
      toast.success('Reordered');
    } catch {
      toast.error('Failed to reorder');
      fetchSections();
    }
  };

  return (
    <AdminLayout>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Homepage Sections</h2>
        <p className="text-sm text-gray-500 mt-1">Manage and reorder homepage sections</p>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-500 bg-white rounded-lg shadow">Loading...</div>
      ) : (
        <div className="space-y-2">
          {sections.map((section, index) => (
            <div
              key={section.id}
              className="bg-white rounded-lg shadow p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs leading-none"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => handleMoveDown(index)}
                    disabled={index === sections.length - 1}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs leading-none"
                  >
                    ▼
                  </button>
                </div>
                <div>
                  <p className="font-medium text-gray-900">{section.title}</p>
                  <p className="text-xs text-gray-500">{section.type}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleToggleActive(section)}
                  className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer ${
                    section.isActive
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {section.isActive ? 'Active' : 'Inactive'}
                </button>
                <Link
                  href={`/homepage/${section.id}/edit`}
                  className="text-blue-600 hover:underline text-sm"
                >
                  Edit
                </Link>
              </div>
            </div>
          ))}
          {sections.length === 0 && (
            <div className="text-center py-12 text-gray-400 bg-white rounded-lg shadow">
              No homepage sections found
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}

export default withAuth(HomepagePage, { permission: 'content.manage' });
