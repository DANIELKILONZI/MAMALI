'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi, StaffUser } from '@/lib/api';
import AdminLayout from '@/components/layout/AdminLayout';
import PageHeader from '@/components/ui/PageHeader';
import Modal from '@/components/ui/Modal';
import DataTable from '@/components/ui/DataTable';
import { withAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';

function StaffPage() {
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchStaff = () => {
    setIsLoading(true);
    adminApi.staff
      .list()
      .then(setStaff)
      .catch(() => toast.error('Failed to load staff'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { fetchStaff(); }, []);

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await adminApi.staff.delete(deleteId);
      toast.success('Staff member deleted');
      fetchStaff();
    } catch {
      toast.error('Failed to delete staff');
    }
  };

  const columns = [
    { key: 'name', label: 'Name', sortable: true },
    { key: 'email', label: 'Email', sortable: true },
    {
      key: 'role',
      label: 'Role',
      render: (s: StaffUser) => (
        <span
          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
            s.role === 'OWNER' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
          }`}
        >
          {s.role === 'OWNER' ? 'Owner' : 'Staff'}
        </span>
      ),
    },
    {
      key: 'isActive',
      label: 'Status',
      render: (s: StaffUser) => (
        <span
          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
            s.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {s.isActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (s: StaffUser) => (
        <div className="flex items-center gap-2">
          <Link href={`/staff/${s.id}/edit`} className="text-blue-600 hover:underline text-sm">
            Edit
          </Link>
          <button
            onClick={() => setDeleteId(s.id)}
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
        title="Staff"
        description="Your employees and what each of them can access."
        actions={
          <Link
            href="/staff/new"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            + Add staff
          </Link>
        }
      />

      <DataTable
        columns={columns}
        data={staff}
        isLoading={isLoading}
        emptyIcon="🧑‍💼"
        emptyMessage="No staff yet"
        emptyAction={
          <Link href="/staff/new" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Add your first employee
          </Link>
        }
      />

      <Modal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Staff Member"
        message="Are you sure you want to remove this staff member?"
        confirmLabel="Delete"
      />
    </AdminLayout>
  );
}

export default withAuth(StaffPage, true);
