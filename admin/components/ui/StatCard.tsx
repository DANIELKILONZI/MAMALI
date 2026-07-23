'use client';

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon?: string;
  /** Colours the sub text: up = green, down = red, flat = grey. */
  trend?: 'up' | 'down' | 'flat';
  href?: string;
}

const trendClass = {
  up: 'text-emerald-600',
  down: 'text-red-600',
  flat: 'text-gray-500',
} as const;

/** KPI tile used on the dashboard and analytics screens. */
export default function StatCard({ label, value, sub, icon, trend = 'flat' }: Readonly<StatCardProps>) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        {icon && <span className="text-lg" aria-hidden="true">{icon}</span>}
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-gray-900">{value}</p>
      {sub && <p className={`mt-1 text-xs font-medium ${trendClass[trend]}`}>{sub}</p>}
    </div>
  );
}
