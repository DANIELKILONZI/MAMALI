'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi, Alert, AlertsResponse, SystemHealthResponse } from '@/lib/api';
import AdminLayout from '@/components/layout/AdminLayout';
import { withAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';

// ── Helpers ───────────────────────────────────────────────────────────────

function severityClass(severity: string) {
  return severity === 'critical'
    ? 'border-red-400 bg-red-50'
    : 'border-yellow-400 bg-yellow-50';
}

function severityBadge(severity: string) {
  return severity === 'critical' ? (
    <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">
      🔴 Critical
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-bold text-yellow-700">
      ⚠️ Warning
    </span>
  );
}

function componentStatusDot(status: string) {
  if (status === 'ok')    return <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" />;
  if (status === 'warn')  return <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-400" />;
  return                         <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />;
}

function AlertTypeLabel({ type }: { type: string }) {
  const labels: Record<string, string> = {
    HIGH_NOTIFICATION_FAILURE: '📩 Notification Failures',
    FRAUD_SCORE_SPIKE:         '🚨 Fraud Spike',
    CONVERSION_DROP:           '📉 Conversion Drop',
    HIGH_ABANDONED_CHECKOUTS:  '🛒 Abandoned Checkouts',
    PAYMENT_FAILURE_SPIKE:     '💳 Payment Failures',
    LOW_STOCK_CRITICAL:        '📦 Stock Alert',
  };
  return <span className="font-semibold text-gray-800">{labels[type] ?? type}</span>;
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

// ── Page Component ─────────────────────────────────────────────────────────

const ALERT_REFRESH_INTERVAL_MS = 60_000; // 60 seconds

function AlertsPage() {
  const [alerts, setAlerts]   = useState<AlertsResponse | null>(null);
  const [health, setHealth]   = useState<SystemHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [a, h] = await Promise.all([
        adminApi.alerts.get(),
        adminApi.health.fullCheck(),
      ]);
      setAlerts(a);
      setHealth(h);
    } catch {
      toast.error('Failed to load alerts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchData, ALERT_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">System Alerts</h1>
            <p className="text-sm text-gray-500 mt-1">
              Real-time operational alerts — refreshes every {ALERT_REFRESH_INTERVAL_MS / 1000}s
            </p>
          </div>
          <button
            onClick={fetchData}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            🔄 Refresh
          </button>
        </div>

        {loading && (
          <p className="text-gray-400 text-sm">Loading alerts…</p>
        )}

        {/* Summary strip */}
        {alerts && !loading && (
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg bg-white shadow p-4 text-center">
              <p className="text-3xl font-bold text-gray-900">{alerts.summary.total}</p>
              <p className="text-sm text-gray-500 mt-1">Active Alerts</p>
            </div>
            <div className="rounded-lg bg-red-50 shadow p-4 text-center">
              <p className="text-3xl font-bold text-red-700">{alerts.summary.critical}</p>
              <p className="text-sm text-red-500 mt-1">Critical</p>
            </div>
            <div className="rounded-lg bg-yellow-50 shadow p-4 text-center">
              <p className="text-3xl font-bold text-yellow-700">{alerts.summary.warning}</p>
              <p className="text-sm text-yellow-500 mt-1">Warnings</p>
            </div>
          </div>
        )}

        {/* Active alerts list */}
        {alerts && !loading && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Active Alerts</h2>
            </div>
            {alerts.alerts.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-4xl">✅</p>
                <p className="mt-2 text-gray-600 font-medium">All systems are healthy</p>
                <p className="text-sm text-gray-400 mt-1">No active alerts — keep it up!</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {alerts.alerts.map((alert: Alert) => (
                  <li key={alert.type} className={`p-4 border-l-4 ${severityClass(alert.severity)}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {severityBadge(alert.severity)}
                          <AlertTypeLabel type={alert.type} />
                        </div>
                        <p className="text-sm text-gray-700">{alert.message}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          Threshold: {alert.threshold}{alert.unit} · Current: {alert.value}{alert.unit} · {timeAgo(alert.generatedAt)}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* System health panel */}
        {health && !loading && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">System Health</h2>
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${
                  health.status === 'healthy'
                    ? 'bg-green-100 text-green-700'
                    : health.status === 'degraded'
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-red-100 text-red-700'
                }`}
              >
                {health.status === 'healthy' ? '✅' : health.status === 'degraded' ? '⚠️' : '🔴'}{' '}
                {health.status.charAt(0).toUpperCase() + health.status.slice(1)}
              </span>
            </div>
            <ul className="divide-y divide-gray-100">
              {Object.entries(health.components).map(([name, comp]) => (
                <li key={name} className="px-4 py-3 flex items-start gap-3">
                  <div className="mt-1">{componentStatusDot(comp.status)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 capitalize">{name}</p>
                    {comp.detail && (
                      <p className="text-xs text-gray-500 mt-0.5">{comp.detail}</p>
                    )}
                    {comp.metrics && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {Object.entries(comp.metrics)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(' · ')}
                      </p>
                    )}
                    {comp.latencyMs !== undefined && (
                      <p className="text-xs text-gray-400">DB latency: {comp.latencyMs}ms</p>
                    )}
                  </div>
                  <span
                    className={`text-xs font-semibold uppercase ${
                      comp.status === 'ok' ? 'text-green-600' : comp.status === 'warn' ? 'text-yellow-600' : 'text-red-600'
                    }`}
                  >
                    {comp.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

export default withAuth(AlertsPage, { permission: 'analytics.view' });
