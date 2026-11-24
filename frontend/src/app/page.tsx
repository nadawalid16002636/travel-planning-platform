'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { HotelCard } from '@/components/hotel-card';
import { HotelSearchForm } from '@/components/hotel-search-form';
import { api, errorMessage } from '@/lib/api';
import type { Hotel, PageResult } from '@/lib/hotel-types';

export default function HomePage() {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    api<PageResult<Hotel>>('/hotels/search?sortBy=rating&sortOrder=desc&limit=6', {
      signal: controller.signal,
    })
      .then((result) => setHotels(result.data))
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  return (
    <main>
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-copy">
            <p className="hero-kicker">A better way to get away</p>
            <h1>Find a stay<br />that feels <em>right.</em></h1>
            <p className="hero-description">
              Thoughtful places, transparent prices, and a little more room to
              enjoy the journey.
            </p>
          </div>
        </div>
      </section>

      <div className="search-panel">
        <HotelSearchForm />
      </div>

      <section className="page-width section">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Good places to begin</p>
            <h2 className="section-title">Stays worth the journey</h2>
          </div>
          <Link className="section-link" href="/hotels">Explore all stays →</Link>
        </div>
        {loading ? (
          <div className="loading-state">Finding welcoming places to stay…</div>
        ) : error ? (
          <div className="error-state" role="alert">
            We couldn’t load stays from the travel service. {error}
          </div>
        ) : hotels.length ? (
          <div className="hotel-grid">
            {hotels.slice(0, 6).map((hotel) => (
              <HotelCard key={hotel._id} hotel={hotel} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            No stays are available yet. Try searching for a destination.
          </div>
        )}
        <div className="trust-strip">
          <div className="trust-item">
            <span className="trust-icon" aria-hidden="true">⌖</span>
            <span>Places selected for the way you travel</span>
          </div>
          <div className="trust-item">
            <span className="trust-icon" aria-hidden="true">◇</span>
            <span>Clear prices, no surprises at checkout</span>
          </div>
          <div className="trust-item">
            <span className="trust-icon" aria-hidden="true">✦</span>
            <span>Your plans, all in one calm place</span>
          </div>
        </div>
      </section>
    </main>
  );
}
