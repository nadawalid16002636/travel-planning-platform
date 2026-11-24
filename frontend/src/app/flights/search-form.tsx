"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { cabinClasses, cabinLabel, type Airport } from "./api";

export function SearchForm({
  airports,
  values,
}: {
  airports: Airport[];
  values: Record<string, string>;
}) {
  const router = useRouter();
  const [roundTrip, setRoundTrip] = useState(values.tripType === "round-trip");
  const [departure, setDeparture] = useState(values.departureDate || "");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const query = new URLSearchParams();
    for (const [key, value] of data)
      if (typeof value === "string" && value.trim())
        query.set(key, value.trim());
    const currency = query.get("currency")?.toUpperCase();
    const min = query.get("minPrice");
    const max = query.get("maxPrice");
    if (query.get("departureAirport") === query.get("arrivalAirport"))
      return setError("Choose different departure and arrival airports.");
    if (Number(query.get("infants")) > Number(query.get("adults")))
      return setError("Each infant needs an accompanying adult.");
    if (min && max && Number(min) > Number(max))
      return setError("Minimum price must be at most the maximum price.");
    if ((min || max || query.get("sort")?.startsWith("price")) && !currency)
      return setError("Enter a currency to compare prices.");
    if (currency) {
      const digits = new Intl.NumberFormat("en", {
        style: "currency",
        currency,
      }).resolvedOptions().maximumFractionDigits!;
      query.set("currency", currency);
      for (const key of ["minPrice", "maxPrice"]) {
        const value = query.get(key);
        if (!value) continue;
        if ((value.split(".")[1]?.length ?? 0) > digits)
          return setError(
            `Enter prices with up to ${digits} decimal places for ${currency}.`,
          );
        const minor = Math.round(Number(value) * 10 ** digits);
        if (!Number.isSafeInteger(minor))
          return setError("Enter a smaller price.");
        query.set(key + "Minor", String(minor));
      }
    }
    setError("");
    startTransition(() => {
      if (query.toString() === new URLSearchParams(values).toString())
        router.refresh();
      else router.push("/flights?" + query);
    });
  }

  return (
    <form className="panel" onSubmit={submit}>
      <div className="fields">
        <label>
          Trip type
          <select
            name="tripType"
            value={roundTrip ? "round-trip" : "one-way"}
            onChange={(event) =>
              setRoundTrip(event.target.value === "round-trip")
            }
          >
            <option value="one-way">One way</option>
            <option value="round-trip">Round trip</option>
          </select>
        </label>
        {["departureAirport", "arrivalAirport"].map((name, index) => (
          <label key={name}>
            {index === 0 ? "From" : "To"}
            <select
              aria-label={index === 0 ? "From" : "To"}
              required
              name={name}
              defaultValue={values[name] || ""}
            >
              <option value="">Select an airport</option>
              {airports.map((airport) => (
                <option value={airport.code} key={airport.code}>
                  {airport.code} · {airport.name}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label>
          Departure date
          <input
            required
            name="departureDate"
            type="date"
            value={departure}
            onChange={(event) => setDeparture(event.target.value)}
          />
        </label>
        {roundTrip && (
          <label>
            Return date
            <input
              required
              name="returnDate"
              type="date"
              min={departure || undefined}
              defaultValue={values.returnDate}
            />
          </label>
        )}
        {[
          ["adults", "Adults (12+)", 1],
          ["children", "Children (2–11)", 0],
          ["infants", "Infants (under 2)", 0],
        ].map(([name, label, minimum]) => (
          <label key={name}>
            {label}
            <input
              required
              name={String(name)}
              type="number"
              min={minimum}
              defaultValue={values[name] || minimum}
            />
          </label>
        ))}
        <label>
          Cabin
          <select name="cabinClass" defaultValue={values.cabinClass || ""}>
            <option value="">Any cabin</option>
            {cabinClasses.map((cabin) => (
              <option key={cabin} value={cabin}>
                {cabinLabel(cabin)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <details
        open={
          Boolean(
            values.currency ||
            values.minPrice ||
            values.maxPrice ||
            (values.sort && values.sort !== "departure"),
          ) || undefined
        }
      >
        <summary>Price filters and sorting</summary>
        <div className="fields">
          <label>
            Currency
            <input
              name="currency"
              pattern="[A-Za-z]{3}"
              placeholder="e.g. EGP"
              maxLength={3}
              defaultValue={values.currency}
            />
          </label>
          <label>
            Minimum fare
            <input
              name="minPrice"
              type="number"
              min="0"
              step="any"
              defaultValue={values.minPrice}
            />
          </label>
          <label>
            Maximum fare
            <input
              name="maxPrice"
              type="number"
              min="0"
              step="any"
              defaultValue={values.maxPrice}
            />
          </label>
          <label>
            Sort by
            <select name="sort" defaultValue={values.sort || "departure"}>
              <option value="departure">Departure time</option>
              <option value="duration">Shortest duration</option>
              <option value="price-asc">Lowest fare</option>
              <option value="price-desc">Highest fare</option>
            </select>
          </label>
        </div>
      </details>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button disabled={pending || airports.length === 0}>
        {pending ? "Searching…" : "Search flights"}
      </button>
    </form>
  );
}
