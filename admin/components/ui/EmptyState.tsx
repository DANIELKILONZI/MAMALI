'use client';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

/** Friendly empty state — replaces bare "No data found" text. */
export default function EmptyState({ icon = '📭', title, description, action }: Readonly<EmptyStateProps>) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="mb-3 text-4xl" aria-hidden="true">{icon}</span>
      <p className="text-base font-semibold text-gray-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-gray-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
