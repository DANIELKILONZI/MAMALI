import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-gray-50 py-10 mt-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <span className="text-xl font-extrabold text-blue-600">MAMALI</span>
            <p className="mt-2 text-sm text-gray-500">
              Your trusted digital commerce partner.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-900">Shop</h3>
            <ul className="mt-3 space-y-2 text-sm text-gray-600">
              <li><Link href="/products" className="hover:text-blue-600">All Products</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-900">Company</h3>
            <ul className="mt-3 space-y-2 text-sm text-gray-600">
              <li>
                <Link href="/about" className="hover:text-blue-600">About</Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-blue-600">Contact</Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-900">Legal</h3>
            <ul className="mt-3 space-y-2 text-sm text-gray-600">
              <li>
                <Link href="/privacy" className="hover:text-blue-600">Privacy Policy</Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-blue-600">Terms of Service</Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t border-gray-200 pt-6 text-center text-xs text-gray-400">
          &copy; {new Date().getFullYear()} MAMALI. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
