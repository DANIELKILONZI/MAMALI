'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi, NotificationLogEntry, NotificationListResponse } from '@/lib/api';
import AdminLayout from '@/components/layout/AdminLayout';
import { withAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';

const STATUS_OPTIONS = ['all', 'sent', 'pending', 'failed', 'delivered'] as const;
const CHANNEL_OPTIONS = ['all', 'whatsapp', 'sms'] as const;

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    sent: 'bg-green-100 text-green-700',
    delivered: 'bg-emerald-100 text-emerald-700',
    pending: 'bg-yellow-100 text-yellow-700',
    failed: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

function ChannelBadge({ channel }: { channel: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
        channel === 'whatsapp' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'
      }`}
    >
      {channel === 'whatsapp' ? '💬 WhatsApp' : '📱 SMS'}
    </span>
  );
}

function NotificationsPage() {
  const [data, setData] = useState<NotificationListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>('all');
  const [channel, setChannel] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [resending, setResending] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    adminApi.notifications
      .list({ page, status, channel })
      .then(setData)
      .catch(() => toast.error('Failed to load notifications'))
      .finally(() => setLoading(false));
  }, [page, status, channel]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [status, channel]);

  const handleResend = async (id: string) => {
    setResending(id);
    try {
      await adminApi.notifications.resend(id);
      toast.success('Resend queued — delivery will appear shortly');
      load();
    } catch {
      toast.error('Failed to queue resend');
    } finally {
      setResending(null);
    }
  };

  const summary = data?.summary;

  return (
    <AdminLayout>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Notifications Center</h2>
        <p className="text-gray-500 text-sm mt-1">WhatsApp and SMS delivery logs</p>
      </div>

      {/* Summary KPIs */}
      {summary && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-2xl font-bold text-gray-900">{summary.totalSent}</p>
            <p className="text-sm text-gray-500 mt-1">✅ Sent</p>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-2xl font-bold text-gray-900">{summary.totalPending}</p>
            <p className="text-sm text-gray-500 mt-1">⏳ Pending</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-2xl font-bold text-gray-900">{summary.totalFailed}</p>
            <p className="text-sm text-gray-500 mt-1">❌ Failed</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Status:</span>
          <div className="flex gap-1">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  status === s
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Channel:</span>
          <div className="flex gap-1">
            {CHANNEL_OPTIONS.map((c) => (
              <button
                key={c}
                onClick={() => setChannel(c)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  channel === c
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading notifications…</div>
      ) : (
        <>
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Channel</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Recipient</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Type</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Order</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Status</th>
                  <th className="text-right py-3 px-4 text-gray-500 font-medium">Retries</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Sent At</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {(data?.logs ?? []).map((log: NotificationLogEntry) => (
                  <>
                    <tr
                      key={log.id}
                      className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                      onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                    >
                      <td className="py-3 px-4">
                        <ChannelBadge channel={log.channel} />
                      </td>
                      <td className="py-3 px-4 text-gray-700">{log.recipient}</td>
                      <td className="py-3 px-4 text-gray-600 text-xs font-mono">
                        {log.messageType.replace(/_/g, ' ')}
                      </td>
                      <td className="py-3 px-4">
                        {log.order ? (
                          <span className="font-mono text-xs text-blue-600">{log.order.orderNumber}</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={log.status} />
                        {log.error && <p className="text-xs text-red-500 mt-0.5 truncate max-w-[160px]">{log.error}</p>}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-600">{log.retryCount}</td>
                      <td className="py-3 px-4 text-gray-500 text-xs">
                        {log.sentAt ? new Date(log.sentAt).toLocaleString() : '—'}
                      </td>
                      <td className="py-3 px-4">
                        {(log.status === 'failed' || log.status === 'pending') && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleResend(log.id); }}
                            disabled={resending === log.id}
                            className="text-xs rounded bg-blue-600 text-white px-2 py-1 hover:bg-blue-700 disabled:opacity-50"
                          >
                            {resending === log.id ? '…' : 'Resend'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {/* Expandable message body */}
                    {expanded === log.id && log.body && (
                      <tr key={`${log.id}-body`} className="bg-gray-50">
                        <td colSpan={8} className="py-3 px-4">
                          <p className="text-xs font-semibold text-gray-500 mb-1">Message Body:</p>
                          <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans bg-white border border-gray-200 rounded p-3 max-h-40 overflow-y-auto">
                            {log.body}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                {(data?.logs ?? []).length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-gray-400">
                      No notification logs yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data && data.pagination.pages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-500">
                Page {data.pagination.page} of {data.pagination.pages} ({data.pagination.total} logs)
              </p>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
                >
                  ← Prev
                </button>
                <button
                  disabled={page >= data.pagination.pages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </AdminLayout>
  );
}

export default withAuth(NotificationsPage);
