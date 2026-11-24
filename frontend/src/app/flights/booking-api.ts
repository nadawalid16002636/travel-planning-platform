export type PassengerType = "adult" | "child" | "infant";
export type Passenger = {
  name: string;
  type: PassengerType;
  dateOfBirth: string;
  documentNumber: string;
  extraBagWeightsKg: number[];
};
export type Leg = {
  flightId: string;
  flightNumber: string;
  departureAirport: string;
  arrivalAirport: string;
  departureTimeZone: string;
  arrivalTimeZone: string;
  departureAt: string;
  arrivalAt: string;
  cabinClass: string;
  priceMinor: number;
  currency: string;
  freeBags: number;
  maxWeightKgPerBag: number;
  policySnapshot: {
    baggagePolicy: {
      currency: string;
      extraBagPriceMinor: number;
      maxExtraBagsPerPassenger: number;
      cabinBaggageKg: number;
      checkedBaggageKg: number;
    };
    cancellationPolicy: {
      tiers: { daysBeforeDeparture: number; refundPercent: number }[];
    };
  };
};
export type Hold = { _id: string; expiresAt: string; legs: Leg[] };
export type Booking = {
  _id: string;
  reference: string;
  status:
    "pending-payment" | "confirmed" | "completed" | "cancelled" | "expired";
  legs: Leg[];
  passengers: Passenger[];
  contactEmail: string;
  acceptedPoliciesAt: string;
  paymentExpiresAt: string;
  fareMinor: number;
  baggageMinor: number;
  totalMinor: number;
  currency: string;
  refundDueMinor?: number;
  refundState?: string;
};
export type BookingPage = {
  data: Booking[];
  total: number;
  page: number;
  limit: number;
};
export type PaymentIntent = { paymentId: string; clientSecret: string };

export class BookingApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function bookingApi<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch("/travel-api/" + path, {
    credentials: "same-origin",
    cache: "no-store",
    signal,
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    const message = Array.isArray(error?.message)
      ? error.message.join(". ")
      : error?.message;
    throw new BookingApiError(
      response.status,
      typeof message === "string"
        ? message
        : "The booking service could not complete your request.",
    );
  }
  return response.json() as Promise<T>;
}

export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The booking service could not complete your request.";
}

export function signInUrl(next: string) {
  return "/flights/sign-in?" + new URLSearchParams({ next });
}
