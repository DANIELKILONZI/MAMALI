import Link from 'next/link';
import { api } from '@/lib/api';
import { ProductGrid } from '@/components/products/ProductGrid';

export const revalidate = 30;

interface PageProps {
  searchParams: Promise<{
    search?: string;
    category?: string;
    minPrice?: string;
    maxPrice?: string;
    page?: string;
  }>;
}

export default async function ProductsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Number(params.page) || 1;

  const [productsRes, categoriesRes] = await Promise.allSettled([
    api.products.list({
      search: params.search,
      category: params.category,
      minPrice: params.minPrice ? Number(params.minPrice) : undefined,
      maxPrice: params.maxPrice ? Number(params.maxPrice) : undefined,
      page,
      limit: 20,
    }),
    api.categories.list(),
  ]);

  const productsData = productsRes.status === 'fulfilled' ? productsRes.value : null;
  const categories = categoriesRes.status === 'fulfilled' ? categoriesRes.value.categories : [];
  const products = productsData?.products ?? [];
  const pagination = productsData?.pagination;

  function buildUrl(overrides: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    const merged = { ...params, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v) q.set(k, v);
    }
    return `/products?${q.toString()}`;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">All Products</h1>

      <div className="flex flex-col gap-6 md:flex-row">
        {/* Sidebar Filters */}
        <aside className="w-full shrink-0 md:w-64">
          <div className="sticky top-24 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">Filters</h2>

            {/* Search */}
            <div className="mb-5">
              <label className="mb-1 block text-sm font-medium text-gray-700">Search</label>
              <form>
                <input
                  type="text"
                  name="search"
                  defaultValue={params.search}
                  placeholder="Search products..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input type="hidden" name="category" value={params.category ?? ''} />
                <input type="hidden" name="minPrice" value={params.minPrice ?? ''} />
                <input type="hidden" name="maxPrice" value={params.maxPrice ?? ''} />
                <button
                  type="submit"
                  className="mt-2 w-full rounded-lg bg-blue-600 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Search
                </button>
              </form>
            </div>

            {/* Categories */}
            {categories.length > 0 && (
              <div className="mb-5">
                <h3 className="mb-2 text-sm font-medium text-gray-700">Category</h3>
                <ul className="space-y-1">
                  <li>
                    <Link
                      href={buildUrl({ category: undefined, page: undefined })}
                      className={`block rounded px-2 py-1 text-sm transition ${
                        !params.category
                          ? 'bg-blue-50 font-semibold text-blue-700'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      All Categories
                    </Link>
                  </li>
                  {categories.map((cat) => (
                    <li key={cat.id}>
                      <Link
                        href={buildUrl({ category: cat.slug, page: undefined })}
                        className={`block rounded px-2 py-1 text-sm transition ${
                          params.category === cat.slug
                            ? 'bg-blue-50 font-semibold text-blue-700'
                            : 'text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {cat.name}
                        <span className="ml-1 text-xs text-gray-400">({cat._count.products})</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Price Range */}
            <div>
              <h3 className="mb-2 text-sm font-medium text-gray-700">Price Range (KSh)</h3>
              <form className="flex gap-2">
                <input
                  type="number"
                  name="minPrice"
                  defaultValue={params.minPrice}
                  placeholder="Min"
                  min={0}
                  className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="number"
                  name="maxPrice"
                  defaultValue={params.maxPrice}
                  placeholder="Max"
                  min={0}
                  className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input type="hidden" name="search" value={params.search ?? ''} />
                <input type="hidden" name="category" value={params.category ?? ''} />
                <button
                  type="submit"
                  className="shrink-0 rounded-lg bg-gray-800 px-3 text-xs font-medium text-white hover:bg-gray-700"
                >
                  Go
                </button>
              </form>
              {(params.minPrice || params.maxPrice) && (
                <Link
                  href={buildUrl({ minPrice: undefined, maxPrice: undefined, page: undefined })}
                  className="mt-1 block text-xs text-red-500 hover:underline"
                >
                  Clear price filter
                </Link>
              )}
            </div>
          </div>
        </aside>

        {/* Product Grid */}
        <div className="flex-1">
          {pagination && (
            <p className="mb-4 text-sm text-gray-500">
              {pagination.total} product{pagination.total !== 1 ? 's' : ''} found
              {params.search ? ` for &quot;${params.search}&quot;` : ''}
            </p>
          )}

          <ProductGrid products={products} />

          {/* Pagination */}
          {pagination && pagination.pages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              {page > 1 && (
                <Link
                  href={buildUrl({ page: String(page - 1) })}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  ← Prev
                </Link>
              )}
              <span className="text-sm text-gray-600">
                Page {page} of {pagination.pages}
              </span>
              {page < pagination.pages && (
                <Link
                  href={buildUrl({ page: String(page + 1) })}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Next →
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
