'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/app-shell';
import { api, errorMessage } from '@/lib/api';
import type { HotelBookingGroups } from '@/lib/hotel-types';
import { hotelNameOf } from '@/lib/hotel-types';

type ReservationGroup = 'upcoming' | 'past' | 'cancelled';

const groupLabels: Record<ReservationGroup, string> = {
  upcoming: 'Upcoming',
  past: 'Past stays',
  cancelled: 'Cancelled',
};

export default function MyReservationsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [group, setGroup] = useState<ReservationGroup>('upcoming');
  const [reservations, setReservations] = useState<HotelBookingGroups | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login?next=%2Fmy-reservations');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    api<HotelBookingGroups>('/hotel-bookings?page=1&limit=20', { signal: controller.signal })
      .then(setReservations)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [user]);

  if (authLoading || !user) {
    return <main className="page-width page-pad loading-state">Checking your account…</main>;
  }

  const current = reservations?.[group];
  const items = current?.data ?? [];

  return (
    <main className="page-width page-pad">
      <p className="eyebrow">Your travels</p>
      <h1 className="page-heading">My reservations.</h1>
      <p className="page-subheading">Everything about your stays, from the first plan to the last checkout.</p>
      <div className="reservation-tabs" role="tablist" aria-label="Reservation categories">
        {(Object.keys(groupLabels) as ReservationGroup[]).map((value) => (
          <button
            className={`reservation-tab${group === value ? ' active' : ''}`}
            key={value}
            role="tab"
            aria-selected={group === value}
            onClick={() => setGroup(value)}
          >
            {groupLabels[value]}
            {reservations && <span> ({reservations[value].total})</span>}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="loading-state">Gathering your reservations…</div>
      ) : error ? (
        <div className="error-state" role="alert">Couldn’t load your reservations: {error}</div>
      ) : items.length ? (
        <div className="reservation-list">
          {items.map((booking) => (
            <article className="reservation-card" key={booking._id}>
              <div>
                <p className="eyebrow">{booking.reference ?? `Reservation ${booking._id.slice(-6).toUpperCase()}`}</p>
                <h3>{hotelNameOf(booking)}</h3>
                <p>{new Date(booking.checkIn).toLocaleDateString()} – {new Date(booking.checkOut).toLocaleDateString()} · {booking.rooms.length} {booking.rooms.length === 1 ? 'room' : 'rooms'}</p>
                <p>{booking.rooms.map((room) => room.roomName).join(', ')}</p>
              </div>
              <div className="reservation-card-actions">
                <span className={`status-pill ${booking.status}`}>{booking.status.replaceAll('_', ' ')}</span>
                <Link className="button button-outline button-small" href={`/my-reservations/${booking._id}`}>
                  View details
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2>No {groupLabels[group].toLowerCase()} stays yet</h2>
          <p>When you make a reservation, its details will be waiting here.</p>
          <Link className="button button-dark" href="/hotels">Explore stays</Link>
        </div>
      )}
    </main>
  );
}
