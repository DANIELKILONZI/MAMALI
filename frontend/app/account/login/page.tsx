'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, customerAuth } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';

export default function CustomerLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.customer.login({ phone, password });
      customerAuth.setToken(res.token);
      router.push('/account');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Log In</h1>
      <p className="mb-8 text-sm text-gray-600">
        See your order history and check out faster.
      </p>

      {error && <Alert variant="error" className="mb-4">{error}</Alert>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Phone Number"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="0712345678"
          required
        />
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button type="submit" loading={loading} size="lg" className="w-full">
          Log In
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-600">
        No account?{' '}
        <Link href="/account/register" className="font-medium text-blue-600 hover:underline">
          Create one
        </Link>
      </p>
      <p className="mt-3 text-center text-xs text-gray-400">
        Accounts are optional — you can always{' '}
        <Link href="/products" className="underline hover:text-gray-600">
          shop as a guest
        </Link>
        .
      </p>
    </div>
  );
}
