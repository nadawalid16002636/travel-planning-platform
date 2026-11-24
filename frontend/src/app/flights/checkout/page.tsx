import Link from "next/link";
import { Checkout } from "./checkout";
import { selectedLeg } from "../selection";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const read = (key: string) =>
    typeof query[key] === "string" ? (query[key] as string) : null;
  const outbound = selectedLeg(read("outbound"));
  const inbound = selectedLeg(read("inbound"));
  const counts = [
    Number(read("adults") ?? 1),
    Number(read("children") ?? 0),
    Number(read("infants") ?? 0),
  ];
  const from = read("from");
  const back = "/flights" + (from ? "?" + new URLSearchParams(from) : "");
  if (
    !outbound ||
    (read("inbound") && !inbound) ||
    inbound?.flightId === outbound.flightId ||
    counts.some((count) => !Number.isSafeInteger(count) || count < 0) ||
    counts[0] < 1 ||
    counts[2] > counts[0] ||
    !Number.isSafeInteger(counts.reduce((a, b) => a + b))
  ) {
    return (
      <main>
        <h1>Flight selection required</h1>
        <Link href={back}>Return to flight search</Link>
      </main>
    );
  }
  return (
    <main>
      <Link href={back}>Back to results</Link>
      <h1>Book your flight</h1>
      <Checkout
        legs={inbound ? [outbound, inbound] : [outbound]}
        counts={counts}
        back={back}
      />
    </main>
  );
}
