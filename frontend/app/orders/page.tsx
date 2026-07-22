'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

/**
 * Order lookup — lets a customer find their order by order number
 * (from the confirmation screen or M-Pesa SMS) without an account.
 */
export default function OrderLookupPage() {
  const router = useRouter();
  const [orderNumber, setOrderNumber] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = orderNumber.trim().toUpperCase();
    if (!trimmed) {
      setError('Enter your order number');
      return;
    }
    router.push(`/orders/${encodeURIComponent(trimmed)}`);
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-16 sm:px-6">
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Track Your Order</h1>
      <p className="mb-8 text-sm text-gray-600">
        Enter the order number from your confirmation screen or SMS (e.g. ORD-20260722-A1B2).
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Order Number"
          type="text"
          value={orderNumber}
          onChange={(e) => {
            setOrderNumber(e.target.value);
            setError('');
          }}
          placeholder="ORD-XXXXXXXX-XXXX"
          error={error}
          required
        />
        <Button type="submit" size="lg" className="w-full">
          Track Order
        </Button>
      </form>
    </div>
  );
}
