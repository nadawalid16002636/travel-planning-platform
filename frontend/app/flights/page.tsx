import Link from "next/link";
import {
  cabinLabel,
  duration,
  flightApi,
  localTime,
  price,
  type Airport,
  type OfferPage,
  type SearchResult,
} from "./api";
import { SearchForm } from "./search-form";
import { checkoutUrl, legKey, selectedLeg, selectOffer } from "./selection";

type Query = Record<string, string | string[] | undefined>;
const fields = [
  "departureAirport",
  "arrivalAirport",
  "departureDate",
  "returnDate",
  "tripType",
  "adults",
  "children",
  "infants",
  "cabinClass",
  "minPriceMinor",
  "maxPriceMinor",
  "currency",
  "sort",
  "page",
];

function Offers({
  title,
  data,
  query,
  direction,
}: {
  title: string;
  data: OfferPage;
  query: URLSearchParams;
  direction: "outbound" | "inbound";
}) {
  const pageUrl = (page: number) =>
    "/flights?" +
    new URLSearchParams({ ...Object.fromEntries(query), page: String(page) });
  return (
    <section className="results">
      <h2>
        {title}{" "}
        <small>
          {data.total} {data.total === 1 ? "offer" : "offers"}
        </small>
      </h2>
      {!data.items.length && (
        <p className="panel">
          No flights found. Try different dates or filters.
        </p>
      )}
      {data.items.map((offer) => {
        const leg = {
          flightId: offer._id,
          cabinClass: offer.cabins.cabinClass,
        };
        const selected = query.get(direction) === legKey(leg);
        return (
          <article
            className={selected ? "panel offer selected" : "panel offer"}
            key={offer._id + offer.cabins.cabinClass}
          >
            <div>
              <strong>
                {offer.airline[0]?.name} · {offer.flightNumber}
              </strong>
              <p>
                {offer.departureAirport} to {offer.arrivalAirport} ·{" "}
                {duration(offer.durationMinutes)}
              </p>
              <p>
                Departs {localTime(offer.departureAt, offer.departureTimeZone)}
                <br />
                Arrives {localTime(offer.arrivalAt, offer.arrivalTimeZone)}
              </p>
            </div>
            <div>
              <strong>
                {price(offer.cabins.priceMinor, offer.cabins.currency)}
              </strong>
              <p className="cabin">
                {cabinLabel(offer.cabins.cabinClass)} · {offer.availableSeats}{" "}
                seats
              </p>
              <Link
                href={
                  "/flights/" +
                  offer._id +
                  "?" +
                  new URLSearchParams({
                    from: query.toString(),
                    cabin: offer.cabins.cabinClass,
                    direction,
                  })
                }
              >
                Flight details
              </Link>
              <p>
                {selected ? (
                  <strong>Selected</strong>
                ) : (
                  <a href={selectOffer(query, direction, leg)}>
                    Select {direction === "outbound" ? "outbound" : "return"}{" "}
                    cabin
                  </a>
                )}
              </p>
            </div>
          </article>
        );
      })}
      {(data.page > 1 || data.page * data.limit < data.total) && (
        <nav aria-label={title + " pages"} className="pager">
          {data.page > 1 && (
            <Link href={pageUrl(data.page - 1)}>Previous page</Link>
          )}
          <span>Page {data.page}</span>
          {data.page * data.limit < data.total && (
            <Link href={pageUrl(data.page + 1)}>Next page</Link>
          )}
        </nav>
      )}
    </section>
  );
}

export default async function Flights({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const params = await searchParams;
  const values: Record<string, string> = {};
  const query = new URLSearchParams();
  for (const key of [
    ...fields,
    "minPrice",
    "maxPrice",
    "outbound",
    "inbound",
  ]) {
    const value = params[key];
    if (typeof value !== "string" || !value) continue;
    values[key] = value;
    if (fields.includes(key)) query.set(key, value);
  }
  if (values.tripType !== "round-trip") query.delete("returnDate");
  const searching = Boolean(
    values.departureAirport && values.arrivalAirport && values.departureDate,
  );
  const [airports, results] = await Promise.allSettled([
    flightApi<{ items: Airport[] }>("/airports?limit=100"),
    searching
      ? flightApi<SearchResult>("/flights/search?" + query)
      : Promise.resolve(null),
  ]);
  const navigation = new URLSearchParams(values);
  const checkout = checkoutUrl(navigation);
  const outbound = selectedLeg(navigation.get("outbound"));
  const inbound = selectedLeg(navigation.get("inbound"));
  return (
    <main>
      <div className="intro">
        <h1>Find your flight</h1>
        <p>Compare routes, cabin fares, and baggage allowances.</p>
      </div>
      {airports.status === "rejected" && (
        <p role="alert" className="error">
          {airports.reason.message}
        </p>
      )}
      {airports.status === "fulfilled" && !airports.value.items.length && (
        <p role="status">No airports are available to search.</p>
      )}
      <SearchForm
        key={navigation.toString()}
        airports={airports.status === "fulfilled" ? airports.value.items : []}
        values={values}
      />
      {results.status === "rejected" && (
        <p role="alert" className="error">
          {results.reason.message}
        </p>
      )}
      {results.status === "fulfilled" && results.value && (
        <>
          {(outbound || inbound) && (
            <section className="panel stack">
              <h2>Your selection</h2>
              {outbound && (
                <p>
                  Outbound ·{" "}
                  <Link
                    href={
                      "/flights/" +
                      outbound.flightId +
                      "?" +
                      new URLSearchParams({
                        from: navigation.toString(),
                        cabin: outbound.cabinClass,
                      })
                    }
                  >
                    {cabinLabel(outbound.cabinClass)} cabin
                  </Link>
                </p>
              )}
              {inbound && (
                <p>
                  Return ·{" "}
                  <Link
                    href={
                      "/flights/" +
                      inbound.flightId +
                      "?" +
                      new URLSearchParams({
                        from: navigation.toString(),
                        cabin: inbound.cabinClass,
                      })
                    }
                  >
                    {cabinLabel(inbound.cabinClass)} cabin
                  </Link>
                </p>
              )}
              {checkout ? (
                <Link className="button" href={checkout}>
                  Continue to booking
                </Link>
              ) : (
                <p>Select a cabin for each flight to continue.</p>
              )}
            </section>
          )}
          <Offers
            title={
              results.value.inbound ? "Outbound flights" : "Available flights"
            }
            data={results.value.outbound}
            query={navigation}
            direction="outbound"
          />
          {results.value.inbound && (
            <Offers
              title="Return flights"
              data={results.value.inbound}
              query={navigation}
              direction="inbound"
            />
          )}
        </>
      )}
    </main>
  );
}
