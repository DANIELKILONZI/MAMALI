'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCart } from '@/context/CartContext';
import { Button } from '@/components/ui/Button';

export default function CartPage() {
  const { items, removeItem, updateQuantity, subtotal } = useCart();

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <svg className="mx-auto mb-4 h-16 w-16 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13l-1.4 7h12.8M7 13l-1-5M17 13l1-5M9 20a1 1 0 100 2 1 1 0 000-2zm6 0a1 1 0 100 2 1 1 0 000-2z" />
        </svg>
        <h2 className="mb-2 text-xl font-bold text-gray-700">Your cart is empty</h2>
        <p className="mb-6 text-gray-500">Add some products to get started.</p>
        <Link href="/products">
          <Button size="lg">Browse Products</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="mb-8 text-2xl font-bold text-gray-900">Shopping Cart</h1>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Cart Items */}
        <div className="lg:col-span-2 space-y-4">
          {items.map((item) => (
            <div
              key={item.productId}
              className="flex gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              {/* Image */}
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
                {item.image ? (
                  <Image src={item.image} alt={item.name} fill className="object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-gray-300">
                    <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-gray-800 line-clamp-2">{item.name}</h3>
                <p className="mt-1 text-sm text-blue-600 font-medium">
                  KSh {item.price.toLocaleString('en-KE')}
                </p>

                {/* Quantity Controls */}
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden text-sm">
                    <button
                      onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                      className="px-2.5 py-1 text-gray-600 hover:bg-gray-100 transition"
                    >
                      −
                    </button>
                    <span className="w-8 text-center font-semibold">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                      className="px-2.5 py-1 text-gray-600 hover:bg-gray-100 transition"
                    >
                      +
                    </button>
                  </div>
                  <button
                    onClick={() => removeItem(item.productId)}
                    className="text-xs text-red-500 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>

              {/* Line Total */}
              <div className="shrink-0 text-right">
                <span className="font-bold text-gray-900">
                  KSh {(item.price * item.quantity).toLocaleString('en-KE')}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-bold text-gray-900">Order Summary</h2>
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex justify-between">
                <span>Subtotal ({items.reduce((s, i) => s + i.quantity, 0)} items)</span>
                <span>KSh {subtotal.toLocaleString('en-KE')}</span>
              </div>
              <div className="flex justify-between">
                <span>Delivery</span>
                <span className="text-green-600">Free</span>
              </div>
              <div className="border-t border-gray-100 pt-3 flex justify-between text-base font-bold text-gray-900">
                <span>Total</span>
                <span>KSh {subtotal.toLocaleString('en-KE')}</span>
              </div>
            </div>

            <Link href="/checkout" className="block mt-5">
              <Button size="lg" className="w-full">
                Proceed to Checkout
              </Button>
            </Link>
            <Link href="/products" className="mt-3 block text-center text-sm text-gray-500 hover:text-blue-600">
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
