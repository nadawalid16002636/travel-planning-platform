'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/app-shell';
import { StripePaymentPanel } from '@/components/stripe-payment-panel';
import { api, errorMessage } from '@/lib/api';
import type { Hotel, HotelBooking, HotelReview, PaymentStart } from '@/lib/hotel-types';
import { hotelIdOf, hotelNameOf } from '@/lib/hotel-types';
import type { FormEvent } from 'react';

interface CancellationQuote {
  bookingId: string;
  eligible: boolean;
  daysRemaining: number;
  refundPercent: number;
  refundAmount: number;
  currency: string;
}

interface RefundResult {
  id: string;
  status: string;
  amount: number;
  currency: string;
}

export default function ReservationDetailsPage() {
  return (
    <Suspense fallback={<main className="page-width page-pad loading-state">Loading reservation…</main>}>
      <ReservationDetailsContent />
    </Suspense>
  );
}

function ReservationDetailsContent() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const bookingId = params.id;
  const [booking, setBooking] = useState<HotelBooking | null>(null);
  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [quote, setQuote] = useState<CancellationQuote | null>(null);
  const [refund, setRefund] = useState<RefundResult | null>(null);
  const [review, setReview] = useState<HotelReview | null>(null);
  const [paymentStart, setPaymentStart] = useState<PaymentStart | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace(`/login?next=${encodeURIComponent(`/my-reservations/${bookingId}`)}`);
    }
  }, [authLoading, user, router, bookingId]);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    api<HotelBooking>(`/hotel-bookings/${encodeURIComponent(bookingId)}`, {
      signal: controller.signal,
    })
      .then(async (record) => {
        setBooking(record);
        const hotelId = hotelIdOf(record);
        const detail = api<Hotel>(`/hotels/${encodeURIComponent(hotelId)}`, { signal: controller.signal });
        const ownReviewRequest = api<HotelReview | null>(
          `/hotel-bookings/${encodeURIComponent(record._id)}/review`,
          { signal: controller.signal },
        );
        const results = await Promise.all([detail, ownReviewRequest]);
        setHotel(results[0]);
        const ownReview = results[1];
        if (ownReview) {
          setReview(ownReview);
          setRating(ownReview.rating);
          setComment(ownReview.comment ?? '');
        }
        if (record.status === 'confirmed') {
          const cancellation = await api<CancellationQuote>(
            `/hotel-bookings/${encodeURIComponent(bookingId)}/cancellation-quote`,
            { signal: controller.signal },
          );
          setQuote(cancellation);
        }
        if (record.refundId) {
          const refundStatus = await api<RefundResult>(
            `/refunds/${encodeURIComponent(record.refundId)}`,
            { signal: controller.signal },
          );
          setRefund(refundStatus);
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [bookingId, user]);

  async function cancelReservation() {
    if (!confirmCancel) {
      setError('Confirm that you understand the full reservation will be cancelled.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const updated = await api<HotelBooking>(`/hotel-bookings/${encodeURIComponent(bookingId)}/cancel`, {
        method: 'POST',
      });
      setBooking(updated);
      setNotice('Your reservation has been cancelled.');
      if (updated.refundId) {
        const refundStatus = await api<RefundResult>(`/refunds/${encodeURIComponent(updated.refundId)}`);
        setRefund(refundStatus);
      }
      setQuote(null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  async function resumePayment() {
    if (!booking?.paymentId) return;
    setError('');
    setSubmitting(true);
    try {
      const payment = await api<PaymentStart>(
        `/payments/${encodeURIComponent(booking.paymentId)}/retry`,
        { method: 'POST' },
      );
      setPaymentStart(payment);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    setSubmitting(true);
    try {
      const body = { rating, comment };
      const saved = review
        ? await api<HotelReview>(`/reviews/${encodeURIComponent(review._id)}`, {
            method: 'PATCH',
            body: JSON.stringify(body),
          })
        : await api<HotelReview>(`/hotel-bookings/${encodeURIComponent(bookingId)}/review`, {
            method: 'POST',
            body: JSON.stringify(body),
          });
      setReview(saved);
      setNotice(review ? 'Your review has been updated.' : 'Thank you for sharing your stay.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteReview() {
    if (!review) return;
    setError('');
    setNotice('');
    setSubmitting(true);
    try {
      await api(`/reviews/${encodeURIComponent(review._id)}`, { method: 'DELETE' });
      setReview(null);
      setRating(5);
      setComment('');
      setNotice('Your review has been deleted.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || loading || !user) {
    return <main className="page-width page-pad loading-state">Loading reservation details…</main>;
  }
  if (error && !booking) {
    return (
      <main className="page-width page-pad">
        <div className="error-state" role="alert">Couldn’t load this reservation: {error}</div>
        <p><Link className="button-link" href="/my-reservations">← My reservations</Link></p>
      </main>
    );
  }
  if (!booking) return null;

  const money = (amount: number, currency = booking.currency) =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);

  return (
    <main className="page-width page-pad">
      <Link className="button-link" href="/my-reservations">← My reservations</Link>
      <div className="section-heading-row" style={{ marginTop: 18 }}>
        <div>
          <p className="eyebrow">{booking.reference ?? 'Reservation details'}</p>
          <h1 className="page-heading">{hotel?.name ?? hotelNameOf(booking)}</h1>
          <p className="page-subheading">
            {new Date(booking.checkIn).toLocaleDateString()} – {new Date(booking.checkOut).toLocaleDateString()}
            {' · '}{booking.nights} {booking.nights === 1 ? 'night' : 'nights'}
          </p>
        </div>
        <span className={`status-pill ${booking.status}`}>{booking.status.replaceAll('_', ' ')}</span>
      </div>
      {notice && <div className="confirmation-panel" role="status" style={{ marginBottom: 16 }}>{notice}</div>}
      {error && <div className="error-state" role="alert" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="booking-layout">
        <div className="booking-main">
          <section className="content-card">
            <h2>Rooms and guests</h2>
            {booking.rooms.map((room) => (
              <div className="booking-room-form" key={room.roomId}>
                <div className="booking-room-heading">
                  <h3>{room.roomName}</h3>
                  <strong>{money(room.pricePerNight)}/night</strong>
                </div>
                <div className="room-details">
                  <span>{room.adults} {room.adults === 1 ? 'adult' : 'adults'}</span>
                  <span>{room.childrenAges.length} {room.childrenAges.length === 1 ? 'child' : 'children'}</span>
                  {room.childrenAges.map((age, index) => <span key={index}>Child age {age}</span>)}
                </div>
              </div>
            ))}
          </section>

          <section className="content-card">
            <h2>Hotel policies</h2>
            <div className="policy-line"><span>Check in</span><strong>{booking.policySnapshot.checkInTime}</strong></div>
            <div className="policy-line"><span>Check out</span><strong>{booking.policySnapshot.checkOutTime}</strong></div>
            {booking.policySnapshot.cancellationTiers.map((tier) => (
              <div className="policy-line" key={tier.daysBeforeCheckIn}>
                <span>{tier.daysBeforeCheckIn}+ days before check-in</span>
                <strong>{tier.refundPercent}% refund</strong>
              </div>
            ))}
          </section>

          {quote?.eligible && (
            <section className="content-card">
              <h2>Cancellation and refund</h2>
              <div className="policy-line"><span>Refund estimate</span><strong>{money(quote.refundAmount, quote.currency)} ({quote.refundPercent}%)</strong></div>
              <p className="form-note">The refund is calculated from the full reservation total using the hotel’s cancellation terms.</p>
              <label className="policy-check">
                <input type="checkbox" checked={confirmCancel} onChange={(event) => setConfirmCancel(event.target.checked)} />
                <span>I understand this will cancel every room in this reservation.</span>
              </label>
              <button className="button button-outline" disabled={!confirmCancel || submitting} onClick={cancelReservation} style={{ marginTop: 14 }}>
                {submitting ? 'Cancelling…' : 'Cancel full reservation'}
              </button>
            </section>
          )}

          {refund && (
            <section className="content-card">
              <h2>Refund status</h2>
              <div className="policy-line"><span>Status</span><strong>{refund.status}</strong></div>
              <div className="policy-line"><span>Amount</span><strong>{money(refund.amount, refund.currency)}</strong></div>
            </section>
          )}

          {booking.status === 'completed' && (
            <section className="content-card">
              <h2>{review ? 'Your review' : 'How was your stay?'}</h2>
              <p className="form-note">Share one review for your completed reservation. You can edit or remove it later.</p>
              <form className="login-form" onSubmit={submitReview}>
                <label className="control-label">
                  Your rating
                  <select className="select-input" value={rating} onChange={(event) => setRating(Number(event.target.value))}>
                    {[5, 4, 3, 2, 1].map((value) => <option value={value} key={value}>{value} {value === 1 ? 'star' : 'stars'}</option>)}
                  </select>
                </label>
                <label className="control-label">
                  A few words (optional)
                  <textarea className="text-area" maxLength={1000} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="What made the stay memorable?" />
                  <span className="form-note">{comment.length}/1000</span>
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  <button className="button button-dark" disabled={submitting}>{review ? 'Save changes' : 'Submit review'}</button>
                  {review && <button className="button button-outline" type="button" disabled={submitting} onClick={deleteReview}>Delete review</button>}
                </div>
              </form>
            </section>
          )}
        </div>
        <aside className="sidebar-card booking-sidebar">
          <h3>Reservation summary</h3>
          <div className="policy-line"><span>Reference</span><strong>{booking.reference ?? 'Pending'}</strong></div>
          <div className="policy-line"><span>Rooms</span><strong>{booking.rooms.length}</strong></div>
          <div className="policy-line"><span>Guests</span><strong>{booking.rooms.reduce((sum, room) => sum + room.adults + room.childrenAges.length, 0)}</strong></div>
          <div className="policy-line"><span>Payment</span><strong>{booking.status === 'pending_payment' ? 'Awaiting payment' : booking.status === 'confirmed' || booking.status === 'completed' ? 'Paid' : booking.status.replaceAll('_', ' ')}</strong></div>
          <div className="price-breakdown">
            <div className="price-total"><span>Total</span><strong>{money(booking.totalAmount)}</strong></div>
          </div>
          {booking.status === 'pending_payment' && (
            <div className="payment-area">
              <p className="form-note">Payment is still pending. If you have just paid, allow a moment for secure confirmation.</p>
              {paymentStart ? (
                <StripePaymentPanel
                  payment={paymentStart}
                  bookingId={booking._id}
                  expiresAt={booking.holdExpiresAt}
                  onConfirmed={setBooking}
                />
              ) : (
                <button className="button button-dark button-full" disabled={!booking.paymentId || submitting} onClick={resumePayment} style={{ marginTop: 12 }}>
                  {submitting ? 'Preparing secure payment…' : 'Continue payment'}
                </button>
              )}
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
