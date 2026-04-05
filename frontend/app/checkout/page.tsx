'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import { api, Order } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';

type Step = 'form' | 'pending_payment' | 'done';

/** Poll every 3 seconds, up to 10 times (30 seconds total) before showing fallback */
const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 10;

/** Validates Kenyan phone numbers (07XXXXXXXX or 2547XXXXXXXX) */
function validateKenyanPhone(phone: string): string | null {
  const cleaned = phone.replace(/\s+/g, '');
  if (/^07\d{8}$/.test(cleaned)) return `254${cleaned.slice(1)}`;
  if (/^2547\d{8}$/.test(cleaned)) return cleaned;
  if (/^\+2547\d{8}$/.test(cleaned)) return cleaned.slice(1);
  return null;
}

/**
 * CheckoutPage — multi-step checkout with M-Pesa STK push payment.
 *
 * State transitions:
 *   'form'            — customer fills name + phone, submits order
 *   'pending_payment' — order created, STK push sent, polling payment status
 *   'done'            — payment confirmed (paid) or max polls reached (fallback)
 *
 * Payment polling:
 *   Polls GET /api/payments/:orderId/status every POLL_INTERVAL_MS (3 s),
 *   up to MAX_POLLS (10) times (30 s total). If payment is not confirmed by
 *   then, the user is shown a manual "check your phone" message and directed
 *   to their order status page.
 */
export default function CheckoutPage() {
  const router = useRouter();
  const { items, subtotal, clearCart } = useCart();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [step, setStep] = useState<Step>('form');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'completed' | 'failed'>('pending');
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearTimeout(pollRef.current);
  }, []);

  const pollPaymentStatus = useCallback(
    async (orderId: string, count: number) => {
      if (count >= MAX_POLLS) {
        // Max polls reached - show "check your phone" message
        stopPolling();
        return;
      }
      try {
        const res = await api.payments.getStatus(orderId);
        if (res.payment.status === 'completed') {
          setPaymentStatus('completed');
          setStep('done');
          clearCart();
          stopPolling();
          return;
        }
        if (res.payment.status === 'failed') {
          setPaymentStatus('failed');
          setError('Payment failed. Please try again.');
          setStep('form');
          stopPolling();
          return;
        }
      } catch {
        // network error - keep polling
      }
      setPollCount(count + 1);
      pollRef.current = setTimeout(() => pollPaymentStatus(orderId, count + 1), POLL_INTERVAL_MS);
    },
    [clearCart, stopPolling]
  );

  useEffect(() => () => stopPolling(), [stopPolling]);

  if (items.length === 0 && step === 'form') {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <p className="mb-4 text-gray-600">Your cart is empty.</p>
        <Button onClick={() => router.push('/products')}>Shop Products</Button>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setPhoneError('');

    const formatted = validateKenyanPhone(phone);
    if (!formatted) {
      setPhoneError('Enter a valid Kenyan number: 07XXXXXXXX or 2547XXXXXXXX');
      return;
    }

    setLoading(true);
    try {
      // 1. Create order
      const orderRes = await api.orders.create({
        customerName: name || undefined,
        customerPhone: formatted,
        items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      });
      setOrder(orderRes.order);

      // 2. Initiate payment
      await api.payments.initiate({
        orderId: orderRes.order.id,
        phoneNumber: formatted,
      });

      setStep('pending_payment');
      setPollCount(0);
      pollRef.current = setTimeout(
        () => pollPaymentStatus(orderRes.order.id, 0),
        POLL_INTERVAL_MS
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'done' && order) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <div className="mb-4 flex justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </span>
        </div>
        <h2 className="mb-2 text-2xl font-bold text-gray-900">Payment Confirmed!</h2>
        <p className="mb-1 text-gray-600">Order: <strong>{order.orderNumber}</strong></p>
        <p className="mb-6 text-gray-500 text-sm">Check your M-Pesa for the receipt.</p>
        <div className="flex flex-col gap-3">
          <Button onClick={() => router.push(`/orders/${order.orderNumber}`)} size="lg">
            Track Order
          </Button>
          <Button variant="outline" onClick={() => router.push('/products')}>
            Continue Shopping
          </Button>
        </div>
      </div>
    );
  }

  if (step === 'pending_payment' && order) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <div className="mb-6 flex justify-center">
          <Spinner size="lg" />
        </div>
        <h2 className="mb-3 text-2xl font-bold text-gray-900">Check Your Phone</h2>
        <p className="mb-2 text-gray-600">
          An M-Pesa STK push has been sent to <strong>{phone}</strong>.
        </p>
        <p className="mb-2 text-gray-600">
          Enter your M-Pesa PIN to complete the payment of{' '}
          <strong>KSh {order.total.toLocaleString('en-KE')}</strong>.
        </p>
        {pollCount >= MAX_POLLS && (
          <Alert variant="warning" className="mt-4 text-left">
            We haven&apos;t received payment confirmation yet. If you completed the payment, your
            order will be updated shortly.{' '}
            <button
              className="font-semibold text-yellow-800 underline"
              onClick={() => router.push(`/orders/${order.orderNumber}`)}
            >
              Check order status
            </button>
          </Alert>
        )}
        <p className="mt-6 text-sm text-gray-400">
          Order: {order.orderNumber}
        </p>
        <button
          onClick={() => router.push(`/orders/${order.orderNumber}`)}
          className="mt-2 text-sm text-blue-600 hover:underline"
        >
          View order status →
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="mb-8 text-2xl font-bold text-gray-900">Checkout</h1>

      <div className="grid gap-8 lg:grid-cols-5">
        {/* Form */}
        <div className="lg:col-span-3">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-5 text-lg font-semibold text-gray-800">Your Details</h2>
            {error && <Alert variant="error" className="mb-4">{error}</Alert>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Full Name (optional)"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
              />
              <Input
                label="M-Pesa Phone Number"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0712345678"
                error={phoneError}
                hint="Format: 07XXXXXXXX or 2547XXXXXXXX"
                required
              />
              <Button
                type="submit"
                loading={loading}
                size="lg"
                className="w-full"
              >
                Place Order & Pay via M-Pesa
              </Button>
            </form>
          </div>
        </div>

        {/* Summary */}
        <div className="lg:col-span-2">
          <div className="sticky top-24 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-800">Order Summary</h2>
            <ul className="mb-4 space-y-2 text-sm text-gray-600">
              {items.map((item) => (
                <li key={item.productId} className="flex justify-between">
                  <span className="line-clamp-1 flex-1 pr-2">
                    {item.name} × {item.quantity}
                  </span>
                  <span className="shrink-0 font-medium text-gray-800">
                    KSh {(item.price * item.quantity).toLocaleString('en-KE')}
                  </span>
                </li>
              ))}
            </ul>
            <div className="border-t border-gray-100 pt-3 flex justify-between text-base font-bold text-gray-900">
              <span>Total</span>
              <span>KSh {subtotal.toLocaleString('en-KE')}</span>
            </div>
            <p className="mt-3 text-xs text-gray-400">
              Payments powered by M-Pesa. You will receive an STK push after placing your order.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
