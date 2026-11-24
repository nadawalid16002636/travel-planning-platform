'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useTodayString } from '@/lib/use-today';

export interface HotelSearchValues {
  city: string;
  country: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  rooms: number;
}

export function HotelSearchForm({
  initial = {},
  compact = false,
  onSearch,
}: {
  initial?: Partial<HotelSearchValues>;
  compact?: boolean;
  onSearch?: (values: HotelSearchValues) => void;
}) {
  const router = useRouter();
  const today = useTodayString();
  const [city, setCity] = useState(initial.city ?? '');
  const [country, setCountry] = useState(initial.country ?? '');
  const [checkIn, setCheckIn] = useState(initial.checkIn ?? '');
  const [checkOut, setCheckOut] = useState(initial.checkOut ?? '');
  const [guests, setGuests] = useState(initial.guests ?? 2);
  const [rooms, setRooms] = useState(initial.rooms ?? 1);
  const [validation, setValidation] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidation('');
    if (checkIn && checkOut && checkOut <= checkIn) {
      setValidation('Check-out must be after check-in.');
      return;
    }
    if (today && checkIn && checkIn < today) {
      setValidation('Check-in cannot be in the past.');
      return;
    }
    const values = { city: city.trim(), country: country.trim(), checkIn, checkOut, guests, rooms };
    if (onSearch) {
      onSearch(values);
      return;
    }
    const params = new URLSearchParams();
    if (values.city) params.set('city', values.city);
    if (values.country) params.set('country', values.country);
    if (checkIn) params.set('checkIn', checkIn);
    if (checkOut) params.set('checkOut', checkOut);
    params.set('guests', String(guests));
    params.set('rooms', String(rooms));
    router.push(`/hotels?${params.toString()}`);
  }

  return (
    <form className={`search-form${compact ? ' search-form-compact' : ''}`} onSubmit={submit}>
      <label className="search-field destination-field">
        <span>City</span>
        <span className="search-input-wrap">
          <span className="field-icon" aria-hidden="true">⌖</span>
          <input
            value={city}
            onChange={(event) => setCity(event.target.value)}
            placeholder="Where to?"
            aria-label="City"
          />
        </span>
      </label>
      <label className="search-field destination-field">
        <span>Country</span>
        <input
          value={country}
          onChange={(event) => setCountry(event.target.value)}
          placeholder="Any country"
          aria-label="Country"
        />
      </label>
      <label className="search-field">
        <span>Check in</span>
        <input
          type="date"
          min={today}
          value={checkIn}
          onChange={(event) => setCheckIn(event.target.value)}
          aria-label="Check in"
        />
      </label>
      <label className="search-field">
        <span>Check out</span>
        <input
          type="date"
          min={checkIn || today}
          value={checkOut}
          onChange={(event) => setCheckOut(event.target.value)}
          aria-label="Check out"
        />
      </label>
      <div className="search-field guest-field">
        <label htmlFor="search-guests">Guests</label>
        <select
          id="search-guests"
          value={guests}
          onChange={(event) => setGuests(Number(event.target.value))}
        >
          {Array.from({ length: 20 }, (_, index) => index + 1).map((count) => (
            <option key={count} value={count}>{count} {count === 1 ? 'guest' : 'guests'}</option>
          ))}
        </select>
      </div>
      <div className="search-field guest-field">
        <label htmlFor="search-rooms">Rooms</label>
        <select
          id="search-rooms"
          value={rooms}
          onChange={(event) => setRooms(Number(event.target.value))}
        >
          {Array.from({ length: 10 }, (_, index) => index + 1).map((count) => (
            <option key={count} value={count}>{count} {count === 1 ? 'room' : 'rooms'}</option>
          ))}
        </select>
      </div>
      <button className="button button-dark search-submit" type="submit">
        <span aria-hidden="true">⌕</span>
        Search stays
      </button>
      {validation && <p className="form-note form-note-error search-validation">{validation}</p>}
    </form>
  );
}
