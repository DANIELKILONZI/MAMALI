'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi, Product } from '@/lib/api';
import AdminLayout from '@/components/layout/AdminLayout';
import DataTable from '@/components/ui/DataTable';
import PageHeader from '@/components/ui/PageHeader';
import SearchInput from '@/components/ui/SearchInput';
import Modal from '@/components/ui/Modal';
import Pagination from '@/components/ui/Pagination';
import { withAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';

function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  // 'all' by default so deactivated products stay visible and recoverable —
  // the storefront still only ever shows active ones.
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchProducts = () => {
    setIsLoading(true);
    const params: Record<string, string> = { page: String(page), limit: '10' };
    if (search) params.search = search;
    if (statusFilter) params.status = statusFilter;
    adminApi.products
      .list(params)
      .then((res) => {
        setProducts(res.data);
        setTotalPages(res.totalPages);
      })
      .catch(() => toast.error('Failed to load products'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { fetchProducts(); }, [page, statusFilter, search]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Apply the same change to every selected product. */
  const bulkUpdate = async (ids: string[], data: Partial<Product>, label: string, clear: () => void) => {
    try {
      await Promise.all(ids.map((id) => adminApi.products.update(id, data)));
      toast.success(`${ids.length} product${ids.length === 1 ? '' : 's'} ${label}`);
      clear();
      fetchProducts();
    } catch {
      toast.error('Bulk update failed');
    }
  };

  const handleToggleActive = async (product: Product) => {
    try {
      await adminApi.products.update(product.id, { isActive: !product.isActive });
      toast.success(`Product ${product.isActive ? 'deactivated' : 'activated'}`);
      fetchProducts();
    } catch {
      toast.error('Failed to update product');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await adminApi.products.delete(deleteId);
      toast.success('Product deleted');
      fetchProducts();
    } catch {
      toast.error('Failed to delete product');
    }
  };

  const columns = [
    {
      key: 'name',
      label: 'Product',
      sortable: true,
      render: (p: Product) => (
        <div className="flex items-center gap-3">
          {p.images?.[0] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.images[0]} alt={p.name} className="w-10 h-10 rounded object-cover" />
          )}
          <div>
            <p className="font-medium text-gray-900">{p.name}</p>
            <p className="text-xs text-gray-500">{p.category?.name ?? 'Uncategorised'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'price',
      label: 'Price',
      sortable: true,
      align: 'right' as const,
      render: (p: Product) => (
        <span>KSh {(p.price ?? 0).toLocaleString('en-KE', { maximumFractionDigits: 0 })}</span>
      ),
    },
    {
      key: 'stock',
      label: 'Stock',
      sortable: true,
      render: (p: Product) => (
        <span className={p.stock < 10 ? 'text-red-600 font-bold' : ''}>{p.stock}</span>
      ),
    },
    {
      key: 'isActive',
      label: 'Status',
      render: (p: Product) => (
        <span
          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
            p.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {p.isActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (p: Product) => (
        <div className="flex items-center gap-2">
          <Link
            href={`/products/${p.id}/edit`}
            className="text-blue-600 hover:underline text-sm"
          >
            Edit
          </Link>
          <button
            onClick={() => handleToggleActive(p)}
            className="text-amber-600 hover:underline text-sm"
          >
            {p.isActive ? 'Deactivate' : 'Activate'}
          </button>
          <button
            onClick={() => setDeleteId(p.id)}
            className="text-red-600 hover:underline text-sm"
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <AdminLayout>
      <PageHeader
        title="Products"
        description="Your catalogue. Deactivated products stay here so you can restore them."
        actions={
          <Link
            href="/products/new"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            + Add product
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <SearchInput
          value={search}
          onChange={(v) => { setSearch(v); setPage(1); }}
          placeholder="Search products by name…"
          className="min-w-[240px] flex-1"
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          aria-label="Filter by status"
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="all">All products</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </select>
      </div>

      <DataTable
        columns={columns}
        data={products}
        isLoading={isLoading}
        emptyIcon="📦"
        emptyMessage={search ? 'No products match your search' : 'No products yet'}
        emptyAction={
          !search ? (
            <Link href="/products/new" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Add your first product
            </Link>
          ) : undefined
        }
        selectable
        bulkActions={(ids, clear) => (
          <>
            <button
              onClick={() => bulkUpdate(ids, { isActive: true }, 'activated', clear)}
              className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Activate
            </button>
            <button
              onClick={() => bulkUpdate(ids, { isActive: false }, 'deactivated', clear)}
              className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Deactivate
            </button>
          </>
        )}
      />
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      <Modal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Product"
        message="Are you sure you want to delete this product? This action cannot be undone."
        confirmLabel="Delete"
      />
    </AdminLayout>
  );
}

export default withAuth(ProductsPage, { permission: 'products.manage' });
