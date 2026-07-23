'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminApi } from '@/lib/api';
import AdminLayout from '@/components/layout/AdminLayout';
import FormField, { inputClass, selectClass } from '@/components/ui/FormField';
import { withAuth } from '@/context/AuthContext';
import { DELEGATABLE_PERMISSIONS, type Permission } from '@/lib/permissions';
import toast from 'react-hot-toast';

function NewStaffPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await adminApi.staff.create({
        ...form,
        permissions: form.role === 'OWNER' ? [] : Array.from(permissions),
      });
      toast.success('Staff member created!');
      router.push('/staff');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create staff');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AdminLayout>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700">
          ← Back
        </button>
        <h2 className="text-2xl font-bold text-gray-900">New Staff Member</h2>
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

        <FormField label="Password" required>
          <input type="password" className={inputClass} value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} required />
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
            Only grant this to someone you trust completely.
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
            {isSubmitting ? 'Creating...' : 'Create Staff'}
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

export function PermissionPicker({
  selected,
  onToggle,
}: Readonly<{ selected: Set<Permission>; onToggle: (key: Permission) => void }>) {
  return (
    <div>
      <p className="text-sm font-medium text-gray-700 mb-1">What can this employee do?</p>
      <p className="text-xs text-gray-500 mb-3">
        Advertisements, staff management, and store settings stay owner-only and can&apos;t be delegated.
      </p>
      <div className="space-y-2 rounded-lg border border-gray-200 p-3">
        {DELEGATABLE_PERMISSIONS.map((p) => (
          <label key={p.key} className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selected.has(p.key)}
              onChange={() => onToggle(p.key)}
              className="mt-1 rounded"
            />
            <span>
              <span className="block text-sm font-medium text-gray-800">{p.label}</span>
              <span className="block text-xs text-gray-500">{p.description}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

export default withAuth(NewStaffPage, { ownerOnly: true });
