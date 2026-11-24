import { cabinLabel, localTime, price } from "./api";
import type { Booking, Leg } from "./booking-api";

export function Itinerary({ legs }: { legs: Leg[] }) {
  return (
    <ul className="itinerary">
      {legs.map((leg) => (
        <li key={leg.flightId}>
          <strong>
            {leg.departureAirport} to {leg.arrivalAirport} · {leg.flightNumber}
          </strong>
          <p>
            <span className="cabin">{cabinLabel(leg.cabinClass)}</span> ·{" "}
            {localTime(leg.departureAt, leg.departureTimeZone)} to{" "}
            {localTime(leg.arrivalAt, leg.arrivalTimeZone)}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function Policies({ legs }: { legs: Leg[] }) {
  return (
    <section className="panel stack">
      <h2>Airline policies</h2>
      {legs.map((leg, index) => {
        const { baggagePolicy: bags, cancellationPolicy } = leg.policySnapshot;
        return (
          <div key={leg.flightId}>
            <h3>
              {leg.departureAirport} to {leg.arrivalAirport}
            </h3>
            <p>
              {leg.freeBags} included cabin-fare bags, up to{" "}
              {leg.maxWeightKgPerBag} kg per bag. Airline allowances are{" "}
              {bags.cabinBaggageKg} kg cabin baggage and {bags.checkedBaggageKg}{" "}
              kg checked baggage.
            </p>
            <p>
              Up to {bags.maxExtraBagsPerPassenger} extra bags per passenger at{" "}
              {price(bags.extraBagPriceMinor, bags.currency)} per bag on this
              segment.
            </p>
            {index === 0 && (
              <>
                <h3>
                  Cancellation refund
                  {legs.length > 1 ? " for the entire round trip" : ""}
                </h3>
                {cancellationPolicy.tiers.length ? (
                  <ul>
                    {[...cancellationPolicy.tiers]
                      .sort(
                        (a, b) => b.daysBeforeDeparture - a.daysBeforeDeparture,
                      )
                      .map((tier) => (
                        <li key={tier.daysBeforeDeparture}>
                          {tier.refundPercent}% at least{" "}
                          {tier.daysBeforeDeparture}{" "}
                          {tier.daysBeforeDeparture === 1 ? "day" : "days"}{" "}
                          before departure
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p>No refund tiers apply.</p>
                )}
                <p>
                  Cancellation must be confirmed before outbound departure. A
                  cancellation outside the listed tiers has a zero refund.
                </p>
              </>
            )}
          </div>
        );
      })}
    </section>
  );
}

export function BookingSummary({ booking }: { booking: Booking }) {
  return (
    <section className="panel">
      <h2>Booking summary</h2>
      <Itinerary legs={booking.legs} />
      <h3>Passengers</h3>
      <ul>
        {booking.passengers.map((passenger, index) => (
          <li key={index}>
            {passenger.name} ({passenger.type}) ·{" "}
            {passenger.extraBagWeightsKg?.length
              ? "Extra bags: " +
                passenger.extraBagWeightsKg.join(" kg, ") +
                " kg"
              : "No extra bags"}
          </li>
        ))}
      </ul>
      <p>Contact email {booking.contactEmail}</p>
      <dl className="amounts">
        <dt>Fare</dt>
        <dd>{price(booking.fareMinor, booking.currency)}</dd>
        <dt>Extra baggage</dt>
        <dd>{price(booking.baggageMinor, booking.currency)}</dd>
        <dt>
          <strong>Total</strong>
        </dt>
        <dd>
          <strong>{price(booking.totalMinor, booking.currency)}</strong>
        </dd>
      </dl>
    </section>
  );
}
