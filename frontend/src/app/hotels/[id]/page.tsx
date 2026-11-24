'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { api, errorMessage } from '@/lib/api';
import { safeImageUrl, type Hotel, type HotelReview, type PageResult } from '@/lib/hotel-types';
import { useTodayString } from '@/lib/use-today';

export default function HotelDetailsRoute() {
  return (
    <Suspense fallback={<div className="page-width page-pad loading-state">Loading stay details…</div>}>
      <HotelDetailsPage />
    </Suspense>
  );
}

function HotelDetailsPage() {
  const params = useSearchParams();
  const routeParams = useParams<{ id: string }>();
  const router = useRouter();
  const today = useTodayString();
  const query = params.toString();
  const search = useMemo(() => new URLSearchParams(query), [query]);
  const hotelId = routeParams.id;
  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [reviews, setReviews] = useState<HotelReview[]>([]);
  const [reviewTotal, setReviewTotal] = useState(0);
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewError, setReviewError] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [checkIn, setCheckIn] = useState(search.get('checkIn') ?? '');
  const [checkOut, setCheckOut] = useState(search.get('checkOut') ?? '');
  const [guests, setGuests] = useState(Number(search.get('guests') ?? 2));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateError, setDateError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const detailParams = new URLSearchParams();
    if (search.get('checkIn')) detailParams.set('checkIn', search.get('checkIn')!);
    if (search.get('checkOut')) detailParams.set('checkOut', search.get('checkOut')!);
    detailParams.set('guests', '1');
    const suffix = detailParams.size ? `?${detailParams.toString()}` : '';
    api<Hotel>(`/hotels/${encodeURIComponent(hotelId)}${suffix}`, {
      signal: controller.signal,
    })
      .then((record) => {
        setHotel(record);
        setSelected(record.selectedRooms ?? []);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [hotelId, search]);

  useEffect(() => {
    const controller = new AbortController();
    api<PageResult<HotelReview>>(
      `/hotels/${encodeURIComponent(hotelId)}/reviews?page=${reviewPage}&limit=6`,
      { signal: controller.signal },
    )
      .then((result) => {
        setReviewTotal(result.total);
        setReviews((current) =>
          reviewPage === 1 ? result.data : [...current, ...result.data],
        );
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setReviewError(errorMessage(cause));
      });
    return () => controller.abort();
  }, [hotelId, reviewPage]);

  function updateDates(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDateError('');
    if (!checkIn || !checkOut) {
      setDateError('Choose both check-in and check-out dates.');
      return;
    }
    if ((today && checkIn < today) || checkOut <= checkIn) {
      setDateError('Choose valid dates. Check-out must be after check-in.');
      return;
    }
    const next = new URLSearchParams(search);
    next.set('checkIn', checkIn);
    next.set('checkOut', checkOut);
    next.set('guests', String(guests));
    router.push(`/hotels/${hotelId}?${next.toString()}`);
  }

  function toggleRoom(roomId: string) {
    setSelected((current) => {
      if (current.includes(roomId)) return current.filter((id) => id !== roomId);
      if (current.length >= requestedRoomCount) return current;
      return [...current, roomId];
    });
  }

  function bookingHref() {
    const bookingParams = new URLSearchParams();
    if (checkIn) bookingParams.set('checkIn', checkIn);
    if (checkOut) bookingParams.set('checkOut', checkOut);
    bookingParams.set('guests', String(guests));
    selected.forEach((roomId) => bookingParams.append('roomId', roomId));
    return `/hotels/${hotelId}/book?${bookingParams.toString()}`;
  }

  if (loading) return <main className="page-width page-pad loading-state">Loading this stay…</main>;
  if (error || !hotel) {
    return (
      <main className="page-width page-pad">
        <div className="error-state" role="alert">
          Couldn’t load hotel details: {error || 'Hotel not found.'}
        </div>
        <p><Link className="button-link" href="/hotels">← Back to search</Link></p>
      </main>
    );
  }

  const rooms = hotel.rooms ?? [];
  const photo = (index: number) => safeImageUrl(hotel.photos?.[index] ?? hotel.photos?.[0]);
  const hasDates = Boolean(search.get('checkIn') && search.get('checkOut'));
  const selectedTotal = rooms
    .filter((room) => selected.includes(room._id))
    .reduce((sum, room) => sum + (room.totalStayPrice ?? room.pricePerNight), 0);
  const nights =
    hasDates
      ? Math.max(
          1,
          (new Date(`${search.get('checkOut')}T00:00:00`).getTime() -
            new Date(`${search.get('checkIn')}T00:00:00`).getTime()) /
            86_400_000,
        )
      : 1;
  const requestedRoomCount = Math.max(1, Number(search.get('rooms') ?? 1));
  const selectedCapacity = rooms
    .filter((room) => selected.includes(room._id))
    .reduce((sum, room) => sum + room.maxOccupancy, 0);
  const canBook = selected.length === requestedRoomCount && selectedCapacity >= guests;
  const currency = rooms[0]?.currency ?? hotel.currency ?? 'USD';
  const money = (amount: number) =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);

  return (
    <main className="page-width page-pad">
      <Link className="button-link" href="/hotels">← Back to stays</Link>
      <div className="detail-hero" aria-label={`${hotel.name} photos`}>
        <div
          className="detail-main-image"
          role="img"
          aria-label={`${hotel.name} exterior`}
          style={photo(0) ? { backgroundImage: `url("${photo(0)}")` } : undefined}
        />
        <div className="detail-side-images">
          {[1, 2].map((index) => (
            <div
              key={index}
              className="detail-side-image"
              role="img"
              aria-label={`${hotel.name} photo ${index + 1}`}
              style={photo(index) ? { backgroundImage: `url("${photo(index)}")` } : undefined}
            />
          ))}
        </div>
      </div>

      <div className="detail-title-row">
        <div>
          <p className="eyebrow">{hotel.city}, {hotel.country} · {hotel.starRating ?? 0} star stay</p>
          <h1>{hotel.name}</h1>
          <p className="detail-meta">
            {hotel.address}
            <span>·</span>
            <strong>★ {hotel.averageReviewRating ? hotel.averageReviewRating.toFixed(1) : 'New'}</strong>
            {' '}({hotel.reviewCount} reviews)
          </p>
        </div>
        <a className="button button-outline" href="#rooms">See available rooms</a>
      </div>

      <div className="detail-summary">
        <section className="detail-copy">
          <h2>A little about this stay</h2>
          <p>{hotel.description || `${hotel.name} welcomes guests to ${hotel.city}, ${hotel.country}.`}</p>
          <div className="amenities-list">
            {(hotel.amenities ?? []).map((amenity) => (
              <span className="amenity-pill" key={amenity}>{amenity}</span>
            ))}
          </div>
        </section>
        <aside className="detail-side-card">
          <h3>Good to know</h3>
          <div className="policy-line"><span>Check in</span><strong>{hotel.policy?.checkInTime ?? '15:00'}</strong></div>
          <div className="policy-line"><span>Check out</span><strong>{hotel.policy?.checkOutTime ?? '11:00'}</strong></div>
          <div className="policy-line"><span>Cancellation</span><strong>See refund terms below</strong></div>
          {(hotel.policy?.cancellationTiers ?? []).map((tier) => (
            <div className="policy-line" key={tier.daysBeforeCheckIn}>
              <span>{tier.daysBeforeCheckIn}+ days before</span>
              <strong>{tier.refundPercent}% refund</strong>
            </div>
          ))}
        </aside>
      </div>

      <section className="content-section" id="rooms">
        <div className="content-section-header">
          <div>
            <p className="eyebrow">Make it yours</p>
            <h2>Rooms for your stay</h2>
          </div>
          {hasDates && (
            <span className="detail-meta">
            {search.get('checkIn')} – {search.get('checkOut')} · {guests} guests · {requestedRoomCount} {requestedRoomCount === 1 ? 'room' : 'rooms'}
            </span>
          )}
        </div>
        <form className="content-card" onSubmit={updateDates}>
          <div className="booking-room-fields">
            <label className="control-label">
              Check in
              <input className="text-input" type="date" min={today} value={checkIn} onChange={(event) => setCheckIn(event.target.value)} />
            </label>
            <label className="control-label">
              Check out
              <input className="text-input" type="date" min={checkIn || today} value={checkOut} onChange={(event) => setCheckOut(event.target.value)} />
            </label>
            <label className="control-label">
              Guests
              <select className="select-input" value={guests} onChange={(event) => setGuests(Number(event.target.value))}>
                {Array.from({ length: 10 }, (_, index) => index + 1).map((count) => (
                  <option value={count} key={count}>{count} {count === 1 ? 'guest' : 'guests'}</option>
                ))}
              </select>
            </label>
            <div style={{ display: 'flex', alignItems: 'end' }}>
              <button className="button button-dark" type="submit">Update availability</button>
            </div>
          </div>
          {dateError && <p className="form-note form-note-error" role="alert">{dateError}</p>}
        </form>
        {!rooms.length ? (
          <div className="empty-state" style={{ marginTop: 13 }}>
            No rooms are available for this search. Try different dates or guest count.
          </div>
        ) : (
          <>
            <div className="rooms-list" style={{ marginTop: 13 }}>
              {rooms.map((room) => (
                <article className="room-card" key={room._id}>
                  <div>
                    <h3>{room.name}</h3>
                    <div className="room-details">
                      <span>{room.type}</span>
                      <span>{room.bedCount} {room.bedCount === 1 ? 'bed' : 'beds'}</span>
                      <span>Up to {room.maxOccupancy} guests</span>
                      {(room.amenities ?? []).map((amenity) => <span key={amenity}>{amenity}</span>)}
                    </div>
                  </div>
                  <div className="room-price">
                    <strong>{money(room.totalStayPrice ?? room.pricePerNight * nights)}</strong>
                    {hasDates ? <span>total for {nights} nights</span> : <span>{money(room.pricePerNight)} / night</span>}
                    <label className="policy-check" style={{ justifyContent: 'flex-end' }}>
                      <input
                        type="checkbox"
                        checked={selected.includes(room._id)}
                        disabled={!selected.includes(room._id) && selected.length >= requestedRoomCount}
                        onChange={() => toggleRoom(room._id)}
                        aria-label={`Select ${room.name}`}
                      />
                      Select room
                    </label>
                  </div>
                </article>
              ))}
            </div>
            {selected.length > 0 && (
              <div className="content-card" style={{ display: 'flex', marginTop: 15, alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
                <div>
                  <strong>{selected.length} of {requestedRoomCount} {requestedRoomCount === 1 ? 'room' : 'rooms'} selected</strong>
                  {hasDates && <p className="form-note">{money(selectedTotal)} estimated total · {guests} guests in search</p>}
                </div>
                      {hasDates && canBook ? (
                  <Link className="button button-dark" href={bookingHref()}>Continue to booking →</Link>
                ) : (
                        <span className="form-note">
                          {!hasDates
                            ? 'Choose travel dates to continue.'
                            : selected.length !== requestedRoomCount
                              ? `Select ${requestedRoomCount} ${requestedRoomCount === 1 ? 'room' : 'rooms'} to continue.`
                              : `Selected rooms must fit all ${guests} guests.`}
                        </span>
                )}
              </div>
            )}
          </>
        )}
      </section>

      <section className="content-section">
        <div className="content-section-header">
          <div>
            <p className="eyebrow">From people who stayed</p>
            <h2>Guest notes</h2>
          </div>
          <span className="detail-meta">{hotel.reviewCount} ratings</span>
        </div>
        {reviews.length ? (
          <>
            <div className="review-list">
              {reviews.map((review) => (
                <article className="review-card" key={review._id}>
                  <div className="review-card-header">
                    <span className="stars" aria-label={`${review.rating} out of 5 stars`}>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span>
                    <time dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleDateString()}</time>
                  </div>
                  <p>{review.comment || 'A stay remembered fondly.'}</p>
                </article>
              ))}
            </div>
            {reviewError && <p className="form-note form-note-error" role="alert">{reviewError}</p>}
            {reviews.length < reviewTotal && (
              <button className="button button-outline" style={{ marginTop: 16 }} onClick={() => setReviewPage((page) => page + 1)}>
                Show more guest notes
              </button>
            )}
          </>
        ) : (
          <div className="empty-state">
            {reviewError ? `Couldn’t load guest notes: ${reviewError}` : 'No guest notes yet. Be the first to share your experience after a completed stay.'}
          </div>
        )}
      </section>
    </main>
  );
}
