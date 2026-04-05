'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, Category, Product } from '@/lib/api';
import { ProductGrid } from '@/components/products/ProductGrid';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';

export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const [category, setCategory] = useState<(Category & { products: Product[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchCategory = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.categories.get(slug);
      setCategory(res.category);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Category not found');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchCategory();
  }, [fetchCategory]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !category) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <Alert variant="error">{error || 'Category not found'}</Alert>
        <Link href="/" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
          ← Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Breadcrumb */}
      <nav className="mb-4 flex items-center gap-2 text-sm text-gray-500">
        <Link href="/" className="hover:text-blue-600">Home</Link>
        <span>/</span>
        {category.parentId ? (
          <>
            <span className="text-gray-400">Categories</span>
            <span>/</span>
          </>
        ) : null}
        <span className="text-gray-800 font-medium">{category.name}</span>
      </nav>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900">{category.name}</h1>
        {category.description && (
          <p className="mt-2 text-gray-500 max-w-2xl">{category.description}</p>
        )}
      </div>

      {/* Subcategories */}
      {category.children?.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Subcategories
          </h2>
          <div className="flex flex-wrap gap-3">
            {category.children.map((child) => (
              <Link
                key={child.id}
                href={`/categories/${child.slug}`}
                className="rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100 transition"
              >
                {child.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Products */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">
            {category.products?.length ?? 0} Products
          </h2>
          <Link href="/products" className="text-sm text-blue-600 hover:underline">
            Browse all →
          </Link>
        </div>
        <ProductGrid
          products={category.products ?? []}
          emptyMessage="No products in this category yet."
        />
      </section>
    </div>
  );
}
