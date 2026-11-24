import Link from "next/link";
import { notFound } from "next/navigation";
import { isFlightId } from "../../selection";
import { BookingDetails } from "./details";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isFlightId(id)) notFound();
  return (
    <main>
      <Link href="/flights/bookings">My flight bookings</Link>
      <h1>Booking details</h1>
      <BookingDetails id={id} />
    </main>
  );
}
