"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  BookingApiError,
  bookingApi,
  errorMessage,
  signInUrl,
  type Booking,
  type Hold,
  type Passenger,
  type PassengerType,
} from "../booking-api";
import { BookingSummary, Itinerary, Policies } from "../booking-summary";
import type { SelectedLeg } from "../selection";
import { Countdown, useRemaining } from "./countdown";

const passengerTypes: PassengerType[] = ["adult", "child", "infant"];

function PassengerFields({
  index,
  type,
  maxBags,
  maxWeight,
  lastBirthDate,
}: {
  index: number;
  type: PassengerType;
  maxBags: number;
  maxWeight: number;
  lastBirthDate: string;
}) {
  const [bags, setBags] = useState(0);
  return (
    <fieldset className="panel">
      <legend className="cabin">
        {type} · Passenger {index + 1}
      </legend>
      <div className="fields">
        <label>
          Full name
          <input name={`name-${index}`} required />
        </label>
        <label>
          Date of birth
          <input
            name={`dob-${index}`}
            type="date"
            max={lastBirthDate}
            required
          />
        </label>
        <label>
          Passport or ID number
          <input name={`document-${index}`} autoComplete="off" required />
        </label>
        <label>
          Extra bags
          <input
            type="number"
            min={0}
            max={maxBags}
            value={bags}
            onChange={(event) => {
              const count = event.currentTarget.valueAsNumber;
              if (!event.currentTarget.value) setBags(0);
              else if (
                Number.isInteger(count) &&
                count >= 0 &&
                count <= maxBags
              )
                setBags(count);
            }}
          />
        </label>
        {Array.from({ length: bags }, (_, bag) => (
          <label key={bag}>
            Bag {bag + 1} weight (kg)
            <input
              name={`bag-${index}`}
              type="number"
              min="0.01"
              max={maxWeight}
              step="any"
              required
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Checkout({
  legs,
  counts,
  back,
}: {
  legs: SelectedLeg[];
  counts: number[];
  back: string;
}) {
  const router = useRouter();
  const [hold, setHold] = useState<Hold | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const remaining = useRemaining(hold?.expiresAt);
  const expired = remaining === 0;

  function report(error: unknown) {
    if (error instanceof BookingApiError && error.status === 401)
      router.push(signInUrl(window.location.pathname + window.location.search));
    else setError(errorMessage(error));
  }

  async function reserve() {
    setBusy(true);
    setError("");
    try {
      setHold(
        await bookingApi<Hold>("flight-bookings/hold", {
          legs,
          seats: counts[0] + counts[1],
        }),
      );
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hold || Date.parse(hold.expiresAt) <= Date.now()) return;
    const data = new FormData(event.currentTarget);
    const passengers: Passenger[] = [];
    for (const [group, count] of counts.entries()) {
      for (let position = 0; position < count; position++) {
        const index = passengers.length;
        passengers.push({
          name: String(data.get(`name-${index}`)).trim(),
          type: passengerTypes[group],
          dateOfBirth: String(data.get(`dob-${index}`)),
          documentNumber: String(data.get(`document-${index}`)).trim(),
          extraBagWeightsKg: data.getAll(`bag-${index}`).map(Number),
        });
      }
    }
    setBusy(true);
    setError("");
    try {
      setBooking(
        await bookingApi<Booking>("flight-bookings", {
          holdId: hold._id,
          passengers,
          contactEmail: String(data.get("contactEmail")).trim(),
          acceptedPolicies: data.has("policies"),
        }),
      );
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  }

  if (!hold)
    return (
      <section className="panel stack">
        <h2>Reserve seats</h2>
        <p>
          {counts[0]} adults · {counts[1]} children · {counts[2]} infants
        </p>
        <p>
          Your ten-minute seat hold starts when you reserve. Enter the passenger
          details and complete payment before the timer runs out.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button onClick={reserve} disabled={busy}>
          {busy ? "Reserving…" : "Start seat hold"}
        </button>
      </section>
    );

  if (booking)
    return (
      <>
        <Countdown seconds={remaining} />
        <BookingSummary booking={booking} />
        {expired ? (
          <Link href={back}>Search again</Link>
        ) : (
          <Link className="button" href={"/flights/bookings/" + booking._id}>
            Continue to payment
          </Link>
        )}
      </>
    );

  const maxBags = Math.min(
    ...hold.legs.map((leg) =>
      leg.policySnapshot.baggagePolicy.currency === leg.currency
        ? leg.policySnapshot.baggagePolicy.maxExtraBagsPerPassenger
        : 0,
    ),
  );
  const maxWeight = Math.min(...hold.legs.map((leg) => leg.maxWeightKgPerBag));
  const outbound = hold.legs[0];
  const dateParts = new Intl.DateTimeFormat("en", {
    timeZone: outbound.departureTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(outbound.departureAt));
  const birthLimit = ["year", "month", "day"]
    .map((type) => dateParts.find((part) => part.type === type)?.value)
    .join("-");
  let index = 0;
  return (
    <>
      <Countdown seconds={remaining} />
      {expired ? (
        <Link href={back}>Search again</Link>
      ) : (
        <>
          <section className="panel">
            <h2>Held flights</h2>
            <Itinerary legs={hold.legs} />
          </section>
          <form onSubmit={create} className="stack">
            <h2>Passenger details and baggage</h2>
            {counts.flatMap((count, group) =>
              Array.from({ length: count }, () => {
                const key = index++;
                return (
                  <PassengerFields
                    key={key}
                    index={key}
                    type={passengerTypes[group]}
                    maxBags={maxBags}
                    maxWeight={maxWeight}
                    lastBirthDate={birthLimit}
                  />
                );
              }),
            )}
            <label>
              Contact email
              <input
                name="contactEmail"
                autoComplete="email"
                type="email"
                required
              />
            </label>
            <Policies legs={hold.legs} />
            <label className="check">
              <input name="policies" type="checkbox" required />I accept the
              baggage and cancellation policies shown above.
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button disabled={busy || remaining === null}>
              {busy ? "Saving…" : "Review booking"}
            </button>
          </form>
        </>
      )}
    </>
  );
}
