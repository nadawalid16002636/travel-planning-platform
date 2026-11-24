"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BookingApiError,
  bookingApi,
  errorMessage,
  signInUrl,
  type BookingPage,
} from "../booking-api";
import { Itinerary } from "../booking-summary";

export type Group = "upcoming" | "past" | "cancelled";
const groups: Group[] = ["upcoming", "past", "cancelled"];
const url = (group: Group, page = 1) =>
  "/flights/bookings?" + new URLSearchParams({ group, page: String(page) });

export function History({ group, page }: { group: Group; page: number }) {
  const [data, setData] = useState<BookingPage | null>(null);
  const [error, setError] = useState("");
  const [unauthorized, setUnauthorized] = useState(false);
  const [attempt, retry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    bookingApi<BookingPage>(
      `flight-bookings?group=${group}&page=${page}`,
      undefined,
      controller.signal,
    )
      .then(setData)
      .catch((error) => {
        if (controller.signal.aborted) return;
        setUnauthorized(
          error instanceof BookingApiError && error.status === 401,
        );
        setError(errorMessage(error));
      });
    return () => controller.abort();
  }, [group, page, attempt]);
  return (
    <>
      <nav className="tabs" aria-label="Booking groups">
        {groups.map((tab) => (
          <Link
            key={tab}
            href={url(tab)}
            aria-current={tab === group ? "page" : undefined}
          >
            {tab}
          </Link>
        ))}
      </nav>
      {!error && !data && <p role="status">Loading bookings…</p>}
      {error && (
        <section className="panel">
          <p role="alert" className="error">
            {unauthorized ? "Sign in to view your flight bookings." : error}
          </p>
          {unauthorized ? (
            <Link href={signInUrl(url(group, page))}>Sign in</Link>
          ) : (
            <button
              onClick={() => {
                setError("");
                retry(attempt + 1);
              }}
            >
              Try again
            </button>
          )}
        </section>
      )}
      {data && (
        <>
          {!data.data.length && (
            <p className="panel">
              {data.total
                ? "No bookings on this page."
                : `No ${group} bookings yet.`}
            </p>
          )}
          {data.data.map((booking) => (
            <article key={booking._id} className="panel">
              <h2>
                {booking.status === "pending-payment" ||
                booking.status === "expired"
                  ? "Flight booking"
                  : booking.reference}
              </h2>
              <p className="status">
                {booking.status.replaceAll("-", " ")} ·{" "}
                {booking.passengers.length}{" "}
                {booking.passengers.length === 1 ? "passenger" : "passengers"}
              </p>
              <Itinerary legs={booking.legs} />
              <Link href={"/flights/bookings/" + booking._id}>
                Booking details
              </Link>
            </article>
          ))}
          {(page > 1 || page * data.limit < data.total) && (
            <nav className="pager" aria-label="Booking pages">
              {page > 1 && (
                <Link href={url(group, page - 1)}>Previous page</Link>
              )}
              <span>Page {page}</span>
              {page * data.limit < data.total && (
                <Link href={url(group, page + 1)}>Next page</Link>
              )}
            </nav>
          )}
        </>
      )}
    </>
  );
}
