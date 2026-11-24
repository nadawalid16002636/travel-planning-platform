import { History, type Group } from "./history";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; page?: string }>;
}) {
  const params = await searchParams;
  const group: Group =
    params.group === "past" || params.group === "cancelled"
      ? params.group
      : "upcoming";
  const page =
    typeof params.page === "string" &&
    /^[1-9]\d*$/.test(params.page) &&
    Number.isSafeInteger(Number(params.page))
      ? Number(params.page)
      : 1;
  return (
    <main>
      <h1>My flight bookings</h1>
      <History key={group + page} group={group} page={page} />
    </main>
  );
}
