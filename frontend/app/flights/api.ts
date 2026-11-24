export type Airport = { code: string; name: string; timeZone: string };
export type Cabin = {
  cabinClass: string;
  currency: string;
  priceMinor: number;
  freeBags: number;
  maxWeightKgPerBag: number;
};
type Airline = { name: string; active?: boolean };
type Flight = {
  _id: string;
  flightNumber: string;
  departureAirport: string;
  arrivalAirport: string;
  departureAt: string;
  arrivalAt: string;
  departureTimeZone: string;
  arrivalTimeZone: string;
  durationMinutes: number;
};
export type Offer = Flight & {
  airline: Airline[];
  cabins: Cabin;
  availableSeats: number;
};
export type OfferPage = {
  items: Offer[];
  page: number;
  limit: number;
  total: number;
};
export type SearchResult = { outbound: OfferPage; inbound?: OfferPage };
export type FlightDetails = Flight & {
  airline: Airline | null;
  departure: Airport;
  arrival: Airport;
  status: string;
  cabins: (Cabin & { availableSeats: number })[];
  policySnapshot?: {
    cancellationPolicy?: {
      tiers: { daysBeforeDeparture: number; refundPercent: number }[];
    };
    baggagePolicy?: {
      extraBagPriceMinor: number;
      maxExtraBagsPerPassenger: number;
      currency: string;
    };
  };
};

export const cabinClasses = ["economy", "premium-economy", "business", "first"];
export const cabinLabel = (name: string) => name.replaceAll("-", " ");
export const duration = (minutes: number) =>
  `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
export const localTime = (instant: string, timeZone: string) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(new Date(instant));
export function price(minor: number, currency: string) {
  const formatter = new Intl.NumberFormat("en", {
    style: "currency",
    currency,
  });
  return formatter.format(
    minor / 10 ** formatter.resolvedOptions().maximumFractionDigits!,
  );
}

export async function flightApi<T>(path: string): Promise<T> {
  const base = (
    process.env.BACKEND_API_URL || "http://localhost:3000/api"
  ).replace(/\/$/, "");
  let response: Response;
  try {
    response = await fetch(base + path, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new Error("The flight service is unavailable. Try again shortly.");
  }
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    const message = Array.isArray(error?.message)
      ? error.message.join(". ")
      : error?.message;
    throw new Error(
      response.status < 500 && typeof message === "string"
        ? message
        : "The flight service could not load this request.",
    );
  }
  return response.json() as Promise<T>;
}
