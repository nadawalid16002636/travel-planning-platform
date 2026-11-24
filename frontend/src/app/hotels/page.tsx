'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { HotelCard } from '@/components/hotel-card';
import { HotelSearchForm, type HotelSearchValues } from '@/components/hotel-search-form';
import { api, errorMessage } from '@/lib/api';
import type { Hotel, PageResult } from '@/lib/hotel-types';

const platformCurrency = process.env.NEXT_PUBLIC_PLATFORM_CURRENCY ?? 'USD';

export default function HotelSearchRoute() {
  return (
    <Suspense fallback={<div className="page-width page-pad loading-state">Loading search…</div>}>
      <HotelSearchPage />
    </Suspense>
  );
}

function HotelSearchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = searchParams.toString();
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadedKey, setLoadedKey] = useState('');
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [minRating, setMinRating] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [amenity, setAmenity] = useState('');
  const params = useMemo(() => new URLSearchParams(query), [query]);
  const requestKey = [query, sortBy, sortOrder, minRating, minPrice, maxPrice, amenity, page].join('|');

  useEffect(() => {
    const controller = new AbortController();
    const apiParams = new URLSearchParams(params);
    apiParams.set('sortBy', sortBy);
    apiParams.set('sortOrder', sortOrder);
    apiParams.set('page', String(page));
    apiParams.set('limit', '9');
    if (minRating) apiParams.set('minRating', minRating);
    else apiParams.delete('minRating');
    if (minPrice || maxPrice || sortBy === 'price') {
      apiParams.set('currency', platformCurrency);
      if (minPrice) apiParams.set('minPricePerNight', minPrice);
      else apiParams.delete('minPricePerNight');
      if (maxPrice) apiParams.set('maxPricePerNight', maxPrice);
      else apiParams.delete('maxPricePerNight');
    } else {
      apiParams.delete('currency');
      apiParams.delete('minPricePerNight');
      apiParams.delete('maxPricePerNight');
    }
    if (amenity.trim()) apiParams.set('amenity', amenity.trim());
    else apiParams.delete('amenity');

    api<PageResult<Hotel>>(`/hotels/search?${apiParams.toString()}`, {
      signal: controller.signal,
    })
      .then((result) => {
        setHotels(result.data);
        setTotal(result.total);
        setLoadedKey(requestKey);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError({ key: requestKey, message: errorMessage(cause) });
          setLoadedKey(requestKey);
        }
      })
    return () => controller.abort();
  }, [params, sortBy, sortOrder, minRating, minPrice, maxPrice, amenity, page, requestKey]);

  function applySearch(values: HotelSearchValues) {
    const next = new URLSearchParams();
    if (values.city) next.set('city', values.city);
    if (values.country) next.set('country', values.country);
    if (values.checkIn) next.set('checkIn', values.checkIn);
    if (values.checkOut) next.set('checkOut', values.checkOut);
    next.set('guests', String(values.guests));
    next.set('rooms', String(values.rooms));
    setPage(1);
    router.push(`/hotels?${next.toString()}`);
  }

  const detailsQuery = params.toString();
  const loading = loadedKey !== requestKey;
  const currentError = error?.key === requestKey ? error.message : null;

  return (
    <main className="page-width page-pad">
      <p className="eyebrow">Stay a little differently</p>
      <h1 className="page-heading">Find your kind of place.</h1>
      <p className="page-subheading">
        Search stays that make the destination feel even more like yours.
      </p>
      <div className="search-panel" style={{ width: '100%', margin: '26px 0 0', padding: 12 }}>
        <HotelSearchForm
          key={query}
          compact
          initial={{
            city: params.get('city') ?? '',
            country: params.get('country') ?? '',
            checkIn: params.get('checkIn') ?? '',
            checkOut: params.get('checkOut') ?? '',
            guests: Number(params.get('guests') ?? 2),
            rooms: Number(params.get('rooms') ?? 1),
          }}
          onSearch={applySearch}
        />
      </div>
      <form className="results-toolbar" onSubmit={(event) => event.preventDefault()}>
        <label className="control-label">
          Minimum rating
          <select className="select-input" value={minRating} onChange={(event) => setMinRating(event.target.value)}>
            <option value="">Any rating</option>
            <option value="3">3+ stars</option>
            <option value="4">4+ stars</option>
            <option value="5">5 stars</option>
          </select>
        </label>
        <label className="control-label">
          Min price / night
          <input className="text-input" min="1" type="number" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} placeholder="No minimum" />
        </label>
        <label className="control-label">
          Max price / night
          <input className="text-input" min="1" type="number" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder="No maximum" />
        </label>
        <label className="control-label">
          Amenity
          <input className="text-input" value={amenity} onChange={(event) => setAmenity(event.target.value)} placeholder="Pool, Wi-Fi…" />
        </label>
        <label className="control-label">
          Sort by
          <select className="select-input" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
            <option value="name">Name</option>
            <option value="rating">Guest rating</option>
            <option value="price">Price</option>
          </select>
        </label>
        <label className="control-label">
          Order
          <select className="select-input" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
            <option value="asc">Low to high</option>
            <option value="desc">High to low</option>
          </select>
        </label>
      </form>
      <div className="search-results-summary">
        <span><strong>{total}</strong> stays found</span>
        {(params.get('city') || params.get('country')) && (
          <span>
            in {[params.get('city'), params.get('country')].filter(Boolean).join(', ')}
          </span>
        )}
      </div>
      {loading ? (
        <div className="loading-state">Looking for open rooms…</div>
      ) : currentError ? (
        <div className="error-state" role="alert">Couldn’t load hotel results: {currentError}</div>
      ) : hotels.length ? (
        <div className="hotel-grid">
          {hotels.map((hotel) => (
            <HotelCard key={hotel._id} hotel={hotel} search={detailsQuery} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2>No stays match those filters yet</h2>
          <p>Try a different city, broader dates, or fewer filters.</p>
          <Link className="button button-outline" href="/hotels">Clear search</Link>
        </div>
      )}
      {!loading && !currentError && total > 9 && (
        <div className="pagination-controls">
          <button className="button button-outline button-small" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
            ← Previous
          </button>
          <span>Page {page} of {Math.ceil(total / 9)}</span>
          <button className="button button-outline button-small" disabled={page * 9 >= total} onClick={() => setPage((value) => value + 1)}>
            Next →
          </button>
        </div>
      )}
    </main>
  );
}
