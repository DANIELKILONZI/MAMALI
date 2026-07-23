'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi, Category } from '@/lib/api';
import AdminLayout from '@/components/layout/AdminLayout';
import Modal from '@/components/ui/Modal';
import { withAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';

function CategoryNode({
  category,
  onDelete,
}: {
  category: Category;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="border border-gray-200 rounded-lg">
      <div className="flex items-center justify-between p-3 bg-white hover:bg-gray-50">
        <div className="flex items-center gap-2">
          {category.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={category.imageUrl} alt={category.name} className="w-8 h-8 rounded object-cover" />
          )}
          <div>
            <p className="font-medium text-gray-900 text-sm">{category.name}</p>
            {category.description && (
              <p className="text-xs text-gray-500">{category.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/categories/new?parentId=${category.id}`}
            className="text-green-600 hover:underline text-xs"
          >
            + Sub
          </Link>
          <Link
            href={`/categories/${category.id}/edit`}
            className="text-blue-600 hover:underline text-xs"
          >
            Edit
          </Link>
          <button
            onClick={() => onDelete(category.id)}
            className="text-red-600 hover:underline text-xs"
          >
            Delete
          </button>
        </div>
      </div>
      {category.children && category.children.length > 0 && (
        <div className="pl-6 pb-2 pr-2 space-y-2">
          {category.children.map((child) => (
            <CategoryNode key={child.id} category={child} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchCategories = () => {
    setIsLoading(true);
    adminApi.categories
      .list()
      .then((cats) => {
        // Build tree
        const map = new Map<string, Category & { children: Category[] }>();
        cats.forEach((c) => map.set(c.id, { ...c, children: [] }));
        const roots: (Category & { children: Category[] })[] = [];
        map.forEach((cat) => {
          if (cat.parentId && map.has(cat.parentId)) {
            map.get(cat.parentId)!.children.push(cat);
          } else {
            roots.push(cat);
          }
        });
        setCategories(roots);
      })
      .catch(() => toast.error('Failed to load categories'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { fetchCategories(); }, []);

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await adminApi.categories.delete(deleteId);
      toast.success('Category deleted');
      fetchCategories();
    } catch {
      toast.error('Failed to delete category');
    }
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Categories</h2>
        <Link
          href="/categories/new"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          + Add Category
        </Link>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : (
        <div className="space-y-3">
          {categories.map((cat) => (
            <CategoryNode key={cat.id} category={cat} onDelete={setDeleteId} />
          ))}
          {categories.length === 0 && (
            <div className="text-center py-12 text-gray-400 bg-white rounded-lg shadow">
              No categories found
            </div>
          )}
        </div>
      )}

      <Modal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Category"
        message="Are you sure? This will also remove all subcategories."
        confirmLabel="Delete"
      />
    </AdminLayout>
  );
}

export default withAuth(CategoriesPage, { permission: 'categories.manage' });
