'use client';

import { useEffect, useState } from 'react';
import { adminApi, StoreSettings } from '@/lib/api';
import AdminLayout from '@/components/layout/AdminLayout';
import FormField, { inputClass } from '@/components/ui/FormField';
import { withAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';

function SettingsPage() {
  const [form, setForm] = useState<Partial<StoreSettings>>({
    businessName: 'MAMALI',
    currency: 'KES',
    logoUrl: '',
    primaryColor: '#2563eb',
    themeColor: '#1e293b',
    notificationsEnabled: false,
    whatsappEnabled: false,
    smsFallbackEnabled: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    adminApi.settings
      .get()
      .then((res) => {
        setForm({
          businessName: res.settings.businessName,
          currency: res.settings.currency,
          logoUrl: res.settings.logoUrl ?? '',
          primaryColor: res.settings.primaryColor,
          themeColor: res.settings.themeColor,
          notificationsEnabled: res.settings.notificationsEnabled ?? false,
          whatsappEnabled: res.settings.whatsappEnabled ?? false,
          smsFallbackEnabled: res.settings.smsFallbackEnabled ?? false,
        });
      })
      .catch(() => toast.error('Failed to load settings'))
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await adminApi.settings.update({
        businessName: form.businessName,
        currency: form.currency,
        logoUrl: form.logoUrl || null,
        primaryColor: form.primaryColor,
        themeColor: form.themeColor,
        notificationsEnabled: form.notificationsEnabled,
        whatsappEnabled: form.whatsappEnabled,
        smsFallbackEnabled: form.smsFallbackEnabled,
      });
      toast.success('Settings saved!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const Toggle = ({
    label,
    description,
    checked,
    onChange,
  }: {
    label: string;
    description?: string;
    checked: boolean;
    onChange: (v: boolean) => void;
  }) => (
    <div className="flex items-start justify-between py-3 border-b border-gray-100 last:border-0">
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
          checked ? 'bg-blue-600' : 'bg-gray-200'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );

  return (
    <AdminLayout>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Store Settings</h2>
        <p className="text-gray-500 text-sm mt-1">Configure your store branding and preferences</p>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6 max-w-xl">
          {/* Branding */}
          <div className="bg-white rounded-lg shadow p-6 space-y-5">
            <h3 className="font-semibold text-gray-800">🎨 Branding</h3>

            <FormField label="Business Name" required>
              <input
                className={inputClass}
                value={form.businessName ?? ''}
                onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                required
              />
            </FormField>

            <FormField label="Currency">
              <input
                className={inputClass}
                value={form.currency ?? ''}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                placeholder="KES"
              />
            </FormField>

            <FormField label="Logo URL (optional)">
              <input
                className={inputClass}
                type="url"
                value={form.logoUrl ?? ''}
                onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
                placeholder="https://..."
              />
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Primary Color">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.primaryColor ?? '#2563eb'}
                    onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                    className="h-9 w-14 cursor-pointer rounded border border-gray-300"
                  />
                  <input
                    className={inputClass}
                    value={form.primaryColor ?? ''}
                    onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                    placeholder="#2563eb"
                  />
                </div>
              </FormField>

              <FormField label="Theme Color">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.themeColor ?? '#1e293b'}
                    onChange={(e) => setForm({ ...form, themeColor: e.target.value })}
                    className="h-9 w-14 cursor-pointer rounded border border-gray-300"
                  />
                  <input
                    className={inputClass}
                    value={form.themeColor ?? ''}
                    onChange={(e) => setForm({ ...form, themeColor: e.target.value })}
                    placeholder="#1e293b"
                  />
                </div>
              </FormField>
            </div>
          </div>

          {/* Notification Settings */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-semibold text-gray-800 mb-1">📱 Notification Settings</h3>
            <p className="text-xs text-gray-500 mb-4">
              Configure how customers are notified about their orders. Requires API keys set in environment variables.
            </p>
            <div>
              <Toggle
                label="Enable Notifications"
                description="Master toggle — enables all customer notifications"
                checked={form.notificationsEnabled ?? false}
                onChange={(v) => setForm({ ...form, notificationsEnabled: v })}
              />
              <Toggle
                label="WhatsApp Notifications"
                description="Send order confirmations and updates via WhatsApp (Meta Cloud API)"
                checked={form.whatsappEnabled ?? false}
                onChange={(v) => setForm({ ...form, whatsappEnabled: v })}
              />
              <Toggle
                label="SMS Fallback"
                description="Fall back to SMS (Africa's Talking) when WhatsApp delivery fails"
                checked={form.smsFallbackEnabled ?? false}
                onChange={(v) => setForm({ ...form, smsFallbackEnabled: v })}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={isSaving}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium"
            >
              {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      )}
    </AdminLayout>
  );
}

export default withAuth(SettingsPage);
