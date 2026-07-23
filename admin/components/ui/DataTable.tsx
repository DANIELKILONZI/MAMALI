'use client';

import { useState } from 'react';
import EmptyState from './EmptyState';

interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
  /** Right-align numeric columns. */
  align?: 'left' | 'right';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  emptyIcon?: string;
  emptyAction?: React.ReactNode;
  /** Enables checkbox selection; renders the toolbar returned by bulkActions. */
  selectable?: boolean;
  bulkActions?: (selectedIds: string[], clear: () => void) => React.ReactNode;
  onRowClick?: (row: T) => void;
}

export default function DataTable<T extends { id: string }>({
  columns,
  data,
  isLoading,
  emptyMessage = 'Nothing here yet',
  emptyIcon,
  emptyAction,
  selectable = false,
  bulkActions,
  onRowClick,
}: Readonly<DataTableProps<T>>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const sorted = [...data].sort((a, b) => {
    if (!sortKey) return 0;
    const av = (a as Record<string, unknown>)[sortKey];
    const bv = (b as Record<string, unknown>)[sortKey];
    // Numeric columns must not sort lexicographically ("10" before "9").
    if (typeof av === 'number' && typeof bv === 'number') {
      return sortDir === 'asc' ? av - bv : bv - av;
    }
    const cmp = String(av ?? '').localeCompare(String(bv ?? ''));
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const clear = () => setSelected(new Set());
  const allOnPageSelected = sorted.length > 0 && sorted.every((r) => selected.has(r.id));

  const toggleAll = () => {
    setSelected(allOnPageSelected ? new Set() : new Set(sorted.map((r) => r.id)));
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="animate-pulse divide-y divide-gray-100">
          <div className="h-11 bg-gray-50" />
          {Array.from({ length: 6 }).map((_, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <div key={`skeleton-${i}`} className="flex items-center gap-4 px-4 py-3.5">
              {columns.map((c) => (
                <div key={c.key} className="h-3 flex-1 rounded bg-gray-100" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <EmptyState icon={emptyIcon} title={emptyMessage} action={emptyAction} />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      {selectable && bulkActions && selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-100 bg-blue-50 px-4 py-2.5">
          <span className="text-sm font-medium text-blue-900">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2">
            {bulkActions(Array.from(selected), clear)}
            <button onClick={clear} className="text-sm text-blue-700 hover:underline">
              Clear
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              {selectable && (
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all rows"
                    checked={allOnPageSelected}
                    onChange={toggleAll}
                    className="rounded border-gray-300"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 font-semibold text-gray-600 ${col.align === 'right' ? 'text-right' : ''} ${
                    col.sortable ? 'cursor-pointer select-none hover:bg-gray-100' : ''
                  }`}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  {col.label}
                  {col.sortable && sortKey === col.key && (
                    <span className="ml-1" aria-hidden="true">{sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map((row) => (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`transition-colors hover:bg-gray-50 ${onRowClick ? 'cursor-pointer' : ''}`}
              >
                {selectable && (
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select row ${row.id}`}
                      checked={selected.has(row.id)}
                      onChange={() => toggleOne(row.id)}
                      className="rounded border-gray-300"
                    />
                  </td>
                )}
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 text-gray-700 ${col.align === 'right' ? 'text-right' : ''}`}
                  >
                    {col.render
                      ? col.render(row)
                      : String((row as Record<string, unknown>)[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
