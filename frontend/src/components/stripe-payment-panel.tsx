'use client';

import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, errorMessage } from '@/lib/api';
import type { HotelBooking, PaymentStart } from '@/lib/hotel-types';
import type { FormEvent } from 'react';

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

export function StripePaymentPanel({
  payment,
  bookingId,
  expiresAt,
  onConfirmed,
}: {
  payment: PaymentStart;
  bookingId: string;
  expiresAt: string;
  onConfirmed?: (booking: HotelBooking) => void | Promise<void>;
}) {
  if (!stripePromise) {
    return (
      <div className="error-state" role="alert">
        Stripe checkout is not configured. Add the test publishable key as
        {' '}<code>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> to <code>frontend/.env.local</code>,
        then restart the frontend. The room hold expires automatically if payment is not completed.
      </div>
    );
  }

  return (
    <Elements
      key={payment.clientSecret}
      stripe={stripePromise}
      options={{ clientSecret: payment.clientSecret, appearance: { theme: 'stripe' } }}
    >
      <StripePaymentForm
        paymentId={payment.paymentId}
        bookingId={bookingId}
        expiresAt={expiresAt}
        onConfirmed={onConfirmed}
      />
    </Elements>
  );
}

function StripePaymentForm({
  paymentId,
  bookingId,
  expiresAt,
  onConfirmed,
}: {
  paymentId: string;
  bookingId: string;
  expiresAt: string;
  onConfirmed?: (booking: HotelBooking) => void | Promise<void>;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState('');
  const [now, setNow] = useState<number | null>(null);
  const expiresAtMs = new Date(expiresAt).getTime();
  const secondsRemaining =
    now === null ? null : Math.max(0, Math.floor((expiresAtMs - now) / 1000));

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function pay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stripe || !elements || secondsRemaining === null || secondsRemaining <= 0) return;
    setProcessing(true);
    setMessage('');
    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/my-reservations/${bookingId}`,
        },
        redirect: 'if_required',
      });
      if (result.error) {
        setMessage(result.error.message ?? 'Payment could not be completed. You can try again while the hold is active.');
        return;
      }

      setMessage('Payment submitted. Waiting for the booking service to confirm it…');
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const paymentStatus = await api<{ status: string }>(
          `/payments/${encodeURIComponent(paymentId)}`,
        );
        if (paymentStatus.status === 'failed' || paymentStatus.status === 'canceled') {
          setMessage('Payment was not completed. Check your reservation status before trying again.');
          return;
        }
        if (paymentStatus.status === 'succeeded') {
          const booking = await api<HotelBooking>(
            `/hotel-bookings/${encodeURIComponent(bookingId)}`,
          );
          if (booking.status === 'confirmed' || booking.status === 'completed') {
            await onConfirmed?.(booking);
            router.replace(`/my-reservations/${bookingId}`);
            return;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      setMessage('Payment is still processing. Check My reservations for the latest status.');
    } catch (cause) {
      setMessage(errorMessage(cause));
    } finally {
      setProcessing(false);
    }
  }

  const countdown =
    secondsRemaining === null
      ? 'Checking hold…'
      : `${String(Math.floor(secondsRemaining / 60)).padStart(2, '0')}:${String(secondsRemaining % 60).padStart(2, '0')}`;

  return (
    <form className="payment-form" onSubmit={pay}>
      <div className={`hold-countdown${secondsRemaining === 0 ? ' hold-expired' : ''}`} role="timer">
        {secondsRemaining === 0 ? 'Room hold expired' : `Room hold expires in ${countdown}`}
      </div>
      <PaymentElement />
      {message && <p className="payment-message" role="status">{message}</p>}
      <button className="button button-dark button-full" disabled={!stripe || !elements || processing || secondsRemaining === null || secondsRemaining === 0}>
        {processing ? 'Processing securely…' : 'Pay now'}
      </button>
    </form>
  );
}
