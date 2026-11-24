import { SignIn } from "./sign-in";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safe =
    typeof next === "string" &&
    /^\/flights\/(?:checkout|bookings(?:\/[a-f\d]{24})?)(?:\?|$)/i.test(next)
      ? next
      : "/flights/bookings";
  return (
    <main>
      <h1>Sign in to book flights</h1>
      <SignIn next={safe} />
    </main>
  );
}
