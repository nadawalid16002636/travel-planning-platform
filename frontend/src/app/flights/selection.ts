import { cabinClasses } from "./api";

export type SelectedLeg = { flightId: string; cabinClass: string };
export const legKey = (leg: SelectedLeg) => leg.flightId + ":" + leg.cabinClass;
export const isFlightId = (id: string) => /^[a-f\d]{24}$/i.test(id);

export function selectedLeg(value: string | null) {
  const [flightId, cabinClass, extra] = (value || "").split(":");
  return !extra && isFlightId(flightId) && cabinClasses.includes(cabinClass)
    ? { flightId, cabinClass }
    : null;
}

export function selectOffer(
  query: URLSearchParams,
  direction: "outbound" | "inbound",
  leg: SelectedLeg,
) {
  const next = new URLSearchParams(query);
  next.set(direction, legKey(leg));
  return "/flights?" + next;
}

export function checkoutUrl(query: URLSearchParams) {
  const outbound = selectedLeg(query.get("outbound"));
  const inbound = selectedLeg(query.get("inbound"));
  const roundTrip = query.get("tripType") === "round-trip";
  if (!outbound || (roundTrip && !inbound)) return null;
  const next = new URLSearchParams({
    outbound: legKey(outbound),
    from: query.toString(),
  });
  if (roundTrip && inbound) next.set("inbound", legKey(inbound));
  for (const key of ["adults", "children", "infants"]) {
    const value = query.get(key);
    if (value) next.set(key, value);
  }
  return "/flights/checkout?" + next;
}
