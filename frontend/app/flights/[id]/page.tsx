import Link from "next/link";
import { notFound } from "next/navigation";
import {
  cabinLabel,
  duration,
  flightApi,
  localTime,
  price,
  type FlightDetails,
} from "../api";
import { selectOffer } from "../selection";

export default async function Details({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; cabin?: string; direction?: string }>;
}) {
  const [{ id }, { from, cabin, direction }] = await Promise.all([
    params,
    searchParams,
  ]);
  if (!/^[a-f\d]{24}$/i.test(id)) notFound();
  const back =
    "/flights" +
    (typeof from === "string" ? "?" + new URLSearchParams(from) : "");
  let flight: FlightDetails;
  try {
    flight = await flightApi<FlightDetails>("/flights/" + id);
  } catch (error) {
    return (
      <main>
        <Link href={back}>Back to flights</Link>
        <h1>Flight details</h1>
        <p role="alert" className="error">
          {(error as Error).message}
        </p>
      </main>
    );
  }
  const tiers = flight.policySnapshot?.cancellationPolicy?.tiers;
  const baggage = flight.policySnapshot?.baggagePolicy;
  const search = new URLSearchParams(typeof from === "string" ? from : "");
  const seats =
    Number(search.get("adults") ?? 1) + Number(search.get("children") ?? 0);
  const selectionDirection =
    direction === "inbound" || direction === "outbound" ? direction : null;
  return (
    <main>
      <Link href={back}>Back to flights</Link>
      <div className="intro">
        <h1>
          {flight.departureAirport} to {flight.arrivalAirport}
        </h1>
        <p>
          {flight.airline?.name} · {flight.flightNumber} ·{" "}
          {duration(flight.durationMinutes)} ·{" "}
          <span className="cabin">{flight.status}</span>
        </p>
      </div>
      <section className="panel fields" aria-label="Flight schedule">
        <div>
          <h2>Departure</h2>
          <p>{flight.departure.name}</p>
          <p>{localTime(flight.departureAt, flight.departure.timeZone)}</p>
        </div>
        <div>
          <h2>Arrival</h2>
          <p>{flight.arrival.name}</p>
          <p>{localTime(flight.arrivalAt, flight.arrival.timeZone)}</p>
        </div>
      </section>
      <section className="results">
        <h2>Cabins and baggage</h2>
        {flight.cabins.map((item) => (
          <article
            className={
              item.cabinClass === cabin ? "panel offer selected" : "panel offer"
            }
            key={item.cabinClass}
          >
            <div>
              <h3 className="cabin">{cabinLabel(item.cabinClass)}</h3>
              <p>
                {item.freeBags} free bags · Up to {item.maxWeightKgPerBag} kg
                per bag
              </p>
            </div>
            <div>
              <strong>{price(item.priceMinor, item.currency)}</strong>
              <p>{item.availableSeats} seats remaining</p>
              {selectionDirection &&
                flight.status === "scheduled" &&
                flight.airline?.active !== false &&
                item.availableSeats >= seats && (
                  <Link
                    href={selectOffer(search, selectionDirection, {
                      flightId: id,
                      cabinClass: item.cabinClass,
                    })}
                  >
                    Select this cabin
                  </Link>
                )}
            </div>
          </article>
        ))}
        {baggage && (
          <p>
            Extra baggage costs{" "}
            {price(baggage.extraBagPriceMinor, baggage.currency)} per bag. Limit{" "}
            {baggage.maxExtraBagsPerPassenger} extra bags per passenger.
          </p>
        )}
      </section>
      <section className="panel">
        <h2>Cancellation policy</h2>
        {tiers?.length ? (
          <ul>
            {[...tiers]
              .sort((a, b) => b.daysBeforeDeparture - a.daysBeforeDeparture)
              .map((tier) => (
                <li key={tier.daysBeforeDeparture}>
                  {tier.refundPercent}% refund at least{" "}
                  {tier.daysBeforeDeparture}{" "}
                  {tier.daysBeforeDeparture === 1 ? "day" : "days"} before
                  departure
                </li>
              ))}
          </ul>
        ) : (
          <p>No cancellation tiers are available.</p>
        )}
      </section>
    </main>
  );
}
