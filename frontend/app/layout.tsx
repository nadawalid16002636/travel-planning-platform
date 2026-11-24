import type { Metadata } from "next";
import Link from "next/link";
import "./styles.css";

export const metadata: Metadata = {
  title: "Flights | Travel Planner",
  description: "Search and compare flights for your next trip.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header>
          <nav>
            <Link href="/flights">Travel Planner</Link>
            <Link href="/flights">Flights</Link>
            <Link href="/flights/bookings">My flight bookings</Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
