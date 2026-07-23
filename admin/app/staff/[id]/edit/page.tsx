'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { adminApi } from '@/lib/api';
import AdminLayout from '@/components/layout/AdminLayout';
import FormField, { inputClass, selectClass } from '@/components/ui/FormField';
import { withAuth } from '@/context/AuthContext';
import { PermissionPicker } from '../../new/page';
import { DELEGATABLE_PERMISSIONS, type Permission } from '@/lib/permissions';
import toast from 'react-hot-toast';

const DELEGATABLE_KEYS = new Set<Permission>(DELEGATABLE_PERMISSIONS.map((p) => p.key));

function EditStaffPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    role: 'STAFF' as 'OWNER' | 'STAFF',
    isActive: true,
  });
  const [permissions, setPermissions] = useState<Set<Permission>>(new Set());

  const togglePermission = (key: Permission) => {
    setPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  useEffect(() => {
    adminApi.staff
      .get(id)
      .then((s) => {
        setForm({
          name: s.name ?? '',
          email: s.email ?? '',
          role: (s.role as 'OWNER' | 'STAFF') ?? 'STAFF',
          isActive: s.isActive ?? true,
        });
        // Keep only delegatable permissions in the picker (owners report all).
        setPermissions(new Set((s.permissions ?? []).filter((p): p is Permission => DELEGATABLE_KEYS.has(p as Permission))));
      })
      .catch(() => toast.error('Failed to load staff member'))
      .finally(() => setIsLoading(false));
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await adminApi.staff.update(id, {
        ...form,
        permissions: form.role === 'OWNER' ? [] : Array.from(permissions),
      });
      toast.success('Staff member updated!');
      router.push('/staff');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update staff');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="text-center py-12 text-gray-500">Loading...</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700">
          ← Back
        </button>
        <h2 className="text-2xl font-bold text-gray-900">Edit Staff Member</h2>
      </div>

      <form onSubmit={handleSubmit} className="max-w-lg bg-white rounded-lg shadow p-6 space-y-4">
        <FormField label="Name" required>
          <input className={inputClass} value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </FormField>

        <FormField label="Email" required>
          <input type="email" className={inputClass} value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </FormField>

        <FormField label="Role">
          <select className={selectClass} value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as 'OWNER' | 'STAFF' })}>
            <option value="STAFF">Staff (employee — you choose their access below)</option>
            <option value="OWNER">Owner (full control of everything)</option>
          </select>
        </FormField>

        {form.role === 'STAFF' && (
          <PermissionPicker selected={permissions} onToggle={togglePermission} />
        )}
        {form.role === 'OWNER' && (
          <p className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
            Owners have full control of the business, including advertisements, staff, and settings.
          </p>
        )}

        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="rounded" />
          Active
        </label>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={isSubmitting}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium">
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </button>
          <button type="button" onClick={() => router.back()}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2 rounded-lg text-sm font-medium">
            Cancel
          </button>
        </div>
      </form>
    </AdminLayout>
  );
}

export default withAuth(EditStaffPage, { ownerOnly: true });
