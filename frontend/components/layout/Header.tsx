'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import type { Category } from '@/lib/api';

function SearchForm({ className, onSubmitted }: Readonly<{ className?: string; onSubmitted?: () => void }>) {
  const router = useRouter();
  const [query, setQuery] = useState('');

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/products?search=${encodeURIComponent(q)}` : '/products');
    onSubmitted?.();
  }

  return (
    <form onSubmit={handleSubmit} className={className} role="search">
      <div className="relative">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products…"
          aria-label="Search products"
          className="w-full rounded-full border border-gray-300 bg-gray-50 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <svg
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
        </svg>
      </div>
    </form>
  );
}

interface HeaderProps {
  businessName?: string;
  logoUrl?: string | null;
  categories?: Category[];
}

export function Header({ businessName = 'MAMALI', logoUrl = null, categories = [] }: Readonly<HeaderProps>) {
  const { totalItems } = useCart();
  const [menuOpen, setMenuOpen] = useState(false);

  const navLinks = [
    { href: '/', label: 'Home' },
    { href: '/products', label: 'Products' },
    { href: '/orders', label: 'Track Order' },
  ];

  // Top-level categories only, capped to keep the bar on one line.
  const navCategories = categories.filter((c) => !c.parentId).slice(0, 8);

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white shadow-sm">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
        {/* Logo */}
        <Link href="/" className="flex shrink-0 items-center gap-2">
          {logoUrl ? (
            <Image src={logoUrl} alt={businessName} width={32} height={32} className="h-8 w-8 rounded object-contain" />
          ) : null}
          <span className="text-2xl font-extrabold tracking-tight text-blue-600">{businessName}</span>
        </Link>

        {/* Desktop search */}
        <SearchForm className="hidden flex-1 max-w-md md:block" />

        {/* Desktop nav */}
        <nav className="ml-auto hidden items-center gap-6 md:flex">
          {navLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-gray-600 transition hover:text-blue-600"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Account + cart + mobile toggle */}
        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <Link
            href="/account"
            aria-label="My account"
            className="rounded-lg p-2 transition hover:bg-gray-100"
          >
            <svg className="h-6 w-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </Link>
          <Link href="/cart" className="relative rounded-lg p-2 transition hover:bg-gray-100">
            <svg
              className="h-6 w-6 text-gray-700"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13l-1.4 7h12.8M7 13l-1-5M17 13l1-5M9 20a1 1 0 100 2 1 1 0 000-2zm6 0a1 1 0 100 2 1 1 0 000-2z"
              />
            </svg>
            {totalItems > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                {totalItems > 99 ? '99+' : totalItems}
              </span>
            )}
          </Link>

          {/* Mobile hamburger */}
          <button
            className="rounded-lg p-2 transition hover:bg-gray-100 md:hidden"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            <svg className="h-5 w-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Desktop category bar */}
      {navCategories.length > 0 && (
        <nav
          aria-label="Categories"
          className="hidden border-t border-gray-100 md:block"
        >
          <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 py-1.5 sm:px-6">
            {navCategories.map((cat) => (
              <Link
                key={cat.id}
                href={`/categories/${cat.slug}`}
                className="shrink-0 rounded-full px-3 py-1 text-xs font-medium text-gray-600 transition hover:bg-blue-50 hover:text-blue-700"
              >
                {cat.name}
              </Link>
            ))}
          </div>
        </nav>
      )}

      {/* Mobile menu */}
      {menuOpen && (
        <nav className="border-t border-gray-100 bg-white px-4 pb-4 pt-2 md:hidden">
          <SearchForm className="mb-3" onSubmitted={() => setMenuOpen(false)} />
          {navLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className="block py-2 text-sm font-medium text-gray-700 hover:text-blue-600"
            >
              {l.label}
            </Link>
          ))}
          {navCategories.length > 0 && (
            <>
              <p className="mt-3 mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Categories
              </p>
              <div className="flex flex-wrap gap-2">
                {navCategories.map((cat) => (
                  <Link
                    key={cat.id}
                    href={`/categories/${cat.slug}`}
                    onClick={() => setMenuOpen(false)}
                    className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:border-blue-300 hover:text-blue-700"
                  >
                    {cat.name}
                  </Link>
                ))}
              </div>
            </>
          )}
        </nav>
      )}
    </header>
  );
}
