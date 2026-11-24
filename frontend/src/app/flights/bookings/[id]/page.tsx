import Link from "next/link";
import { notFound } from "next/navigation";
import { isFlightId } from "../../selection";
import { BookingDetails } from "./details";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ payment?: string; redirect_status?: string }>;
}) {
  const [{ id }, { payment, redirect_status: redirectStatus }] =
    await Promise.all([params, searchParams]);
  if (!isFlightId(id)) notFound();
  return (
    <main>
      <Link href="/flights/bookings">My flight bookings</Link>
      <h1>Booking details</h1>
      <BookingDetails
        id={id}
        paymentReturn={payment === "return"}
        redirectStatus={redirectStatus}
      />
    </main>
  );
}
