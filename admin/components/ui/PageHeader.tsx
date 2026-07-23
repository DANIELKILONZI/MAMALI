'use client';

import { useRouter } from 'next/navigation';

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Shows a back control (used on detail/edit screens). */
  backHref?: string | true;
  /** Buttons rendered on the right (e.g. "New product"). */
  actions?: React.ReactNode;
}

/** Consistent page title block used across every admin screen. */
export default function PageHeader({ title, description, backHref, actions }: Readonly<PageHeaderProps>) {
  const router = useRouter();

  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {backHref && (
          <button
            onClick={() => (typeof backHref === 'string' ? router.push(backHref) : router.back())}
            className="mb-1 inline-flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-800"
          >
            <span aria-hidden="true">←</span> Back
          </button>
        )}
        <h2 className="truncate text-2xl font-bold tracking-tight text-gray-900">{title}</h2>
        {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
