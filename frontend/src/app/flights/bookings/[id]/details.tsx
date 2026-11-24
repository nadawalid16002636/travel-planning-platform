"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { price } from "../../api";
import {
  BookingApiError,
  bookingApi,
  errorMessage,
  signInUrl,
  type Booking,
} from "../../booking-api";
import { BookingSummary, Policies } from "../../booking-summary";
import { Countdown, useRemaining } from "../../checkout/countdown";
import { Payment } from "./payment";

type Quote = { refundDueMinor: number; currency: string };

export function BookingDetails({
  id,
  paymentReturn,
  redirectStatus,
}: {
  id: string;
  paymentReturn: boolean;
  redirectStatus?: string;
}) {
  const path = "flight-bookings/" + id;
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState(() =>
    paymentReturn && redirectStatus === "failed"
      ? "The payment could not be completed. You can retry while the hold is active."
      : "",
  );
  const [unauthorized, setUnauthorized] = useState(false);
  const [attempt, retry] = useState(0);
  const [verifying, setVerifying] = useState(
    paymentReturn && redirectStatus !== "failed",
  );
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = booking?.status === "pending-payment";
  const confirmed = booking?.status === "confirmed";
  const remaining = useRemaining(
    pending ? booking.paymentExpiresAt : undefined,
  );
  const departureRemaining = useRemaining(
    confirmed ? booking.legs[0]?.departureAt : undefined,
  );

  useEffect(() => {
    if (!paymentReturn) return;
    const url = new URL(window.location.href);
    window.history.replaceState(window.history.state, "", url.pathname);
  }, [paymentReturn]);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        setBooking(
          await bookingApi<Booking>(path, undefined, controller.signal),
        );
      } catch (error) {
        if (controller.signal.aborted) return;
        setUnauthorized(
          error instanceof BookingApiError && error.status === 401,
        );
        setError(errorMessage(error));
      }
    }
    void load();
    return () => controller.abort();
  }, [path, attempt]);

  useEffect(() => {
    if (!pending && booking?.refundState !== "requested") return;
    const controller = new AbortController();
    let timer: number;
    async function poll() {
      try {
        const latest = await bookingApi<Booking>(
          path,
          undefined,
          controller.signal,
        );
        setBooking(latest);
        if (
          latest.status !== "pending-payment" &&
          latest.refundState !== "requested"
        )
          return;
      } catch (error) {
        if (controller.signal.aborted) return;
        setError(errorMessage(error));
        setUnauthorized(
          error instanceof BookingApiError && error.status === 401,
        );
        return;
      }
      if (!controller.signal.aborted)
        timer = window.setTimeout(poll, verifying ? 2500 : 7000);
    }
    timer = window.setTimeout(poll, verifying ? 1000 : 7000);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [path, pending, verifying, booking?.refundState, attempt]);

  async function cancellation(confirm: boolean) {
    setBusy(true);
    setError("");
    try {
      if (confirm) {
        setBooking(
          await bookingApi<Booking>(path + "/cancel", { confirmed: true }),
        );
        setQuote(null);
      } else setQuote(await bookingApi<Quote>(path + "/cancellation-quote"));
    } catch (error) {
      if (confirm) setQuote(null);
      setUnauthorized(error instanceof BookingApiError && error.status === 401);
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const canCancel =
    confirmed && departureRemaining !== null && departureRemaining > 0;
  return (
    <>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {unauthorized && (
        <Link href={signInUrl("/flights/bookings/" + id)}>Sign in</Link>
      )}
      {!booking && !error && <p role="status">Loading booking…</p>}
      {error && !unauthorized && (
        <button
          onClick={() => {
            setError("");
            retry(attempt + 1);
          }}
        >
          Refresh booking
        </button>
      )}
      {booking && (
        <>
          <section className="panel">
            <p className="status">{booking.status.replaceAll("-", " ")}</p>
            {(confirmed ||
              booking.status === "completed" ||
              booking.status === "cancelled") && (
              <p>
                Booking reference <strong>{booking.reference}</strong>
              </p>
            )}
            {pending && <Countdown seconds={remaining} />}
            {booking.status === "cancelled" && (
              <p>
                Refund {price(booking.refundDueMinor ?? 0, booking.currency)} ·{" "}
                {booking.refundState === "requested"
                  ? "processing"
                  : booking.refundState || "none"}
              </p>
            )}
            {booking.status === "expired" && (
              <Link href="/flights">Search for another flight</Link>
            )}
          </section>
          <BookingSummary booking={booking} />
          <Policies legs={booking.legs} />
          <p>
            Policies accepted{" "}
            {new Date(booking.acceptedPoliciesAt).toLocaleString()}
          </p>
          {pending &&
            remaining !== 0 &&
            (verifying ? (
              <section className="panel stack">
                <p role="status">
                  Waiting for the payment provider to verify your booking.
                </p>
                <button onClick={() => setVerifying(false)}>
                  Return to payment
                </button>
              </section>
            ) : (
              <Payment bookingId={id} onSubmitted={() => setVerifying(true)} />
            ))}
          {(confirmed || booking.status === "completed") && (
            <p>
              <a className="button" href={"/travel-api/" + path + "/e-ticket"}>
                Download PDF e-ticket
              </a>
            </p>
          )}
          {canCancel && (
            <section className="panel stack">
              <h2>Cancel this booking</h2>
              {quote ? (
                <>
                  <p role="status">
                    Estimated refund{" "}
                    <strong>
                      {price(quote.refundDueMinor, quote.currency)}
                    </strong>
                  </p>
                  <p>
                    Confirming cancels{" "}
                    {booking.legs.length > 1 ? "both flights" : "this flight"}{" "}
                    for every passenger. The refund is calculated again when you
                    confirm.
                  </p>
                  <div className="actions">
                    <button
                      className="danger"
                      disabled={busy}
                      onClick={() => cancellation(true)}
                    >
                      {busy ? "Cancelling…" : "Confirm cancellation"}
                    </button>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => setQuote(null)}
                    >
                      Keep booking
                    </button>
                  </div>
                </>
              ) : (
                <button disabled={busy} onClick={() => cancellation(false)}>
                  {busy ? "Loading refund…" : "Preview refund"}
                </button>
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}
