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

const LS_PHONE_KEY = 'mamali_last_phone';
const LS_NAME_KEY = 'mamali_last_name';

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
 */
export default function CheckoutPage() {
  const router = useRouter();
  const { items, subtotal, clearCart } = useCart();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [couponStatus, setCouponStatus] = useState<'idle' | 'applying' | 'applied' | 'error'>('idle');
  const [couponMessage, setCouponMessage] = useState('');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [step, setStep] = useState<Step>('form');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'completed' | 'failed'>('pending');
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Autofill from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedPhone = localStorage.getItem(LS_PHONE_KEY);
      const savedName = localStorage.getItem(LS_NAME_KEY);
      if (savedPhone) setPhone(savedPhone);
      if (savedName) setName(savedName);
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearTimeout(pollRef.current);
  }, []);

  const pollPaymentStatus = useCallback(
    async (orderId: string, count: number) => {
      if (count >= MAX_POLLS) {
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

  async function handleApplyCoupon() {
    if (!couponCode.trim()) return;
    setCouponStatus('applying');
    setCouponMessage('');
    try {
      const res = await api.coupons.apply(couponCode.trim(), subtotal);
      setDiscountAmount(res.discountAmount);
      setCouponStatus('applied');
      setCouponMessage(`✓ Coupon applied! You save KSh ${res.discountAmount.toLocaleString('en-KE')}`);
    } catch (e) {
      setCouponStatus('error');
      setCouponMessage(e instanceof Error ? e.message : 'Invalid coupon code');
      setDiscountAmount(0);
    }
  }

  function handleRemoveCoupon() {
    setCouponCode('');
    setCouponStatus('idle');
    setCouponMessage('');
    setDiscountAmount(0);
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

    // Save to localStorage for next time
    if (typeof window !== 'undefined') {
      localStorage.setItem(LS_PHONE_KEY, phone);
      if (name) localStorage.setItem(LS_NAME_KEY, name);
    }

    setLoading(true);
    try {
      const orderRes = await api.orders.create({
        customerName: name || undefined,
        customerPhone: formatted,
        notes: notes.trim() || undefined,
        couponCode: couponStatus === 'applied' ? couponCode.trim() : undefined,
        items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      });
      setOrder(orderRes.order);

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

  const orderTotal = subtotal - discountAmount;

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
        <p className="mb-2 text-sm text-gray-500">1. Open M-Pesa on your phone</p>
        <p className="mb-2 text-sm text-gray-500">2. Enter your M-Pesa PIN when prompted</p>
        <p className="mb-4 text-sm text-gray-500">3. Wait for confirmation SMS</p>
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

              <div>
                <label htmlFor="delivery-notes" className="mb-1 block text-sm font-medium text-gray-700">
                  Delivery Location &amp; Notes (optional)
                </label>
                <textarea
                  id="delivery-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="e.g. Westlands, Delta Towers — call when you arrive"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Where should we deliver? Landmarks and directions help us reach you faster.
                </p>
              </div>

              {/* Coupon code */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Coupon Code (optional)
                </label>
                {couponStatus === 'applied' ? (
                  <div className="flex items-center gap-2">
                    <span className="flex-1 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700">
                      {couponCode.toUpperCase()}
                    </span>
                    <button
                      type="button"
                      onClick={handleRemoveCoupon}
                      className="text-sm text-red-500 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      placeholder="SAVE10"
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={handleApplyCoupon}
                      disabled={couponStatus === 'applying' || !couponCode.trim()}
                      className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                    >
                      {couponStatus === 'applying' ? '...' : 'Apply'}
                    </button>
                  </div>
                )}
                {couponMessage && (
                  <p className={`mt-1 text-xs ${couponStatus === 'applied' ? 'text-green-600' : 'text-red-500'}`}>
                    {couponMessage}
                  </p>
                )}
              </div>

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
            {discountAmount > 0 && (
              <>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Subtotal</span>
                  <span>KSh {subtotal.toLocaleString('en-KE')}</span>
                </div>
                <div className="flex justify-between text-sm text-green-600 font-medium">
                  <span>Coupon discount</span>
                  <span>- KSh {discountAmount.toLocaleString('en-KE')}</span>
                </div>
              </>
            )}
            <div className="border-t border-gray-100 pt-3 mt-3 flex justify-between text-base font-bold text-gray-900">
              <span>Total</span>
              <span>KSh {orderTotal.toLocaleString('en-KE')}</span>
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

