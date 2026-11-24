'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/app-shell';
import { StripePaymentPanel } from '@/components/stripe-payment-panel';
import { api, errorMessage } from '@/lib/api';
import type { Hotel, HotelBooking, PaymentStart } from '@/lib/hotel-types';
import type { FormEvent } from 'react';

interface RoomGuests {
  adults: number;
  childrenAges: number[];
}

interface BookingResponse {
  booking: HotelBooking;
  payment: PaymentStart;
}

export default function HotelBookingRoute() {
  return (
    <Suspense fallback={<div className="page-width page-pad loading-state">Preparing your booking…</div>}>
      <HotelBookingPage />
    </Suspense>
  );
}

function HotelBookingPage() {
  const searchParams = useSearchParams();
  const routeParams = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const hotelId = routeParams.id;
  const query = searchParams.toString();
  const search = useMemo(() => new URLSearchParams(query), [query]);
  const roomIdsKey = search.getAll('roomId').join('|');
  const roomIds = roomIdsKey ? roomIdsKey.split('|') : [];
  const checkIn = search.get('checkIn') ?? '';
  const checkOut = search.get('checkOut') ?? '';
  const guestsCount = Number(search.get('guests') ?? 1);
  const invalidRequest = !checkIn || !checkOut || !roomIds.length;
  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [guestState, setGuestState] = useState<Record<string, RoomGuests>>({});
  const [accepted, setAccepted] = useState(false);
  const [bookingResult, setBookingResult] = useState<BookingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && !user) {
      const currentPath = `${window.location.pathname}${window.location.search}`;
      router.replace(`/login?next=${encodeURIComponent(currentPath)}`);
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (invalidRequest) return;
    const controller = new AbortController();
    const selectedRoomIds = roomIdsKey ? roomIdsKey.split('|') : [];
    const queryParams = new URLSearchParams({ checkIn, checkOut, guests: '1' });
    api<Hotel>(`/hotels/${encodeURIComponent(hotelId)}?${queryParams.toString()}`, {
      signal: controller.signal,
    })
      .then((record) => {
        setHotel(record);
        const selectedRooms = (record.rooms ?? []).filter((room) => selectedRoomIds.includes(room._id));
        if (selectedRooms.length !== selectedRoomIds.length) {
          setError('One or more selected rooms are no longer available. Return to the hotel page and choose again.');
        }
        setGuestState(
          Object.fromEntries(
            selectedRooms.map((room) => [room._id, { adults: 1, childrenAges: [] }]),
          ),
        );
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [checkIn, checkOut, guestsCount, hotelId, invalidRequest, roomIdsKey]);

  const selectedRooms = (hotel?.rooms ?? []).filter((room) => roomIds.includes(room._id));
  const nights = Math.max(
    1,
    (new Date(`${checkOut}T00:00:00`).getTime() -
      new Date(`${checkIn}T00:00:00`).getTime()) /
      86_400_000,
  );
  const total = selectedRooms.reduce(
    (sum, room) => sum + room.pricePerNight * nights,
    0,
  );
  const adults = Object.values(guestState).reduce((sum, item) => sum + item.adults, 0);
  const currency = selectedRooms[0]?.currency ?? 'USD';
  const money = (amount: number) =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);

  function updateGuests(roomId: string, next: RoomGuests) {
    setGuestState((current) => ({ ...current, [roomId]: next }));
  }

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!user) {
      const currentPath = `${window.location.pathname}${window.location.search}`;
      router.push(`/login?next=${encodeURIComponent(currentPath)}`);
      return;
    }
    if (!accepted) {
      setError('Please accept the hotel policies before continuing to payment.');
      return;
    }
    if (adults < 1) {
      setError('At least one adult is required for the reservation.');
      return;
    }
    const assignedGuests = Object.values(guestState).reduce(
      (sum, room) => sum + room.adults + room.childrenAges.length,
      0,
    );
    if (assignedGuests !== guestsCount) {
      setError(`Assign all ${guestsCount} searched guests to the selected rooms before continuing.`);
      return;
    }
    const rooms = selectedRooms.map((room) => {
      const selection = guestState[room._id];
      return {
        roomId: room._id,
        adults: selection?.adults ?? 0,
        childrenAges: selection?.childrenAges ?? [],
      };
    });
    const overCapacity = selectedRooms.find((room) => {
      const selection = guestState[room._id];
      return selection && selection.adults + selection.childrenAges.length > room.maxOccupancy;
    });
    if (overCapacity) {
      setError(`${overCapacity.name} does not have enough capacity for the guests assigned to it.`);
      return;
    }

    setSubmitting(true);
    try {
      const result = await api<BookingResponse>('/hotel-bookings', {
        method: 'POST',
        body: JSON.stringify({
          hotelId,
          checkIn,
          checkOut,
          rooms,
          acceptPolicies: true,
        }),
      });
      setBookingResult(result);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || loading && !invalidRequest) {
    return <main className="page-width page-pad loading-state">Checking your booking details…</main>;
  }
  if (!user) return <main className="page-width page-pad loading-state">Taking you to sign in…</main>;
  if (invalidRequest) {
    return (
      <main className="page-width page-pad">
        <div className="error-state" role="alert">Choose stay dates and at least one available room before booking.</div>
        <p><Link className="button-link" href={`/hotels/${hotelId}`}>Return to hotel details</Link></p>
      </main>
    );
  }
  if (!hotel || error && !selectedRooms.length) {
    return (
      <main className="page-width page-pad">
        <div className="error-state" role="alert">{error || 'Hotel or rooms are unavailable.'}</div>
        <p><Link className="button-link" href={`/hotels/${hotelId}`}>Return to hotel details</Link></p>
      </main>
    );
  }

  if (bookingResult) {
    return (
      <main className="page-width page-pad">
        <Link className="button-link" href={`/hotels/${hotelId}`}>← Back to {hotel.name}</Link>
        <div className="booking-layout">
          <section className="content-card">
            <p className="eyebrow">Almost there</p>
            <h1 className="page-heading" style={{ fontSize: 36 }}>Complete your payment</h1>
            <p className="page-subheading">
              Your rooms are held for a limited time. Your reservation is confirmed only after the payment service verifies the payment.
            </p>
            <div className="payment-area">
              <StripePaymentPanel
                payment={bookingResult.payment}
                bookingId={bookingResult.booking._id}
                expiresAt={bookingResult.booking.holdExpiresAt}
              />
            </div>
          </section>
          <aside className="sidebar-card booking-sidebar">
            <h3>Reservation summary</h3>
            <p className="form-note">{hotel.name}</p>
            <div className="policy-line"><span>Dates</span><strong>{checkIn} – {checkOut}</strong></div>
            <div className="policy-line"><span>Rooms</span><strong>{selectedRooms.length}</strong></div>
            <div className="price-breakdown">
              {selectedRooms.map((room) => (
                <div key={room._id}><span>{room.name} · {nights} nights</span><strong>{money(room.pricePerNight * nights)}</strong></div>
              ))}
              <div className="price-total"><span>Total</span><strong>{money(total)}</strong></div>
            </div>
            <p className="form-note">Hold expires: {new Date(bookingResult.booking.holdExpiresAt).toLocaleTimeString()}</p>
          </aside>
        </div>
      </main>
    );
  }

  return (
    <main className="page-width page-pad">
      <Link className="button-link" href={`/hotels/${hotelId}?${query}`}>← Back to rooms</Link>
      <p className="eyebrow" style={{ marginTop: 18 }}>Your stay, your way</p>
      <h1 className="page-heading">Review your booking.</h1>
      <p className="page-subheading">Add guests to each room and review the hotel policies before checkout.</p>
      <form className="booking-layout" onSubmit={submitBooking}>
        <div className="booking-main">
          <section className="content-card">
            <p className="eyebrow">Guests and rooms</p>
            <h2 style={{ margin: '5px 0 18px', fontFamily: 'Georgia, serif', fontWeight: 500 }}>{hotel.name}</h2>
            <p className="form-note">{checkIn} – {checkOut} · {nights} {nights === 1 ? 'night' : 'nights'} · {guestsCount} guests in your search</p>
            {selectedRooms.map((room) => {
              const selection = guestState[room._id] ?? { adults: 1, childrenAges: [] };
              const assigned = selection.adults + selection.childrenAges.length;
              return (
                <div className="booking-room-form" key={room._id}>
                  <div className="booking-room-heading">
                    <h3>{room.name}</h3>
                    <span className="form-note">Maximum {room.maxOccupancy} guests</span>
                  </div>
                  <div className="booking-room-fields">
                    <div className="control-label">
                      Adults
                      <div className="guest-counter">
                        <button type="button" aria-label={`Remove adult from ${room.name}`} disabled={selection.adults <= 0} onClick={() => updateGuests(room._id, { ...selection, adults: selection.adults - 1 })}>−</button>
                        <span>{selection.adults}</span>
                        <button type="button" aria-label={`Add adult to ${room.name}`} disabled={assigned >= room.maxOccupancy} onClick={() => updateGuests(room._id, { ...selection, adults: selection.adults + 1 })}>+</button>
                      </div>
                    </div>
                    <label className="control-label">
                      Children
                      <select
                        className="select-input"
                        value={selection.childrenAges.length}
                        onChange={(event) => {
                          const count = Number(event.target.value);
                          const childrenAges = selection.childrenAges.slice(0, count);
                          while (childrenAges.length < count) childrenAges.push(8);
                          updateGuests(room._id, { ...selection, childrenAges });
                        }}
                      >
                        {Array.from({ length: Math.min(8, room.maxOccupancy - selection.adults) + 1 }, (_, index) => (
                          <option key={index} value={index}>{index} {index === 1 ? 'child' : 'children'}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {selection.childrenAges.map((age, index) => (
                    <label className="control-label" key={`${room._id}-child-${index}`} style={{ marginTop: 10 }}>
                      Child {index + 1} age
                      <select
                        className="select-input"
                        value={age}
                        onChange={(event) => {
                          const childrenAges = [...selection.childrenAges];
                          childrenAges[index] = Number(event.target.value);
                          updateGuests(room._id, { ...selection, childrenAges });
                        }}
                      >
                        {Array.from({ length: 18 }, (_, childAge) => (
                          <option key={childAge} value={childAge}>{childAge} years</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              );
            })}
          </section>
          <section className="content-card">
            <p className="eyebrow">The important details</p>
            <h2 style={{ margin: '5px 0 15px', fontFamily: 'Georgia, serif', fontWeight: 500 }}>Hotel policies</h2>
            <div className="policy-line"><span>Check-in time</span><strong>{hotel.policy?.checkInTime ?? '15:00'}</strong></div>
            <div className="policy-line"><span>Check-out time</span><strong>{hotel.policy?.checkOutTime ?? '11:00'}</strong></div>
            <h3 style={{ marginTop: 20 }}>Cancellation terms</h3>
            {hotel.policy?.cancellationTiers?.length ? hotel.policy.cancellationTiers.map((tier) => (
              <div className="policy-line" key={tier.daysBeforeCheckIn}>
                <span>{tier.daysBeforeCheckIn} days before check-in</span>
                <strong>{tier.refundPercent}% refund</strong>
              </div>
            )) : <p className="form-note">No refund tier is listed for this stay.</p>}
            <label className="policy-check">
              <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
              <span>I have read and accept the hotel policies and cancellation terms.</span>
            </label>
          </section>
          {error && <div className="error-state" role="alert">{error}</div>}
        </div>
        <aside className="sidebar-card booking-sidebar">
          <h3>Price summary</h3>
          <p className="form-note">{hotel.name} · {checkIn} – {checkOut}</p>
          <div className="price-breakdown">
            {selectedRooms.map((room) => (
              <div key={room._id}>
                <span>{room.name} · {nights} nights</span>
                <strong>{money(room.pricePerNight * nights)}</strong>
              </div>
            ))}
            <div className="price-total"><span>Total</span><strong>{money(total)}</strong></div>
          </div>
          <p className="form-note">The room price is locked when your 10-minute hold begins.</p>
          <button className="button button-dark button-full" disabled={submitting || !accepted || !selectedRooms.length} style={{ marginTop: 17 }}>
            {submitting ? 'Holding your rooms…' : 'Reserve and continue to payment'}
          </button>
          <p className="form-note" style={{ textAlign: 'center' }}>Secure payment powered by Stripe</p>
        </aside>
      </form>
    </main>
  );
}
