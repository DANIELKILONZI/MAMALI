'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi, Product } from '@/lib/api';
import AdminLayout from '@/components/layout/AdminLayout';
import DataTable from '@/components/ui/DataTable';
import Modal from '@/components/ui/Modal';
import Pagination from '@/components/ui/Pagination';
import { withAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';

function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
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

  useEffect(() => { fetchProducts(); }, [page, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchProducts();
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
            <p className="text-xs text-gray-500">{p.category}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'price',
      label: 'Price',
      sortable: true,
      render: (p: Product) => <span>${p.price?.toFixed(2)}</span>,
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
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Products</h2>
        <Link
          href="/products/new"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          + Add Product
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-4 flex gap-3 flex-wrap">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products..."
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="bg-gray-700 text-white px-4 py-2 rounded-lg text-sm"
          >
            Search
          </button>
        </form>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <DataTable columns={columns} data={products} isLoading={isLoading} />
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

export default withAuth(ProductsPage);
