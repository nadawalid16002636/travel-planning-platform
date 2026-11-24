"use client";

import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useState, type FormEvent } from "react";
import {
  bookingApi,
  errorMessage,
  type PaymentIntent,
} from "../../booking-api";

const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = key?.startsWith("pk_test_") ? loadStripe(key) : null;

function PaymentForm({
  bookingId,
  intent,
  onSubmitted,
  onRetry,
}: {
  bookingId: string;
  intent: PaymentIntent;
  onSubmitted: () => void;
  onRetry: (intent: PaymentIntent) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState("");
  const [needsRetry, setNeedsRetry] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError("");
    try {
      if (needsRetry)
        await onRetry(
          await bookingApi<PaymentIntent>(
            "payments/" + encodeURIComponent(intent.paymentId) + "/retry",
            {},
          ),
        );
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url:
            window.location.origin +
            "/flights/bookings/" +
            bookingId +
            "?payment=return",
        },
        redirect: "if_required",
      });
      if (result.error) {
        setNeedsRetry(true);
        setError(
          result.error.message ||
            "Payment failed. Try again before the hold expires.",
        );
      } else {
        onSubmitted();
      }
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <PaymentElement
        onLoadError={(event) =>
          setError(event.error.message ?? "Payment form could not load.")
        }
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button disabled={!stripe || !elements || busy}>
        {busy ? "Submitting…" : needsRetry ? "Retry payment" : "Pay now"}
      </button>
    </form>
  );
}

export function Payment({
  bookingId,
  onSubmitted,
}: {
  bookingId: string;
  onSubmitted: () => void;
}) {
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function start() {
    setBusy(true);
    setError("");
    try {
      setIntent(
        await bookingApi<PaymentIntent>("payments", {
          bookingType: "flight",
          bookingId,
        }),
      );
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel stack">
      <h2>Payment</h2>
      {!stripePromise ? (
        <p role="status">
          Stripe test checkout requires a publishable test key.
        </p>
      ) : intent ? (
        <Elements
          key={intent.clientSecret}
          stripe={stripePromise}
          options={{ clientSecret: intent.clientSecret }}
        >
          <PaymentForm
            bookingId={bookingId}
            intent={intent}
            onSubmitted={onSubmitted}
            onRetry={(next) => {
              if (next.clientSecret !== intent.clientSecret) setIntent(next);
            }}
          />
        </Elements>
      ) : (
        <button onClick={start} disabled={busy}>
          {busy ? "Loading payment…" : "Open secure payment"}
        </button>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
