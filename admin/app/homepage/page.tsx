'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi, HomepageSection } from '@/lib/api';
import AdminLayout from '@/components/layout/AdminLayout';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import { withAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';

/** What each section type renders on the storefront, shown as a hint. */
const TYPE_HINT: Record<string, string> = {
  HERO: 'Rotating banner at the top of the homepage',
  PROMOTIONS: 'Promotional advertisement cards',
  CATEGORIES: 'Shop-by-category chips',
  FEATURED_PRODUCTS: 'Grid of featured products',
};

function HomepagePage() {
  const [sections, setSections] = useState<HomepageSection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

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
      toast.success(section.isActive ? 'Section hidden' : 'Section shown');
      fetchSections();
    } catch {
      toast.error('Failed to update section');
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    setSections(next); // optimistic
    try {
      await adminApi.homepage.reorder(next.map((s) => s.id));
    } catch {
      toast.error('Failed to reorder');
      fetchSections();
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await adminApi.homepage.delete(deleteId);
      toast.success('Section deleted');
      fetchSections();
    } catch {
      toast.error('Failed to delete section');
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <AdminLayout>
      <PageHeader
        title="Homepage Sections"
        description="Control what appears on your storefront homepage, and in what order."
        actions={
          <Link
            href="/homepage/new"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            + New section
          </Link>
        }
      />

      {(() => {
        if (isLoading) {
          return (
            <div className="space-y-2">
              {['a', 'b', 'c'].map((k) => (
                <div key={k} className="h-16 animate-pulse rounded-xl border border-gray-200 bg-white" />
              ))}
            </div>
          );
        }
        if (sections.length === 0) {
          return (
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <EmptyState
                icon="🏠"
                title="No homepage sections yet"
                description="Add a section to control what customers see on your homepage."
                action={
                  <Link href="/homepage/new" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                    Add your first section
                  </Link>
                }
              />
            </div>
          );
        }
        return (
          <div className="space-y-2">
            {sections.map((section, index) => (
              <div
                key={section.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label="Move up"
                      className="text-xs leading-none text-gray-400 transition-colors hover:text-gray-700 disabled:opacity-25"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => move(index, 1)}
                      disabled={index === sections.length - 1}
                      aria-label="Move down"
                      className="text-xs leading-none text-gray-400 transition-colors hover:text-gray-700 disabled:opacity-25"
                    >
                      ▼
                    </button>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900">{section.title || section.type}</p>
                    <p className="truncate text-xs text-gray-500">
                      {TYPE_HINT[section.type] ?? section.type}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <button
                    onClick={() => handleToggleActive(section)}
                    className={`inline-flex cursor-pointer rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                      section.isActive
                        ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {section.isActive ? 'Visible' : 'Hidden'}
                  </button>
                  <Link href={`/homepage/${section.id}/edit`} className="text-sm text-blue-600 hover:underline">
                    Edit
                  </Link>
                  <button
                    onClick={() => setDeleteId(section.id)}
                    className="text-sm text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      <Modal
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete section?"
        message="This removes the section from your homepage. You can add it again later."
        confirmLabel="Delete"
      />
    </AdminLayout>
  );
}

export default withAuth(HomepagePage, { permission: 'content.manage' });
